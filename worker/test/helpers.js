import { env } from "cloudflare:test";
import { handle } from "../src/index.js";

export const PW = "test-password";
export const ORIGIN = "https://alimuqaddasm.github.io";
export const T0 = Date.UTC(2026, 9, 4, 15, 0, 0); // 4 Oct 2026, 4:00 pm UK time
export const MIN = 60000;

/* Calls the Worker with a chosen server time. */
export async function call(now, method, path, { pw, token, phone, json, bytes, headers = {} } = {}) {
  const h = { Origin: ORIGIN, ...headers };
  if (pw !== undefined) h["X-Exam-Password"] = pw;
  if (token) h["X-Exam-Token"] = token;
  if (phone) h["X-Phone-Token"] = phone;
  let body;
  if (json !== undefined) { body = JSON.stringify(json); h["Content-Type"] = "application/json"; }
  if (bytes !== undefined) { body = bytes; h["Content-Type"] = h["Content-Type"] || "application/octet-stream"; }
  const res = await handle(new Request("https://exams.test" + path, { method, headers: h, body }), env, now);
  const type = res.headers.get("Content-Type") || "";
  const data = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

export const teacher = (now, method, path, opts = {}) => call(now, method, path, { pw: PW, ...opts });

/* A small real PNG / JPEG header: enough for the type and size checks. */
export function png(w = 40, h = 30, pad = 200) {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); b[24] = 8; b[25] = 2;
  return b;
}
export function jpeg(w = 1200, h = 900) {
  const b = new Uint8Array(300);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03], 20);
  return b;
}

/* Makes an exam with two questions, a 60-minute duration and a student link. */
export async function makeExam(now = T0 - 10 * MIN, extra = {}) {
  const r = await teacher(now, "POST", "/api/t/exams", { json: {
    title: "Radians test", subject: "maths", source_path: "students/UK-1/exams/2026-10-04-maths/exam.json", base_minutes: 60, ratio: 1.2,
    questions: [
      { id: "q1", label: "Q1", text_html: "<p>Convert 30° to radians.</p>", marks: 2, type: "short", suggested_min: 2.5 },
      { id: "q2", label: "Q2", text_html: "<p>Sketch \\(y=\\sin x\\).</p>", marks: 4, type: "upload_optional", suggested_min: 5 }
    ], ...extra } });
  const id = r.data.id;
  const link = await teacher(now, "POST", "/api/t/exams/" + id + "/link");
  return { id, token: link.data.token };
}
