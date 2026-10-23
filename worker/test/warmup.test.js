import { describe, it, expect, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { call, teacher, T0, MIN } from "./helpers.js";

const DAY = 24 * 60 * MIN;
async function makePack(now = T0) {
  const r = await teacher(now, "POST", "/api/t/exams", { json: { title: "Holiday practice", kind: "assignment",
    sections: [{ id: "d1-chem", title: "Day 1 Chemistry", subject: "chem", day: 1 }],
    questions: [{ id: "d1c1", marks: 4, type: "short", section_id: "d1-chem" }] } });
  const link = await teacher(now, "POST", `/api/t/exams/${r.data.id}/link`);
  return { id: r.data.id, token: link.data.token };
}
const card = (id, extra = {}) => ({ id, q: "Question " + id + "?", options: ["right " + id, "wrong a", "wrong b", "wrong c"], why: "Book words.", page: "CGP p.174", topic: "3.3.9", ...extra });

afterEach(() => { vi.restoreAllMocks(); delete env.NTFY_TOPIC; });

describe("warm-up deck (21 Oct)", () => {
  it("Ali loads cards; he gets 15, shuffled, with the right answer marked; pending cards stay out", async () => {
    const { id, token } = await makePack();
    const cards = Array.from({ length: 30 }, (_, i) => card("g" + i, { topic: i % 2 ? "3.3.9" : "3.3.4" }));
    cards.push(card("p1", { status: "pending" }), card("off1", { status: "off" }));
    const put = await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards } });
    expect(put.status).toBe(200); expect(put.data).toMatchObject({ cards: 32, live: 30 });
    const d = await call(T0 + MIN, "GET", "/api/s/deck", { token });
    expect(d.status).toBe(200); expect(d.data.cards).toHaveLength(15);
    expect(new Set(d.data.cards.map((c) => c.id)).size).toBe(15);
    expect(d.data.cards.some((c) => c.id === "p1" || c.id === "off1")).toBe(false);
    for (const c of d.data.cards) { expect(c.options).toHaveLength(4); expect(c.options[c.answer]).toBe("right " + c.id); }
  });

  it("a mark-scheme card Ali has not looked at goes live at its time; a card worded by Claude waits", async () => {
    const { id, token } = await makePack();
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [
      card("m1", { kind: "mistake", status: "pending", msWorded: true, liveAt: T0 + 12 * 60 * MIN }),
      card("m2", { kind: "mistake", status: "pending", msWorded: false, liveAt: T0 + 12 * 60 * MIN })] } });
    expect((await call(T0 + MIN, "GET", "/api/s/deck", { token })).data.cards).toHaveLength(0);
    const later = await call(T0 + 13 * 60 * MIN, "GET", "/api/s/deck", { token });
    expect(later.data.cards.map((c) => c.id)).toEqual(["m1"]);
  });

  it("his tries are saved and checked by the server; a mistake card comes back after 1, 3, 7 days and is learnt after 5 right", async () => {
    const { id, token } = await makePack();
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("m1", { kind: "mistake" })] } });
    let t = T0 + MIN;
    const tryIt = async (pick) => { const d = await call(t, "GET", "/api/s/deck", { token }); const c = d.data.cards.find((x) => x.id === "m1");
      if (!c) return false; const r = await call(t, "POST", "/api/s/deck", { token, json: { run: d.data.run, tries: [{ card: "m1", picked: pick }] } }); expect(r.status).toBe(200); return true; };
    expect(await tryIt("wrong a")).toBe(true);
    let tr = await teacher(t, "GET", `/api/t/exams/${id}/cards`);
    expect(tr.data.tries).toHaveLength(1); expect(tr.data.tries[0]).toMatchObject({ right: 0, picked: "wrong a" });
    expect(await tryIt("right m1")).toBe(true);                    // wrong last time: due again at once
    t += 2 * 60 * MIN; expect(await tryIt("right m1")).toBe(false); // one right: not before a day
    t += DAY; expect(await tryIt("right m1")).toBe(true);
    t += DAY; expect(await tryIt("right m1")).toBe(false);          // two right: 3 days
    t += 2 * DAY; expect(await tryIt("right m1")).toBe(true);
    t += 7 * DAY; expect(await tryIt("right m1")).toBe(true);
    t += 14 * DAY; expect(await tryIt("right m1")).toBe(true);      // five right in a row
    t += 60 * DAY; expect(await tryIt("right m1")).toBe(false);     // learnt
    tr = await teacher(t, "GET", `/api/t/exams/${id}/cards`);
    expect(tr.data.tries.filter((x) => x.right)).toHaveLength(5);
  });

  it("reloading cards keeps his tries; bad cards are refused; only an assignment link has a deck", async () => {
    const { id, token } = await makePack();
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("a")] } });
    const d = await call(T0, "GET", "/api/s/deck", { token });
    await call(T0, "POST", "/api/s/deck", { token, json: { run: d.data.run, tries: [{ card: "a", picked: "right a" }] } });
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("a", { q: "Better wording?" }), card("b")] } });
    const g = await teacher(T0, "GET", `/api/t/exams/${id}/cards`);
    expect(g.data.cards.map((c) => c.q)).toEqual(["Better wording?", "Question b?"]); expect(g.data.tries).toHaveLength(1);
    expect((await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("x", { options: ["same", "same"] })] } })).status).toBe(400);
    expect((await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("x"), card("x")] } })).status).toBe(400);
    expect((await call(T0, "POST", "/api/s/deck", { token, json: { run: "r", tries: [{ card: "zz", picked: "q" }] } })).status).toBe(400);
    expect((await call(T0, "GET", "/api/s/deck", { token: "x".repeat(40) })).status).toBe(404);
  });

  it("loads a deck of 300 cards, then a smaller one (D1's 100 bound values a statement); a resent round is not counted twice", async () => {
    const { id, token } = await makePack();
    const big = Array.from({ length: 300 }, (_, i) => card("c" + i));
    const r1 = await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: big } });
    expect(r1.status).toBe(200); expect(r1.data.cards).toBe(300);
    const r2 = await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: big.slice(0, 120) } });
    expect(r2.status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM cards WHERE exam_id = ?").bind(id).first()).n).toBe(120);
    const d = await call(T0, "GET", "/api/s/deck", { token });
    const tries = d.data.cards.map((c) => ({ card: c.id, picked: c.options[c.answer] }));
    await call(T0, "POST", "/api/s/deck", { token, json: { run: d.data.run, tries } });
    await call(T0, "POST", "/api/s/deck", { token, json: { run: d.data.run, tries } });
    expect((await teacher(T0, "GET", `/api/t/exams/${id}/cards`)).data.tries).toHaveLength(15);
  });

  it("a practice copy takes the cards along; deleting the exam removes them", async () => {
    const { id } = await makePack();
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("a"), card("b")] } });
    const cp = await teacher(T0, "POST", `/api/t/exams/${id}/practice-copy`);
    expect((await teacher(T0, "GET", `/api/t/exams/${cp.data.id}/cards`)).data.cards).toHaveLength(2);
    await teacher(T0, "POST", `/api/t/exams/${id}/lock`);
    expect((await teacher(T0, "DELETE", `/api/t/exams/${id}`)).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) n FROM cards WHERE exam_id = ?").bind(id).first()).n).toBe(0);
  });
});

