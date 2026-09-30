/* Tutor Desk: lesson scripts + live lesson log, stored in a private GitHub repo.
   Everything the page records goes to  students/<student>/lessons/<lesson>/session.json
   Photos of his work go to             students/<student>/lessons/<lesson>/work/
   The page holds no data of its own; the GitHub key lives only in this browser. */
(function () {
"use strict";
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function clean(h) { h = h == null ? "" : String(h); return window.DOMPurify ? DOMPurify.sanitize(h, { USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true } }) : esc(h); }
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
var SUBJ = { chem: "Chemistry", maths: "Maths" };
var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pdate(iso) { var p = String(iso).slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function fmtDate(iso, long) { if (!iso) return ""; var d = pdate(iso); return long ? DAYL[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() : DAY[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; }
function hhmm(iso) { if (!iso) return ""; var d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function todayIso() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function now() { return new Date().toISOString(); }

/* ---------------- settings ---------------- */
var CFG = {
  get token() { return ls("tutor.token") || ""; },
  get repo() { return ls("tutor.repo") || "alimuqaddasm/tutoring"; },
  get device() { return ls("tutor.device") || "tablet"; },
  get student() { return ls("tutor.student") || "UK-1"; }
};

/* ---------------- GitHub ---------------- */
var API = "https://api.github.com";
function gh(path, opts) {
  opts = opts || {};
  var h = { "Authorization": "Bearer " + CFG.token, "Accept": opts.accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (opts.body) h["Content-Type"] = "application/json";
  return fetch(API + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
    .then(function (r) { if (r.status === 404) return { status: 404 }; if (!r.ok) return r.text().then(function (t) { var e = new Error("GitHub " + r.status + ": " + t.slice(0, 160)); e.status = r.status; throw e; }); return opts.raw ? r.blob().then(function (b) { return { status: r.status, blob: b }; }) : r.json().then(function (j) { return { status: r.status, json: j }; }); });
}
function enc(p) { return p.split("/").map(encodeURIComponent).join("/"); }
function b64enc(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function b64dec(b64) { var bin = atob(String(b64).replace(/\s/g, "")); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
function getText(path) { return gh("/repos/" + CFG.repo + "/contents/" + enc(path)).then(function (r) { if (r.status === 404) return null; return { text: b64dec(r.json.content), sha: r.json.sha }; }); }
function getJSON(path) { return getText(path).then(function (r) { return r ? { data: JSON.parse(r.text), sha: r.sha } : null; }); }
function putB64(path, b64, msg, sha) { return gh("/repos/" + CFG.repo + "/contents/" + enc(path), { method: "PUT", body: { message: msg, content: b64, sha: sha || undefined } }).then(function (r) { return r.json.content.sha; }); }
var rawCache = {};
function rawURL(path) { if (rawCache[path]) return Promise.resolve(rawCache[path]); return gh("/repos/" + CFG.repo + "/contents/" + enc(path), { accept: "application/vnd.github.raw", raw: true }).then(function (r) { if (r.status === 404) return null; var u = URL.createObjectURL(r.blob); rawCache[path] = u; return u; }); }
var TREE = null;
function loadTree(force) {
  if (TREE && !force) return Promise.resolve(TREE);
  return gh("/repos/" + CFG.repo + "/git/trees/HEAD?recursive=1").then(function (r) { TREE = r.status === 404 ? [] : r.json.tree; return TREE; })
    .catch(function (e) { if (e.status === 409) { TREE = []; return TREE; } throw e; });
}
function shaOf(path) { var f = (TREE || []).filter(function (t) { return t.path === path; })[0]; return f ? f.sha : null; }
var jsonCache = {};
function cachedJSON(path) { var sha = shaOf(path); var k = path + "@" + sha; if (jsonCache[k]) return Promise.resolve(jsonCache[k]); return getJSON(path).then(function (r) { var d = r && r.data; jsonCache[k] = d; return d; }); }
function studentBase() { return "students/" + CFG.student + "/"; }
function lessonBase(id) { return studentBase() + "lessons/" + id + "/"; }

/* ---------------- status + toast ---------------- */
var saveEl = $("#save"), timers = {};
function setSave(t, err) { saveEl.textContent = t; saveEl.className = "save" + (err ? " err" : ""); }
function toast(t) { var el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(timers.toast); timers.toast = setTimeout(function () { el.hidden = true; }, 3000); }

/* ---------------- session model ---------------- */
var VERD = [["right", "✓ Right"], ["wrong", "✗ Wrong"], ["wording", "Wording"], ["terminology", "Terminology"], ["partly", "Partly"], ["skipped", "Skipped"]];
var VHELP = { right: "right", wrong: "wrong", wording: "right idea, wrong wording", terminology: "wrong term used", partly: "partly right", skipped: "not attempted" };
function newSession(id, script) {
  var p = parseId(id);
  return { v: 1, lesson: id, student: CFG.student, subject: (script && script.subject) || p.subject, date: (script && script.date) || p.date, title: (script && script.title) || "",
    status: "not-started", time: { log: [], started: null, ended: null, minutes: null, phaseMinutes: {} }, answers: {}, extra: [], work: [], feedback: {}, devices: [], updated: null };
}
function parseId(id) { var m = /^(\d{4}-\d{2}-\d{2})-([a-z]+)/.exec(id) || []; return { date: m[1] || "", subject: m[2] || "" }; }
function replay(log, upto) {
  /* returns {secs, running, phase, phaseSecs} from the event log */
  var running = false, since = null, phase = null, secs = 0, per = {};
  var end = upto || Date.now();
  function add(t) { if (running && since != null) { var d = (t - since) / 1000; secs += d; if (phase) per[phase] = (per[phase] || 0) + d; } since = t; }
  (log || []).forEach(function (e) { var t = Date.parse(e.t); add(t);
    if (e.e === "start" || e.e === "resume") { running = true; if (e.p) phase = e.p; }
    else if (e.e === "pause" || e.e === "end") running = false;
    else if (e.e === "phase") phase = e.p; });
  add(end);
  return { secs: Math.round(secs), running: running, phase: phase, per: per };
}
function merge(local, remote) {
  if (!remote) return local; var out = JSON.parse(JSON.stringify(remote));
  Object.keys(local.answers || {}).forEach(function (k) { var a = local.answers[k], b = out.answers[k]; if (!b || String(a.at) > String(b.at)) out.answers[k] = a; });
  var ids = {}; out.extra.forEach(function (x) { ids[x.id] = x; }); (local.extra || []).forEach(function (x) { if (!ids[x.id] || String(x.at) > String(ids[x.id].at)) ids[x.id] = x; });
  out.extra = Object.keys(ids).map(function (k) { return ids[k]; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  var files = {}; out.work.forEach(function (w) { files[w.file] = w; }); (local.work || []).forEach(function (w) { files[w.file] = files[w.file] || w; });
  out.work = Object.keys(files).map(function (k) { return files[k]; });
  var ev = {}; out.time.log.concat(local.time.log || []).forEach(function (e) { ev[e.t + e.e + (e.p || "")] = e; });
  out.time.log = Object.keys(ev).map(function (k) { return ev[k]; }).sort(function (a, b) { return a.t.localeCompare(b.t); });
  if (String((local.feedback || {}).at) > String((out.feedback || {}).at)) out.feedback = local.feedback;
  var rank = { "not-started": 0, "in-progress": 1, "finished": 2 }; if (rank[local.status] > rank[out.status]) out.status = local.status;
  ["title", "subject", "date"].forEach(function (k) { if (!out[k] && local[k]) out[k] = local[k]; });
  finalizeTime(out); return out;
}
function finalizeTime(s) { var log = s.time.log; if (!log.length) return;
  var starts = log.filter(function (e) { return e.e === "start"; }), ends = log.filter(function (e) { return e.e === "end"; });
  s.time.started = starts.length ? starts[0].t : null; s.time.ended = ends.length ? ends[ends.length - 1].t : null;
  var r = replay(log, s.time.ended && !replay(log).running ? Date.parse(s.time.ended) : Date.now());
  s.time.minutes = Math.round(r.secs / 6) / 10; var pm = {}; Object.keys(r.per).forEach(function (k) { pm[k] = Math.round(r.per[k] / 6) / 10; }); s.time.phaseMinutes = pm; }

/* ---------------- current lesson state + saving ---------------- */
var L = null; /* {id, script, session, sha, dirty, phase, filter} */
function localKey(id) { return "tutor.s." + CFG.repo + "." + CFG.student + "." + id; }
function stash() { if (L) ls(localKey(L.id), JSON.stringify({ session: L.session, sha: L.sha, dirty: L.dirty })); }
function touch() { if (!L) return; L.session.updated = now(); if (L.session.devices.indexOf(CFG.device) < 0) L.session.devices.push(CFG.device);
  if (L.session.status === "not-started") L.session.status = "in-progress"; L.dirty = true; L.rev = (L.rev || 0) + 1; stash(); setSave("Kept on device"); clearTimeout(timers.flush); timers.flush = setTimeout(flush, 6000); }
var flushing = false;
function flush() {
  if (!L || !L.dirty || flushing) return Promise.resolve();
  if (!navigator.onLine) { setSave("Offline · kept on device", true); return Promise.resolve(); }
  flushing = true; setSave("Saving…"); var mine = L, rev = mine.rev || 0; finalizeTime(mine.session);
  var path = lessonBase(mine.id) + "session.json";
  function put(sha) { return putB64(path, b64enc(JSON.stringify(mine.session, null, 1)), CFG.student + " " + mine.id + ": lesson log (" + CFG.device + ")", sha); }
  return put(mine.sha).catch(function (e) {
    if (e.status === 409 || e.status === 422) return getJSON(path).then(function (r) { mine.session = merge(mine.session, r && r.data); return put(r && r.sha); });
    throw e;
  }).then(function (sha) { mine.sha = sha; mine.dirty = (mine.rev || 0) !== rev; if (L === mine) { stash(); } else ls(localKey(mine.id), JSON.stringify({ session: mine.session, sha: sha, dirty: false }));
    setSave(mine.dirty ? "Saving…" : "Saved " + hhmm(now())); flushing = false; TREE = null; if (mine.dirty) setTimeout(flush, 1500); })
  .catch(function (e) { flushing = false; setSave(e.status === 401 || e.status === 403 ? "Key refused" : "Not saved · kept on device", true);
    if (e.status === 401 || e.status === 403) toast("GitHub refused the key. Check it in Settings."); });
}
window.addEventListener("online", flush);
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
setInterval(function () { if (L && L.dirty) flush(); }, 30000);

/* ---------------- routing ---------------- */
var app = $("#app");
function route() { return (location.hash || "#/").slice(1) || "/"; }
window.addEventListener("hashchange", function () { if (L && L.dirty) flush(); render(); window.scrollTo(0, 0); });
function nav(r) { var k = r.indexOf("/record") === 0 ? "record" : r.indexOf("/settings") === 0 ? "settings" : "lessons";
  $$("[data-nav]").forEach(function (a) { if (a.getAttribute("data-nav") === k) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#who").textContent = CFG.token ? CFG.student + " · " + CFG.device : ""; }
function render() {
  var r = route(); nav(r); document.body.removeAttribute("data-subject");
  if (!CFG.token && r.indexOf("/settings") !== 0) { location.hash = "#/settings"; return; }
  if (r.indexOf("/settings") === 0) return settingsView();
  if (r.indexOf("/lesson/") === 0) return lessonView(decodeURIComponent(r.slice(8)));
  if (r.indexOf("/new") === 0) return newView();
  if (r.indexOf("/record") === 0) return recordView();
  return lessonsView();
}
function fail(e) { app.innerHTML = '<div class="empty"><h3>Couldn’t reach GitHub</h3><p>' + esc(e && e.message || e) + '</p><p>Check your connection, or the key and repo in <a href="#/settings">Settings</a>.</p></div>'; }

/* ---------------- settings ---------------- */
function settingsView() {
  app.innerHTML = '<div class="section-h"><h2>Settings for this device</h2></div>' +
    '<form class="sheet form" id="setform" style="padding:18px 20px">' +
    '<div class="field"><label for="s-token">GitHub key</label><input type="password" id="s-token" autocomplete="off" value="' + esc(CFG.token) + '" placeholder="github_pat_…"><span class="hint">A fine-grained token with Contents read and write on the tutoring repo. It stays in this browser only.</span></div>' +
    '<div class="row2"><div class="field"><label for="s-repo">Repo</label><input type="text" id="s-repo" value="' + esc(CFG.repo) + '"></div>' +
    '<div class="field"><label for="s-dev">This device</label><input type="text" id="s-dev" value="' + esc(CFG.device) + '" placeholder="tablet, la57, mac"></div>' +
    '<div class="field"><label for="s-stu">Student</label><input type="text" id="s-stu" value="' + esc(CFG.student) + '"></div></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">Save and test</button><button class="btn danger" type="button" id="s-clear">Remove key from this device</button><span class="hint" id="s-msg"></span></div></form>';
}
function testConnection() {
  var m = $("#s-msg"); m.textContent = "Testing…";
  gh("/repos/" + CFG.repo).then(function (r) {
    if (r.status === 404) { m.textContent = "Repo not found, or the key can’t see it."; return; }
    var p = r.json.permissions || {}; m.textContent = p.push ? "Connected. This device can read and save." : "Connected, but the key can’t save. Give it Contents: read and write.";
    if (p.push) setTimeout(function () { location.hash = "#/"; }, 900);
  }).catch(function (e) { m.textContent = e.status === 401 ? "GitHub refused the key." : "Couldn’t connect: " + e.message; });
}

/* ---------------- lessons list ---------------- */
function lessonIds(tree) {
  var base = studentBase() + "lessons/", ids = {};
  tree.forEach(function (t) { if (t.path.indexOf(base) === 0) { var rest = t.path.slice(base.length).split("/"); if (rest.length > 1) { var id = rest[0], f = rest.slice(1).join("/"); ids[id] = ids[id] || { id: id, script: false, session: false, marking: false, work: 0 };
    if (f === "script.json") ids[id].script = true; else if (f === "session.json") ids[id].session = true; else if (f === "marking.json") ids[id].marking = true; else if (/^work\//.test(f)) ids[id].work++; } } });
  return Object.keys(ids).map(function (k) { return ids[k]; }).sort(function (a, b) { return b.id.localeCompare(a.id); });
}
function lessonsView() {
  app.innerHTML = '<div class="empty"><h3>Loading lessons</h3><p>Reading ' + esc(CFG.repo) + '.</p></div>';
  loadTree(true).then(function (tree) {
    var items = lessonIds(tree);
    return Promise.all(items.slice(0, 40).map(function (it) {
      return Promise.all([it.script ? cachedJSON(lessonBase(it.id) + "script.json") : null, it.session ? cachedJSON(lessonBase(it.id) + "session.json") : null])
        .then(function (v) { it.s = v[0]; it.x = v[1]; return it; }).catch(function () { return it; });
    })).then(function (items) {
      var t = todayIso();
      var h = '<div class="section-h"><div><div class="eyebrow">' + esc(CFG.student) + '</div><h2>' + esc(fmtDate(t, true)) + '</h2></div><a class="btn" href="#/new">Log a lesson without a script</a></div>';
      if (!items.length) h += '<div class="empty"><h3>No lessons yet</h3><p>Ask Claude for the next lesson’s script. It appears here. Or log a lesson without one.</p></div>';
      else h += '<div class="grid-2">' + items.map(card).join("") + '</div>';
      app.innerHTML = h;
    });
  }).catch(fail);
}
function card(it) {
  var p = parseId(it.id), s = it.s || {}, x = it.x || {}, subj = s.subject || x.subject || p.subject;
  var st = x.status === "finished" ? '<span class="pill ok">Logged</span>' : x.status === "in-progress" ? '<span class="pill warn">In progress</span>' : it.script ? '<span class="pill plain">Script ready</span>' : "";
  var sc = score(s, x);
  return '<a class="sheet lesson-card" data-subject="' + esc(subj) + '" href="#/lesson/' + encodeURIComponent(it.id) + '"><div class="meta"><span class="pill ' + esc(subj) + '">' + esc(SUBJ[subj] || subj) + '</span><span class="mono">' + esc(fmtDate(s.date || x.date || p.date)) + '</span>' + st +
    (x.time && x.time.minutes ? '<span class="pill plain">' + esc(x.time.minutes) + ' min</span>' : "") + (sc.n ? '<span class="pill plain">' + sc.r + '/' + sc.n + ' right</span>' : "") + (it.marking ? '<span class="pill ok">Marked</span>' : it.work ? '<span class="pill warn">' + it.work + ' photo' + (it.work > 1 ? "s" : "") + '</span>' : "") + '</div>' +
    '<h3>' + esc(s.title || x.title || "Lesson") + '</h3>' + (s.summary ? '<div class="hint">' + clean(s.summary) + '</div>' : "") + '</a>';
}
function score(s, x) { var r = 0, n = 0; Object.keys((x && x.answers) || {}).forEach(function (k) { var v = x.answers[k].v; if (!v || v === "skipped") return; n++; if (v === "right") r++; }); ((x && x.extra) || []).forEach(function (e) { if (!e.v || e.v === "skipped") return; n++; if (e.v === "right") r++; }); return { r: r, n: n }; }

/* ---------------- new unscripted lesson ---------------- */
function newView() {
  app.innerHTML = '<a class="back" href="#/">← Lessons</a><div class="section-h"><h2>Log a lesson without a script</h2></div><form class="sheet form" id="newform" style="padding:18px 20px">' +
    '<div class="row2"><div class="field"><label for="n-date">Date</label><input type="date" id="n-date" value="' + todayIso() + '" required></div><div class="field"><label for="n-subj">Subject</label><select id="n-subj"><option value="chem">Chemistry</option><option value="maths">Maths</option></select></div></div>' +
    '<div class="field"><label for="n-title">What’s it on?</label><input type="text" id="n-title" required placeholder="e.g. 7.1 Addition formulae"></div><div><button class="btn primary" type="submit">Start logging</button></div></form>';
}

/* ---------------- lesson view ---------------- */
function lessonView(id) {
  app.innerHTML = '<div class="empty"><h3>Opening the lesson</h3></div>';
  var base = lessonBase(id);
  Promise.all([getJSON(base + "script.json"), getJSON(base + "session.json"), getJSON(base + "marking.json").catch(function () { return null; })]).then(function (v) {
    var script = v[0] && v[0].data, remote = v[1], marking = v[2] && v[2].data;
    var saved = null; try { saved = JSON.parse(ls(localKey(id)) || "null"); } catch (e) {}
    var session, sha = remote ? remote.sha : null, dirty = false;
    if (saved && saved.dirty) { session = remote ? merge(saved.session, remote.data) : saved.session; dirty = true; }
    else session = remote ? remote.data : newSession(id, script);
    if (!session.title && script) session.title = script.title;
    L = { id: id, script: script, session: session, sha: sha, dirty: dirty, marking: marking, phase: null, filter: null };
    if (dirty) flush();
    drawLesson();
  }).catch(fail);
}
function phases() {
  var s = L.script, ps = [];
  if (s && s.phases && s.phases.length) ps = s.phases.slice();
  else if (s && (s.quiz || s.questions)) {
    if ((s.quiz || []).length) ps.push({ id: "quiz", name: "Oral quiz", blocks: [{ type: "quiz", id: "quiz", items: s.quiz }] });
    if ((s.questions || []).length) ps.push({ id: "qs", name: "Questions", blocks: s.questions.map(function (q) { return Object.assign({ type: "question" }, q); }) });
  } else ps.push({ id: "lesson", name: "Lesson", blocks: [{ type: "text", html: "<p>No script for this lesson. Use <b>Extra questions</b> to log what he answered, and <b>After the lesson</b> for notes.</p>" }] });
  ps.push({ id: "_extra", name: "Extra questions", sys: 1 }, { id: "_work", name: "His work (photos)", sys: 1 }, { id: "_after", name: "After the lesson", sys: 1 });
  return ps;
}
function drawLesson() {
  var s = L.script || {}, x = L.session, subj = s.subject || x.subject;
  document.body.setAttribute("data-subject", subj);
  var ps = phases(); if (!L.phase || !ps.some(function (p) { return p.id === L.phase; })) L.phase = x.status === "finished" ? "_after" : ps[0].id;
  var r = replay(x.time.log);
  var h = '<a class="back" href="#/">← Lessons</a><div class="lhead"><div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ' + esc(subj) + '">' + esc(SUBJ[subj] || subj) + '</span><span class="mono">' + esc(fmtDate(s.date || x.date, true)) + '</span>' +
    (x.status === "finished" ? '<span class="pill ok">Logged</span>' : x.status === "in-progress" ? '<span class="pill warn">In progress</span>' : "") + '</div>' +
    '<h1>' + esc(s.title || x.title || "Lesson") + '</h1>' + (s.summary ? '<div class="sub">' + clean(s.summary) + '</div>' : "") + '</div>' +
    '<div class="clock" aria-label="Lesson clock"><span class="t" id="clk">0:00</span><button class="btn small primary" id="clkgo" type="button"></button>' + (r.secs && x.status !== "finished" ? '<button class="btn small" id="clkend" type="button">End lesson</button>' : "") + '<span class="st" id="clkst"></span></div></div>';
  if (s.legacyUrl) h += '<div class="sheet" style="padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:0">Taught from the pilot script. Log how he did here.</span><a class="btn small" href="' + esc(s.legacyUrl) + '" target="_blank" rel="noopener">Open the pilot script</a></div>';
  h += '<div class="lesson" style="margin-top:16px"><nav class="rail" aria-label="Lesson phases">' + ps.map(function (p, i) {
    var pm = x.time.phaseMinutes && x.time.phaseMinutes[p.id], planned = p.start != null ? p.start + "–" + p.end + " min planned" : "";
    var tm = p.sys ? (p.id === "_extra" ? (x.extra.length ? x.extra.length + " logged" : "add as you go") : p.id === "_work" ? (x.work.length ? x.work.length + " uploaded" : "upload photos") : (x.feedback && x.feedback.at ? "saved" : "notes + finish")) : planned + (pm ? " · took " + pm : "");
    return (p.id === "_extra" ? '<div class="sep"></div>' : "") + '<button type="button" data-phase="' + esc(p.id) + '" data-real="' + (p.sys ? "" : "1") + '"' + (p.id === L.phase ? ' aria-current="step"' : "") + '><span class="n">' + (p.sys ? { _extra: "+", _work: "▣", _after: "✓" }[p.id] : i + 1) + '</span><span class="nm">' + esc(p.name) + '</span><span class="tm">' + esc(tm) + '</span></button>';
  }).join("") + '</nav><section class="sheet page" id="phasebox"></section></div>';
  app.innerHTML = h; drawPhase(); tick();
}
function drawPhase() {
  var ps = phases(), p = ps.filter(function (q) { return q.id === L.phase; })[0], box = $("#phasebox"), h = "";
  if (p.id === "_extra") h = extraView(); else if (p.id === "_work") h = workView(); else if (p.id === "_after") h = afterView();
  else {
    h += '<div class="phase-top"><h2>' + esc(p.name) + '</h2>' + (p.start != null ? '<span class="mono hint">' + p.start + '–' + p.end + ' min</span>' : "") + '</div>';
    if (p.show) h += '<div class="screen"><span class="eyebrow">On screen</span><div>' + clean(p.show) + '</div></div>';
    if (L.script && L.script.focus && ps[0] === p) h += focusTable(L.script.focus);
    h += blocks(p.blocks || []);
    var i = ps.indexOf(p); if (i < ps.length - 1) h += '<div style="display:flex;justify-content:flex-end"><button class="btn accent" type="button" data-phase="' + esc(ps[i + 1].id) + '" data-real="' + (ps[i + 1].sys ? "" : "1") + '">Next: ' + esc(ps[i + 1].name) + ' →</button></div>';
  }
  box.innerHTML = h; loadImages(box); drawTally();
}
function focusTable(rows) { return '<details class="module"><summary><span class="lvl deep">PLAN</span><h3>Pick your focus</h3><span class="chev">›</span></summary><div class="mbody"><div class="tablewrap"><table class="t"><thead><tr><th>Focus on</th><th>Spend the time on</th><th>Cut down</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td><b>' + clean(r.want) + '</b></td><td>' + clean(r.spend) + '</td><td>' + clean(r.cut) + '</td></tr>'; }).join("") + '</tbody></table></div></div></details>'; }
var KIND = { say: "Say", draw: "Draw", ask: "Ask", show: "Show", "do": "Do", check: "Check" };
function img(path, alt) { return '<figure class="fig"><img data-src="' + esc(path) + '" alt="' + esc(alt || "") + '" hidden><div class="ph">Loading image</div></figure>'; }
function blocks(bs) { return (bs || []).map(block).join(""); }
function block(b) {
  switch (b.type) {
    case "text": return '<div class="prose">' + clean(b.html) + '</div>';
    case "steps": return '<ol class="steps">' + (b.items || []).map(function (s) { var k = s.kind || "do"; return '<li class="' + esc(k) + '"><span class="kind ' + esc(k) + '">' + (KIND[k] || esc(k)) + '</span><div class="body prose">' + clean(s.html) + '</div></li>'; }).join("") + '</ol>';
    case "module": return '<details class="module"' + (b.level !== "deep" ? " open" : "") + '><summary><span class="lvl ' + (b.level === "deep" ? "deep" : "core") + '">' + (b.level === "deep" ? "DEEP" : "CORE") + '</span><h3>' + esc(b.name) + '</h3>' + (b.minutes ? '<span class="pill plain">' + esc(b.minutes) + ' min</span>' : "") + '<span class="chev">›</span></summary><div class="mbody">' + blocks(b.blocks) + '</div></details>';
    case "figure": return b.img ? img(b.img, b.caption).replace("</figure>", (b.caption ? '<figcaption>' + clean(b.caption) + '</figcaption>' : "") + '</figure>') : '<figure class="fig">' + clean(b.html) + '</figure>';
    case "reveal": return '<details class="reveal"><summary>' + esc(b.label || "Answer") + '</summary><div class="prose">' + clean(b.html) + (b.img || []).map(function (i) { return img(i); }).join("") + '</div></details>';
    case "drill": return '<div><div class="eyebrow" style="margin-bottom:8px">' + esc(b.title || "Quick-fire drill") + (b.own ? " · Claude’s practice questions" : "") + '</div><div class="drill">' + (b.items || []).map(function (d) { return '<div class="d"><div>' + clean(d[0]) + '</div><details><summary class="linkbtn">Answer</summary><div class="da">' + clean(d[1]) + '</div></details></div>'; }).join("") + '</div></div>';
    case "quiz": return quizBlock(b);
    case "question": return questionBlock(b);
    default: return b.html ? '<div class="prose">' + clean(b.html) + '</div>' : "";
  }
}
function ctl(id, marks) {
  var a = L.session.answers[id] || {};
  return '<div class="ctl" data-item="' + esc(id) + '">' + VERD.map(function (v) { return '<button class="v" type="button" data-v="' + v[0] + '" title="' + esc(VHELP[v[0]]) + '" aria-pressed="' + (a.v === v[0]) + '">' + v[1] + '</button>'; }).join("") +
    (marks ? '<input class="mk" type="number" min="0" max="' + esc(marks) + '" step="0.5" inputmode="decimal" aria-label="Marks out of ' + esc(marks) + '" data-mk value="' + (a.m != null ? esc(a.m) : "") + '"><span class="mono hint">/ ' + esc(marks) + '</span>' : "") +
    '<input class="note" type="text" data-note aria-label="What he said or got wrong" placeholder="What he said / got wrong" value="' + esc(a.note || "") + '"></div>';
}
function quizBlock(b) {
  var items = b.items || [], hasStar = items.some(function (i) { return i.star; });
  var f = L.filter || (hasStar ? "star" : "all"); L.filter = f;
  var topics = {}; items.forEach(function (i) { if (i.topic) topics[i.topic] = 1; });
  var chips = (hasStar ? [["star", "★ Suggested"]] : []).concat([["all", "All " + items.length], ["recall", "Recall"], ["reason", "Reasoning"], ["draw", "Drawing"]]).concat(Object.keys(topics).map(function (t) { return ["t:" + t, t.charAt(0).toUpperCase() + t.slice(1)]; }));
  return '<div class="qbar" role="group" aria-label="Filter questions">' + chips.map(function (c) { return '<button class="chip" type="button" data-qf="' + esc(c[0]) + '" aria-pressed="' + (f === c[0]) + '">' + esc(c[1]) + '</button>'; }).join("") + '</div>' +
    '<div class="items">' + items.map(function (it, i) {
      var a = L.session.answers[it.id] || {}, show = f === "all" || (f === "star" && it.star) || f === it.kind || ("t:" + it.topic) === f;
      return '<div class="item" data-v="' + esc(a.v || "") + '"' + (show ? "" : " hidden") + '><span class="qn">' + (i + 1) + '</span><div><div class="tags">' + (it.page ? '<span class="pill plain">' + esc(it.page) + '</span>' : "") + (it.kind ? '<span class="pill plain">' + esc({ recall: "Recall", reason: "Reason", draw: "Draw" }[it.kind] || it.kind) + '</span>' : "") + (it.star ? '<span class="pill warn">★</span>' : "") + '</div><div>' + clean(it.q) + '</div><button class="linkbtn" type="button" data-ans>Show answer</button><div class="qa prose" hidden>' + clean(it.a) + '</div></div>' + ctl(it.id) + '</div>';
    }).join("") + '</div>';
}
function questionBlock(q) {
  var a = L.session.answers[q.id] || {};
  var h = '<div class="qcard"><div><h3>' + esc(q.label || "Question") + '</h3>' + (q.source ? '<div class="src">' + esc(q.source) + '</div>' : "") + '</div>' + (q.html ? '<div class="prose">' + clean(q.html) + '</div>' : "") + (q.img || []).map(function (i) { return img(i, q.label); }).join("");
  if (q.answer || (q.answerImg || []).length) h += '<details class="reveal"><summary>Mark scheme</summary><div class="prose">' + clean(q.answer || "") + (q.answerImg || []).map(function (i) { return img(i, "Mark scheme"); }).join("") + '</div></details>';
  return h + '<div class="items"><div class="item" data-v="' + esc(a.v || "") + '"><span class="qn">▸</span><div class="eyebrow" style="padding-top:10px">How he did</div>' + ctl(q.id, q.marks) + '</div></div></div>';
}
function drawTally() {
  var old = $("#tally"); if (old) old.remove(); var box = $("#phasebox"); if (!box || L.phase === "_after") return;
  var c = { right: 0, wrong: 0, wording: 0, terminology: 0, partly: 0 }, n = 0;
  Object.keys(L.session.answers).forEach(function (k) { var v = L.session.answers[k].v; if (c[v] != null) { c[v]++; n++; } });
  L.session.extra.forEach(function (e) { if (c[e.v] != null) { c[e.v]++; n++; } });
  var d = document.createElement("div"); d.className = "tally"; d.id = "tally";
  d.innerHTML = n ? '<b>' + c.right + ' / ' + n + '</b><span>right</span><span>✗ ' + c.wrong + '</span><span>wording ' + c.wording + '</span><span>terminology ' + c.terminology + '</span><span>partly ' + c.partly + '</span>' : '<span>Tap a verdict on each answer. Everything saves to GitHub as you go.</span>';
  box.appendChild(d);
}
function loadImages(root) { $$("img[data-src]", root).forEach(function (im) { var p = im.getAttribute("data-src"); var full = /^students\//.test(p) ? p : lessonBase(L.id) + p;
  rawURL(full).then(function (u) { var ph = im.nextElementSibling; if (u) { im.src = u; im.hidden = false; if (ph && ph.classList.contains("ph")) ph.remove(); } else if (ph) ph.textContent = "Image missing: " + p; }).catch(function () { var ph = im.nextElementSibling; if (ph) ph.textContent = "Couldn’t load image"; }); }); }

/* extra questions, asked on the spot */
function extraView() {
  var x = L.session;
  var h = '<div class="phase-top"><h2>Extra questions</h2><span class="hint">Anything you asked that isn’t in the script</span></div>';
  h += '<form class="sheet form" id="exform" style="padding:14px 16px;max-width:none"><div class="field"><label for="ex-q">Question you asked</label><input type="text" id="ex-q" required placeholder="e.g. Why is propanone’s product not chiral?"></div>' +
    '<div class="field"><span class="lab">How he did</span><div class="ctl" style="display:flex;gap:6px;flex-wrap:wrap" id="ex-v">' + VERD.map(function (v) { return '<button class="v" type="button" data-exv="' + v[0] + '" aria-pressed="false">' + v[1] + '</button>'; }).join("") + '</div></div>' +
    '<div class="field"><label for="ex-note">What he said / got wrong</label><input type="text" id="ex-note"></div><div><button class="btn primary" type="submit">Add</button></div></form>';
  h += x.extra.length ? '<div class="items">' + x.extra.map(function (e, i) { return '<div class="item" data-v="' + esc(e.v || "") + '"><span class="qn">' + (i + 1) + '</span><div><div>' + esc(e.q) + '</div><div class="hint">' + esc(VHELP[e.v] || "no verdict") + (e.note ? " · " + esc(e.note) : "") + ' · ' + esc(hhmm(e.at)) + '</div></div><div class="ctl"><button class="btn small danger" type="button" data-exdel="' + esc(e.id) + '">Remove</button></div></div>'; }).join("") + '</div>' : '<div class="empty"><h3>None yet</h3><p>Every question you add here counts in his record like a scripted one.</p></div>';
  return h;
}

/* photos of his work */
function workView() {
  var x = L.session, items = itemsList();
  var h = '<div class="phase-top"><h2>His work</h2><span class="hint">Photos go to GitHub for Claude to read and mark</span></div>';
  h += '<form class="sheet form" id="wkform" style="padding:14px 16px;max-width:none"><div class="field"><label for="wk-files">Photos or PDFs</label><input type="file" id="wk-files" accept="image/*,application/pdf" multiple required><span class="hint">Photos are resized to keep them sharp but small. Several pages at once is fine.</span></div>' +
    '<div class="row2"><div class="field"><label for="wk-item">Which question?</label><select id="wk-item"><option value="">Whole lesson / several questions</option>' + items.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.label) + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label for="wk-kind">What is it?</label><select id="wk-kind"><option value="class">Class work</option><option value="homework">Homework</option><option value="test">Test</option><option value="other">Other</option></select></div></div>' +
    '<div class="field"><label for="wk-note">Note for Claude (optional)</label><input type="text" id="wk-note" placeholder="e.g. page 2 is blurry"></div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn primary" type="submit" id="wk-go">Upload</button><span class="hint" id="wk-st"></span></div></form>';
  var m = L.marking;
  if (m) h += '<div class="sheet" style="padding:14px 16px"><div class="eyebrow">Claude’s marking</div>' + (m.summary ? '<p>' + clean(m.summary) + '</p>' : "") + (m.score != null ? '<p><b>' + esc(m.score) + ' / ' + esc(m.max) + '</b></p>' : "") + '<ul class="list-plain">' + (m.mistakes || []).map(function (k) { return '<li class="mistake ' + esc(k.type || "") + '"><div><b>' + esc(k.item || "") + '</b> ' + clean(k.what || "") + '</div>' + (k.fix ? '<div class="fix">Fix: ' + clean(k.fix) + '</div>' : "") + '</li>'; }).join("") + '</ul></div>';
  h += x.work.length ? '<div class="items">' + x.work.map(function (w) { return '<div class="item"><span class="qn">▣</span><div><div><b>' + esc(labelOf(w.item) || "Whole lesson") + '</b> <span class="pill plain">' + esc(w.kind) + '</span></div><div class="hint">' + esc(w.file.split("/").pop()) + ' · ' + esc(hhmm(w.at)) + (w.note ? " · " + esc(w.note) : "") + '</div><div class="thumbs" style="margin-top:8px">' + (/\.pdf$/i.test(w.file) ? '<span class="pdf">PDF</span>' : '<img data-src="' + esc(w.file) + '" alt="His work" hidden><span class="ph hint">loading</span>') + '</div></div></div>'; }).join("") + '</div>'
    : '<div class="empty"><h3>No photos yet</h3><p>Upload his answers. Claude reads each one, marks it against the real mark scheme and notes every mistake.</p></div>';
  return h;
}
function itemsList() { var out = [];
  phases().forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "question") out.push({ id: b.id, label: b.label || b.id }); if (b.type === "quiz") (b.items || []).forEach(function (q, i) { out.push({ id: q.id, label: "Quiz " + (i + 1) + ": " + String(q.q).replace(/<[^>]+>/g, "").slice(0, 60) }); }); if (b.blocks) walk(b.blocks); }); })(p.blocks); });
  L.session.extra.forEach(function (e, i) { out.push({ id: e.id, label: "Extra " + (i + 1) + ": " + e.q.slice(0, 60) }); }); return out; }
function labelOf(id) { if (!id) return ""; var f = itemsList().filter(function (i) { return i.id === id; })[0]; return f ? f.label : id; }

/* after the lesson */
function afterView() {
  var x = L.session, fb = x.feedback || {}, s = L.script || {}, sc = score(s, x);
  var h = '<div class="phase-top"><h2>After the lesson</h2><span class="hint">Claude reads this before the next script</span></div>';
  h += '<div class="stats"><div class="sheet stat"><div class="v2">' + (x.time.minutes != null ? x.time.minutes : "—") + '</div><div class="l">minutes taught' + (x.time.started ? " · " + hhmm(x.time.started) + "–" + (x.time.ended ? hhmm(x.time.ended) : "now") : "") + '</div></div>' +
    '<div class="sheet stat"><div class="v2">' + (sc.n ? sc.r + "/" + sc.n : "—") + '</div><div class="l">answers right</div></div><div class="sheet stat"><div class="v2">' + x.work.length + '</div><div class="l">photos uploaded</div></div></div>';
  var wrong = [];
  Object.keys(x.answers).forEach(function (k) { var a = x.answers[k]; if (a.v && a.v !== "right" && a.v !== "skipped") wrong.push('<li class="mistake ' + esc(a.v) + '"><div><b>' + esc(labelOf(k)) + '</b> <span class="pill plain">' + esc(VHELP[a.v]) + '</span></div>' + (a.note ? '<div class="fix">' + esc(a.note) + '</div>' : "") + '</li>'); });
  x.extra.forEach(function (e) { if (e.v && e.v !== "right" && e.v !== "skipped") wrong.push('<li class="mistake ' + esc(e.v) + '"><div><b>' + esc(e.q) + '</b> <span class="pill plain">' + esc(VHELP[e.v]) + '</span></div>' + (e.note ? '<div class="fix">' + esc(e.note) + '</div>' : "") + '</li>'); });
  if (wrong.length) h += '<div><div class="eyebrow" style="margin-bottom:8px">Going into his mistakes log</div><ul class="list-plain">' + wrong.join("") + '</ul></div>';
  function fld(id, label, key, ph, area, def) { var v = fb[key] != null ? fb[key] : (def || ""); return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (area ? '<textarea id="' + id + '" data-fb="' + key + '" placeholder="' + esc(ph || "") + '">' + esc(v) + '</textarea>' : '<input type="text" id="' + id + '" data-fb="' + key + '" value="' + esc(v) + '" placeholder="' + esc(ph || "") + '">') + '</div>'; }
  h += '<form class="form" id="fbform"><div class="field"><span class="lab">How did it go?</span><div style="display:flex;gap:6px;flex-wrap:wrap">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="chip" type="button" data-rate="' + n + '" aria-pressed="' + (fb.rating === n) + '">' + n + '</button>'; }).join("") + '</div><span class="hint">1 rough · 5 went really well</span></div>' +
    fld("fb-cov", "What you actually covered", "covered", "e.g. got to 3c, skipped the NaBH₄ drill", true) + fld("fb-stuck", "Where he got stuck", "stuck", "", true) + fld("fb-worked", "What worked", "worked", "", true) +
    fld("fb-change", "What to change next time (for Claude)", "change", "This shapes the next script", true) + fld("fb-hw", "Homework set", "hw", "", false, s.homeworkSummary) + fld("fb-pages", "Book pages set to memorise", "pages", "e.g. CGP 172–173", false, s.pagesSet) +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">' + (x.status === "finished" ? "Update the log" : "Finish and save the lesson") + '</button>' + (fb.at ? '<span class="pill ok">Saved ' + esc(hhmm(fb.at)) + '</span>' : "") + '</div></form>';
  return h;
}

/* ---------------- clock ---------------- */
function fmt(s) { var m = Math.floor(s / 60), x = s % 60; return m + ":" + (x < 10 ? "0" : "") + x; }
function tick() {
  var el = $("#clk"); if (!el || !L) return; var x = L.session, r = replay(x.time.log);
  el.textContent = fmt(r.secs);
  var go = $("#clkgo"); if (go) { go.textContent = x.status === "finished" ? "Resume" : r.running ? "Pause" : (r.secs ? "Resume" : "Start lesson"); }
  var st = $("#clkst"); if (st) st.textContent = x.time.started ? "started " + hhmm(x.time.started) + (x.time.ended && !r.running ? " · ended " + hhmm(x.time.ended) : "") : "";
  $$(".rail button[data-real]").forEach(function (b) { b.classList.toggle("live", r.running && r.phase === b.getAttribute("data-phase")); });
}
setInterval(function () { if (L && replay(L.session.time.log).running) tick(); }, 1000);
function logEvent(e, p) { L.session.time.log.push({ t: now(), e: e, p: p || undefined, d: CFG.device }); finalizeTime(L.session); touch(); }

/* ---------------- events ---------------- */
document.addEventListener("click", function (ev) {
  var t = ev.target.closest("button,img"); if (!t) return;
  if (t.tagName === "IMG") { if (t.closest(".fig") || t.closest(".thumbs")) { $("#zimg").src = t.src; $("#zoom").hidden = false; } return; }
  if (t.id === "zoomx") { closeZoom(); return; }
  if (t.id === "s-clear") { ls("tutor.token", null); toast("Key removed from this device"); settingsView(); return; }
  if (!L || route().indexOf("/lesson/") !== 0) return;
  var x = L.session;
  if (t.hasAttribute("data-phase")) { var id = t.getAttribute("data-phase"); var r = replay(x.time.log);
    if (t.getAttribute("data-real") && r.running && r.phase !== id) logEvent("phase", id);
    L.phase = id; drawLesson(); if (window.innerWidth < 860) $("#phasebox").scrollIntoView({ block: "start" }); return; }
  if (t.id === "clkgo") { var r2 = replay(x.time.log); var cur = phases().filter(function (p) { return p.id === L.phase && !p.sys; })[0];
    if (r2.running) logEvent("pause"); else { if (x.status === "finished") x.status = "in-progress"; logEvent(r2.secs ? "resume" : "start", cur ? cur.id : (r2.phase || phases()[0].id)); wake(); }
    drawLesson(); return; }
  if (t.id === "clkend") { logEvent("end"); L.phase = "_after"; drawLesson(); flush(); return; }
  if (t.hasAttribute("data-qf")) { L.filter = t.getAttribute("data-qf"); drawPhase(); return; }
  if (t.hasAttribute("data-ans")) { var qa = t.parentNode.querySelector(".qa"); qa.hidden = !qa.hidden; t.textContent = qa.hidden ? "Show answer" : "Hide answer"; return; }
  if (t.hasAttribute("data-v")) { var box = t.closest("[data-item]"), iid = box.getAttribute("data-item"), v = t.getAttribute("data-v"); var a = x.answers[iid] || {};
    a.v = a.v === v ? null : v; a.at = now(); a.d = CFG.device; x.answers[iid] = a; touch();
    $$(".v", box).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === a.v)); }); var row = box.closest(".item"); if (row) row.setAttribute("data-v", a.v || ""); drawTally(); return; }
  if (t.hasAttribute("data-exv")) { $$("[data-exv]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t && b.getAttribute("aria-pressed") !== "true")); }); return; }
  if (t.hasAttribute("data-exdel")) { var did = t.getAttribute("data-exdel"); x.extra = x.extra.filter(function (e) { return e.id !== did; }); touch(); drawPhase(); return; }
  if (t.hasAttribute("data-rate")) { x.feedback = x.feedback || {}; x.feedback.rating = +t.getAttribute("data-rate"); x.feedback.at = now(); touch(); $$("[data-rate]").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-rate") === x.feedback.rating)); }); return; }
});
document.addEventListener("input", function (ev) {
  var t = ev.target; if (!L) return; var x = L.session;
  if (t.hasAttribute("data-note") || t.hasAttribute("data-mk")) { var iid = t.closest("[data-item]").getAttribute("data-item"); var a = x.answers[iid] || {};
    if (t.hasAttribute("data-note")) a.note = t.value; else a.m = t.value === "" ? null : +t.value; a.at = now(); x.answers[iid] = a; touch(); }
  if (t.hasAttribute("data-fb")) { x.feedback = x.feedback || {}; x.feedback[t.getAttribute("data-fb")] = t.value; x.feedback.at = now(); touch(); }
});
document.addEventListener("submit", function (ev) {
  ev.preventDefault(); var f = ev.target;
  if (f.id === "setform") { ls("tutor.token", $("#s-token").value.trim()); ls("tutor.repo", $("#s-repo").value.trim() || "alimuqaddasm/tutoring"); ls("tutor.device", $("#s-dev").value.trim() || "tablet"); ls("tutor.student", $("#s-stu").value.trim() || "UK-1"); TREE = null; nav(route()); testConnection(); return; }
  if (f.id === "newform") { var id = $("#n-date").value + "-" + $("#n-subj").value; var sess = newSession(id, null); sess.title = $("#n-title").value.trim(); sess.subject = $("#n-subj").value; sess.date = $("#n-date").value;
    ls(localKey(id), JSON.stringify({ session: sess, sha: null, dirty: true })); location.hash = "#/lesson/" + encodeURIComponent(id); return; }
  if (!L) return; var x = L.session;
  if (f.id === "exform") { var q = $("#ex-q").value.trim(); if (!q) return; var sel = $("[data-exv][aria-pressed='true']");
    x.extra.push({ id: "x" + Date.now().toString(36), q: q, v: sel ? sel.getAttribute("data-exv") : null, note: $("#ex-note").value.trim(), at: now(), d: CFG.device }); touch(); drawLesson(); toast("Added"); return; }
  if (f.id === "fbform") { $$("[data-fb]", f).forEach(function (i) { x.feedback[i.getAttribute("data-fb")] = i.value; }); x.feedback.at = now();
    if (replay(x.time.log).running) logEvent("end"); x.status = "finished"; touch(); flush().then(function () { toast("Lesson saved to GitHub"); drawLesson(); }); return; }
  if (f.id === "wkform") uploadWork();
});
function closeZoom() { $("#zoom").hidden = true; $("#zimg").removeAttribute("src"); }
$("#zoom").addEventListener("click", function (e) { if (e.target.id === "zoom") closeZoom(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeZoom(); });
function wake() { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(function () {}); } catch (e) {} }

/* ---------------- uploads ---------------- */
function shrink(file) {
  /* JPEG, long side at most 2400 px: sharp enough to read handwriting, small enough for GitHub */
  return new Promise(function (res, rej) {
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) { var fr = new FileReader(); fr.onload = function () { res({ b64: String(fr.result).split(",")[1], ext: "pdf" }); }; fr.onerror = rej; fr.readAsDataURL(file); return; }
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () { var s = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res({ b64: c.toDataURL("image/jpeg", 0.86).split(",")[1], ext: "jpg" }); };
    im.onerror = function () { rej(new Error(file.name + " isn’t a photo this browser can read (try JPG or PNG).")); };
    im.src = url;
  });
}
function uploadWork() {
  var files = Array.prototype.slice.call($("#wk-files").files || []); if (!files.length) return;
  var st = $("#wk-st"), go = $("#wk-go"), item = $("#wk-item").value, kind = $("#wk-kind").value, note = $("#wk-note").value.trim(); go.disabled = true;
  var stamp = new Date(), base = lessonBase(L.id) + "work/" + stamp.toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
  var i = 0;
  function next() {
    if (i >= files.length) { go.disabled = false; st.textContent = ""; toast("Uploaded " + files.length + " file" + (files.length > 1 ? "s" : "")); flush(); drawLesson(); return; }
    var f = files[i++]; st.textContent = "Uploading " + i + " of " + files.length + "…";
    shrink(f).then(function (r) { var path = base + "-" + (item || "lesson").replace(/[^a-z0-9]+/gi, "") + "-" + i + "." + r.ext;
      return putB64(path, r.b64, CFG.student + " " + L.id + ": his work (" + CFG.device + ")").then(function () { L.session.work.push({ file: path, item: item || null, kind: kind, note: note, at: now(), d: CFG.device }); touch(); }); })
      .then(next).catch(function (e) { go.disabled = false; st.textContent = (e.status ? "GitHub said " + e.status + ". " : "") + (e.message || "Upload failed") + " Try again."; });
  }
  next();
}

/* ---------------- record ---------------- */
function recordView() {
  app.innerHTML = '<div class="empty"><h3>Loading his record</h3></div>';
  var sb = studentBase();
  loadTree(true).then(function (tree) {
    var ids = lessonIds(tree).filter(function (i) { return i.session; });
    return Promise.all([getText(sb + "mistakes.jsonl"), getText(sb + "tests.jsonl"), getText(sb + "profile.md")].concat(ids.map(function (i) { return cachedJSON(lessonBase(i.id) + "session.json").then(function (d) { i.x = d; return i; }); })))
      .then(function (v) {
        function jl(r) { return r ? r.text.split(/\n/).filter(function (l) { return l.trim(); }).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []; }
        var mistakes = jl(v[0]).reverse(), tests = jl(v[1]), prof = v[2] ? v[2].text : "";
        var mins = 0, n = 0, r = 0; ids.forEach(function (i) { var x = i.x || {}; mins += (x.time && x.time.minutes) || 0; var s = score(null, x); n += s.n; r += s.r; });
        var h = '<div class="section-h"><h2>' + esc(CFG.student) + '’s record</h2></div>';
        h += '<div class="stats"><div class="sheet stat"><div class="v2">' + ids.length + '</div><div class="l">lessons logged</div></div><div class="sheet stat"><div class="v2">' + Math.round(mins / 6) / 10 + '</div><div class="l">hours taught</div></div><div class="sheet stat"><div class="v2">' + (n ? Math.round(100 * r / n) + "%" : "—") + '</div><div class="l">answers right</div></div><div class="sheet stat"><div class="v2">' + mistakes.filter(function (m) { return !m.fixed; }).length + '</div><div class="l">open mistakes</div></div></div>';
        h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Time log</h2></div>';
        h += ids.length ? '<div class="sheet tablewrap"><table class="t"><thead><tr><th>Date</th><th>Subject</th><th>Lesson</th><th>Start</th><th>End</th><th>Minutes</th><th>Right</th></tr></thead><tbody>' + ids.map(function (i) { var x = i.x || {}, p = parseId(i.id), s = score(null, x); return '<tr data-href="#/lesson/' + encodeURIComponent(i.id) + '"><td class="mono">' + esc(fmtDate(x.date || p.date)) + '</td><td><span class="pill ' + esc(x.subject || p.subject) + '">' + esc(SUBJ[x.subject || p.subject] || "") + '</span></td><td><b>' + esc(x.title || i.id) + '</b></td><td class="mono">' + esc(hhmm(x.time && x.time.started)) + '</td><td class="mono">' + esc(hhmm(x.time && x.time.ended)) + '</td><td class="mono">' + esc(x.time && x.time.minutes != null ? x.time.minutes : "") + '</td><td class="mono">' + (s.n ? s.r + "/" + s.n : "") + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="empty"><h3>No lessons logged yet</h3><p>Start the clock in a lesson and its times land here.</p></div>';
        h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Mistakes</h2><span class="hint">Kept by Claude from your verdicts and his marked work</span></div>';
        h += mistakes.length ? '<ul class="list-plain">' + mistakes.slice(0, 120).map(function (m) { return '<li class="mistake ' + esc(m.type || "") + '"' + (m.fixed ? ' style="opacity:.6"' : "") + '><div><span class="pill ' + esc(m.subject || "plain") + '">' + esc(SUBJ[m.subject] || m.subject || "") + '</span> ' + (m.type ? '<span class="pill plain">' + esc(VHELP[m.type] || m.type) + '</span> ' : "") + clean(m.text || m.what || "") + '</div>' + (m.fix ? '<div class="fix">Fix: ' + clean(m.fix) + '</div>' : "") + '<div class="fix mono">' + esc([m.topic, m.source, m.date, m.fixed ? "fixed" : ""].filter(Boolean).join(" · ")) + '</div></li>'; }).join("") + '</ul>' : '<div class="empty"><h3>No mistakes logged yet</h3></div>';
        h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Tests</h2></div><form class="sheet form" id="tsform" style="padding:14px 16px"><div class="row2"><div class="field"><label for="t-date">Date</label><input type="date" id="t-date" value="' + todayIso() + '" required></div><div class="field"><label for="t-subj">Subject</label><select id="t-subj"><option value="maths">Maths</option><option value="chem">Chemistry</option></select></div><div class="field"><label for="t-sc">Score</label><input type="number" id="t-sc" step="0.5" min="0" required></div><div class="field"><label for="t-max">Out of</label><input type="number" id="t-max" step="0.5" min="1" required></div></div><div class="field"><label for="t-ti">Which test?</label><input type="text" id="t-ti" required placeholder="e.g. School mock Paper 1"></div><div class="field"><label for="t-no">Notes</label><input type="text" id="t-no"></div><div><button class="btn primary" type="submit">Add test result</button></div></form>';
        if (tests.length) h += '<div class="sheet tablewrap" style="margin-top:12px"><table class="t"><thead><tr><th>Date</th><th>Subject</th><th>Test</th><th>Score</th><th>%</th><th>Notes</th></tr></thead><tbody>' + tests.slice().reverse().map(function (t) { return '<tr><td class="mono">' + esc(fmtDate(t.date)) + '</td><td><span class="pill ' + esc(t.subject) + '">' + esc(SUBJ[t.subject] || t.subject) + '</span></td><td><b>' + esc(t.title) + '</b></td><td class="mono">' + esc(t.score) + '/' + esc(t.max) + '</td><td class="mono">' + (t.max ? Math.round(100 * t.score / t.max) + "%" : "") + '</td><td>' + esc(t.notes || "") + '</td></tr>'; }).join("") + '</tbody></table></div>';
        if (prof) h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Profile</h2></div><div class="sheet prose" style="padding:16px 20px;max-width:none">' + md(prof) + '</div>';
        app.innerHTML = h;
      });
  }).catch(fail);
}
document.addEventListener("click", function (ev) { var tr = ev.target.closest("tr[data-href]"); if (tr) location.hash = tr.getAttribute("data-href"); });
document.addEventListener("submit", function (ev) { if (ev.target.id !== "tsform") return; var sb = studentBase() + "tests.jsonl";
  var t = { date: $("#t-date").value, subject: $("#t-subj").value, score: +$("#t-sc").value, max: +$("#t-max").value, title: $("#t-ti").value.trim(), notes: $("#t-no").value.trim(), device: CFG.device, at: now() };
  setSave("Saving…");
  getText(sb).then(function (r) { var body = (r ? r.text.replace(/\s*$/, "\n") : "") + JSON.stringify(t) + "\n"; return putB64(sb, b64enc(body), CFG.student + ": test result " + t.date + " (" + CFG.device + ")", r && r.sha); })
    .then(function () { setSave("Saved " + hhmm(now())); toast("Test result saved"); recordView(); }).catch(function (e) { setSave("Not saved", true); toast("Couldn’t save: " + e.message); }); });
function md(s) {
  var out = [], list = false;
  String(s).split(/\n/).forEach(function (line) {
    var l = esc(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
    if (/^\s*[-*] /.test(line)) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + l.replace(/^\s*[-*] /, "") + "</li>"); return; }
    if (list) { out.push("</ul>"); list = false; }
    var m = /^(#{1,3}) (.*)/.exec(line); if (m) { out.push("<h3>" + esc(m[2]) + "</h3>"); return; }
    if (line.trim()) out.push("<p>" + l + "</p>");
  });
  if (list) out.push("</ul>"); return out.join("");
}

render();
})();
