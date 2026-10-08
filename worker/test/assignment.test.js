import { describe, it, expect } from "vitest";
import { call, teacher, png, T0, MIN } from "./helpers.js";

const DAY = 24 * 60 * MIN;
async function makeAssignment(now = T0 - 10 * MIN) {
  const r = await teacher(now, "POST", "/api/t/exams", { json: {
    title: "Holiday practice", subject: "", kind: "assignment", source_path: "students/UK-1/assignments/2026-10-23-holiday/assignment.json",
    sections: [{ id: "d1-math", title: "Day 1 Maths", subject: "maths", day: 1, date: "2026-10-23", suggest_min: 45 },
               { id: "d1-chem", title: "Day 1 Chemistry", subject: "chem", day: 1, date: "2026-10-23", suggest_min: 45 }],
    questions: [{ id: "d1m1", label: "Q1", text_html: "<p>a</p>", marks: 6, type: "upload_required", section_id: "d1-math" },
                { id: "d1c1", label: "Q1", text_html: "<p>b</p>", marks: 5, type: "short", section_id: "d1-chem" }] } });
  const id = r.data.id;
  await teacher(now, "PUT", `/api/t/exams/${id}/questions/d1m1/ms`, { bytes: png(), headers: { "Content-Type": "image/png" } });
  await teacher(now, "PUT", `/api/t/exams/${id}/questions/d1c1/ms`, { bytes: png(), headers: { "Content-Type": "image/png" } });
  const link = await teacher(now, "POST", `/api/t/exams/${id}/link`);
  return { id, token: link.data.token };
}

const HOUR = 60 * MIN;
async function makeDays(now = T0 - 10 * MIN) {
  const r = await teacher(now, "POST", "/api/t/exams", { json: { title: "Days", kind: "assignment", gap_hours: 12,
    sections: [1, 2, 3].map((d) => ({ id: "d" + d, title: "Day " + d, day: d })),
    questions: [1, 2, 3].map((d) => ({ id: "q" + d, marks: 4, type: "short", section_id: "d" + d, study: { book: "CGP", pages: [{ pages: "pp. 156-161" }] } })) } });
  const link = await teacher(now, "POST", `/api/t/exams/${r.data.id}/link`);
  return { id: r.data.id, token: link.data.token };
}

