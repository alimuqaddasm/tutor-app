/* Tutor Desk exam server (Cloudflare Worker + D1).
   It owns the clock: every time below comes from the server, never from a browser.
   /api/t/*  teacher, needs the X-Exam-Password header (Worker secret TEACHER_PASSWORD)
   /api/s/*  student, needs the X-Exam-Token header (the long random token in the student link)
   /api/p/*  phone upload, needs the X-Phone-Token header (one question of one exam)
   Student and phone replies never contain marks or comments. */

import { checkImage } from "./image.js";

const TYPES = ["short", "long", "upload_required", "upload_optional"];
const MAX_TEXT = 50000;
const MAX_UPLOADS_PER_Q = 20;
const MAX_EXTEND = 600;
const VIEW_GAP = 20000;   // a report later than this after the last one starts a new visit (page closed, offline, asleep)
const DEFAULT_ORIGINS = "https://alimuqaddasm.github.io,http://localhost:8765,http://127.0.0.1:8765";

export default {
  fetch(request, env) { return handle(request, env, Date.now()); }
};

/* `now` is passed in so the tests can move the clock. */
export async function handle(request, env, now) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim());
  const cors = allowed.includes(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Exam-Password, X-Exam-Token, X-Phone-Token, X-Upload-Source",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  } : { "Vary": "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const res = await route(request, env, now);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const msg = e instanceof HttpError ? e.message : "Something went wrong on the exam server.";
    if (!(e instanceof HttpError)) console.error(e && e.stack || e);
    return json({ error: msg }, status, cors);
  }
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}

/* A picture he uploaded never changes (a new upload gets a new id), so the teacher's browser may keep it (keep = true),
   which makes marking faster. His own device and the phone never keep them; question pictures can change before Start. */
function imageResponse(bytes, mime, keep) {
  return new Response(bytes, { headers: { "Content-Type": mime, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": keep ? "private, max-age=31536000, immutable" : "private, no-store" } });
}

/* Several reads in one trip to the database (it is far away: every separate query is a round trip). */
async function reads(env, stmts) { return (await env.DB.batch(stmts)).map((r) => r.results); }

function randomToken(nBytes = 32) {
  const b = new Uint8Array(nBytes); crypto.getRandomValues(b);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function body(request) {
  try { return await request.json(); } catch (e) { fail(400, "The request was not valid JSON."); }
}

async function bytesOf(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 2500000) fail(413, "The picture is too big (over 1.9 MB) even after shrinking.");
  return new Uint8Array(await request.arrayBuffer());
}

const toBytes = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));

/* ---------- auth ---------- */

async function sha256(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }

async function requireTeacher(request, env) {
  if (!env.TEACHER_PASSWORD) fail(503, "The exam password is not set on the server yet.");
  const given = request.headers.get("X-Exam-Password") || "";
  const a = await sha256(given), b = await sha256(env.TEACHER_PASSWORD);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) fail(401, "Wrong exam password.");
}

async function examByToken(env, token) {
  if (!token || token.length < 32) fail(404, "This exam link is not valid.");
  const exam = await env.DB.prepare("SELECT * FROM exams WHERE token = ?").bind(token).first();
  if (!exam) fail(404, "This exam link is not valid.");
  return exam;
}

async function examById(env, id) {
  const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
  if (!exam) fail(404, "No such exam.");
  return exam;
}

/* ---------- clock and status ---------- */

/* draft | waiting | running | timeup | submitted | locked. "timeup" is never stored: it is running past end_at. */
export function liveStatus(exam, now) {
  if (exam.status === "running" && exam.end_at != null && now >= exam.end_at) return "timeup";
  return exam.status;
}

const started = (exam) => exam.started_at != null;
const canWrite = (exam) => exam.status === "running";

async function event(env, examId, now, kind, detail = "") {
  await env.DB.prepare("INSERT INTO events (exam_id, at, kind, detail) VALUES (?, ?, ?, ?)").bind(examId, now, kind, detail).run();
}

/* The first time anyone looks after the end time, write "time up" into the log (once per end time). */
async function noteTimeUp(env, exam, now) {
  if (liveStatus(exam, now) === "timeup" && exam.timeup_logged_for !== exam.end_at) {
    await env.DB.prepare("UPDATE exams SET timeup_logged_for = ? WHERE id = ?").bind(exam.end_at, exam.id).run();
    await event(env, exam.id, exam.end_at, "timeup", "");
    exam.timeup_logged_for = exam.end_at;
  }
}

const extensionsQ = (env, examId) => env.DB.prepare("SELECT minutes, at FROM extensions WHERE exam_id = ? ORDER BY id").bind(examId);
async function extensionsOf(env, examId) { return (await extensionsQ(env, examId).all()).results; }

