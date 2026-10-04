import { describe, it, expect } from "vitest";
import { call, teacher, makeExam, T0, MIN } from "./helpers.js";

const state = (now, token) => call(now, "GET", "/api/s/state", { token });

describe("timer", () => {
  it("waits until the teacher presses Start, and shows no questions before that", async () => {
    const { token } = await makeExam();
    const s = await state(T0, token);
    expect(s.status).toBe(200);
    expect(s.data.status).toBe("waiting");
    expect(s.data.questions).toBeUndefined();
    expect(s.data.endAt).toBeNull();
  });

  it("Start takes its times from the server clock", async () => {
    const { id, token } = await makeExam();
    const r = await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    expect(r.data.startedAt).toBe(T0);
    expect(r.data.originalEndAt).toBe(T0 + 60 * MIN);
    const s = await state(T0 + 1000, token);
    expect(s.data.status).toBe("running");
    expect(s.data.serverNow).toBe(T0 + 1000);
    expect(s.data.endAt).toBe(T0 + 60 * MIN);
    expect(s.data.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("refreshing the page (asking again later) never resets the timer", async () => {
    const { id, token } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    const a = await state(T0 + 5 * MIN, token);
    const b = await state(T0 + 20 * MIN, token);
    expect(a.data.endAt).toBe(T0 + 60 * MIN);
    expect(b.data.endAt).toBe(T0 + 60 * MIN);
    expect(b.data.startedAt).toBe(T0);
    // Start again is refused, so nobody can restart the clock.
    const again = await teacher(T0 + 21 * MIN, "POST", `/api/t/exams/${id}/start`);
    expect(again.status).toBe(409);
  });

  it("+5, +10 and a custom amount add up, and each one is logged with its time", async () => {
    const { id, token } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await teacher(T0 + 30 * MIN, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 5 } });
    await teacher(T0 + 40 * MIN, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 10 } });
    await teacher(T0 + 50 * MIN, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 7 } });
    const s = await state(T0 + 51 * MIN, token);
    expect(s.data.endAt).toBe(T0 + 82 * MIN);
    expect(s.data.originalEndAt).toBe(T0 + 60 * MIN);
    expect(s.data.extensions).toEqual([{ minutes: 5, at: T0 + 30 * MIN }, { minutes: 10, at: T0 + 40 * MIN }, { minutes: 7, at: T0 + 50 * MIN }]);
    const ex = await teacher(T0 + 51 * MIN, "GET", `/api/t/exams/${id}`);
    expect(ex.data.events.filter((e) => e.kind === "extend").map((e) => [e.detail, e.at])).toEqual([["+5 min", T0 + 30 * MIN], ["+10 min", T0 + 40 * MIN], ["+7 min", T0 + 50 * MIN]]);
  });

  it("rejects silly extensions", async () => {
    const { id } = await makeExam();
    expect((await teacher(T0, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 5 } })).status).toBe(409); // not started
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    for (const minutes of [0, -5, "x", 601]) expect((await teacher(T0, "POST", `/api/t/exams/${id}/extend`, { json: { minutes } })).status).toBe(400);
  });

  it("at zero it shows time up but does not lock: answers still save and are marked late", async () => {
    const { id, token } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await call(T0 + 59 * MIN, "PUT", "/api/s/answers/q1", { token, json: { text: "pi/6", seq: 1 } });
    const s = await state(T0 + 60 * MIN, token);
    expect(s.data.status).toBe("timeup");
    const w = await call(T0 + 62 * MIN, "PUT", "/api/s/answers/q1", { token, json: { text: "pi/6 radians", seq: 2 } });
    expect(w.status).toBe(200);
    expect(w.data.late).toBe(true);
    const live = await teacher(T0 + 62 * MIN, "GET", `/api/t/exams/${id}/live`);
    expect(live.data.status).toBe("timeup");
    const ex = await teacher(T0 + 62 * MIN, "GET", `/api/t/exams/${id}`);
    const tu = ex.data.events.filter((e) => e.kind === "timeup");
    expect(tu).toHaveLength(1);              // logged once, however often it is checked
    expect(tu[0].at).toBe(T0 + 60 * MIN);
  });

  it("extending after time up gives fresh time from now and running again", async () => {
    const { id, token } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await state(T0 + 61 * MIN, token);
    const r = await teacher(T0 + 65 * MIN, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 10 } });
    expect(r.data.endAt).toBe(T0 + 75 * MIN);
    expect((await state(T0 + 66 * MIN, token)).data.status).toBe("running");
    expect((await state(T0 + 75 * MIN, token)).data.status).toBe("timeup");
  });

  it("Lock stops all writes; Reopen allows them again", async () => {
    const { id, token } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    await teacher(T0 + 61 * MIN, "POST", `/api/t/exams/${id}/lock`);
    expect((await state(T0 + 62 * MIN, token)).data.status).toBe("locked");
    expect((await call(T0 + 62 * MIN, "PUT", "/api/s/answers/q1", { token, json: { text: "late", seq: 1 } })).status).toBe(409);
    expect((await teacher(T0 + 62 * MIN, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 5 } })).status).toBe(409);
    await teacher(T0 + 63 * MIN, "POST", `/api/t/exams/${id}/reopen`);
    await teacher(T0 + 63 * MIN, "POST", `/api/t/exams/${id}/extend`, { json: { minutes: 5 } });
    expect((await call(T0 + 64 * MIN, "PUT", "/api/s/answers/q1", { token, json: { text: "again", seq: 2 } })).status).toBe(200);
  });

  it("the student can hand in; then writes stop", async () => {
    const { id, token } = await makeExam();
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    const h = await call(T0 + 30 * MIN, "POST", "/api/s/submit", { token });
    expect(h.data.status).toBe("submitted");
    expect((await state(T0 + 31 * MIN, token)).data.status).toBe("submitted");
    expect((await call(T0 + 31 * MIN, "PUT", "/api/s/answers/q1", { token, json: { text: "x", seq: 1 } })).status).toBe(409);
  });

  it("duration can't be changed after Start", async () => {
    const { id } = await makeExam();
    expect((await teacher(T0 - MIN, "PUT", `/api/t/exams/${id}`, { json: { base_minutes: 45 } })).status).toBe(200);
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    expect((await teacher(T0 + MIN, "PUT", `/api/t/exams/${id}`, { json: { base_minutes: 90 } })).status).toBe(409);
    expect((await teacher(T0 + MIN, "GET", `/api/t/exams/${id}`)).data.originalEndAt).toBe(T0 + 45 * MIN);
  });
});

