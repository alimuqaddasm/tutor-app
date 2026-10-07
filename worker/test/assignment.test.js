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
    expect(q).toMatchObject({ section: "d1-chem", doneAt: T0 + MIN, atDone: "A", final: "C", changedAfterDone: true });
    expect(q.revisions.map((v) => v.afterDone)).toEqual([false, true]);
    expect(q.uploads[0].afterDone).toBe(true);
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