function clock(exam, now, extensions) {
  return {
    status: liveStatus(exam, now),
    serverNow: now,
    baseMinutes: exam.base_minutes,
    startedAt: exam.started_at,
    originalEndAt: exam.original_end_at,
    endAt: exam.end_at,
    submittedAt: exam.submitted_at,
    lockedAt: exam.locked_at,
    extensions
  };
}

/* ---------- questions ---------- */

function cleanQuestions(list) {
  if (!Array.isArray(list) || list.length === 0) fail(400, "An exam needs at least one question.");
  if (list.length > 100) fail(400, "Too many questions.");
  const seen = new Set();
  return list.map((q, i) => {
    const id = String(q.id || "q" + (i + 1)).slice(0, 40);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(400, "Question ids may use letters, digits, - and _ only.");
    if (seen.has(id)) fail(400, "Two questions have the id " + id + ".");
    seen.add(id);
    const marks = Number(q.marks);
    if (!(marks >= 0 && marks <= 1000)) fail(400, "Question " + id + " needs its marks.");
    const type = q.type || "long";
    if (!TYPES.includes(type)) fail(400, "Question " + id + " has an unknown type.");
    const sm = q.suggested_min == null || q.suggested_min === "" ? null : Number(q.suggested_min);
    return { id, pos: i, label: String(q.label || "").slice(0, 200), text_html: String(q.text_html || "").slice(0, 100000), marks, type, suggested_min: Number.isFinite(sm) ? sm : null };
  });
}

const questionsQ = (env, examId) => env.DB.prepare("SELECT id, pos, label, text_html, marks, type, suggested_min, img IS NOT NULL AS has_img FROM questions WHERE exam_id = ? ORDER BY pos").bind(examId);
const questionList = (rows) => rows.map((q) => ({ ...q, has_img: !!q.has_img }));
async function questionRows(env, examId) { return questionList((await questionsQ(env, examId).all()).results); }
const eventsQ = (env, examId) => env.DB.prepare("SELECT at, kind, detail FROM events WHERE exam_id = ? ORDER BY id").bind(examId);

/* ---------- time on each question ---------- */

