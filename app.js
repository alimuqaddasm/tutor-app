/* Tutor Desk: lesson scripts + a live lesson log, stored in a private GitHub repo.
   The page keeps no data of its own. It reads  students/<student>/lessons/<id>/script.json
   and writes  session.json  and  work/*  in the same folder. The GitHub key stays in this browser.
   Speed: every file is cached on the device by its git hash (never changes), so after the first
   visit only one small "what changed" request goes to GitHub. */
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
function r1(x) { return Math.round(x * 10) / 10; }

/* ---------------- settings, theme ---------------- */
var CFG = {
  get token() { return ls("tutor.token") || ""; },
  get repo() { return ls("tutor.repo") || "alimuqaddasm/tutoring"; },
  get device() { return ls("tutor.device") || "tablet"; },
  get student() { return ls("tutor.student") || "UK-1"; }
};
var THEMES = ["auto", "light", "dark"], TLABEL = { auto: "◐ Auto", light: "☀ Light", dark: "☾ Dark" };
function applyTheme() { var t = ls("tutor.theme") || "auto"; if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); $("#theme").textContent = TLABEL[t]; }
$("#theme").addEventListener("click", function () { var t = ls("tutor.theme") || "auto"; ls("tutor.theme", THEMES[(THEMES.indexOf(t) + 1) % 3]); applyTheme(); });
applyTheme();

/* ---------------- device cache (IndexedDB) ---------------- */
var idbP = null;
function idb() { if (idbP) return idbP; idbP = new Promise(function (res) { try { var r = indexedDB.open("tutor-desk", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; } catch (e) { res(null); } }); return idbP; }
function cget(k) { return idb().then(function (d) { if (!d) return null; return new Promise(function (res) { try { var q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result == null ? null : q.result); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } }); }); }
function cput(k, v) { return idb().then(function (d) { if (!d) return; try { d.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) {} }); }

