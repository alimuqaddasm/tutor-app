import { describe, it, expect } from "vitest";
import { call, teacher, makeExam, T0, MIN } from "./helpers.js";

const look = (now, token, q) => call(now, "GET", "/api/s/state" + (q ? "?q=" + q : ""), { token });

async function running() {
  const e = await makeExam();
  await teacher(T0, "POST", `/api/t/exams/${e.id}/start`);
  return e;
}

describe("time on each question", () => {
  it("adds up the time on each question, counting a return as a new visit", async () => {
    const { id, token } = await running();
    for (let s = 0; s <= 60; s += 3) await look(T0 + s * 1000, token, "q1");       // q1 from 0 to 60 s
    await look(T0 + 63000, token, "q2");                                            // moves on: q1 ends at 63 s
    for (let s = 66; s <= 120; s += 3) await look(T0 + s * 1000, token, "q2");     // q2 to 120 s
    for (let s = 123; s <= 150; s += 3) await look(T0 + s * 1000, token, "q1");    // back to q1 for 27 s
    const r = await teacher(T0 + 151000, "GET", `/api/t/exams/${id}/review`);
    const [q1, q2] = r.data.questions;
    expect(q1.visits).toHaveLength(2);
    expect(q1.seconds).toBe(63 + 27);
    expect(q2.visits).toHaveLength(1);
    expect(q2.seconds).toBe(60);
    const live = await teacher(T0 + 151000, "GET", `/api/t/exams/${id}/live`);
    expect(live.data.on).toBe("q1");
    expect(live.data.perQuestion.q1).toMatchObject({ seconds: 90, visits: 2 });
  });

  it("a long gap (page closed or offline) ends the visit instead of counting the gap", async () => {
    const { id, token } = await running();
    await look(T0, token, "q1"); await look(T0 + 10000, token, "q1");
    await look(T0 + 5 * MIN, token, "q1"); await look(T0 + 5 * MIN + 6000, token, "q1");
    const r = await teacher(T0 + 6 * MIN, "GET", `/api/t/exams/${id}/review`);
    expect(r.data.questions[0].seconds).toBe(16);
    expect(r.data.questions[0].visits).toHaveLength(2);
    expect((await teacher(T0 + 6 * MIN, "GET", `/api/t/exams/${id}/live`)).data.on).toBe(null);
  });

  it("records nothing before Start, after hand-in, or for an unknown question", async () => {
    const { id, token } = await makeExam();
    await look(T0 - MIN, token, "q1");
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await look(T0 + 1000, token, "nope");
    await call(T0 + 2000, "POST", "/api/s/submit", { token });
    await look(T0 + 3000, token, "q2");
    const r = await teacher(T0 + 4000, "GET", `/api/t/exams/${id}/review`);
    expect(r.data.questions.map((q) => q.seconds)).toEqual([0, 0]);
    expect(r.data.questions.every((q) => q.visits.length === 0)).toBe(true);
  });

  it("the teacher's student view shows the questions and his answers without counting as him", async () => {
    const { id, token } = await makeExam();
    const before = await teacher(T0 - MIN, "GET", `/api/t/exams/${id}/student`);
    expect(before.data.status).toBe("waiting");
    expect(before.data.questions).toHaveLength(2);          // Ali can check the pages before Start
    expect(before.data.lastSeenAt).toBe(null);
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await call(T0 + 1000, "PUT", "/api/s/answers/q1", { token, json: { text: "π/6", seq: 1 } });
    await look(T0 + 2000, token, "q1");
    const s = await teacher(T0 + 3000, "GET", `/api/t/exams/${id}/student?q=q2`);
    expect(s.data.answers.q1.text).toBe("π/6");
    expect(s.data.on).toBe("q1");
    expect(s.data.lastSeenAt).toBe(T0 + 2000);
    expect(JSON.stringify(s.data)).not.toMatch(/"score"|"comment"/);
    const r = await teacher(T0 + 4000, "GET", `/api/t/exams/${id}/review`);
    expect(r.data.questions[1].visits).toHaveLength(0);
    expect((await call(T0, "GET", `/api/t/exams/${id}/student`, { pw: "wrong" })).status).toBe(401);
  });

  it("deleting a practice exam removes its times too", async () => {
    const { id, token } = await makeExam(T0 - 10 * MIN, { practice: true });
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await look(T0 + 1000, token, "q1");
    await teacher(T0 + 2000, "POST", `/api/t/exams/${id}/lock`);
    expect((await teacher(T0 + 3000, "DELETE", `/api/t/exams/${id}`)).status).toBe(200);
  });
});