/* The student page says which question is on screen with every poll. Only while the exam runs, never in a teacher preview. */
async function noteView(env, exam, questionId, now) {
  if (!canWrite(exam) || !questionId) return;
  const [qr, lr] = await reads(env, [env.DB.prepare("SELECT id FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, questionId),
    env.DB.prepare("SELECT id, question_id, end_at FROM question_views WHERE exam_id = ? ORDER BY id DESC LIMIT 1").bind(exam.id)]);
  if (!qr.length) return;
  const last = lr[0];
  const fresh = last && now - last.end_at <= VIEW_GAP && now >= last.end_at;
  if (fresh && last.question_id === questionId) {
    await env.DB.prepare("UPDATE question_views SET end_at = ? WHERE id = ?").bind(now, last.id).run();
    return;
  }
  const stmts = [];
  if (fresh) stmts.push(env.DB.prepare("UPDATE question_views SET end_at = ? WHERE id = ?").bind(now, last.id));   // he moved on just now
  stmts.push(env.DB.prepare("INSERT INTO question_views (exam_id, question_id, start_at, end_at) VALUES (?, ?, ?, ?)").bind(exam.id, questionId, now, now));
  await env.DB.batch(stmts);
}

const viewsQ = (env, examId) => env.DB.prepare("SELECT question_id, start_at, end_at FROM question_views WHERE exam_id = ? ORDER BY id").bind(examId);

/* Per question: total seconds, number of visits and each visit. `on` is the question on his screen right now, if any. */
function timeOn(views, now) {
  const per = {};
  for (const v of views) {
    const p = per[v.question_id] || (per[v.question_id] = { seconds: 0, visits: [] });
    p.seconds += (v.end_at - v.start_at) / 1000;
    p.visits.push({ from: v.start_at, to: v.end_at });
  }
  for (const k of Object.keys(per)) per[k].seconds = Math.round(per[k].seconds);
  const last = views[views.length - 1];
  return { per, on: last && now - last.end_at <= VIEW_GAP ? last.question_id : null };
}

/* ---------- answers and uploads (shared by the student, phone and teacher views) ---------- */

const answersQ = (env, examId) => env.DB.prepare(
  "SELECT a.question_id, a.text, a.seq, a.server_at, a.late FROM answer_revisions a " +
  "JOIN (SELECT question_id, MAX(id) AS mid FROM answer_revisions WHERE exam_id = ? GROUP BY question_id) m ON a.id = m.mid"
).bind(examId);
function answerMap(rows) {
  const out = {};
  for (const a of rows) out[a.question_id] = { text: a.text, seq: a.seq, savedAt: a.server_at, late: !!a.late };
  return out;
}

const uploadsQ = (env, examId, questionId) => questionId
  ? env.DB.prepare("SELECT id, question_id, source, mime, bytes, width, height, server_at, late FROM uploads WHERE exam_id = ? AND question_id = ? AND deleted_at IS NULL ORDER BY server_at").bind(examId, questionId)
  : env.DB.prepare("SELECT id, question_id, source, mime, bytes, width, height, server_at, late FROM uploads WHERE exam_id = ? AND deleted_at IS NULL ORDER BY server_at").bind(examId);
const uploadItems = (rows) => rows.map((u) => ({ id: u.id, question: u.question_id, source: u.source, mime: u.mime, bytes: u.bytes, width: u.width, height: u.height, at: u.server_at, late: !!u.late }));
async function uploadList(env, examId, questionId) { return uploadItems((await uploadsQ(env, examId, questionId).all()).results); }

async function saveUpload(env, exam, questionId, source, request, now) {
  if (!canWrite(exam)) fail(409, exam.status === "waiting" ? "The exam has not started yet." : "The exam has ended, so nothing more can be added.");
  const q = await env.DB.prepare("SELECT id FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, questionId).first();
  if (!q) fail(404, "No such question.");
  const bytes = await bytesOf(request);
  const img = checkImage(bytes);
  if (img.error) fail(img.status || 415, img.error);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE exam_id = ? AND question_id = ? AND deleted_at IS NULL").bind(exam.id, questionId).first();
  if (count.n >= MAX_UPLOADS_PER_Q) fail(409, "This question already has " + MAX_UPLOADS_PER_Q + " pictures. Remove one first.");
  const id = randomToken(12);
  const late = now > exam.original_end_at ? 1 : 0;
  await env.DB.prepare("INSERT INTO uploads (id, exam_id, question_id, source, mime, bytes, width, height, data, server_at, late) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, exam.id, questionId, source, img.mime, bytes.length, img.width, img.height, bytes, now, late).run();
  return { id, question: questionId, source, mime: img.mime, bytes: bytes.length, width: img.width, height: img.height, at: now, late: !!late };
}

async function sendUpload(env, examId, uploadId, questionId) {
  const u = await env.DB.prepare("SELECT question_id, mime, data, deleted_at FROM uploads WHERE id = ? AND exam_id = ?").bind(uploadId, examId).first();
  if (!u || (questionId && u.question_id !== questionId)) fail(404, "No such picture.");
  return imageResponse(toBytes(u.data), u.mime);
}

/* ---------- router ---------- */

async function route(request, env, now) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, "");
  const m = request.method;
  let a;

  if (p === "/api/health" || p === "/api") return json({ ok: true, serverNow: now });

  /* ===== student ===== */
  if (p.startsWith("/api/s/")) {
    const exam = await examByToken(env, request.headers.get("X-Exam-Token"));
    await noteTimeUp(env, exam, now);

    if (p === "/api/s/state" && m === "GET") {
      await noteView(env, exam, url.searchParams.get("q"), now);
      // Questions only from Start on, and not once the exam is locked.
      const open = started(exam) && exam.status !== "locked";
      const seen = env.DB.prepare("UPDATE exams SET last_seen_at = ? WHERE id = ?").bind(now, exam.id);
      const r = (await reads(env, open ? [seen, extensionsQ(env, exam.id), questionsQ(env, exam.id), answersQ(env, exam.id), uploadsQ(env, exam.id)] : [seen, extensionsQ(env, exam.id)])).slice(1);
      const out = { title: exam.title, subject: exam.subject, practice: !!exam.practice, ...clock(exam, now, r[0]) };
      if (open) {
        out.questions = questionList(r[1]).map((q) => ({ id: q.id, pos: q.pos, label: q.label, text_html: q.text_html, marks: q.marks, type: q.type, suggested_min: q.suggested_min, has_img: q.has_img }));
        out.answers = answerMap(r[2]);
        out.uploads = uploadItems(r[3]);
      }
      return json(out);
    }
    if ((a = p.match(/^\/api\/s\/questions\/([\w-]+)\/image$/)) && m === "GET") {
      if (!started(exam) || exam.status === "locked") fail(403, "The exam is not open.");
      const q = await env.DB.prepare("SELECT img, img_mime FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, a[1]).first();
      if (!q || !q.img) fail(404, "No picture for this question.");
      return imageResponse(toBytes(q.img), q.img_mime);
    }
    if ((a = p.match(/^\/api\/s\/answers\/([\w-]+)$/)) && m === "PUT") {
      if (!canWrite(exam)) fail(409, exam.status === "waiting" || exam.status === "draft" ? "The exam has not started yet." : "The exam has ended, so answers can't be changed.");
      const q = await env.DB.prepare("SELECT id FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, a[1]).first();
      if (!q) fail(404, "No such question.");
      const b = await body(request);
      const text = String(b.text == null ? "" : b.text);
      if (text.length > MAX_TEXT) fail(413, "This answer is too long.");
      const seq = Math.floor(Number(b.seq));
      if (!(seq >= 1)) fail(400, "Missing save number.");
      const last = await env.DB.prepare("SELECT text, seq, server_at, late FROM answer_revisions WHERE exam_id = ? AND question_id = ? ORDER BY id DESC LIMIT 1").bind(exam.id, a[1]).first();
      // An older save that arrives late (or twice) must never overwrite a newer one.
      if (last && seq <= last.seq) return json({ ok: true, stale: true, seq: last.seq, savedAt: last.server_at, late: !!last.late });
      if (last && last.text === text) {
        await env.DB.prepare("UPDATE answer_revisions SET seq = ? WHERE exam_id = ? AND question_id = ? AND seq = ?").bind(seq, exam.id, a[1], last.seq).run();
        return json({ ok: true, unchanged: true, seq, savedAt: last.server_at, late: !!last.late });
      }
      const late = now > exam.original_end_at ? 1 : 0;
      const clientAt = Number.isFinite(Number(b.clientAt)) ? Math.floor(Number(b.clientAt)) : null;
      await env.DB.prepare("INSERT INTO answer_revisions (exam_id, question_id, text, seq, client_at, server_at, late) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(exam.id, a[1], text, seq, clientAt, now, late).run();
      return json({ ok: true, seq, savedAt: now, late: !!late });
    }
    if ((a = p.match(/^\/api\/s\/uploads\/([\w-]+)$/)) && m === "POST") {
      const src = request.headers.get("X-Upload-Source") === "drawing" ? "drawing" : "file";
      return json(await saveUpload(env, exam, a[1], src, request, now), 201);
    }
    if ((a = p.match(/^\/api\/s\/uploads\/([\w-]+)$/)) && m === "DELETE") {
      if (!canWrite(exam)) fail(409, "The exam has ended, so pictures can't be removed.");
      const u = await env.DB.prepare("SELECT question_id FROM uploads WHERE id = ? AND exam_id = ? AND deleted_at IS NULL").bind(a[1], exam.id).first();
      if (!u) fail(404, "No such picture.");
      await env.DB.prepare("UPDATE uploads SET deleted_at = ? WHERE id = ?").bind(now, a[1]).run();
      await event(env, exam.id, now, "remove-picture", u.question_id);
      return json({ ok: true });
    }
    if ((a = p.match(/^\/api\/s\/files\/([\w-]+)$/)) && m === "GET") {
      const u = await env.DB.prepare("SELECT deleted_at FROM uploads WHERE id = ? AND exam_id = ?").bind(a[1], exam.id).first();
      if (!u || u.deleted_at) fail(404, "No such picture.");
      return sendUpload(env, exam.id, a[1]);
    }
    if ((a = p.match(/^\/api\/s\/phone-token\/([\w-]+)$/)) && m === "POST") {
      if (!canWrite(exam)) fail(409, "The exam is not running.");
      const q = await env.DB.prepare("SELECT id FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, a[1]).first();
      if (!q) fail(404, "No such question.");
      const old = await env.DB.prepare("SELECT token FROM phone_tokens WHERE exam_id = ? AND question_id = ?").bind(exam.id, a[1]).first();
      if (old) return json({ token: old.token });
      const token = randomToken(32);
      await env.DB.prepare("INSERT INTO phone_tokens (token, exam_id, question_id, created_at) VALUES (?, ?, ?, ?)").bind(token, exam.id, a[1], now).run();
      return json({ token }, 201);
    }
    if (p === "/api/s/submit" && m === "POST") {
      if (!canWrite(exam)) fail(409, "The exam is not running.");
      await env.DB.prepare("UPDATE exams SET status = 'submitted', submitted_at = ? WHERE id = ?").bind(now, exam.id).run();
      await event(env, exam.id, now, "submit", "");
      return json({ ok: true, status: "submitted", submittedAt: now });
    }
    fail(404, "Not found.");
  }

  /* ===== phone ===== */
  if (p.startsWith("/api/p/")) {
    const token = request.headers.get("X-Phone-Token") || "";
    if (token.length < 32) fail(404, "This phone link is not valid.");
    const pt = await env.DB.prepare("SELECT exam_id, question_id FROM phone_tokens WHERE token = ?").bind(token).first();
    if (!pt) fail(404, "This phone link is not valid.");
    const exam = await examById(env, pt.exam_id);
    if (p === "/api/p/info" && m === "GET") {
      const q = await env.DB.prepare("SELECT label, pos FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, pt.question_id).first();
      return json({ title: exam.title, question: pt.question_id, label: q ? q.label : "", number: q ? q.pos + 1 : null, status: liveStatus(exam, now), uploads: await uploadList(env, exam.id, pt.question_id) });
    }
    if (p === "/api/p/upload" && m === "POST") return json(await saveUpload(env, exam, pt.question_id, "phone", request, now), 201);
    if ((a = p.match(/^\/api\/p\/files\/([\w-]+)$/)) && m === "GET") {
      const u = await env.DB.prepare("SELECT deleted_at FROM uploads WHERE id = ? AND exam_id = ?").bind(a[1], exam.id).first();
      if (!u || u.deleted_at) fail(404, "No such picture.");
      return sendUpload(env, exam.id, a[1], pt.question_id);
    }
    fail(404, "Not found.");
  }

  /* ===== teacher ===== */
  if (p.startsWith("/api/t/")) {
    await requireTeacher(request, env);

    if (p === "/api/t/check" && m === "GET") return json({ ok: true, serverNow: now });

    if (p === "/api/t/papers" && m === "GET") return json((await env.DB.prepare("SELECT id, label, marks, minutes FROM past_papers ORDER BY id").all()).results);
    if (p === "/api/t/papers" && m === "POST") {
      const b = await body(request);
      const marks = Number(b.marks), minutes = Number(b.minutes);
      if (!(marks > 0) || !(minutes > 0)) fail(400, "A past paper needs its marks and minutes.");
      const r = await env.DB.prepare("INSERT INTO past_papers (label, marks, minutes) VALUES (?, ?, ?)").bind(String(b.label || "Past paper").slice(0, 120), marks, minutes).run();
      return json({ id: r.meta.last_row_id, label: b.label, marks, minutes }, 201);
    }
    if ((a = p.match(/^\/api\/t\/papers\/(\d+)$/)) && m === "DELETE") {
      await env.DB.prepare("DELETE FROM past_papers WHERE id = ?").bind(Number(a[1])).run();
      return json({ ok: true });
    }

    if (p === "/api/t/exams" && m === "GET") {
      const r = await env.DB.prepare("SELECT e.*, (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS n_questions, (SELECT COALESCE(SUM(marks), 0) FROM questions q WHERE q.exam_id = e.id) AS total_marks FROM exams e ORDER BY created_at DESC").all();
      return json(r.results.map((e) => ({ id: e.id, title: e.title, subject: e.subject, sourcePath: e.source_path, practice: !!e.practice, status: liveStatus(e, now), createdAt: e.created_at, startedAt: e.started_at, endAt: e.end_at, questions: e.n_questions, totalMarks: e.total_marks })));
    }
    if (p === "/api/t/exams" && m === "POST") {
      const b = await body(request);
      const title = String(b.title || "").trim().slice(0, 200);
      if (!title) fail(400, "The exam needs a title.");
      const qs = cleanQuestions(b.questions);
      const id = randomToken(9);
      const ratio = b.ratio == null || b.ratio === "" ? null : Number(b.ratio);
      const base = Number(b.base_minutes) || 0;
      const stmts = [env.DB.prepare("INSERT INTO exams (id, title, subject, source_path, ratio, base_minutes, practice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, title, String(b.subject || "").slice(0, 40), String(b.source_path || "").slice(0, 300), Number.isFinite(ratio) ? ratio : null, base, b.practice ? 1 : 0, now)];
      for (const q of qs) stmts.push(env.DB.prepare("INSERT INTO questions (id, exam_id, pos, label, text_html, marks, type, suggested_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(q.id, id, q.pos, q.label, q.text_html, q.marks, q.type, q.suggested_min));
      stmts.push(env.DB.prepare("INSERT INTO events (exam_id, at, kind, detail) VALUES (?, ?, 'created', ?)").bind(id, now, String(b.source_path || "")));
      await env.DB.batch(stmts);
      return json({ id }, 201);
    }

    if ((a = p.match(/^\/api\/t\/files\/([\w-]+)$/)) && m === "GET") {
      const u = await env.DB.prepare("SELECT mime, data FROM uploads WHERE id = ?").bind(a[1]).first();
      if (!u) fail(404, "No such picture.");
      return imageResponse(toBytes(u.data), u.mime, true);
    }

    if ((a = p.match(/^\/api\/t\/exams\/([\w-]+)(\/.*)?$/))) {
      const exam = await examById(env, a[1]);
      const sub = a[2] || "";
      await noteTimeUp(env, exam, now);
      let b2;

      if (sub === "" && m === "GET") {
        const [ext, qs, evs] = await reads(env, [extensionsQ(env, exam.id), questionsQ(env, exam.id), eventsQ(env, exam.id)]);
        return json({
          id: exam.id, title: exam.title, subject: exam.subject, sourcePath: exam.source_path, practice: !!exam.practice, token: exam.token, ratio: exam.ratio, createdAt: exam.created_at, lastSeenAt: exam.last_seen_at,
          ...clock(exam, now, ext), questions: questionList(qs), events: evs
        });
      }
      if (sub === "" && m === "PUT") {
        const b = await body(request);
        const sets = [], vals = [];
        if (b.title != null) { const t = String(b.title).trim().slice(0, 200); if (!t) fail(400, "The exam needs a title."); sets.push("title = ?"); vals.push(t); }
        if (b.ratio !== undefined) { const r = b.ratio === null || b.ratio === "" ? null : Number(b.ratio); sets.push("ratio = ?"); vals.push(Number.isFinite(r) ? r : null); }
        if (b.base_minutes != null) {
          if (started(exam)) fail(409, "The exam has started. Use the + minutes buttons instead.");
          const bm = Number(b.base_minutes); if (!(bm > 0 && bm <= 1440)) fail(400, "The duration must be between 1 and 1440 minutes.");
          sets.push("base_minutes = ?"); vals.push(bm);
        }
        const stmts = [];
        if (sets.length) stmts.push(env.DB.prepare("UPDATE exams SET " + sets.join(", ") + " WHERE id = ?").bind(...vals, exam.id));
        if (b.questions) {
          if (started(exam)) fail(409, "Questions can't change once the exam has started.");
          const qs = cleanQuestions(b.questions);
          const keep = qs.map((q) => q.id);
          stmts.push(env.DB.prepare("DELETE FROM questions WHERE exam_id = ? AND id NOT IN (" + keep.map(() => "?").join(",") + ")").bind(exam.id, ...keep));
          for (const q of qs) stmts.push(env.DB.prepare(
            "INSERT INTO questions (id, exam_id, pos, label, text_html, marks, type, suggested_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT (exam_id, id) DO UPDATE SET pos = excluded.pos, label = excluded.label, text_html = excluded.text_html, marks = excluded.marks, type = excluded.type, suggested_min = excluded.suggested_min"
          ).bind(q.id, exam.id, q.pos, q.label, q.text_html, q.marks, q.type, q.suggested_min));
        }
        if (stmts.length) await env.DB.batch(stmts);
        return json({ ok: true });
      }
      if (sub === "" && m === "DELETE") {
        if (exam.status === "running") fail(409, "Lock the exam before deleting it.");
        await env.DB.batch(["exams:id", "questions:exam_id", "extensions:exam_id", "answer_revisions:exam_id", "uploads:exam_id", "phone_tokens:exam_id", "marks:exam_id", "events:exam_id", "question_views:exam_id"]
          .map((t) => { const [table, col] = t.split(":"); return env.DB.prepare("DELETE FROM " + table + " WHERE " + col + " = ?").bind(exam.id); }));
        return json({ ok: true });
      }
      if ((b2 = sub.match(/^\/questions\/([\w-]+)\/image$/))) {
        const q = await env.DB.prepare("SELECT img, img_mime FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, b2[1]).first();
        if (!q) fail(404, "No such question.");
        if (m === "GET") { if (!q.img) fail(404, "No picture for this question."); return imageResponse(toBytes(q.img), q.img_mime); }
        if (m === "PUT") {
          if (started(exam)) fail(409, "Questions can't change once the exam has started.");
          const bytes = await bytesOf(request); const img = checkImage(bytes); if (img.error) fail(img.status || 415, img.error);
          await env.DB.prepare("UPDATE questions SET img = ?, img_mime = ? WHERE exam_id = ? AND id = ?").bind(bytes, img.mime, exam.id, b2[1]).run();
          return json({ ok: true, width: img.width, height: img.height });
        }
        if (m === "DELETE") { await env.DB.prepare("UPDATE questions SET img = NULL, img_mime = NULL WHERE exam_id = ? AND id = ?").bind(exam.id, b2[1]).run(); return json({ ok: true }); }
      }
      if (sub === "/link" && m === "POST") {
        if (exam.status === "locked") fail(409, "This exam is locked.");
        const token = randomToken(32);
        await env.DB.prepare("UPDATE exams SET token = ?, status = CASE WHEN status = 'draft' THEN 'waiting' ELSE status END WHERE id = ?").bind(token, exam.id).run();
        await env.DB.prepare("DELETE FROM phone_tokens WHERE exam_id = ?").bind(exam.id).run();
        await event(env, exam.id, now, exam.token ? "new-link" : "link", "");
        return json({ token });
      }
      if (sub === "/start" && m === "POST") {
        if (exam.status !== "waiting") fail(409, exam.status === "draft" ? "Make the student link first." : "The exam has already started.");
        if (!(exam.base_minutes > 0)) fail(409, "Set the duration first.");
        const end = now + Math.round(exam.base_minutes * 60000);
        await env.DB.prepare("UPDATE exams SET status = 'running', started_at = ?, original_end_at = ?, end_at = ? WHERE id = ?").bind(now, end, end, exam.id).run();
        await event(env, exam.id, now, "start", exam.base_minutes + " min");
        return json({ ok: true, startedAt: now, originalEndAt: end, endAt: end });
      }
      if (sub === "/extend" && m === "POST") {
        const b = await body(request);
        const minutes = Number(b.minutes);
        if (!(minutes > 0 && minutes <= MAX_EXTEND)) fail(400, "Add between 1 and " + MAX_EXTEND + " minutes.");
        if (exam.status !== "running") fail(409, exam.status === "locked" || exam.status === "submitted" ? "Reopen the exam before adding time." : "Start the exam first.");
        // Extra time counts from the current end, or from now if the time has already run out.
        const from = Math.max(exam.end_at, now);
        const end = from + Math.round(minutes * 60000);
        await env.DB.batch([
          env.DB.prepare("UPDATE exams SET end_at = ? WHERE id = ?").bind(end, exam.id),
          env.DB.prepare("INSERT INTO extensions (exam_id, minutes, at) VALUES (?, ?, ?)").bind(exam.id, minutes, now),
          env.DB.prepare("INSERT INTO events (exam_id, at, kind, detail) VALUES (?, ?, 'extend', ?)").bind(exam.id, now, "+" + minutes + " min")
        ]);
        return json({ ok: true, endAt: end, extensions: await extensionsOf(env, exam.id) });
      }
      if (sub === "/lock" && m === "POST") {
        if (exam.status === "locked") return json({ ok: true, lockedAt: exam.locked_at });
        if (exam.status === "draft") fail(409, "This exam has not been opened yet.");
        await env.DB.prepare("UPDATE exams SET status = 'locked', locked_at = ? WHERE id = ?").bind(now, exam.id).run();
        await event(env, exam.id, now, "lock", "");
        return json({ ok: true, lockedAt: now });
      }
      if (sub === "/reopen" && m === "POST") {
        if (exam.status !== "locked" && exam.status !== "submitted") fail(409, "Only a locked or handed-in exam can be reopened.");
        const to = started(exam) ? "running" : "waiting";
        await env.DB.prepare("UPDATE exams SET status = ?, locked_at = NULL, submitted_at = NULL WHERE id = ?").bind(to, exam.id).run();
        await event(env, exam.id, now, "reopen", "");
        return json({ ok: true, status: to });
      }
      /* What the student page shows, for the teacher's "Student view": questions at any time, his answers and pictures
         as they are now. It never counts as him being there and never records time on a question. */
      if (sub === "/student" && m === "GET") {
        const [ext, qs, ans, ups, vs] = await reads(env, [extensionsQ(env, exam.id), questionsQ(env, exam.id), answersQ(env, exam.id), uploadsQ(env, exam.id), viewsQ(env, exam.id)]);
        return json({ title: exam.title, subject: exam.subject, practice: !!exam.practice, ...clock(exam, now, ext),
          questions: questionList(qs).map((q) => ({ id: q.id, pos: q.pos, label: q.label, text_html: q.text_html, marks: q.marks, type: q.type, suggested_min: q.suggested_min, has_img: q.has_img })),
          answers: answerMap(ans), uploads: uploadItems(ups), lastSeenAt: exam.last_seen_at, on: timeOn(vs, now).on });
      }
      if (sub === "/live" && m === "GET") {
        const [saves, ups, vs, ext] = await reads(env, [
          env.DB.prepare("SELECT question_id, MAX(server_at) AS at, COUNT(*) AS n, MAX(late) AS late FROM answer_revisions WHERE exam_id = ? GROUP BY question_id").bind(exam.id),
          env.DB.prepare("SELECT question_id, COUNT(*) AS n, MAX(server_at) AS at FROM uploads WHERE exam_id = ? AND deleted_at IS NULL GROUP BY question_id").bind(exam.id),
          viewsQ(env, exam.id), extensionsQ(env, exam.id)]);
        const perQ = {};
        for (const s of saves) perQ[s.question_id] = { lastSave: s.at, saves: s.n, late: !!s.late, pictures: 0 };
        for (const u of ups) { perQ[u.question_id] = perQ[u.question_id] || { lastSave: null, saves: 0, late: false }; perQ[u.question_id].pictures = u.n; perQ[u.question_id].lastPicture = u.at; }
        const views = timeOn(vs, now);
        for (const [q, v] of Object.entries(views.per)) { perQ[q] = perQ[q] || { lastSave: null, saves: 0, late: false, pictures: 0 }; perQ[q].seconds = v.seconds; perQ[q].visits = v.visits.length; }
        return json({ ...clock(exam, now, ext), lastSeenAt: exam.last_seen_at, perQuestion: perQ, on: views.on });
      }
      if ((sub === "/review" || sub === "/export") && m === "GET") {
        const [revs, marks, ups, vs, qs, ext, evs] = await reads(env, [
          env.DB.prepare("SELECT question_id, text, seq, client_at, server_at, late FROM answer_revisions WHERE exam_id = ? ORDER BY id").bind(exam.id),
          env.DB.prepare("SELECT question_id, score, comment, ticks, updated_at FROM marks WHERE exam_id = ?").bind(exam.id),
          uploadsQ(env, exam.id), viewsQ(env, exam.id), questionsQ(env, exam.id), extensionsQ(env, exam.id), eventsQ(env, exam.id)]);
        const uploads = uploadItems(ups);
        const views = timeOn(vs, now);
        const questions = questionList(qs).map((q) => {
          const mine = revs.filter((r) => r.question_id === q.id);
          const inTime = mine.filter((r) => !r.late);
          const mk = marks.find((x) => x.question_id === q.id);
          return {
            ...q,
            final: mine.length ? mine[mine.length - 1].text : "",
            finalAt: mine.length ? mine[mine.length - 1].server_at : null,
            atOriginalEnd: inTime.length ? inTime[inTime.length - 1].text : "",
            writtenLate: mine.some((r) => r.late),
            revisions: mine.map((r) => ({ text: r.text, at: r.server_at, clientAt: r.client_at, late: !!r.late })),
            uploads: uploads.filter((u) => u.question === q.id),
            score: mk ? mk.score : null,
            comment: mk ? mk.comment : "",
            ticks: mk && mk.ticks ? JSON.parse(mk.ticks) : null,
            seconds: views.per[q.id] ? views.per[q.id].seconds : 0,
            visits: views.per[q.id] ? views.per[q.id].visits : []
          };
        });
        const total = questions.reduce((s, q) => s + (q.score || 0), 0);
        const max = questions.reduce((s, q) => s + q.marks, 0);
        return json({
          id: exam.id, title: exam.title, subject: exam.subject, sourcePath: exam.source_path, practice: !!exam.practice,
          ...clock(exam, now, ext),
          questions, total, max, marked: questions.filter((q) => q.score != null).length,
          events: evs
        });
      }
      if ((b2 = sub.match(/^\/marks\/([\w-]+)$/)) && m === "PUT") {
        const q = await env.DB.prepare("SELECT marks FROM questions WHERE exam_id = ? AND id = ?").bind(exam.id, b2[1]).first();
        if (!q) fail(404, "No such question.");
        const b = await body(request);
        const score = b.score === null || b.score === "" || b.score === undefined ? null : Number(b.score);
        if (score !== null && !(score >= 0 && score <= q.marks)) fail(400, "The mark must be between 0 and " + q.marks + ".");
        // ticks: the marks given for each line of the mark list; left out = keep what is there
        let ticks = null;
        if (b.ticks !== undefined && b.ticks !== null) {
          if (!Array.isArray(b.ticks) || b.ticks.length > 60 || !b.ticks.every((t) => Number.isFinite(Number(t)) && Number(t) >= 0 && Number(t) <= 20)) fail(400, "The ticked marks are not valid.");
          ticks = JSON.stringify(b.ticks.map(Number));
        }
        await env.DB.prepare("INSERT INTO marks (exam_id, question_id, score, comment, ticks, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (exam_id, question_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, ticks = COALESCE(excluded.ticks, marks.ticks), updated_at = excluded.updated_at")
          .bind(exam.id, b2[1], score, String(b.comment || "").slice(0, 5000), ticks, now).run();
        return json({ ok: true, score, updatedAt: now });
      }
    }
    fail(404, "Not found.");
  }

  fail(404, "Not found.");
}
