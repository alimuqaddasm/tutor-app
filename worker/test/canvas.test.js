import { applyD1Migrations, env } from "cloudflare:test";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
import { describe, it, expect } from "vitest";
import { call, teacher, T0, MIN } from "./helpers.js";

describe("teaching canvas relay (17 Oct)", () => {
  it("Teach posts, Student view reads the actions in order, only after the last one it has", async () => {
    const r1 = await teacher(T0, "POST", "/api/t/canvas/2026-10-18-maths", { json: { action: { t: "add", u: "a1", ref: "q5" } } });
    expect(r1.status).toBe(201);
    const r2 = await teacher(T0 + 1000, "POST", "/api/t/canvas/2026-10-18-maths", { json: { actions: [{ t: "pos", u: "a1", x: 50, y: 40, w: 900 }, { t: "top", u: "a1" }] } });
    expect(r2.data.seq).toBeGreaterThan(r1.data.seq);
    let g = await teacher(T0 + 2000, "GET", "/api/t/canvas/2026-10-18-maths?after=0");
    expect(g.data.actions.map((x) => x.a.t)).toEqual(["add", "pos", "top"]);
    g = await teacher(T0 + 2000, "GET", "/api/t/canvas/2026-10-18-maths?after=" + r1.data.seq);
    expect(g.data.actions.map((x) => x.a.t)).toEqual(["pos", "top"]);
  });
  it("lessons do not see each other's canvas", async () => {
    await teacher(T0, "POST", "/api/t/canvas/2026-10-18-chem", { json: { action: { t: "add", u: "b1", ref: "q1" } } });
    const g = await teacher(T0, "GET", "/api/t/canvas/2026-10-19-chem?after=0");
    expect(g.data.actions).toEqual([]);
  });
  it("needs the exam password, and refuses what is not an action", async () => {
    expect((await call(T0, "GET", "/api/t/canvas/x?after=0")).status).toBe(401);
    expect((await call(T0, "GET", "/api/t/canvas/x?after=0", { pw: "wrong" })).status).toBe(401);
    expect((await teacher(T0, "POST", "/api/t/canvas/x", { json: { action: "add" } })).status).toBe(400);
    expect((await teacher(T0, "POST", "/api/t/canvas/x", { json: { actions: [] } })).status).toBe(400);
    expect((await teacher(T0, "POST", "/api/t/canvas/x", { json: { action: { t: "add", pad: "x".repeat(5000) } } })).status).toBe(413);
    expect((await teacher(T0, "GET", "/api/t/canvas/bad%20room?after=0")).status).toBe(404);
  });
  it("drops actions older than 3 days", async () => {
    await teacher(T0, "POST", "/api/t/canvas/old", { json: { action: { t: "add", u: "c1", ref: "q1" } } });
    await teacher(T0 + 4 * 24 * 60 * MIN, "POST", "/api/t/canvas/new", { json: { action: { t: "new" } } });
    const g = await teacher(T0 + 4 * 24 * 60 * MIN, "GET", "/api/t/canvas/old?after=0");
    expect(g.data.actions).toEqual([]);
  });
});
