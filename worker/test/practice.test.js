import { describe, it, expect } from "vitest";
import { teacher, call, makeExam, T0, MIN } from "./helpers.js";

describe("practice exams", () => {
  it("are marked as practice in the list, the exam, the review and the student view", async () => {
    const real = await makeExam();
    const prac = await makeExam(T0 - 10 * MIN, { practice: true, source_path: "" });
    const list = (await teacher(T0, "GET", "/api/t/exams")).data;
    expect(list.find((e) => e.id === real.id).practice).toBe(false);
    expect(list.find((e) => e.id === prac.id).practice).toBe(true);
    expect((await teacher(T0, "GET", "/api/t/exams/" + prac.id)).data.practice).toBe(true);
    expect((await teacher(T0, "GET", "/api/t/exams/" + prac.id + "/review")).data.practice).toBe(true);
    expect((await call(T0, "GET", "/api/s/state", { token: prac.token })).data.practice).toBe(true);
    expect((await call(T0, "GET", "/api/s/state", { token: real.token })).data.practice).toBe(false);
  });
  it("can be deleted with everything in them", async () => {
    const prac = await makeExam(T0 - 10 * MIN, { practice: true });
    expect((await teacher(T0, "DELETE", "/api/t/exams/" + prac.id)).status).toBe(200);
    expect((await teacher(T0, "GET", "/api/t/exams/" + prac.id)).status).toBe(404);
  });
});