describe("days, practice, notes, phone (8 Oct)", () => {
  it("day 1 is open; day 2 opens 12 hours after he first opens day 1; day 3 12 hours after day 2", async () => {
    const { token } = await makeDays();
    let s = await call(T0, "GET", "/api/s/state", { token });
    expect(s.data.sections.map((x) => x.open)).toEqual([true, false, false]);
    expect(s.data.questions.map((q) => q.id)).toEqual(["q1"]);           // nothing from closed days
    expect((await call(T0, "PUT", "/api/s/answers/q2", { token, json: { text: "x", seq: 1 } })).status).toBe(403);
    expect((await call(T0, "POST", "/api/s/sections/d2/open", { token })).status).toBe(403);
    await call(T0 + HOUR, "POST", "/api/s/sections/d1/open", { token });
    s = await call(T0 + 2 * HOUR, "GET", "/api/s/state", { token });
    expect(s.data.sections[1]).toMatchObject({ open: false, opensAt: T0 + 13 * HOUR });
    s = await call(T0 + 13 * HOUR, "GET", "/api/s/state", { token });
    expect(s.data.sections.map((x) => x.open)).toEqual([true, true, false]);
    expect(s.data.sections[2].opensAt).toBe(null);                         // waits for him to open day 2
    await call(T0 + 20 * HOUR, "POST", "/api/s/sections/d2/open", { token });
    s = await call(T0 + 32 * HOUR, "GET", "/api/s/state", { token });
    expect(s.data.sections.map((x) => x.open)).toEqual([true, true, true]);
  });

  it("Ali can open a day early and change the hours", async () => {
    const { id, token } = await makeDays();
    await teacher(T0, "POST", `/api/t/exams/${id}/sections/d3/release`);
    let s = await call(T0, "GET", "/api/s/state", { token });
    expect(s.data.sections.map((x) => x.open)).toEqual([true, false, true]);
    await teacher(T0, "PUT", `/api/t/exams/${id}`, { json: { gap_hours: 16 } });
    await call(T0, "POST", "/api/s/sections/d1/open", { token });
    s = await call(T0 + 15 * HOUR, "GET", "/api/s/state", { token });
    expect(s.data.sections[1].open).toBe(false);
    expect(s.data.gapHours).toBe(16);
  });

  it("his notes show as soon as Ali saves them; the study pointer only where marks were lost", async () => {
    const { id, token } = await makeDays();
    await call(T0, "POST", "/api/s/sections/d1/done", { token, json: {} });
    await teacher(T0, "PUT", `/api/t/exams/${id}/marks/q1`, { json: { score: null, comment: "private", note: "Write the identity first" } });
    let s = await call(T0, "GET", "/api/s/state", { token });
    expect(s.data.notes.q1).toEqual({ note: "Write the identity first", study: null });
    expect(JSON.stringify(s.data)).not.toMatch(/private/);
    await teacher(T0, "PUT", `/api/t/exams/${id}/marks/q1`, { json: { score: 2, comment: "private" } });   // note kept
    s = await call(T0, "GET", "/api/s/state", { token });
    expect(s.data.notes.q1.note).toBe("Write the identity first");
    expect(s.data.notes.q1.study).toEqual({ book: "CGP", pages: [{ pages: "pp. 156-161" }] });
    expect(JSON.stringify(s.data)).not.toMatch(/"score"/);
  });

  it("one phone link for the whole assignment: it lists the open days and uploads to the chosen question", async () => {
    const { id, token } = await makeDays();
    const t = await call(T0, "POST", "/api/s/phone-token", { token });
    const phone = t.data.token;
    expect((await call(T0, "POST", "/api/s/phone-token", { token })).data.token).toBe(phone);
    const info = await call(T0, "GET", "/api/p/info", { phone });
    expect(info.data).toMatchObject({ all: true });
    expect(info.data.questions.map((q) => q.id)).toEqual(["q1"]);
    expect((await call(T0, "POST", "/api/p/upload?q=q1", { phone, bytes: png(), headers: { "Content-Type": "image/png" } })).status).toBe(201);
    expect((await call(T0, "POST", "/api/p/upload?q=q2", { phone, bytes: png(), headers: { "Content-Type": "image/png" } })).status).toBe(403);
    const r = await teacher(T0, "GET", `/api/t/exams/${id}/review`);
    expect(r.data.questions[0].uploads[0]).toMatchObject({ source: "phone", practice: false });
  });

  it("after finishing, his marked pictures can't be removed; practice ones can", async () => {
    const { token } = await makeDays();
    const up = (await call(T0, "POST", "/api/s/uploads/q1", { token, bytes: png(), headers: { "Content-Type": "image/png" } })).data;
    await call(T0 + MIN, "POST", "/api/s/sections/d1/done", { token, json: {} });
    expect((await call(T0 + MIN, "DELETE", "/api/s/uploads/" + up.id, { token })).status).toBe(409);
    const pr = (await call(T0 + 2 * MIN, "POST", "/api/s/uploads/q1", { token, bytes: png(), headers: { "Content-Type": "image/png" } })).data;
    expect(pr.practice).toBe(true);
    expect((await call(T0 + 2 * MIN, "DELETE", "/api/s/uploads/" + pr.id, { token })).status).toBe(200);
  });
});

