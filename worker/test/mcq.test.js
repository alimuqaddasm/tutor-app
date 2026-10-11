import { describe, it, expect } from "vitest";
import { teacher, call, makeExam, T0, MIN } from "./helpers.js";

const MCQ = [
  { id: "m1", label: "Q1", marks: 1, type: "mcq" },
  { id: "m2", label: "Q2", marks: 1, type: "mcq", choices: ["a", "b", "c", "d", "e"], work: "Draw all 4 isomers and send a picture." },
  { id: "l1", label: "Q3", marks: 3, type: "long" }
];

describe("multiple choice", () => {
  it("keeps the letters and the working line, and he sees them once started", async () => {
    const e = await makeExam(T0 - 10 * MIN, { questions: MCQ });
    const t = (await teacher(T0, "GET", "/api/t/exams/" + e.id)).data.questions;
    expect(t.map((q) => [q.type, q.choices, q.work])).toEqual([["mcq", "ABCD", null], ["mcq", "ABCDE", "Draw all 4 isomers and send a picture."], ["long", null, null]]);
    await teacher(T0, "POST", `/api/t/exams/${e.id}/start`);
    const s = (await call(T0 + MIN, "GET", "/api/s/state", { token: e.token })).data.questions;
    expect(s[1]).toMatchObject({ type: "mcq", choices: "ABCDE", work: "Draw all 4 isomers and send a picture." });
    // his tap is saved as the letter, like a short answer
    expect((await call(T0 + MIN, "PUT", "/api/s/answers/m1", { token: e.token, json: { text: "B", seq: 1, clientAt: T0 + MIN } })).status).toBe(200);
    expect((await call(T0 + MIN, "GET", "/api/s/state", { token: e.token })).data.answers.m1.text).toBe("B");
    const v = (await teacher(T0 + MIN, "GET", "/api/t/exams/" + e.id + "/student")).data.questions;
    expect(v[0].choices).toBe("ABCD");
  });
  it("refuses fewer than two letters", async () => {
    const r = await teacher(T0, "POST", "/api/t/exams", { json: { title: "x", subject: "chem", base_minutes: 10, questions: [{ id: "m1", marks: 1, type: "mcq", choices: "A" }] } });
    expect(r.status).toBe(400);
  });
  it("carries the letters into a practice copy", async () => {
    const e = await makeExam(T0 - 10 * MIN, { questions: MCQ });
    const c = (await teacher(T0, "POST", "/api/t/exams/" + e.id + "/practice-copy")).data;
    expect((await teacher(T0, "GET", "/api/t/exams/" + c.id)).data.questions[1].choices).toBe("ABCDE");
  });
});