/* ---------------- GitHub ---------------- */
var API = "https://api.github.com";
function gh(path, opts) {
  opts = opts || {};
  var h = { "Authorization": "Bearer " + CFG.token, "Accept": opts.accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (opts.body) h["Content-Type"] = "application/json";
  return fetch(API + path, { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
    .then(function (r) { if (r.status === 404) return { status: 404 }; if (!r.ok) return r.text().then(function (t) { var e = new Error("GitHub " + r.status + ": " + t.slice(0, 160)); e.status = r.status; throw e; }); return r.json().then(function (j) { return { status: r.status, json: j }; }); });
}
function enc(p) { return p.split("/").map(encodeURIComponent).join("/"); }
function b64enc(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function b64bytes(b64) { var bin = atob(String(b64).replace(/\s/g, "")), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
function putB64(path, b64, msg, sha) {
  return gh("/repos/" + CFG.repo + "/contents/" + enc(path), { method: "PUT", body: { message: msg, content: b64, sha: sha || undefined } })
    .then(function (r) { var nsha = r.json.content.sha; setTreeSha(path, nsha); return nsha; });
}
/* the file list: one request, kept for 20 s, remembered on the device for an instant start */
var TREE = null, treeAt = 0, treeP = null;
try { TREE = JSON.parse(ls("tutor.tree." + CFG.repo) || "null"); } catch (e) {}
function loadTree(force) {
  if (!force && TREE && Date.now() - treeAt < 20000) return Promise.resolve(TREE);
  if (treeP) return treeP;
  treeP = gh("/repos/" + CFG.repo + "/git/trees/HEAD?recursive=1").then(function (r) {
    TREE = r.status === 404 ? [] : r.json.tree.filter(function (t) { return t.type === "blob"; }).map(function (t) { return { path: t.path, sha: t.sha }; });
    treeAt = Date.now(); treeP = null; ls("tutor.tree." + CFG.repo, JSON.stringify(TREE)); return TREE;
  }).catch(function (e) { treeP = null; if (e.status === 409) { TREE = []; return TREE; } throw e; });
  return treeP;
}
function shaOf(path) { var f = (TREE || []).filter(function (t) { return t.path === path; })[0]; return f ? f.sha : null; }
function setTreeSha(path, sha) { TREE = TREE || []; var f = TREE.filter(function (t) { return t.path === path; })[0]; if (f) f.sha = sha; else TREE.push({ path: path, sha: sha }); ls("tutor.tree." + CFG.repo, JSON.stringify(TREE)); }
function blobBytes(sha) {
  return cget("b:" + sha).then(function (v) { if (v) return v;
    return gh("/repos/" + CFG.repo + "/git/blobs/" + sha).then(function (r) { var b = b64bytes(r.json.content); cput("b:" + sha, b); return b; }); });
}
function fileJSON(path) { var sha = shaOf(path); if (!sha) return Promise.resolve(null); return blobBytes(sha).then(function (b) { return { data: JSON.parse(new TextDecoder().decode(b)), sha: sha }; }); }
function fileText(path) { var sha = shaOf(path); if (!sha) return Promise.resolve(null); return blobBytes(sha).then(function (b) { return { text: new TextDecoder().decode(b), sha: sha }; }); }
var urlCache = {};
function fileURL(path) { var sha = shaOf(path); if (!sha) return Promise.resolve(null); if (urlCache[sha]) return Promise.resolve(urlCache[sha]);
  return blobBytes(sha).then(function (b) { var t = /\.png$/i.test(path) ? "image/png" : /\.pdf$/i.test(path) ? "application/pdf" : /\.svg$/i.test(path) ? "image/svg+xml" : "image/jpeg"; var u = URL.createObjectURL(new Blob([b], { type: t })); urlCache[sha] = u; return u; }); }
function studentBase() { return "students/" + CFG.student + "/"; }
function lessonBase(id) { return studentBase() + "lessons/" + id + "/"; }

/* ---------------- status + toast ---------------- */
var saveEl = $("#save"), timers = {};
function setSave(t, err) { saveEl.textContent = t; saveEl.className = "save" + (err ? " err" : ""); }
function toast(t) { var el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(timers.toast); timers.toast = setTimeout(function () { el.hidden = true; }, 3000); }

/* ---------------- session model ---------------- */
var VERD = [["right", "✓ Right"], ["wrong", "✗ Wrong"], ["wording", "Wording"], ["terminology", "Terminology"], ["partly", "Partly"], ["skipped", "Skipped"]];
var VHELP = { right: "right", wrong: "wrong", wording: "right idea, wrong wording", terminology: "wrong term used", partly: "partly right", skipped: "not attempted" };
function parseId(id) { var m = /^(\d{4}-\d{2}-\d{2})-([a-z]+)/.exec(id) || []; return { date: m[1] || "", subject: m[2] || "" }; }
function newSession(id, script) {
  var p = parseId(id);
  return { v: 2, lesson: id, student: CFG.student, subject: (script && script.subject) || p.subject, date: (script && script.date) || p.date, title: (script && script.title) || "",
    status: "not-started", time: { log: [], edit: {}, started: null, ended: null, minutes: null, phaseMinutes: {} }, answers: {}, extra: [], work: [], feedback: {}, devices: [], updated: null };
}
function norm(s) { s.time = s.time || {}; s.time.log = s.time.log || []; s.time.edit = s.time.edit || {}; s.answers = s.answers || {}; s.extra = s.extra || []; s.work = s.work || []; s.feedback = s.feedback || {}; s.devices = s.devices || [];
  if (s.time.manual && !Object.keys(s.time.edit).length) { s.time.edit = { started: s.time.started, ended: s.time.ended }; delete s.time.manual; } return s; }
function replay(log, upto) {
  var running = false, since = null, phase = null, secs = 0, per = {}, end = upto || Date.now();
  function add(t) { if (running && since != null) { var d = Math.max(0, (t - since) / 1000); secs += d; if (phase) per[phase] = (per[phase] || 0) + d; } since = t; }
  (log || []).forEach(function (e) { var t = Date.parse(e.t); add(t);
    if (e.e === "start" || e.e === "resume") { running = true; if (e.p) phase = e.p; } else if (e.e === "pause" || e.e === "end") running = false; else if (e.e === "phase") phase = e.p; });
  add(end); return { secs: Math.round(secs), running: running, phase: phase, per: per };
}
function finalizeTime(s) {
  /* clock values come from the event log; anything typed under "Times" overrides them */
  var t = s.time, ed = t.edit || {}, log = t.log, a = { started: null, ended: null, minutes: null, phaseMinutes: {} };
  if (log.length) { var st = log.filter(function (e) { return e.e === "start"; }), en = log.filter(function (e) { return e.e === "end"; });
    var r = replay(log); a.started = st.length ? st[0].t : null; a.ended = !r.running && en.length ? en[en.length - 1].t : null;
    a.minutes = r1(r.secs / 60); Object.keys(r.per).forEach(function (k) { a.phaseMinutes[k] = r1(r.per[k] / 60); }); }
  t.auto = a;
  t.started = ed.started ? ed.started : a.started;
  t.ended = ed.ended ? ed.ended : a.ended;
  if (ed.minutes != null) t.minutes = ed.minutes;
  else if ((ed.started || ed.ended) && t.started && t.ended) t.minutes = Math.round((Date.parse(t.ended) - Date.parse(t.started)) / 60000);
  else t.minutes = a.minutes;
  var pm = {}; Object.keys(a.phaseMinutes).forEach(function (k) { pm[k] = a.phaseMinutes[k]; }); Object.keys(ed.phaseMinutes || {}).forEach(function (k) { if (ed.phaseMinutes[k] != null) pm[k] = ed.phaseMinutes[k]; });
  t.phaseMinutes = pm;
}
function merge(local, remote) {
  if (!remote) return local; var out = norm(JSON.parse(JSON.stringify(remote))); local = norm(local);
  Object.keys(local.answers).forEach(function (k) { var a = local.answers[k], b = out.answers[k]; if (!b || String(a.at) > String(b.at)) out.answers[k] = a; });
  var ids = {}; out.extra.forEach(function (x) { ids[x.id] = x; }); local.extra.forEach(function (x) { if (!ids[x.id] || String(x.at) > String(ids[x.id].at)) ids[x.id] = x; });
  out.extra = Object.keys(ids).map(function (k) { return ids[k]; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  var files = {}; out.work.forEach(function (w) { files[w.file] = w; }); local.work.forEach(function (w) { if (!files[w.file] || String(w.at) > String(files[w.file].at)) files[w.file] = w; });
  out.work = Object.keys(files).map(function (k) { return files[k]; });
  if (String(local.time.editAt || "") >= String(out.time.editAt || "")) { out.time.log = local.time.log; out.time.edit = local.time.edit; out.time.editAt = local.time.editAt; }
  if (String(local.feedback.at) > String(out.feedback.at)) out.feedback = local.feedback;
  if (String(local.statusAt || "") > String(out.statusAt || "")) { out.status = local.status; out.statusAt = local.statusAt; }
  ["title", "subject", "date"].forEach(function (k) { if (!out[k] && local[k]) out[k] = local[k]; });
  finalizeTime(out); return out;
}

/* ---------------- current lesson + saving ---------------- */
var L = null; /* {id, script, session, sha, dirty, rev, phase, filter, marking} */
function localKey(id) { return "tutor.s." + CFG.repo + "." + CFG.student + "." + id; }
function stash() { if (L) ls(localKey(L.id), JSON.stringify({ session: L.session, sha: L.sha, dirty: L.dirty })); }
function touch() { if (!L) return; var x = L.session; x.updated = now(); if (x.devices.indexOf(CFG.device) < 0) x.devices.push(CFG.device);
  if (x.status === "not-started") { x.status = "in-progress"; x.statusAt = now(); } finalizeTime(x); L.dirty = true; L.rev = (L.rev || 0) + 1; stash();
  setSave("Kept on device"); clearTimeout(timers.flush); timers.flush = setTimeout(flush, 4000); }
var flushing = false;
function flush() {
  if (!L || !L.dirty || flushing) return Promise.resolve();
  if (!navigator.onLine) { setSave("Offline · kept on device", true); return Promise.resolve(); }
  flushing = true; setSave("Saving…"); var mine = L, rev = mine.rev || 0; finalizeTime(mine.session);
  var path = lessonBase(mine.id) + "session.json";
  function put(sha) { return putB64(path, b64enc(JSON.stringify(mine.session, null, 1)), CFG.student + " " + mine.id + ": lesson log (" + CFG.device + ")", sha); }
  return put(mine.sha).catch(function (e) {
    if (e.status === 409 || e.status === 422) return gh("/repos/" + CFG.repo + "/contents/" + enc(path)).then(function (r) {
      var remote = r.status === 404 ? null : { data: JSON.parse(new TextDecoder().decode(b64bytes(r.json.content))), sha: r.json.sha };
      mine.session = merge(mine.session, remote && remote.data); return put(remote && remote.sha); });
    throw e;
  }).then(function (sha) { mine.sha = sha; mine.dirty = (mine.rev || 0) !== rev;
    ls(localKey(mine.id), JSON.stringify({ session: mine.session, sha: sha, dirty: mine.dirty }));
    setSave(mine.dirty ? "Saving…" : "Saved " + hhmm(now())); flushing = false; if (mine.dirty) setTimeout(flush, 1200); })
  .catch(function (e) { flushing = false; setSave(e.status === 401 || e.status === 403 ? "Key refused" : "Not saved · kept on device", true);
    if (e.status === 401 || e.status === 403) toast("GitHub refused the key. Check it in Settings."); });
}
window.addEventListener("online", flush);
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
setInterval(function () { if (L && L.dirty) flush(); }, 25000);

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
  var f = ls("tutor.font") || "figtree";
  app.innerHTML = '<div class="section-h"><h2>Settings for this device</h2></div>' +
    '<form class="card form" id="setform" style="padding:20px 22px">' +
    '<div class="field"><label for="s-token">GitHub key</label><input type="password" id="s-token" autocomplete="off" value="' + esc(CFG.token) + '" placeholder="github_pat_…"><span class="hint">Fine-grained token with Contents read and write on the tutoring repo. It stays in this browser only.</span></div>' +
    '<div class="row2"><div class="field"><label for="s-repo">Repo</label><input type="text" id="s-repo" value="' + esc(CFG.repo) + '"></div>' +
    '<div class="field"><label for="s-dev">This device</label><input type="text" id="s-dev" value="' + esc(CFG.device) + '" placeholder="tablet, la57, mac"></div>' +
    '<div class="field"><label for="s-stu">Student</label><input type="text" id="s-stu" value="' + esc(CFG.student) + '"></div>' +
    '<div class="field"><label for="s-font">Text style</label><select id="s-font"><option value="figtree"' + (f === "figtree" ? " selected" : "") + '>Clean (Figtree)</option><option value="lexend"' + (f === "lexend" ? " selected" : "") + '>Extra readable (Lexend)</option><option value="serif"' + (f === "serif" ? " selected" : "") + '>Book (Source Serif)</option></select></div></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">Save and test</button><button class="btn" type="button" id="s-cache">Clear this device’s cache</button><button class="btn danger" type="button" id="s-clear">Remove key from this device</button><span class="hint" id="s-msg"></span></div></form>';
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
  (tree || []).forEach(function (t) { if (t.path.indexOf(base) === 0) { var rest = t.path.slice(base.length).split("/"); if (rest.length > 1) { var id = rest[0], f = rest.slice(1).join("/"); ids[id] = ids[id] || { id: id, script: false, session: false, marking: false, work: 0 };
    if (f === "script.json") ids[id].script = true; else if (f === "session.json") ids[id].session = true; else if (f === "marking.json") ids[id].marking = true; else if (/^work\//.test(f)) ids[id].work++; } } });
  return Object.keys(ids).map(function (k) { return ids[k]; }).sort(function (a, b) { return b.id.localeCompare(a.id); });
}
var listSeq = 0;
function lessonsView() {
  var seq = ++listSeq;
  function draw(tree) {
    var items = lessonIds(tree);
    return Promise.all(items.slice(0, 60).map(function (it) {
      return Promise.all([it.script ? fileJSON(lessonBase(it.id) + "script.json") : null, it.session ? fileJSON(lessonBase(it.id) + "session.json") : null])
        .then(function (v) { it.s = v[0] && v[0].data; it.x = v[1] && norm(v[1].data); return it; }).catch(function () { return it; });
    })).then(function (items) {
      if (seq !== listSeq || route().indexOf("/lesson/") === 0 || route().indexOf("/record") === 0 || route().indexOf("/settings") === 0) return;
      var h = '<div class="section-h"><div><div class="label">' + esc(CFG.student) + '</div><h2>' + esc(fmtDate(todayIso(), true)) + '</h2></div><a class="btn" href="#/new">Log a lesson without a script</a></div>';
      h += items.length ? '<div class="grid-2">' + items.map(card).join("") + '</div>' : '<div class="empty"><h3>No lessons yet</h3><p>Ask Claude for the next lesson’s script. It appears here.</p></div>';
      app.innerHTML = h;
    });
  }
  if (TREE && TREE.length) draw(TREE).catch(function () {}); else app.innerHTML = '<div class="empty"><h3>Loading lessons</h3></div>';
  loadTree(true).then(draw).catch(function (e) { if (!TREE || !TREE.length) fail(e); else setSave("Offline", true); });
}
function card(it) {
  var p = parseId(it.id), s = it.s || {}, x = it.x || null, subj = s.subject || (x && x.subject) || p.subject;
  var st = x && x.status === "finished" ? '<span class="pill ok">Logged</span>' : x && x.status === "in-progress" ? '<span class="pill warn">In progress</span>' : s.status === "draft" ? '<span class="pill warn">Draft script</span>' : it.script ? '<span class="pill">Script ready</span>' : "";
  var sc = x ? score(x) : { n: 0 };
  return '<a class="card lesson-card" data-subject="' + esc(subj) + '" href="#/lesson/' + encodeURIComponent(it.id) + '"><div class="meta"><span class="pill ' + esc(subj) + '">' + esc(SUBJ[subj] || subj) + '</span><span>' + esc(fmtDate(s.date || (x && x.date) || p.date)) + '</span>' + st +
    (x && x.time && x.time.minutes ? '<span class="pill">' + esc(x.time.minutes) + ' min</span>' : "") + (sc.n ? '<span class="pill">' + sc.r + '/' + sc.n + ' right</span>' : "") + (it.marking ? '<span class="pill ok">Marked</span>' : it.work ? '<span class="pill warn">' + it.work + ' photo' + (it.work > 1 ? "s" : "") + '</span>' : "") + '</div>' +
    '<h3>' + esc(s.title || (x && x.title) || "Lesson") + '</h3>' + (s.summary ? '<div class="hint">' + clean(s.summary) + '</div>' : "") + '</a>';
}
function score(x) { var r = 0, n = 0; Object.keys(x.answers || {}).forEach(function (k) { var v = x.answers[k].v; if (!v || v === "skipped") return; n++; if (v === "right") r++; }); (x.extra || []).forEach(function (e) { if (!e.v || e.v === "skipped") return; n++; if (e.v === "right") r++; }); return { r: r, n: n }; }

/* ---------------- new unscripted lesson ---------------- */
function newView() {
  app.innerHTML = '<a class="back" href="#/">← Lessons</a><div class="section-h"><h2>Log a lesson without a script</h2></div><form class="card form" id="newform" style="padding:20px 22px">' +
    '<div class="row2"><div class="field"><label for="n-date">Date</label><input type="date" id="n-date" value="' + todayIso() + '" required></div><div class="field"><label for="n-subj">Subject</label><select id="n-subj"><option value="chem">Chemistry</option><option value="maths">Maths</option></select></div></div>' +
    '<div class="field"><label for="n-title">What’s it on?</label><input type="text" id="n-title" required placeholder="e.g. 7.1 Addition formulae"></div><div><button class="btn primary" type="submit">Start logging</button></div></form>';
}

/* ---------------- lesson view ---------------- */
function lessonView(id) {
  var base = lessonBase(id);
  function here() { return route() === "/lesson/" + encodeURIComponent(id) || route() === "/lesson/" + id; }
  function open(fresh) {
    return Promise.all([fileJSON(base + "script.json"), fileJSON(base + "session.json"), fileJSON(base + "marking.json").catch(function () { return null; })]).then(function (v) {
      if (!here()) return;
      var script = v[0] && v[0].data, remote = v[1], marking = v[2] && v[2].data;
      if (L && L.id === id && fresh) {
        /* refresh under an open lesson: new script or another device's taps, redrawn only if something changed */
        var changed = JSON.stringify(script) !== JSON.stringify(L.script) || JSON.stringify(marking) !== JSON.stringify(L.marking);
        L.script = script; L.marking = marking;
        if (remote && remote.sha !== L.sha) { L.session = L.dirty ? merge(L.session, remote.data) : norm(remote.data); finalizeTime(L.session); L.sha = remote.sha; changed = true; }
        if (changed && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) drawLesson(); return;
      }
      var saved = null; try { saved = JSON.parse(ls(localKey(id)) || "null"); } catch (e) {}
      var session, sha = remote ? remote.sha : null, dirty = false;
      if (saved && saved.dirty) { session = remote ? merge(norm(saved.session), remote.data) : norm(saved.session); dirty = true; }
      else session = remote ? norm(remote.data) : newSession(id, script);
      if (!session.title && script) session.title = script.title;
      finalizeTime(session);
      L = { id: id, script: script, session: session, sha: sha, dirty: dirty, marking: marking, phase: (L && L.id === id) ? L.phase : null, filter: null, rev: 0 };
      if (dirty) flush();
      drawLesson();
    });
  }
  if (!(L && L.id === id)) app.innerHTML = '<div class="empty"><h3>Opening the lesson</h3></div>';
  var had = TREE && TREE.some(function (t) { return t.path.indexOf(base) === 0; });
  var first = had ? open(false) : loadTree(true).then(function () { return open(false); });
  first.then(function () { if (had) return loadTree(true).then(function () { return open(true); }); }).catch(function (e) { if (!(L && L.id === id)) fail(e); });
}
function phases() {
  var s = L.script, ps = [];
  if (s && s.phases && s.phases.length) ps = s.phases.slice();
  else if (s && (s.quiz || s.questions)) {
    if ((s.quiz || []).length) ps.push({ id: "quiz", name: "Oral quiz", blocks: [{ type: "quiz", id: "quiz", items: s.quiz }] });
    if ((s.questions || []).length) ps.push({ id: "qs", name: "Questions", blocks: s.questions.map(function (q) { return Object.assign({ type: "question" }, q); }) });
  } else ps.push({ id: "lesson", name: "Lesson", blocks: [{ type: "text", html: "<p>No script for this lesson. Use <b>Extra questions</b> to log what he answered, and <b>After the lesson</b> for notes.</p>" }] });
  ps.push({ id: "_extra", name: "Extra questions", sys: 1 }, { id: "_work", name: "His work (photos)", sys: 1 }, { id: "_time", name: "Times", sys: 1 }, { id: "_after", name: "After the lesson", sys: 1 });
  return ps;
}
function drawLesson() {
  var s = L.script || {}, x = L.session, subj = s.subject || x.subject;
  document.body.setAttribute("data-subject", subj);
  var ps = phases(); if (!L.phase || !ps.some(function (p) { return p.id === L.phase; })) L.phase = x.status === "finished" ? "_after" : ps[0].id;
  var r = replay(x.time.log);
  var h = '<a class="back" href="#/">← Lessons</a><div class="lhead"><div style="min-width:0"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ' + esc(subj) + '">' + esc(SUBJ[subj] || subj) + '</span><span class="hint">' + esc(fmtDate(x.date || s.date, true)) + '</span>' +
    (s.status === "draft" ? '<span class="pill warn">Draft script</span>' : "") + (x.status === "finished" ? '<span class="pill ok">Logged</span>' : x.status === "in-progress" ? '<span class="pill warn">In progress</span>' : "") + '</div>' +
    '<h1>' + esc(s.title || x.title || "Lesson") + '</h1>' + (s.summary ? '<div class="sub">' + clean(s.summary) + '</div>' : "") + '</div>' +
    '<div class="card clock" aria-label="Lesson clock"><span class="t" id="clk">0:00</span><button class="btn small primary" id="clkgo" type="button"></button>' + (r.running ? '<button class="btn small" id="clkend" type="button">End lesson</button>' : "") + '<button class="btn small" type="button" data-phase="_time">Edit times</button><span class="st" id="clkst"></span></div></div>';
  h += '<div class="lesson"><nav class="rail" aria-label="Lesson phases">' + ps.map(function (p, i) {
    var pm = x.time.phaseMinutes && x.time.phaseMinutes[p.id], planned = p.start != null ? p.start + "–" + p.end + " min" : "";
    var tm = p.sys ? ({ _extra: x.extra.length ? x.extra.length + " logged" : "add as you go", _work: x.work.filter(function (w) { return !w.removed; }).length ? x.work.filter(function (w) { return !w.removed; }).length + " uploaded" : "upload photos", _time: x.time.minutes != null ? x.time.minutes + " min" + (x.time.started ? " · " + hhmm(x.time.started) + "–" + (x.time.ended ? hhmm(x.time.ended) : "") : "") : "not recorded yet", _after: x.feedback && x.feedback.at ? "saved " + hhmm(x.feedback.at) : "notes + finish" })[p.id] : planned + (pm ? " · took " + pm : "");
    return (p.id === "_extra" ? '<div class="sep"></div>' : "") + '<button type="button" data-phase="' + esc(p.id) + '" data-real="' + (p.sys ? "" : "1") + '"' + (p.id === L.phase ? ' aria-current="step"' : "") + '><span class="n">' + (p.sys ? { _extra: "+", _work: "▤", _time: "⏱", _after: "✓" }[p.id] : i + 1) + '</span><span class="nm">' + esc(p.name) + '</span><span class="tm">' + esc(tm) + '</span></button>';
  }).join("") + '</nav><section class="card page" id="phasebox"></section></div>';
  app.innerHTML = h; drawPhase(); tick();
}
function drawPhase() {
  var ps = phases(), p = ps.filter(function (q) { return q.id === L.phase; })[0], box = $("#phasebox"), h = "";
  if (p.id === "_extra") h = extraView(); else if (p.id === "_work") h = workView(); else if (p.id === "_time") h = timeView(); else if (p.id === "_after") h = afterView();
  else {
    h += '<div class="phase-top"><h2>' + esc(p.name) + '</h2>' + (p.start != null ? '<span class="hint num">' + p.start + '–' + p.end + ' min</span>' : "") + '</div>';
    if (p.show) h += '<div class="screen"><span class="label">On screen</span><div>' + clean(p.show) + '</div></div>';
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
    case "module": return '<details class="module"' + (b.level !== "deep" ? " open" : "") + '><summary><span class="lvl ' + (b.level === "deep" ? "deep" : "core") + '">' + (b.level === "deep" ? "DEEP" : "CORE") + '</span><h3>' + esc(b.name) + '</h3>' + (b.minutes ? '<span class="pill">' + esc(b.minutes) + ' min</span>' : "") + '<span class="chev">›</span></summary><div class="mbody">' + blocks(b.blocks) + '</div></details>';
    case "figure": return b.img ? img(b.img, b.caption).replace("</figure>", (b.caption ? '<figcaption>' + clean(b.caption) + '</figcaption>' : "") + '</figure>') : '<figure class="fig">' + clean(b.html) + '</figure>';
    case "reveal": return '<details class="reveal"><summary>' + esc(b.label || "Answer") + '</summary><div class="prose">' + clean(b.html) + (b.img || []).map(function (i) { return img(i); }).join("") + '</div></details>';
    case "drill": return '<div><div class="label" style="margin-bottom:8px">' + esc(b.title || "Quick-fire drill") + '</div><div class="drill">' + (b.items || []).map(function (d) { return '<div class="d"><div>' + clean(d[0]) + '</div><details><summary class="linkbtn">Answer</summary><div class="da">' + clean(d[1]) + '</div></details></div>'; }).join("") + '</div></div>';
    case "quiz": return quizBlock(b);
    case "question": return questionBlock(b);
    default: return b.html ? '<div class="prose">' + clean(b.html) + '</div>' : "";
  }
}
function ctl(id, marks, a) {
  a = a || L.session.answers[id] || {};
  return '<div class="ctl" data-item="' + esc(id) + '">' + VERD.map(function (v) { return '<button class="v" type="button" data-v="' + v[0] + '" title="' + esc(VHELP[v[0]]) + '" aria-pressed="' + (a.v === v[0]) + '">' + v[1] + '</button>'; }).join("") +
    (marks ? '<input class="mk" type="number" min="0" max="' + esc(marks) + '" step="0.5" inputmode="decimal" aria-label="Marks out of ' + esc(marks) + '" data-mk value="' + (a.m != null ? esc(a.m) : "") + '"><span class="hint num">/ ' + esc(marks) + '</span>' : "") +
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
      return '<div class="item" data-v="' + esc(a.v || "") + '"' + (show ? "" : " hidden") + '><span class="qn">' + (i + 1) + '</span><div><div class="tags">' + (it.page ? '<span class="pill">' + esc(it.page) + '</span>' : "") + (it.kind ? '<span class="pill">' + esc({ recall: "Recall", reason: "Reason", draw: "Draw" }[it.kind] || it.kind) + '</span>' : "") + (it.star ? '<span class="pill warn">★</span>' : "") + '</div><div>' + clean(it.q) + '</div><button class="linkbtn" type="button" data-ans>Show answer</button><div class="qa prose" hidden>' + clean(it.a) + '</div></div>' + ctl(it.id) + '</div>';
    }).join("") + '</div>';
}
function questionBlock(q) {
  var h = '<div class="qcard"><div><h3>' + esc(q.label || "Question") + '</h3>' + (q.source ? '<div class="src">' + esc(q.source) + '</div>' : "") + '</div>' + (q.html ? '<div class="prose">' + clean(q.html) + '</div>' : "") + (q.img || []).map(function (i) { return img(i, q.label); }).join("");
  if (q.answer || (q.answerImg || []).length) h += '<details class="reveal"><summary>Mark scheme</summary><div class="prose">' + clean(q.answer || "") + (q.answerImg || []).map(function (i) { return img(i, "Mark scheme"); }).join("") + '</div></details>';
  var a = L.session.answers[q.id] || {};
  return h + '<div class="items"><div class="item" data-v="' + esc(a.v || "") + '"><span class="qn">▸</span><div class="label" style="padding-top:12px">How he did</div>' + ctl(q.id, q.marks) + '</div></div></div>';
}
function drawTally() {
  var old = $("#tally"); if (old) old.remove(); var box = $("#phasebox"); if (!box || L.phase === "_after" || L.phase === "_time") return;
  var c = { right: 0, wrong: 0, wording: 0, terminology: 0, partly: 0 }, n = 0;
  Object.keys(L.session.answers).forEach(function (k) { var v = L.session.answers[k].v; if (c[v] != null) { c[v]++; n++; } });
  L.session.extra.forEach(function (e) { if (c[e.v] != null) { c[e.v]++; n++; } });
  var d = document.createElement("div"); d.className = "tally"; d.id = "tally";
  d.innerHTML = n ? '<b>' + c.right + ' / ' + n + '</b><span>right</span><span>✗ ' + c.wrong + '</span><span>wording ' + c.wording + '</span><span>terminology ' + c.terminology + '</span><span>partly ' + c.partly + '</span>' : '<span>Tap a verdict on each answer. Tap it again to undo. Everything saves as you go.</span>';
  box.appendChild(d);
}
function loadImages(root) { $$("img[data-src]", root).forEach(function (im) { var p = im.getAttribute("data-src"); var full = /^(students|books)\//.test(p) ? p : lessonBase(L.id) + p;
  fileURL(full).then(function (u) { var ph = im.nextElementSibling; if (u) { im.src = u; im.hidden = false; if (ph && ph.classList.contains("ph")) ph.remove(); } else if (ph) ph.textContent = "Image not found: " + p; }).catch(function () { var ph = im.nextElementSibling; if (ph) ph.textContent = "Couldn’t load image"; }); }); }

/* extra questions: asked on the spot, editable any time */
function extraView() {
  var x = L.session;
  var h = '<div class="phase-top"><h2>Extra questions</h2><span class="hint">Anything you asked that isn’t in the script</span></div>';
  h += '<form class="card form" id="exform" style="padding:16px 18px;max-width:none"><div class="field"><label for="ex-q">Question you asked</label><input type="text" id="ex-q" required placeholder="e.g. Why is propanone’s product not chiral?"></div>' +
    '<div class="field"><span class="lab">How he did</span><div style="display:flex;gap:6px;flex-wrap:wrap">' + VERD.map(function (v) { return '<button class="v" type="button" data-exv="' + v[0] + '" aria-pressed="false">' + v[1] + '</button>'; }).join("") + '</div></div>' +
    '<div class="field"><label for="ex-note">What he said / got wrong</label><input type="text" id="ex-note"></div><div><button class="btn primary" type="submit">Add</button></div></form>';
  h += x.extra.length ? '<div class="items">' + x.extra.map(function (e, i) { return '<div class="item" data-v="' + esc(e.v || "") + '"><span class="qn">' + (i + 1) + '</span><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input style="flex:1 1 260px;min-height:42px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);padding:0 12px;font-weight:700" type="text" data-exq="' + esc(e.id) + '" value="' + esc(e.q) + '" aria-label="Question"><span class="hint">' + esc(hhmm(e.at)) + '</span><button class="btn small danger" type="button" data-exdel="' + esc(e.id) + '">Remove</button></div>' + ctl("x:" + e.id, null, e) + '</div>'; }).join("") + '</div>'
    : '<div class="empty"><h3>None yet</h3><p>Every question you add here counts in his record like a scripted one, and you can change it later.</p></div>';
  return h;
}

/* photos of his work */
function workView() {
  var x = L.session, items = itemsList();
  var h = '<div class="phase-top"><h2>His work</h2><span class="hint">Photos go to GitHub for Claude to read, mark and log</span></div>';
  h += '<form class="card form" id="wkform" style="padding:16px 18px;max-width:none"><div class="field"><label for="wk-files">Photos or PDFs</label><input type="file" id="wk-files" accept="image/*,application/pdf" multiple required><span class="hint">Photos are resized to stay sharp but small. Several pages at once is fine.</span></div>' +
    '<div class="row2"><div class="field"><label for="wk-item">Which question?</label><select id="wk-item"><option value="">Whole lesson / several questions</option>' + items.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.label) + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label for="wk-kind">What is it?</label><select id="wk-kind"><option value="class">Class work</option><option value="homework">Homework</option><option value="test">Test</option><option value="other">Other</option></select></div></div>' +
    '<div class="field"><label for="wk-note">Note for Claude (optional)</label><input type="text" id="wk-note" placeholder="e.g. page 2 is blurry"></div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn primary" type="submit" id="wk-go">Upload</button><span class="hint" id="wk-st"></span></div></form>';
  var m = L.marking;
  if (m) h += '<div class="card" style="padding:16px 18px"><div class="label">Claude’s marking</div>' + (m.summary ? '<p>' + clean(m.summary) + '</p>' : "") + (m.score != null ? '<p><b>' + esc(m.score) + ' / ' + esc(m.max) + '</b></p>' : "") + '<ul class="list-plain">' + (m.mistakes || []).map(function (k) { return '<li class="mistake ' + esc(k.type || "") + '"><div><b>' + esc(labelOf(k.item) || k.item || "") + '</b> ' + clean(k.what || "") + '</div>' + (k.fix ? '<div class="fix">Fix: ' + clean(k.fix) + '</div>' : "") + '</li>'; }).join("") + '</ul></div>';
  var live = x.work.filter(function (w) { return !w.removed; });
  h += live.length ? '<div class="items">' + live.map(function (w) { return '<div class="item"><span class="qn">▤</span><div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>' + esc(labelOf(w.item) || "Whole lesson") + '</b><span class="pill">' + esc(w.kind) + '</span><span class="hint">' + esc(hhmm(w.at)) + (w.note ? " · " + esc(w.note) : "") + '</span><button class="btn small danger" type="button" data-wkdel="' + esc(w.file) + '" style="margin-left:auto">Remove from lesson</button></div><div class="thumbs" style="margin-top:10px">' + (/\.pdf$/i.test(w.file) ? '<span class="pdf">PDF</span>' : '<figure class="fig"><img data-src="' + esc(w.file) + '" alt="His work" hidden style="width:104px;height:104px;object-fit:cover"><div class="ph" style="width:104px">loading</div></figure>') + '</div></div></div>'; }).join("") + '</div>'
    : '<div class="empty"><h3>No photos yet</h3><p>Upload his answers. Claude reads each one, marks it against the real mark scheme and notes every mistake.</p></div>';
  return h;
}
function itemsList() { var out = [];
  phases().forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "question") out.push({ id: b.id, label: b.label || b.id }); if (b.type === "quiz") (b.items || []).forEach(function (q, i) { out.push({ id: q.id, label: "Quiz " + (i + 1) + ": " + String(q.q).replace(/<[^>]+>/g, "").slice(0, 60) }); }); if (b.blocks) walk(b.blocks); }); })(p.blocks); });
  L.session.extra.forEach(function (e, i) { out.push({ id: "x:" + e.id, label: "Extra " + (i + 1) + ": " + e.q.slice(0, 60) }); }); return out; }
function labelOf(id) { if (!id) return ""; var f = itemsList().filter(function (i) { return i.id === id; })[0]; return f ? f.label : id; }

/* times: everything editable, including undoing "End lesson" */
function tval(iso) { return iso ? hhmm(iso) : ""; }
function timeView() {
  var x = L.session, t = x.time, ed = t.edit || {}, a = t.auto || {}, r = replay(t.log), ended = t.log.length && t.log[t.log.length - 1].e === "end";
  var h = '<div class="phase-top"><h2>Times</h2><span class="hint">Change anything. Leave a box empty to use the clock’s value.</span></div>';
  h += '<div class="card form" style="padding:18px 20px;max-width:none"><div class="row2 timegrid">' +
    '<div class="field"><label for="tm-date">Date</label><input type="date" id="tm-date" data-tm="date" value="' + esc(x.date || parseId(L.id).date) + '"></div>' +
    '<div class="field"><label for="tm-s">Started at</label><input type="time" id="tm-s" data-tm="started" value="' + esc(tval(ed.started)) + '"><span class="hint">Clock: ' + esc(tval(a.started) || "not started") + '</span></div>' +
    '<div class="field"><label for="tm-e">Ended at</label><input type="time" id="tm-e" data-tm="ended" value="' + esc(tval(ed.ended)) + '"><span class="hint">Clock: ' + esc(tval(a.ended) || (r.running ? "still running" : "not ended")) + '</span></div>' +
    '<div class="field"><label for="tm-m">Minutes taught</label><input type="number" id="tm-m" data-tm="minutes" min="0" step="1" inputmode="numeric" value="' + esc(ed.minutes != null ? ed.minutes : "") + '"><span class="hint">Now counted: <b id="tm-now">' + esc(t.minutes != null ? t.minutes : "—") + '</b> (clock: ' + esc(a.minutes != null ? a.minutes : "—") + ')</span></div></div>';
  var real = phases().filter(function (p) { return !p.sys; });
  h += '<div><div class="label" style="margin-bottom:8px">Minutes per part</div><div class="row2 timegrid">' + real.map(function (p) { var e = (ed.phaseMinutes || {})[p.id]; return '<div class="field"><label for="tp-' + esc(p.id) + '">' + esc(p.name) + '</label><input type="number" id="tp-' + esc(p.id) + '" data-tp="' + esc(p.id) + '" min="0" step="0.5" inputmode="decimal" value="' + esc(e != null ? e : "") + '" placeholder="' + esc((a.phaseMinutes || {})[p.id] != null ? a.phaseMinutes[p.id] : "") + '"></div>'; }).join("") + '</div></div>';
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap">' + (ended ? '<button class="btn" type="button" id="tm-undo">Undo “End lesson”</button>' : "") + '<button class="btn" type="button" id="tm-clear">Clear typed times</button><button class="btn danger" type="button" id="tm-reset">Reset the clock</button></div></div>';
  if (t.log.length) h += '<details class="reveal"><summary>Clock history (' + t.log.length + ' taps)</summary><div><ul class="list-plain">' + t.log.map(function (e, i) { var pn = e.p ? (phases().filter(function (p) { return p.id === e.p; })[0] || {}).name : ""; return '<li style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="num" style="min-width:3.5em">' + esc(hhmm(e.t)) + '</span><span>' + esc({ start: "Started", pause: "Paused", resume: "Resumed", phase: "Moved to", end: "Ended" }[e.e] || e.e) + (pn ? " · " + esc(pn) : "") + '</span><span class="hint">' + esc(e.d || "") + '</span><button class="btn small danger" type="button" data-logdel="' + i + '" style="margin-left:auto">Delete</button></li>'; }).join("") + '</ul></div></details>';
  return h;
}
function timeEdited() { L.session.time.editAt = now(); touch(); var el = $("#tm-now"); if (el) el.textContent = L.session.time.minutes != null ? L.session.time.minutes : "—"; tick(); }

/* after the lesson */
function afterView() {
  var x = L.session, fb = x.feedback || {}, s = L.script || {}, sc = score(x);
  var h = '<div class="phase-top"><h2>After the lesson</h2><span class="hint">Claude reads this before the next script</span></div>';
  h += '<div class="stats"><button class="card stat" type="button" data-phase="_time" style="text-align:left;cursor:pointer"><div class="v2">' + (x.time.minutes != null ? x.time.minutes : "—") + '</div><div class="l">minutes taught' + (x.time.started ? " · " + hhmm(x.time.started) + "–" + (x.time.ended ? hhmm(x.time.ended) : "now") : "") + ' · tap to edit</div></button>' +
    '<div class="card stat"><div class="v2">' + (sc.n ? sc.r + "/" + sc.n : "—") + '</div><div class="l">answers right</div></div><div class="card stat"><div class="v2">' + x.work.filter(function (w) { return !w.removed; }).length + '</div><div class="l">photos uploaded</div></div></div>';
  var wrong = [];
  Object.keys(x.answers).forEach(function (k) { var a = x.answers[k]; if (a.v && a.v !== "right" && a.v !== "skipped") wrong.push('<li class="mistake ' + esc(a.v) + '"><div><b>' + esc(labelOf(k)) + '</b> <span class="pill">' + esc(VHELP[a.v]) + '</span></div>' + (a.note ? '<div class="fix">' + esc(a.note) + '</div>' : "") + '</li>'); });
  x.extra.forEach(function (e) { if (e.v && e.v !== "right" && e.v !== "skipped") wrong.push('<li class="mistake ' + esc(e.v) + '"><div><b>' + esc(e.q) + '</b> <span class="pill">' + esc(VHELP[e.v]) + '</span></div>' + (e.note ? '<div class="fix">' + esc(e.note) + '</div>' : "") + '</li>'); });
  if (wrong.length) h += '<div><div class="label" style="margin-bottom:8px">Going into his mistakes log</div><ul class="list-plain">' + wrong.join("") + '</ul></div>';
  function fld(id, label, key, ph, area, def) { var v = fb[key] != null ? fb[key] : (def || ""); return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (area ? '<textarea id="' + id + '" data-fb="' + key + '" placeholder="' + esc(ph || "") + '">' + esc(v) + '</textarea>' : '<input type="text" id="' + id + '" data-fb="' + key + '" value="' + esc(v) + '" placeholder="' + esc(ph || "") + '">') + '</div>'; }
  h += '<form class="form" id="fbform"><div class="field"><span class="lab">How did it go?</span><div style="display:flex;gap:6px;flex-wrap:wrap">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="chip" type="button" data-rate="' + n + '" aria-pressed="' + (fb.rating === n) + '">' + n + '</button>'; }).join("") + '</div><span class="hint">1 rough · 5 went really well</span></div>' +
    fld("fb-cov", "What you actually covered", "covered", "e.g. got to 3c, skipped the NaBH₄ drill", true) + fld("fb-stuck", "Where he got stuck", "stuck", "", true) + fld("fb-worked", "What worked", "worked", "", true) +
    fld("fb-change", "What to change next time (for Claude)", "change", "This shapes the next script", true) + fld("fb-hw", "Homework set", "hw", "", false, s.homeworkSummary) + fld("fb-pages", "Book pages set to memorise", "pages", "e.g. CGP 172–173 (Claude adds these to the next quiz)", false, s.pagesSet) +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">' + (x.status === "finished" ? "Save changes" : "Finish and save the lesson") + '</button>' + (x.status === "finished" ? '<button class="btn" type="button" id="reopen">Reopen the lesson</button>' : "") + (fb.at ? '<span class="pill ok">Saved ' + esc(hhmm(fb.at)) + '</span>' : "") + '</div></form>';
  return h;
}

