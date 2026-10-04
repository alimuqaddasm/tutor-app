import { describe, it, expect } from "vitest";
import { call, teacher, makeExam, png, jpeg, T0, MIN } from "./helpers.js";

const up = (now, token, q, bytes, headers = {}) => call(now, "POST", "/api/s/uploads/" + q, { token, bytes, headers: { "Content-Type": "image/png", ...headers } });

async function running() {
  const e = await makeExam();
  await teacher(T0, "POST", `/api/t/exams/${e.id}/start`);
  return e;
}

describe("uploads", () => {
  it("accepts a PNG and a JPEG, reads their size, and lists them under the question", async () => {
    const { token } = await running();
    const a = await up(T0 + 1000, token, "q2", png(40, 30));
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({ question: "q2", source: "file", mime: "image/png", width: 40, height: 30, late: false });
    const b = await up(T0 + 2000, token, "q2", jpeg(1200, 900), { "Content-Type": "image/jpeg", "X-Upload-Source": "drawing" });
    expect(b.data).toMatchObject({ mime: "image/jpeg", width: 1200, height: 900, source: "drawing" });
    const s = await call(T0 + 3000, "GET", "/api/s/state", { token });
    expect(s.data.uploads.map((u) => u.id)).toEqual([a.data.id, b.data.id]);
  });

  it("refuses files that are not pictures, even with a picture's name or type", async () => {
    const { token } = await running();
    const text = new TextEncoder().encode("<script>alert(1)</script>".repeat(10));
    const r = await up(T0, token, "q2", text, { "Content-Type": "image/png" });
    expect(r.status).toBe(415);
    const pdf = new TextEncoder().encode("%PDF-1.7 pretend");
    expect((await up(T0, token, "q2", pdf)).status).toBe(415);
    expect((await up(T0, token, "q2", new Uint8Array(0))).status).toBe(415);
  });

  it("refuses pictures over 1.9 MB", async () => {
    const { token } = await running();
    expect((await up(T0, token, "q2", png(4000, 3000, 1900001))).status).toBe(413);
  });

  it("a picture after the original end time is marked late; after Lock nothing can be added", async () => {
    const { id, token } = await running();
    expect((await up(T0 + 61 * MIN, token, "q2", png())).data.late).toBe(true);
    await teacher(T0 + 62 * MIN, "POST", `/api/t/exams/${id}/lock`);
    expect((await up(T0 + 63 * MIN, token, "q2", png())).status).toBe(409);
  });

  it("can't upload before Start", async () => {
    const { token } = await makeExam();
    expect((await up(T0, token, "q2", png())).status).toBe(409);
  });

  it("pictures are only served with the student token or the teacher password, never openly", async () => {
    const { token } = await running();
    const { id: picId } = (await up(T0, token, "q2", png())).data;
    const own = await call(T0, "GET", "/api/s/files/" + picId, { token });
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/png");
    expect(own.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(own.headers.get("Cache-Control")).toContain("no-store");
    expect((await teacher(T0, "GET", "/api/t/files/" + picId)).status).toBe(200);
    expect((await call(T0, "GET", "/api/t/files/" + picId)).status).toBe(401);
    expect((await call(T0, "GET", "/api/s/files/" + picId)).status).toBe(404);
    // Another exam's token can't open it either.
    const other = await makeExam();
    expect((await call(T0, "GET", "/api/s/files/" + picId, { token: other.token })).status).toBe(404);
  });

  it("the phone link works for its own question only, and its photo appears for the computer", async () => {
    const { token } = await running();
    const pt = (await call(T0, "POST", "/api/s/phone-token/q2", { token })).data.token;
    expect(pt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await call(T0, "POST", "/api/s/phone-token/q2", { token })).data.token).toBe(pt); // same link again
    const info = await call(T0, "GET", "/api/p/info", { phone: pt });
    expect(info.data).toMatchObject({ question: "q2", number: 2, status: "running" });
    const ph = await call(T0 + 1000, "POST", "/api/p/upload", { phone: pt, bytes: jpeg(), headers: { "Content-Type": "image/jpeg" } });
    expect(ph.status).toBe(201);
    expect(ph.data).toMatchObject({ question: "q2", source: "phone" });
    const s = await call(T0 + 2000, "GET", "/api/s/state", { token });
    expect(s.data.uploads.find((u) => u.id === ph.data.id)).toBeTruthy();
    // The phone token can't reach student routes or another question's pictures.
    expect((await call(T0, "GET", "/api/s/state", { token: pt })).status).toBe(404);
    const q1pic = (await up(T0, token, "q1", png())).data.id;
    expect((await call(T0, "GET", "/api/p/files/" + q1pic, { phone: pt })).status).toBe(404);
    expect((await call(T0, "GET", "/api/p/files/" + ph.data.id, { phone: pt })).status).toBe(200);
    expect((await call(T0, "GET", "/api/p/info", { phone: "y".repeat(43) })).status).toBe(404);
  });

  it("removing a picture hides it but keeps a note in the log", async () => {
    const { id, token } = await running();
    const pic = (await up(T0, token, "q2", png())).data.id;
    expect((await call(T0 + 1000, "DELETE", "/api/s/uploads/" + pic, { token })).status).toBe(200);
    expect((await call(T0 + 2000, "GET", "/api/s/state", { token })).data.uploads).toHaveLength(0);
    expect((await call(T0 + 2000, "GET", "/api/s/files/" + pic, { token })).status).toBe(404);
    const ex = await teacher(T0 + 3000, "GET", `/api/t/exams/${id}`);
    expect(ex.data.events.some((e) => e.kind === "remove-picture")).toBe(true);
  });

  it("at most 20 pictures per question", async () => {
    const { token } = await running();
    for (let i = 0; i < 20; i++) expect((await up(T0 + i, token, "q2", png())).status).toBe(201);
    expect((await up(T0 + 21, token, "q2", png())).status).toBe(409);
  });

  it("question pictures: teacher sets them before Start; the student sees them only after Start", async () => {
    const { id, token } = await makeExam();
    expect((await teacher(T0 - MIN, "PUT", `/api/t/exams/${id}/questions/q1/image`, { bytes: png(800, 200) })).status).toBe(200);
    expect((await call(T0 - MIN, "GET", "/api/s/questions/q1/image", { token })).status).toBe(403);
    await teacher(T0, "POST", `/api/t/exams/${id}/start`);
    expect((await call(T0 + 1, "GET", "/api/s/questions/q1/image", { token })).status).toBe(200);
    expect((await teacher(T0 + 1, "PUT", `/api/t/exams/${id}/questions/q1/image`, { bytes: png() })).status).toBe(409);
  });
});
