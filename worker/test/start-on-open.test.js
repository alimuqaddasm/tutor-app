import { describe, it, expect } from "vitest";
import { call, teacher, makeExam, T0, MIN } from "./helpers.js";

const state = (now, token) => call(now, "GET", "/api/s/state", { token });
const arm = (now, id, on = true) => teacher(now, "POST", `/api/t/exams/${id}/start-on-open`, { json: { on } });

describe("start when he opens the link", () => {
  it("the clock starts the first time he opens it, not when Ali sets it", async () => {
    const { id, token } = await makeExam();
    expect((await arm(T0, id)).status).toBe(200);
    const t = await teacher(T0 + MIN, "GET", `/api/t/exams/${id}`);
    expect(t.data.status).toBe("waiting");
    expect(t.data.startOnOpen).toBe(true);
    const open = T0 + 3 * 60 * MIN;            // he opens it 3 hours later
    const s = await state(open, token);
    expect(s.data.status).toBe("running");
    expect(s.data.startedAt).toBe(open);
    expect(s.data.endAt).toBe(open + 60 * MIN);
    expect(s.data.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    // refreshing never restarts it
    const again = await state(open + 20 * MIN, token);
    expect(again.data.startedAt).toBe(open);
    expect(again.data.endAt).toBe(open + 60 * MIN);
    const ev = (await teacher(open + 21 * MIN, "GET", `/api/t/exams/${id}`)).data.events.map((e) => e.kind);
    expect(ev).toContain("start-on-open");
    expect(ev.filter((k) => k === "start").length).toBe(1);
  });

  it("without it, opening the link still waits for Start", async () => {
    const { token } = await makeExam();
    const s = await state(T0, token);
    expect(s.data.status).toBe("waiting");
    expect(s.data.questions).toBeUndefined();
  });

  it("can be cancelled, and Start still works while it is set", async () => {
    const { id, token } = await makeExam();
    await arm(T0, id);
    await arm(T0 + MIN, id, false);
    expect((await state(T0 + 2 * MIN, token)).data.status).toBe("waiting");
    await arm(T0 + 3 * MIN, id);
    const r = await teacher(T0 + 4 * MIN, "POST", `/api/t/exams/${id}/start`);
    expect(r.data.startedAt).toBe(T0 + 4 * MIN);
    expect((await state(T0 + 5 * MIN, token)).data.startedAt).toBe(T0 + 4 * MIN);
    expect((await arm(T0 + 6 * MIN, id)).status).toBe(409);   // already started
  });
});
