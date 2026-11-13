import { describe, it, expect } from "vitest";
import { teacher, makeExam, T0, MIN } from "./helpers.js";

/* 13 Nov: a change sent with ?full=1 answers with the exam as it now is, so the exam page makes one trip, not two. */
describe("?full=1: the exam comes back with the answer", () => {
  it("Start: the same answer as before, plus the exam exactly as GET gives it", async () => {
    const { id } = await makeExam();
    const r = await teacher(T0, "POST", `/api/t/exams/${id}/start?full=1`);
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.startedAt).toBe(T0);
    expect(r.data.exam.status).toBe("running");
    expect(r.data.exam.endAt).toBe(T0 + 60 * MIN);
    const g = await teacher(T0, "GET", `/api/t/exams/${id}`);
    expect(r.data.exam).toEqual(g.data);
    expect(r.data.exam.events.map((e) => e.kind)).toContain("start");
  });

  it("without ?full=1 nothing changes", async () => {
    const { id } = await makeExam();
    const r = await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    expect(r.status).toBe(200);
    expect(r.data.exam).toBeUndefined();
  });

  it("add minutes, lock and reopen each carry the new state", async () => {
    const { id } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    const ext = await teacher(T0 + 5 * MIN, "POST", `/api/t/exams/${id}/extend?full=1`, { json: { minutes: 10 } });
    expect(ext.data.endAt).toBe(T0 + 70 * MIN);
    expect(ext.data.exam.endAt).toBe(T0 + 70 * MIN);
    expect(ext.data.exam.extensions.length).toBe(1);
    const lock = await teacher(T0 + 6 * MIN, "POST", `/api/t/exams/${id}/lock?full=1`);
    expect(lock.data.exam.status).toBe("locked");
    const open = await teacher(T0 + 7 * MIN, "POST", `/api/t/exams/${id}/reopen?full=1`);
    expect(open.data.exam.status).toBe("running");
  });

  it("saving the set-up (PUT) carries the new questions and duration", async () => {
    const { id } = await makeExam();
    const r = await teacher(T0, "PUT", `/api/t/exams/${id}?full=1`, { json: { base_minutes: 45, questions: [{ id: "q1", label: "Q1", text_html: "<p>Only one now</p>", marks: 5, type: "short", suggested_min: 6 }] } });
    expect(r.status).toBe(200);
    expect(r.data.exam.baseMinutes).toBe(45);
    expect(r.data.exam.questions.map((q) => [q.id, q.marks])).toEqual([["q1", 5]]);
  });

  it("a refused change has no exam in it, and reading never does", async () => {
    const { id } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    const again = await teacher(T0 + MIN, "POST", `/api/t/exams/${id}/start?full=1`);
    expect(again.status).toBe(409);
    expect(again.data.exam).toBeUndefined();
    const get = await teacher(T0 + MIN, "GET", `/api/t/exams/${id}?full=1`);
    expect(get.data.exam).toBeUndefined();
    expect(get.data.id).toBe(id);
  });

  it("needs the exam password like every teacher call", async () => {
    const { id } = await makeExam();
    const { call } = await import("./helpers.js");
    const r = await call(T0, "POST", `/api/t/exams/${id}/start?full=1`, { pw: "wrong" });
    expect(r.status).toBe(401);
    expect(r.data.exam).toBeUndefined();
  });

  it("a new link carries the exam with its token", async () => {
    const { id } = await makeExam();
    const r = await teacher(T0, "POST", `/api/t/exams/${id}/link?full=1`);
    expect(r.data.token).toBeTruthy();
    expect(r.data.exam.token).toBe(r.data.token);
  });
});