describe("phone push when he finishes a section (21 Oct)", () => {
  it("sends one push to the ntfy topic with the section's name, only the first time", async () => {
    const { token } = await makePack();
    env.NTFY_TOPIC = "tutor-test-topic";
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const r = await call(T0 + MIN, "POST", "/api/s/sections/d1-chem/done", { token, json: { tookMin: 40 } });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://ntfy.sh/tutor-test-topic");
    expect(init.headers.Title).toBe("finished Day 1 Chemistry");
    expect(init.body).toContain("took 40 min");
    expect(init.headers.Authorization).toBeUndefined();
    await call(T0 + 2 * MIN, "POST", "/api/s/sections/d1-chem/done", { token, json: {} });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("no topic, no push; a failing push never blocks his Done", async () => {
    const { token } = await makePack();
    const f = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect((await call(T0 + MIN, "POST", "/api/s/sections/d1-chem/done", { token, json: {} })).status).toBe(200);
    expect(f).not.toHaveBeenCalled();
    const p2 = await makePack(); env.NTFY_TOPIC = "t";
    expect((await call(T0 + MIN, "POST", "/api/s/sections/d1-chem/done", { token: p2.token, json: {} })).status).toBe(200);
  });
});

describe("warm-up in step with the pack (23 Oct)", () => {
  async function pack2() {
    const r = await teacher(T0, "POST", "/api/t/exams", { json: { title: "Holiday", kind: "assignment",
      sections: [{ id: "d1-chem", title: "Day 1 Chemistry", subject: "chem", day: 1 }, { id: "d2-chem", title: "Day 2 Chemistry", subject: "chem", day: 2 }],
      questions: [
        { id: "d1c1", label: "Q1", marks: 1, type: "mcq", choices: "ABCD", answer: "c", section_id: "d1-chem", study: { pages: [{ spec: "3.3.4", pages: "pp. 151-155" }] } },
        { id: "d1c2", label: "Q2", marks: 1, type: "mcq", choices: "ABCD", answer: "B", section_id: "d1-chem", study: { pages: [{ spec: "3.3.4" }] } },
        { id: "d1c3", label: "Q3", marks: 1, type: "mcq", choices: "ABCD", answer: "A", section_id: "d1-chem", study: { pages: [{ spec: "3.3.4" }] } },
        { id: "d2c1", label: "Q1", marks: 4, type: "short", section_id: "d2-chem", study: { pages: [{ spec: "3.3.10" }] } }] } });
    const token = (await teacher(T0, "POST", `/api/t/exams/${r.data.id}/link`)).data.token;
    return { id: r.data.id, token };
  }
  it("never shows him the right letter, and turns wrong or blank taps into picture cards when he finishes", async () => {
    const { id, token } = await pack2();
    const st = await call(T0, "GET", "/api/s/state", { token });
    expect(JSON.stringify(st.data)).not.toContain('"answer"');
    await call(T0 + MIN, "PUT", "/api/s/answers/d1c1", { token, json: { text: "A", seq: 1 } });
    await call(T0 + MIN, "PUT", "/api/s/answers/d1c2", { token, json: { text: "B", seq: 1 } });
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("g1", { topic: "3.3.2" })] } });
    await call(T0 + 2 * MIN, "POST", "/api/s/sections/d1-chem/done", { token, json: {} });
    const c = await teacher(T0 + 3 * MIN, "GET", `/api/t/exams/${id}/cards`);
    const auto = c.data.cards.filter((x) => x.qid).sort((a, b) => a.id.localeCompare(b.id));
    expect(auto.map((x) => x.id)).toEqual(["q-d1c1", "q-d1c3"]);
    expect(auto[0]).toMatchObject({ kind: "mistake", qid: "d1c1", topic: "3.3.4", page: "CGP pp. 151-155", live: true });
    expect(auto[0].options[0]).toBe("C"); expect(auto[0].q).toContain("you chose A");
    // Ali sending the repo's cards again keeps them
    await teacher(T0 + 4 * MIN, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: [card("g1", { topic: "3.3.2" })] } });
    const d = await call(T0 + 5 * MIN, "GET", "/api/s/deck", { token });
    expect(d.data.cards.map((x) => x.id).sort()).toEqual(["g1", "q-d1c1", "q-d1c3"]);
    const pc = d.data.cards.find((x) => x.id === "q-d1c1");
    expect(pc.qid).toBe("d1c1"); expect(pc.options).toEqual(["A", "B", "C", "D"]); expect(pc.answer).toBe(2);
  });
  it("general cards on the day he is on come up more often", async () => {
    const { id, token } = await pack2();
    const cards = [...Array.from({ length: 10 }, (_, i) => card("al" + i, { topic: "3.3.4" })), ...Array.from({ length: 60 }, (_, i) => card("x" + i, { topic: "3.3.2" }))];
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards } });
    let hits = 0;
    for (let k = 0; k < 20; k++) hits += (await call(T0 + k, "GET", "/api/s/deck", { token })).data.cards.filter((c) => c.topic === "3.3.4").length;
    expect(hits / 20).toBeGreaterThan(3.2);   // 10 of 70 cards; unweighted about 2.1 a deck, weighted 3 times about 5
  });
  it("a general card he got wrong comes back like a mistake", async () => {
    const { id, token } = await pack2();
    await teacher(T0, "PUT", `/api/t/exams/${id}/cards`, { json: { cards: Array.from({ length: 40 }, (_, i) => card("g" + i, { topic: "3.3.2" })) } });
    const d = await call(T0, "GET", "/api/s/deck", { token });
    const miss = d.data.cards[0];
    await call(T0, "POST", "/api/s/deck", { token, json: { run: d.data.run, tries: [{ card: miss.id, picked: "wrong a" }] } });
    const next = await call(T0 + DAY, "GET", "/api/s/deck", { token });
    expect(next.data.cards.map((c) => c.id)).toContain(miss.id);
  });
});