describe("assignments", () => {
  it("every question must sit in a section", async () => {
    const r = await teacher(T0, "POST", "/api/t/exams", { json: { title: "x", kind: "assignment", sections: [{ id: "s1" }],
      questions: [{ id: "q1", marks: 1, section_id: "nope" }] } });
    expect(r.status).toBe(400);
  });

  it("the link opens it at once: no Start, no clock, open for days", async () => {
    const { id, token } = await makeAssignment();
    const s = await call(T0, "GET", "/api/s/state", { token });
    expect(s.data).toMatchObject({ kind: "assignment", status: "running", endAt: null });
    expect(s.data.questions.map((q) => q.section)).toEqual(["d1-math", "d1-chem"]);
    expect(s.data.sections.map((x) => x.doneAt)).toEqual([null, null]);
    expect((await teacher(T0, "POST", `/api/t/exams/${id}/start`)).status).toBe(409);
    expect((await teacher(T0, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 5 } })).status).toBe(409);
    const later = await call(T0 + 6 * DAY, "PUT", "/api/s/answers/d1c1", { token, json: { text: "B", seq: 1 } });
    expect(later.data).toMatchObject({ ok: true, late: false });
    expect((await call(T0, "POST", "/api/s/submit", { token })).status).toBe(409);
  });

  it("a mark scheme is never shown before Done, and only for that section", async () => {
    const { token } = await makeAssignment();
    expect((await call(T0, "GET", "/api/s/questions/d1m1/ms", { token })).status).toBe(403);
    const d = await call(T0 + MIN, "POST", "/api/s/sections/d1-math/done", { token, json: { tookMin: 40 } });
    expect(d.data).toMatchObject({ ok: true, doneAt: T0 + MIN, tookMin: 40 });
    expect((await call(T0 + MIN, "GET", "/api/s/questions/d1m1/ms", { token })).status).toBe(200);
    expect((await call(T0 + MIN, "GET", "/api/s/questions/d1c1/ms", { token })).status).toBe(403);
    const s = await call(T0 + MIN, "GET", "/api/s/state", { token });
    expect(s.data.questions.map((q) => q.has_ms)).toEqual([true, false]);
    // Done twice keeps the first time
    expect((await call(T0 + 2 * MIN, "POST", "/api/s/sections/d1-math/done", { token, json: {} })).data.doneAt).toBe(T0 + MIN);
  });

  it("marking sees what he had at Done; changes and photos after Done are flagged", async () => {
    const { id, token } = await makeAssignment();
    await call(T0, "PUT", "/api/s/answers/d1c1", { token, json: { text: "A", seq: 1 } });
    await call(T0 + MIN, "POST", "/api/s/sections/d1-chem/done", { token, json: {} });
    await call(T0 + 2 * MIN, "PUT", "/api/s/answers/d1c1", { token, json: { text: "C", seq: 2 } });
    await call(T0 + 3 * MIN, "POST", "/api/s/uploads/d1c1", { token, bytes: png(), headers: { "Content-Type": "image/png" } });
    const r = await teacher(T0 + 4 * MIN, "GET", `/api/t/exams/${id}/review`);
    const q = r.data.questions.find((x) => x.id === "d1c1");
    // after finishing, his answer stays; what he writes then is practice, kept apart
    expect(q).toMatchObject({ section: "d1-chem", doneAt: T0 + MIN, atDone: "A", final: "A", practiceText: "C", changedAfterDone: false });
    expect(q.uploads[0]).toMatchObject({ afterDone: true, practice: true });
    expect(r.data.sections.find((x) => x.id === "d1-chem").doneAt).toBe(T0 + MIN);
  });

  it("Ali can still lock and reopen it by hand", async () => {
    const { id, token } = await makeAssignment();
    await teacher(T0, "POST", `/api/t/exams/${id}/lock`);
    expect((await call(T0, "PUT", "/api/s/answers/d1c1", { token, json: { text: "x", seq: 1 } })).status).toBe(409);
    await teacher(T0, "POST", `/api/t/exams/${id}/reopen`);
    expect((await call(T0, "PUT", "/api/s/answers/d1c1", { token, json: { text: "x", seq: 1 } })).status).toBe(200);
  });
});
