import { describe, it, expect } from "vitest";
import { call, teacher, makeExam, T0, MIN } from "./helpers.js";

const save = (now, token, q, text, seq, clientAt) => call(now, "PUT", "/api/s/answers/" + q, { token, json: { text, seq, clientAt } });

async function running() {
  const e = await makeExam();
  await teacher(T0, "POST", `/api/t/exams/${e.id}/start`);
  return e;
}

/* Every key anywhere in a JSON value. */
function keys(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keys(x, out); }
  return out;
}

describe("autosave", () => {
  it("can't save before Start", async () => {
    const { token } = await makeExam();
    expect((await save(T0, token, "q1", "early", 1)).status).toBe(409);
  });

  it("every save gets the server's time, and the latest one comes back after a reload", async () => {
    const { token } = await running();
    const a = await save(T0 + 1000, token, "q1", "π", 1, 123);
    expect(a.data).toMatchObject({ ok: true, seq: 1, savedAt: T0 + 1000, late: false });
    await save(T0 + 4000, token, "q1", "π/6", 2);
    const s = await call(T0 + 5000, "GET", "/api/s/state", { token });
    expect(s.data.answers.q1).toEqual({ text: "π/6", seq: 2, savedAt: T0 + 4000, late: false });
  });

  it("an older save arriving late never overwrites a newer one", async () => {
    const { token } = await running();
    await save(T0 + 1000, token, "q1", "newest", 5);
    const old = await save(T0 + 2000, token, "q1", "older", 4);
    expect(old.data.stale).toBe(true);
    const dup = await save(T0 + 3000, token, "q1", "newest", 5);
    expect(dup.data.stale).toBe(true);
    const s = await call(T0 + 4000, "GET", "/api/s/state", { token });
    expect(s.data.answers.q1.text).toBe("newest");
  });

  it("the same text saved again does not add a new revision", async () => {
    const { id, token } = await running();
    await save(T0 + 1000, token, "q1", "same", 1);
    const r = await save(T0 + 9000, token, "q1", "same", 2);
    expect(r.data.unchanged).toBe(true);
    expect(r.data.savedAt).toBe(T0 + 1000);
    const rev = await teacher(T0 + 10000, "GET", `/api/t/exams/${id}/review`);
    expect(rev.data.questions[0].revisions).toHaveLength(1);
    // The next real change still goes through after the bumped save number.
    expect((await save(T0 + 11000, token, "q1", "changed", 3)).data.seq).toBe(3);
  });

  it("marking view shows what was written in time and what came after", async () => {
    const { id, token } = await running();
    await save(T0 + 50 * MIN, token, "q1", "x = π/6", 1);
    await save(T0 + 61 * MIN, token, "q1", "x = π/6, so 0.524", 2);
    const rev = await teacher(T0 + 70 * MIN, "GET", `/api/t/exams/${id}/review`);
    const q1 = rev.data.questions.find((q) => q.id === "q1");
    expect(q1.atOriginalEnd).toBe("x = π/6");
    expect(q1.final).toBe("x = π/6, so 0.524");
    expect(q1.writtenLate).toBe(true);
    expect(q1.revisions.map((r) => [r.at, r.late])).toEqual([[T0 + 50 * MIN, false], [T0 + 61 * MIN, true]]);
  });

  it("refuses unknown questions, missing save numbers and huge answers", async () => {
    const { token } = await running();
    expect((await save(T0, token, "nope", "x", 1)).status).toBe(404);
    expect((await save(T0, token, "q1", "x")).status).toBe(400);
    expect((await save(T0, token, "q1", "x".repeat(50001), 1)).status).toBe(413);
  });

  it("the student never receives marks or comments, even after marking", async () => {
    const { id, token } = await running();
    await save(T0 + 1000, token, "q1", "π/6", 1);
    await teacher(T0 + 2000, "PUT", `/api/t/exams/${id}/marks/q1`, { json: { score: 1.5, comment: "units missing" } });
    const s = await call(T0 + 3000, "GET", "/api/s/state", { token });
    const k = keys(s.data);
    expect(k.has("score")).toBe(false);
    expect(k.has("comment")).toBe(false);
    expect(JSON.stringify(s.data)).not.toContain("units missing");
  });

  it("partial marks are allowed, but not above the question's marks; total adds up", async () => {
    const { id } = await running();
    expect((await teacher(T0, "PUT", `/api/t/exams/${id}/marks/q1`, { json: { score: 2.5 } })).status).toBe(400);
    expect((await teacher(T0, "PUT", `/api/t/exams/${id}/marks/q1`, { json: { score: 1.5, comment: "ok" } })).status).toBe(200);
    expect((await teacher(T0, "PUT", `/api/t/exams/${id}/marks/q2`, { json: { score: 3 } })).status).toBe(200);
    const rev = await teacher(T0, "GET", `/api/t/exams/${id}/review`);
    expect(rev.data.total).toBe(4.5);
    expect(rev.data.max).toBe(6);
    expect(rev.data.marked).toBe(2);
  });
});