/* ---------------- clock ---------------- */
function fmt(s) { var m = Math.floor(s / 60), x = s % 60; return m + ":" + (x < 10 ? "0" : "") + x; }
function tick() {
  var el = $("#clk"); if (!el || !L) return; var x = L.session, r = replay(x.time.log);
  el.textContent = fmt(r.secs);
  var go = $("#clkgo"); if (go) go.textContent = r.running ? "Pause" : (r.secs ? "Resume" : "Start lesson");
  var st = $("#clkst"); if (st) st.textContent = x.time.started ? "from " + hhmm(x.time.started) + (x.time.ended && !r.running ? " to " + hhmm(x.time.ended) : "") : "";
  $$(".rail button[data-real]").forEach(function (b) { b.classList.toggle("live", r.running && r.phase === b.getAttribute("data-phase")); });
}
setInterval(function () { if (L && replay(L.session.time.log).running) tick(); }, 1000);
function logEvent(e, p) { L.session.time.log.push({ t: now(), e: e, p: p || undefined, d: CFG.device }); L.session.time.editAt = now(); touch(); }

/* ---------------- events ---------------- */
var armed = null;
document.addEventListener("click", function (ev) {
  var t = ev.target.closest("button,img"); if (!t) return;
  if (t.tagName === "IMG") { if (t.closest(".fig") || t.closest(".thumbs")) { $("#zimg").src = t.src; $("#zoom").hidden = false; } return; }
  if (t.id === "zoomx") { closeZoom(); return; }
  if (t.id === "s-clear") { ls("tutor.token", null); toast("Key removed from this device"); settingsView(); return; }
  if (t.id === "s-cache") { try { indexedDB.deleteDatabase("tutor-desk"); } catch (e) {} idbP = null; ls("tutor.tree." + CFG.repo, null); TREE = null; toast("Cache cleared"); return; }
  if (!L || route().indexOf("/lesson/") !== 0) return;
  var x = L.session;
  if (t.hasAttribute("data-phase")) { var id = t.getAttribute("data-phase"); var r = replay(x.time.log);
    if (t.getAttribute("data-real") && r.running && r.phase !== id) logEvent("phase", id);
    L.phase = id; drawLesson(); if (window.innerWidth < 900) $("#phasebox").scrollIntoView({ block: "start" }); return; }
  if (t.id === "clkgo") { var r2 = replay(x.time.log); var cur = phases().filter(function (p) { return p.id === L.phase && !p.sys; })[0];
    if (r2.running) logEvent("pause"); else { if (x.status === "finished") { x.status = "in-progress"; x.statusAt = now(); } logEvent(r2.secs ? "resume" : "start", cur ? cur.id : (r2.phase || phases()[0].id)); wake(); }
    drawLesson(); return; }
  if (t.id === "clkend") { logEvent("end"); drawLesson(); flush(); toast("Lesson ended. Undo it under Times if that was a mistake."); return; }
  if (t.id === "tm-undo") { var lg = x.time.log; for (var i = lg.length - 1; i >= 0; i--) { if (lg[i].e === "end") { lg.splice(i, 1); break; } } timeEdited(); drawLesson(); toast("“End lesson” undone"); return; }
  if (t.id === "tm-clear") { x.time.edit = {}; timeEdited(); drawLesson(); return; }
  if (t.id === "tm-reset") { if (armed !== "reset") { armed = "reset"; t.textContent = "Tap again to reset the clock"; t.classList.add("confirm"); setTimeout(function () { if (armed === "reset") { armed = null; if (t.isConnected) { t.textContent = "Reset the clock"; t.classList.remove("confirm"); } } }, 4000); return; }
    armed = null; x.time.log = []; timeEdited(); drawLesson(); toast("Clock reset"); return; }
  if (t.hasAttribute("data-logdel")) { x.time.log.splice(+t.getAttribute("data-logdel"), 1); timeEdited(); drawLesson(); return; }
  if (t.id === "reopen") { x.status = "in-progress"; x.statusAt = now(); touch(); drawLesson(); return; }
  if (t.hasAttribute("data-qf")) { L.filter = t.getAttribute("data-qf"); drawPhase(); return; }
  if (t.hasAttribute("data-ans")) { var qa = t.parentNode.querySelector(".qa"); qa.hidden = !qa.hidden; t.textContent = qa.hidden ? "Show answer" : "Hide answer"; return; }
  if (t.hasAttribute("data-v")) { var box = t.closest("[data-item]"), iid = box.getAttribute("data-item"), v = t.getAttribute("data-v"), a = target(iid);
    a.v = a.v === v ? null : v; a.at = now(); a.d = CFG.device; save(iid, a);
    $$(".v", box).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === a.v)); }); var row = box.closest(".item"); if (row) row.setAttribute("data-v", a.v || ""); drawTally(); return; }
  if (t.hasAttribute("data-exv")) { $$("[data-exv]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t && b.getAttribute("aria-pressed") !== "true")); }); return; }
  if (t.hasAttribute("data-exdel")) { var did = t.getAttribute("data-exdel"); x.extra = x.extra.filter(function (e) { return e.id !== did; }); touch(); drawLesson(); return; }
  if (t.hasAttribute("data-wkdel")) { var f = t.getAttribute("data-wkdel"); x.work.forEach(function (w) { if (w.file === f) { w.removed = true; w.at = now(); } }); touch(); drawLesson(); toast("Removed from the lesson (the photo stays in GitHub)"); return; }
  if (t.hasAttribute("data-rate")) { x.feedback.rating = +t.getAttribute("data-rate"); x.feedback.at = now(); touch(); $$("[data-rate]").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-rate") === x.feedback.rating)); }); return; }
});
/* verdicts live in session.answers; extra questions carry their own verdict */
function target(iid) { if (iid.indexOf("x:") === 0) { var e = L.session.extra.filter(function (z) { return z.id === iid.slice(2); })[0]; return e || {}; } return L.session.answers[iid] || {}; }
function save(iid, a) { if (iid.indexOf("x:") !== 0) L.session.answers[iid] = a; touch(); }
document.addEventListener("input", function (ev) {
  var t = ev.target; if (!L) return; var x = L.session;
  if (t.hasAttribute("data-note") || t.hasAttribute("data-mk")) { var iid = t.closest("[data-item]").getAttribute("data-item"), a = target(iid);
    if (t.hasAttribute("data-note")) a.note = t.value; else a.m = t.value === "" ? null : +t.value; a.at = now(); save(iid, a); }
  if (t.hasAttribute("data-exq")) { var e = x.extra.filter(function (z) { return z.id === t.getAttribute("data-exq"); })[0]; if (e) { e.q = t.value; e.at = now(); touch(); } }
  if (t.hasAttribute("data-fb")) { x.feedback[t.getAttribute("data-fb")] = t.value; x.feedback.at = now(); touch(); }
  if (t.hasAttribute("data-tm")) { var k = t.getAttribute("data-tm"), ed = x.time.edit;
    if (k === "date") { x.date = t.value; }
    else if (k === "minutes") ed.minutes = t.value === "" ? null : +t.value;
    else { var d = x.date || parseId(L.id).date; ed[k] = t.value ? new Date(d + "T" + t.value).toISOString() : null; }
    timeEdited(); }
  if (t.hasAttribute("data-tp")) { var ed2 = x.time.edit; ed2.phaseMinutes = ed2.phaseMinutes || {}; ed2.phaseMinutes[t.getAttribute("data-tp")] = t.value === "" ? null : +t.value; timeEdited(); }
});
document.addEventListener("submit", function (ev) {
  ev.preventDefault(); var f = ev.target;
  if (f.id === "setform") { ls("tutor.token", $("#s-token").value.trim()); ls("tutor.repo", $("#s-repo").value.trim() || "alimuqaddasm/tutoring"); ls("tutor.device", $("#s-dev").value.trim() || "tablet"); ls("tutor.student", $("#s-stu").value.trim() || "UK-1");
    var nf = $("#s-font").value; if (nf !== (ls("tutor.font") || "figtree")) { ls("tutor.font", nf); location.reload(); return; } TREE = null; nav(route()); testConnection(); return; }
  if (f.id === "newform") { var id = $("#n-date").value + "-" + $("#n-subj").value; var sess = newSession(id, null); sess.title = $("#n-title").value.trim(); sess.subject = $("#n-subj").value; sess.date = $("#n-date").value;
    ls(localKey(id), JSON.stringify({ session: sess, sha: null, dirty: true })); location.hash = "#/lesson/" + encodeURIComponent(id); return; }
  if (f.id === "tsform") return saveTest();
  if (!L) return; var x = L.session;
  if (f.id === "exform") { var q = $("#ex-q").value.trim(); if (!q) return; var sel = $("[data-exv][aria-pressed='true']");
    x.extra.push({ id: "x" + Date.now().toString(36), q: q, v: sel ? sel.getAttribute("data-exv") : null, note: $("#ex-note").value.trim(), at: now(), d: CFG.device }); touch(); drawLesson(); toast("Added"); return; }
  if (f.id === "fbform") { $$("[data-fb]", f).forEach(function (i) { x.feedback[i.getAttribute("data-fb")] = i.value; }); x.feedback.at = now();
    if (replay(x.time.log).running) logEvent("end"); x.status = "finished"; x.statusAt = now(); touch(); flush().then(function () { toast("Lesson saved to GitHub"); drawLesson(); }); return; }
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
  var base = lessonBase(L.id) + "work/" + new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-"), i = 0;
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
  var sb = studentBase();
  function draw(tree) {
    var ids = lessonIds(tree).filter(function (i) { return i.session; });
    return Promise.all([fileText(sb + "mistakes.jsonl"), fileText(sb + "tests.jsonl"), fileText(sb + "profile.md")].concat(ids.map(function (i) { return fileJSON(lessonBase(i.id) + "session.json").then(function (d) { i.x = d && norm(d.data); return i; }); })))
      .then(function (v) {
        if (route().indexOf("/record") !== 0) return;
        function jl(r) { return r ? r.text.split(/\n/).filter(function (l) { return l.trim(); }).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []; }
        var mistakes = jl(v[0]).reverse(), tests = jl(v[1]), prof = v[2] ? v[2].text : "";
        var mins = 0, n = 0, r = 0; ids.forEach(function (i) { var x = i.x || {}; mins += (x.time && x.time.minutes) || 0; var s = score(x); n += s.n; r += s.r; });
        var h = '<div class="section-h"><h2>' + esc(CFG.student) + '’s record</h2></div>';
        h += '<div class="stats"><div class="card stat"><div class="v2">' + ids.length + '</div><div class="l">lessons logged</div></div><div class="card stat"><div class="v2">' + r1(mins / 60) + '</div><div class="l">hours taught</div></div><div class="card stat"><div class="v2">' + (n ? Math.round(100 * r / n) + "%" : "—") + '</div><div class="l">answers right</div></div><div class="card stat"><div class="v2">' + mistakes.filter(function (m) { return !m.fixed; }).length + '</div><div class="l">open mistakes</div></div></div>';
        h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Time log</h2><span class="hint">Tap a row to open or correct it</span></div>';
        h += ids.length ? '<div class="card tablewrap"><table class="t"><thead><tr><th>Date</th><th>Subject</th><th>Lesson</th><th>Start</th><th>End</th><th>Minutes</th><th>Right</th></tr></thead><tbody>' + ids.map(function (i) { var x = i.x || {}, p = parseId(i.id), s = score(x); return '<tr data-href="#/lesson/' + encodeURIComponent(i.id) + '"><td class="num">' + esc(fmtDate(x.date || p.date)) + '</td><td><span class="pill ' + esc(x.subject || p.subject) + '">' + esc(SUBJ[x.subject || p.subject] || "") + '</span></td><td><b>' + esc(x.title || i.id) + '</b></td><td class="num">' + esc(hhmm(x.time && x.time.started)) + '</td><td class="num">' + esc(hhmm(x.time && x.time.ended)) + '</td><td class="num">' + esc(x.time && x.time.minutes != null ? x.time.minutes : "") + '</td><td class="num">' + (s.n ? s.r + "/" + s.n : "") + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="empty"><h3>No lessons logged yet</h3></div>';
        h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Mistakes</h2><span class="hint">Kept by Claude from your verdicts and his marked work</span></div>';
        h += mistakes.length ? '<ul class="list-plain">' + mistakes.slice(0, 150).map(function (m) { return '<li class="mistake ' + esc(m.type || "") + '"' + (m.fixed ? ' style="opacity:.55"' : "") + '><div><span class="pill ' + esc(m.subject || "") + '">' + esc(SUBJ[m.subject] || m.subject || "") + '</span> ' + (m.type ? '<span class="pill">' + esc(VHELP[m.type] || m.type) + '</span> ' : "") + clean(m.text || m.what || "") + '</div>' + (m.fix ? '<div class="fix">Fix: ' + clean(m.fix) + '</div>' : "") + '<div class="fix">' + esc([m.topic, m.source, m.date, m.fixed ? "fixed" : ""].filter(Boolean).join(" · ")) + '</div></li>'; }).join("") + '</ul>' : '<div class="empty"><h3>No mistakes logged yet</h3></div>';
        h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Tests</h2></div><form class="card form" id="tsform" style="padding:18px 20px"><div class="row2"><div class="field"><label for="t-date">Date</label><input type="date" id="t-date" value="' + todayIso() + '" required></div><div class="field"><label for="t-subj">Subject</label><select id="t-subj"><option value="maths">Maths</option><option value="chem">Chemistry</option></select></div><div class="field"><label for="t-sc">Score</label><input type="number" id="t-sc" step="0.5" min="0" required></div><div class="field"><label for="t-max">Out of</label><input type="number" id="t-max" step="0.5" min="1" required></div></div><div class="field"><label for="t-ti">Which test?</label><input type="text" id="t-ti" required placeholder="e.g. School mock Paper 1"></div><div class="field"><label for="t-no">Notes</label><input type="text" id="t-no"></div><div><button class="btn primary" type="submit">Add test result</button></div></form>';
        if (tests.length) h += '<div class="card tablewrap" style="margin-top:12px"><table class="t"><thead><tr><th>Date</th><th>Subject</th><th>Test</th><th>Score</th><th>%</th><th>Notes</th></tr></thead><tbody>' + tests.slice().reverse().map(function (t) { return '<tr><td class="num">' + esc(fmtDate(t.date)) + '</td><td><span class="pill ' + esc(t.subject) + '">' + esc(SUBJ[t.subject] || t.subject) + '</span></td><td><b>' + esc(t.title) + '</b></td><td class="num">' + esc(t.score) + '/' + esc(t.max) + '</td><td class="num">' + (t.max ? Math.round(100 * t.score / t.max) + "%" : "") + '</td><td>' + esc(t.notes || "") + '</td></tr>'; }).join("") + '</tbody></table></div>';
        if (prof) h += '<div class="section-h"><h2 style="font-size:var(--s-lg)">Profile</h2></div><div class="card prose" style="padding:18px 22px;max-width:none">' + md(prof) + '</div>';
        app.innerHTML = h;
      });
  }
  if (TREE && TREE.length) draw(TREE).catch(function () {}); else app.innerHTML = '<div class="empty"><h3>Loading his record</h3></div>';
  loadTree(true).then(draw).catch(function (e) { if (!TREE || !TREE.length) fail(e); });
}
document.addEventListener("click", function (ev) { var tr = ev.target.closest("tr[data-href]"); if (tr) location.hash = tr.getAttribute("data-href"); });
function saveTest() { var sb = studentBase() + "tests.jsonl";
  var t = { date: $("#t-date").value, subject: $("#t-subj").value, score: +$("#t-sc").value, max: +$("#t-max").value, title: $("#t-ti").value.trim(), notes: $("#t-no").value.trim(), device: CFG.device, at: now() };
  setSave("Saving…");
  loadTree(true).then(function () { return fileText(sb); }).then(function (r) { var body = (r ? r.text.replace(/\s*$/, "\n") : "") + JSON.stringify(t) + "\n"; return putB64(sb, b64enc(body), CFG.student + ": test result " + t.date + " (" + CFG.device + ")", r && r.sha); })
    .then(function () { setSave("Saved " + hhmm(now())); toast("Test result saved"); recordView(); }).catch(function (e) { setSave("Not saved", true); toast("Couldn’t save: " + e.message); }); }
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