describe("access", () => {
  it("teacher routes need the right password", async () => {
    expect((await call(T0, "GET", "/api/t/exams")).status).toBe(401);
    expect((await call(T0, "GET", "/api/t/exams", { pw: "wrong" })).status).toBe(401);
    expect((await teacher(T0, "GET", "/api/t/exams")).status).toBe(200);
  });

  it("a wrong or short student token gets nothing", async () => {
    await makeExam();
    expect((await call(T0, "GET", "/api/s/state", { token: "x".repeat(43) })).status).toBe(404);
    expect((await call(T0, "GET", "/api/s/state", { token: "abc" })).status).toBe(404);
  });

  it("the student link is 43 random characters, and a new link kills the old one", async () => {
    const { id, token } = await makeExam();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const fresh = (await teacher(T0, "POST", `/api/t/exams/${id}/link`)).data.token;
    expect(fresh).not.toBe(token);
    expect((await call(T0, "GET", "/api/s/state", { token })).status).toBe(404);
    expect((await call(T0, "GET", "/api/s/state", { token: fresh })).status).toBe(200);
  });

  it("CORS allows only the app's own site", async () => {
    const ok = await call(T0, "GET", "/api/health");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://alimuqaddasm.github.io");
    const bad = await call(T0, "GET", "/api/health", { headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
