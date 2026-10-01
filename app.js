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
var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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
var TMAP = null, TMAPsrc = null;
function shaOf(path) { if (TMAPsrc !== TREE) { TMAP = {}; (TREE || []).forEach(function (t) { TMAP[t.path] = t.sha; }); TMAPsrc = TREE; } return TMAP[path] || null; }
function setTreeSha(path, sha) { TREE = TREE || []; var f = TREE.filter(function (t) { return t.path === path; })[0]; if (f) f.sha = sha; else TREE.push({ path: path, sha: sha }); TMAPsrc = null; ls("tutor.tree." + CFG.repo, JSON.stringify(TREE)); }
var inflight = {};
function blobBytes(sha) {
  return cget("b:" + sha).then(function (v) { if (v) return v; if (inflight[sha]) return inflight[sha];
    inflight[sha] = fetch(API + "/repos/" + CFG.repo + "/git/blobs/" + sha, { headers: { "Authorization": "Bearer " + CFG.token, "Accept": "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" } })
      .then(function (r) { if (!r.ok) { var e = new Error("GitHub " + r.status); e.status = r.status; throw e; } return r.arrayBuffer(); })
      .then(function (buf) { var b = new Uint8Array(buf); cput("b:" + sha, b); delete inflight[sha]; return b; }, function (e) { delete inflight[sha]; throw e; });
    return inflight[sha]; });
}
function fileJSON(path) { var sha = shaOf(path); if (!sha) return Promise.resolve(null); return blobBytes(sha).then(function (b) {
  try { return { data: JSON.parse(new TextDecoder().decode(b)), sha: sha }; }
  catch (e) { var er = new Error(path.split("/").slice(-2).join("/") + " is not valid JSON (" + e.message + "). Ask Claude to fix the file."); er.broken = true; throw er; } }); }
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
function norm(s) { s.time = s.time || {}; s.time.log = s.time.log || []; s.time.edit = s.time.edit || {}; s.answers = s.answers || {}; s.extra = s.extra || []; s.work = s.work || []; s.feedback = s.feedback || {}; s.devices = s.devices || []; s.done = s.done || {};
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
  out.done = out.done || {}; Object.keys(local.done || {}).forEach(function (k) { var a = local.done[k], b = out.done[k]; if (!b || String(a.at) > String(b.at)) out.done[k] = a; });
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
function nav(r) { var k = r.indexOf("/record") === 0 ? "record" : r.indexOf("/settings") === 0 ? "settings" : r.indexOf("/revise") === 0 ? "revise" : r.indexOf("/videos") === 0 ? "videos" : "lessons";
  $$("[data-nav]").forEach(function (a) { if (a.getAttribute("data-nav") === k) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#who").textContent = CFG.token ? CFG.student + " · " + CFG.device : ""; if (typeof subjSync === "function") subjSync(); }
function render() {
  var r = route(); nav(r); document.body.removeAttribute("data-subject"); document.body.classList.remove("teaching");
  if (!CFG.token && r.indexOf("/settings") !== 0) { location.hash = "#/settings"; return; }
  if (r.indexOf("/settings") === 0) return settingsView();
  if (r.indexOf("/lesson/") === 0) { var rest = decodeURIComponent(r.slice(8)), tm = /\/teach$/.test(rest); MODE = tm ? "teach" : "plan"; return lessonView(rest.replace(/\/teach$/, "")); }
  if (r.indexOf("/new") === 0) return newView();
  if (r.indexOf("/record") === 0) return recordView();
  if (r.indexOf("/revise") === 0) return reviseView();
  if (r.indexOf("/videos") === 0) return videosView();
  return lessonsView();
}
function fail(e) { if (e && e.broken) { app.innerHTML = '<div class="empty"><h3>This file is broken</h3><p>' + esc(e.message) + '</p><p><a href="#/">Back to lessons</a></p></div>'; return; }
  app.innerHTML = '<div class="empty"><h3>Couldn’t reach GitHub</h3><p>' + esc(e && e.message || e) + '</p><p>Check your connection, or the key and repo in <a href="#/settings">Settings</a>.</p></div>'; }

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
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">Save and test</button><button class="btn" type="button" id="s-cache">Clear this device’s cache</button><button class="btn danger" type="button" id="s-clear">Remove key from this device</button><span class="hint" id="s-msg"></span></div></form>' +
    '<div class="card" style="padding:18px 20px;margin-top:16px;max-width:820px"><h3 style="font-size:var(--s-lg)">Install on this device</h3><p class="hint" style="margin:6px 0 12px">Adds a Tutor Desk icon to the home screen. It opens full screen, and lessons you have opened before keep working without internet; taps upload when you are back online. On the Samsung tablet: browser menu \u2192 <b>Add page to</b> \u2192 <b>Home screen</b> (or <b>Install app</b>).</p><button class="btn primary" type="button" id="s-install" hidden>Install Tutor Desk</button></div>';
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
      var sp = subjPick(); items = items.filter(function (it) { var sj = (it.s && it.s.subject) || (it.x && it.x.subject) || parseId(it.id).subject; return sp === "all" || sj === sp; });
      app.innerHTML = homeHTML(items); fillHomeRevise();
    });
  }
  if (!$(".home")) app.innerHTML = '<div class="empty"><h3>Loading lessons</h3></div>';
  if (TREE && TREE.length) draw(TREE).catch(function () {});
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

/* ---------------- home: this week, what's up next per subject, recent lessons ---------------- */
var OFFDAYS = [2, 5]; /* Tuesday and Friday: Ali's days off */
function pad2(n) { return String(n).padStart(2, "0"); }
function isoOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function weekDays() { var d = pdate(todayIso()), dow = (d.getDay() + 6) % 7, out = []; for (var i = 0; i < 7; i++) { var x = new Date(d); x.setDate(d.getDate() - dow + i); out.push(isoOf(x)); } return out; }
function subjOf(it) { return (it.s && it.s.subject) || (it.x && it.x.subject) || parseId(it.id).subject; }
function dateOf(it) { return (it.s && it.s.date) || (it.x && it.x.date) || parseId(it.id).date; }
function doneOf(x, k, kind) { if (!x) return false; if (kind === "q") { var a = x.answers && x.answers[k]; return !!(a && a.v); } var d = x.done && x.done[k]; return !!(d && !d.off); }
function partsOf(s, x) { if (!s || !s.phases) return [];
  return s.phases.map(function (p) { var its = phaseItems(p).filter(function (i) { return i.kind !== "module"; }), d = its.filter(function (i) { return doneOf(x, i.k, i.kind); }).length; return { name: p.name, w: pw(p), f: its.length ? d / its.length : 0 }; }); }
var WMARK = {
  chem: '<svg viewBox="0 0 230 230" fill="none" aria-hidden="true"><path d="M115 115V30M115 115 40 160" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M115 115l80 35-15 18z" fill="currentColor"/><path d="M115 115l35 85" stroke="currentColor" stroke-width="6" stroke-dasharray="6 7"/><circle cx="115" cy="115" r="16" fill="currentColor"/><path d="M150 40l26 15v30l-26 15-26-15V55z" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>',
  maths: '<svg viewBox="0 0 240 220" fill="none" aria-hidden="true"><path d="M20 110h200M120 10v200" stroke="currentColor" stroke-width="3"/><path d="M60 190c35-12 50-30 60-80s25-68 60-80" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M30 200 210 20" stroke="currentColor" stroke-width="3" stroke-dasharray="7 8"/><circle cx="60" cy="190" r="7" fill="currentColor"/><circle cx="180" cy="30" r="7" fill="currentColor"/></svg>'
};
function homeHTML(items) {
  var sp = subjPick(), t = todayIso(), wk = weekDays(), byDay = {};
  items.forEach(function (it) { var d = dateOf(it); (byDay[d] = byDay[d] || []).push(subjOf(it)); });
  var week = '<div class="week" aria-label="This week">' + wk.map(function (d) { var dd = pdate(d), off = OFFDAYS.indexOf(dd.getDay()) >= 0;
    return '<div class="wd' + (d === t ? " today" : off ? " off" : "") + '"><span>' + DAY[dd.getDay()] + '</span><span class="n">' + dd.getDate() + '</span><span class="dots">' + (d === t ? "Today" : off ? "Off" : (byDay[d] || []).map(function (s) { return '<i class="' + esc(s) + '" title="' + esc(SUBJ[s] || s) + '"></i>'; }).join("")) + '</span></div>'; }).join("") + '</div>';
  var h = '<header class="phead"><div class="phead-row"><div style="min-width:0"><div class="eyebrow">' + esc(CFG.student) + (sp !== "all" ? " · " + esc(SUBJ[sp]) + " only" : "") + '</div><h1>' + esc(DAYL[pdate(t).getDay()] + " " + pdate(t).getDate() + " " + MONL[pdate(t).getMonth()]) + '</h1><p>Lessons Mon, Wed, Thu, Sat, Sun · 45 minutes a subject</p></div>' + week + '</div></header>';
  /* up next: the first lesson from today on that is not logged yet, else an invitation to draft one */
  var subs = sp === "all" ? ["chem", "maths"] : [sp], shown = {};
  var tiles = subs.map(function (sj) {
    var mine = items.filter(function (it) { return subjOf(it) === sj; });
    var up = mine.filter(function (it) { return dateOf(it) >= t && !(it.x && it.x.status === "finished"); }).sort(function (a, b) { return dateOf(a).localeCompare(dateOf(b)); })[0];
    var last = mine.filter(function (it) { return it.x && it.x.status === "finished"; }).sort(function (a, b) { return dateOf(b).localeCompare(dateOf(a)); })[0];
    var tag = '<span class="tag">' + esc(SUBJ[sj]) + ' · up next</span>';
    if (up) { shown[up.id] = 1; var s = up.s || {}, x = up.x, st = x && x.status === "in-progress" ? "In progress" : s.status === "draft" ? "Draft script" : up.script ? "Script ready" : "No script";
      return '<article class="tile" data-subject="' + sj + '">' + WMARK[sj] + '<div class="meta">' + tag + '<span class="st">' + esc(fmtDate(dateOf(up))) + ' · ' + st + '</span></div><h2>' + esc(s.title || (x && x.title) || "Lesson") + '</h2>' + (s.summary ? '<p>' + esc(plain(s.summary)) + '</p>' : "") +
        '<div class="acts"><a class="btn go" href="#/lesson/' + encodeURIComponent(up.id) + '/teach">Teach ▶</a><a class="btn" href="#/lesson/' + encodeURIComponent(up.id) + '">Open the plan</a></div></article>'; }
    return '<article class="tile" data-subject="' + sj + '">' + WMARK[sj] + '<div class="meta">' + tag + '<span class="st">No script yet</span></div><h2>Next ' + esc(SUBJ[sj].toLowerCase()) + ' lesson</h2>' +
      (last ? '<p>Last: ' + esc((last.s && last.s.title) || last.x.title || "lesson") + ' (' + esc(fmtDate(dateOf(last))) + '). Claude reads it before drafting the next one.</p>' : '<p>Ask Claude to draft the first script.</p>') +
      '<div class="acts"><button class="btn go" type="button" data-askclaude="' + sj + '">Draft it with Claude</button><a class="btn" href="#/new">Log without a script</a></div></article>';
  }).join("");
  var rest = items.filter(function (it) { return !shown[it.id]; });
  var rows = rest.map(function (it) {
    var s = it.s || {}, x = it.x, sj = subjOf(it), d = pdate(dateOf(it)), sc = x ? score(x) : { n: 0 }, parts = partsOf(s, x);
    var st = x && x.status === "finished" ? "logged" : x && x.status === "in-progress" ? "in progress" : s.status === "draft" ? "draft script" : it.script ? "script ready" : "";
    var sub = [SUBJ[sj] || sj, st, sc.n ? sc.r + " of " + sc.n + " answers right" : "", it.marking ? "marked" : it.work ? it.work + " photo" + (it.work > 1 ? "s" : "") : ""].filter(Boolean).join(" · ");
    return '<a class="lrow" data-subject="' + esc(sj) + '" href="#/lesson/' + encodeURIComponent(it.id) + '"><span class="dblock">' + DAY[d.getDay()] + '<b>' + d.getDate() + '</b></span><span class="lt"><b>' + esc(s.title || (x && x.title) || "Lesson") + '</b><span class="hint">' + esc(sub) + '</span></span>' +
      '<span class="parts" aria-label="Parts taught">' + parts.map(function (p) { return '<span style="flex:' + p.w + ' 1 0" title="' + esc(p.name) + ': ' + Math.round(p.f * 100) + '% ticked"><i style="width:' + Math.round(p.f * 100) + '%"></i></span>'; }).join("") + '</span>' +
      '<span class="mins">' + (x && x.time && x.time.minutes ? esc(x.time.minutes) + '<small> min</small>' : "") + '</span></a>'; }).join("");
  /* this week's numbers */
  var mins = 0, r = 0, n = 0, logged = 0;
  items.forEach(function (it) { if (wk.indexOf(dateOf(it)) < 0 || !it.x) return; if (it.x.time && it.x.time.minutes) mins += +it.x.time.minutes; if (it.x.status === "finished") logged++; var sc = score(it.x); r += sc.r; n += sc.n; });
  var side = '<div class="inkcard" id="homerev"><div class="k"><span>MISTAKES WARM-UP</span><span class="num" id="homerevn"></span></div><div class="q" id="homerevq">Loading his mistakes…</div><div class="hint" id="homerevm"></div><a class="btn" href="#/revise">Start the 5-minute warm-up</a></div>' +
    '<div class="statcard"><span class="k">THIS WEEK</span><div style="display:flex;align-items:baseline;gap:8px"><span class="big">' + Math.floor(mins / 60) + ':' + pad2(Math.round(mins % 60)) + '</span><span class="hint">hours taught</span></div>' +
    '<div class="statline"><span>Lessons logged</span><b>' + logged + '</b></div><div class="statline"><span>Answers right</span><b>' + (n ? r + " / " + n : "–") + '</b></div></div>';
  return h + '<div class="home"><div><div class="tiles">' + tiles + '</div>' + (rows ? '<h2 class="sec">Recent lessons</h2><div class="rows">' + rows + '</div>' : "") + '</div><div>' + side + '</div></div>';
}
function fillHomeRevise() {
  var sp = subjPick();
  loadRevise().then(function () { var box = $("#homerev"); if (!box) return; var due = dueList(sp === "all" ? null : sp); $("#homerevn").textContent = due.length + " due";
    if (!due.length) { $("#homerevq").textContent = "Nothing due today."; $("#homerevm").textContent = "Each mistake comes back on day 1, 3, 7, 14 and 30."; return; }
    var m = due[0], rv = REV.rv[m.key]; $("#homerevq").textContent = plain(m.ask || m.text || m.what || "");
    $("#homerevm").textContent = [SUBJ[m.subject] || m.subject, m.topic, m.type, rv ? "review " + (rv.box + 1) : "first review"].filter(Boolean).join(" · "); revBadge(); }).catch(function () { var q = $("#homerevq"); if (q) q.textContent = "Couldn’t load the mistakes list."; });
}
function revBadge() { var b = $("#revbadge"); if (!b || !REV) return; var n = dueList(null).length; b.textContent = n; b.hidden = !n; }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-askclaude]"); if (!b) return;
  var sj = b.getAttribute("data-askclaude"), txt = "/tutor next lesson " + (SUBJ[sj] || sj).toLowerCase() + " for " + CFG.student;
  var done = function () { toast("Copied “" + txt + "”. Paste it into any Claude chat to draft the script."); };
  try { navigator.clipboard.writeText(txt).then(done, function () { toast("Ask Claude: “" + txt + "”"); }); } catch (x) { toast("Ask Claude: “" + txt + "”"); } });

/* ---------------- new unscripted lesson ---------------- */
function newView() {
  app.innerHTML = '<a class="back" href="#/">← Lessons</a><div class="section-h"><h2>Log a lesson without a script</h2></div><form class="card form" id="newform" style="padding:20px 22px">' +
    '<div class="row2"><div class="field"><label for="n-date">Date</label><input type="date" id="n-date" value="' + todayIso() + '" required></div><div class="field"><label for="n-subj">Subject</label><select id="n-subj"><option value="chem">Chemistry</option><option value="maths">Maths</option></select></div></div>' +
    '<div class="field"><label for="n-title">What’s it on?</label><input type="text" id="n-title" required placeholder="e.g. 7.1 Addition formulae"></div><div><button class="btn primary" type="submit">Start logging</button></div></form>';
}

/* ---------------- lesson view ---------------- */
function lessonView(id) {
  var base = lessonBase(id);
  function here() { var r = route(); return r.indexOf("/lesson/" + encodeURIComponent(id)) === 0 || r.indexOf("/lesson/" + id) === 0; }
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
  first.then(function () { if (had) return loadTree(true).then(function () { return open(true); }, function () { setSave("Offline · using the saved copy", true); }); }).catch(function (e) { if (window.console) console.error(e); if (!(L && L.id === id)) fail(e); else toast("Couldn’t draw this lesson: " + (e && e.message || e)); });
}
function phases() {
  var s = L.script, ps = [];
  if (s && s.phases && s.phases.length) ps = s.phases.slice();
  else if (s && (s.quiz || s.questions)) {
    if ((s.quiz || []).length) ps.push({ id: "quiz", name: "Oral quiz", blocks: [{ type: "quiz", id: "quiz", items: s.quiz }] });
    if ((s.questions || []).length) ps.push({ id: "qs", name: "Questions", blocks: s.questions.map(function (q) { return Object.assign({ type: "question" }, q); }) });
  } else ps.push({ id: "lesson", name: "Lesson", blocks: [{ type: "text", html: "<p>No script for this lesson. Use <b>Extra questions</b> to log what he answered, and <b>After the lesson</b> for notes.</p>" }] });
  ps.push({ id: "_revise", name: "Mistakes warm-up", sys: 1 }, { id: "_extra", name: "Extra questions", sys: 1 }, { id: "_work", name: "His work (photos)", sys: 1 }, { id: "_time", name: "Times", sys: 1 }, { id: "_after", name: "After the lesson", sys: 1 });
  return ps;
}
function drawLesson() {
  if (MODE === "teach") return drawTeach();
  var s = L.script || {}, x = L.session, subj = s.subject || x.subject;
  document.body.setAttribute("data-subject", subj);
  var ps = phases(); if (!L.phase || !ps.some(function (p) { return p.id === L.phase; })) L.phase = x.status === "finished" ? "_after" : ps[0].id;
  var r = replay(x.time.log);
  var h = '<div class="lhead phead"><div style="min-width:0"><div class="crumb" style="margin-bottom:8px"><a href="#/">Lessons</a><span aria-hidden="true">\u203a</span><span>' + esc(SUBJ[subj] || subj) + '</span></div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ' + esc(subj) + '">' + esc(SUBJ[subj] || subj) + '</span><span class="hint">' + esc(fmtDate(x.date || s.date, true)) + '</span>' +
    (s.status === "draft" ? '<span class="pill warn">Draft script</span>' : "") + (x.status === "finished" ? '<span class="pill ok">Logged</span>' : x.status === "in-progress" ? '<span class="pill warn">In progress</span>' : "") + '</div>' +
    '<h1>' + esc(s.title || x.title || "Lesson") + '</h1>' + (s.summary ? '<div class="sub">' + clean(s.summary) + '</div>' : "") + '</div>' +
    '<div class="card clock" aria-label="Lesson clock"><span class="t" id="clk">0:00</span><button class="btn small primary" id="clkgo" type="button"></button>' + (r.running ? '<button class="btn small" id="clkend" type="button">End lesson</button>' : "") + '<button class="btn small" type="button" data-phase="_time">Edit times</button><span class="st" id="clkst"></span></div><div class="modes" style="align-self:center"><a href="#/lesson/' + encodeURIComponent(L.id) + '" aria-current="true">Plan</a><a href="#/lesson/' + encodeURIComponent(L.id) + '/teach">Teach \u25b6</a></div></div>';
  h += '<div class="lesson"><nav class="rail" aria-label="Lesson phases">' + ps.map(function (p, i) {
    var pm = x.time.phaseMinutes && x.time.phaseMinutes[p.id], planned = p.start != null ? p.start + "–" + p.end + " min" : "";
    var tm = p.sys ? ({ _revise: REV ? dueList(x.subject).length + " due" : "his old mistakes", _extra: x.extra.length ? x.extra.length + " logged" : "add as you go", _work: x.work.filter(function (w) { return !w.removed; }).length ? x.work.filter(function (w) { return !w.removed; }).length + " uploaded" : "upload photos", _time: x.time.minutes != null ? x.time.minutes + " min" + (x.time.started ? " · " + hhmm(x.time.started) + "–" + (x.time.ended ? hhmm(x.time.ended) : "") : "") : "not recorded yet", _after: x.feedback && x.feedback.at ? "saved " + hhmm(x.feedback.at) : "notes + finish" })[p.id] : planned + (pm ? " · took " + pm : "") + (phaseCount(p) ? " · " + phaseCount(p) : "");
    return (p.id === "_revise" ? '<div class="sep"></div>' : "") + '<button type="button" data-phase="' + esc(p.id) + '" data-real="' + (p.sys ? "" : "1") + '"' + (p.id === L.phase ? ' aria-current="step"' : "") + '><span class="n">' + (p.sys ? { _revise: "↻", _extra: "+", _work: "▤", _time: "⏱", _after: "✓" }[p.id] : i + 1) + '</span><span class="nm">' + esc(p.name) + '</span><span class="tm">' + esc(tm) + '</span></button>';
  }).join("") + '</nav><section class="card page" id="phasebox"></section></div>';
  app.innerHTML = h; drawPhase(); tick(); prefetchLesson();
}
function railCount() { var p = phases().filter(function (q) { return q.id === L.phase && !q.sys; })[0]; if (!p) return; var b = $('.rail button[data-phase="' + p.id + '"] .tm'); if (!b) return;
  var pm = L.session.time.phaseMinutes && L.session.time.phaseMinutes[p.id], planned = p.start != null ? p.start + "–" + p.end + " min" : "";
  b.textContent = planned + (pm ? " · took " + pm : "") + (phaseCount(p) ? " · " + phaseCount(p) : "");
}
function drawPhase() {
  var ps = phases(), p = ps.filter(function (q) { return q.id === L.phase; })[0], box = $("#phasebox"), h = "";
  if (p.id === "_revise") { box.innerHTML = '<div class="phase-top"><h2>Mistakes warm-up</h2><span class="hint">His old mistakes, brought back on a schedule until he gets them right</span></div><div id="revbox"></div>'; reviseInto($("#revbox"), L.session.subject); return; }
  if (p.id === "_extra") h = extraView(); else if (p.id === "_work") h = workView(); else if (p.id === "_time") h = timeView(); else if (p.id === "_after") h = afterView();
  else {
    var nq = slidesOf(p).length;
    h += '<div class="phase-top"><h2>' + esc(p.name) + '</h2><div style="display:flex;gap:10px;align-items:center">' + (nq ? '<button class="btn small accent" type="button" data-show="*">Show him (' + nq + ')</button>' : "") + (p.start != null ? '<span class="hint num">' + p.start + '–' + p.end + ' min</span>' : "") + '</div></div>';
    if (p.show) h += '<div class="screen"><span class="label">On screen</span><div>' + clean(p.show) + '</div></div>';
    if (L.script && L.script.focus && ps[0] === p) h += focusTable(L.script.focus);
    h += blocks(p.blocks || []);
    var i = ps.indexOf(p); if (i < ps.length - 1) h += '<div style="display:flex;justify-content:flex-end"><button class="btn accent" type="button" data-phase="' + esc(ps[i + 1].id) + '" data-real="' + (ps[i + 1].sys ? "" : "1") + '">Next: ' + esc(ps[i + 1].name) + ' →</button></div>';
  }
  box.innerHTML = h; fillRows(box); loadImages(box); maths(box); drawTally();
}
function focusTable(rows) { return '<details class="module"><summary><span class="lvl deep">PLAN</span><h3>Pick your focus</h3><span class="chev">›</span></summary><div class="mbody"><div class="tablewrap"><table class="t"><thead><tr><th>Focus on</th><th>Spend the time on</th><th>Cut down</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td><b>' + clean(r.want) + '</b></td><td>' + clean(r.spend) + '</td><td>' + clean(r.cut) + '</td></tr>'; }).join("") + '</tbody></table></div></div></details>'; }
/* "taught" ticks: keyed by the content itself, so they survive edits elsewhere in the script */
function plain(h) { return String(h == null ? "" : h).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim(); }
function isDone(k) { var d = L && L.session.done && L.session.done[k]; return !!(d && !d.off); }
function tick_(k, label) { return '<button class="tick" type="button" data-tick="' + esc(k) + '" data-lab="' + esc(String(label).slice(0, 90)) + '" aria-pressed="' + isDone(k) + '" title="Mark as taught" aria-label="Mark as taught">\u2713</button>'; }
function stepKey(h) { return "s:" + hkey(plain(h)); }
function textKey(h) { return "t:" + hkey(plain(h)); }
function modKey(n) { return "m:" + hkey(n); }
function drillKey(q) { return "d:" + hkey(plain(q)); }
/* everything tickable or answerable in a phase, for the rail count and the after-lesson summary */
function phaseItems(p) { var out = [];
  (function walk(bs, mod) { (bs || []).forEach(function (b) {
    if (b.type === "steps") (b.items || []).forEach(function (it) { out.push({ k: stepKey(it.html), kind: "step", label: plain(it.html), mod: mod }); });
    else if (b.type === "text" && gradeRows(clean(b.html)).rows.length) gradeRows(clean(b.html)).rows.forEach(function (r) { out.push({ k: r.k, kind: "q", label: r.label, mod: mod }); });
    else if (b.type === "text" && plain(b.html).length > 40) out.push({ k: textKey(b.html), kind: "text", label: plain(b.html), mod: mod });
    else if (b.type === "drill") (b.items || []).forEach(function (d) { out.push({ k: drillKey(d[0]), kind: "q", label: plain(d[0]), mod: mod }); });
    else if (b.type === "quiz") (b.items || []).forEach(function (q) { out.push({ k: q.id, kind: "q", label: plain(q.q), mod: mod }); });
    else if (b.type === "question") out.push({ k: b.id, kind: "q", label: b.label || b.id, mod: mod });
    if (b.type === "module") { out.push({ k: modKey(b.name), kind: "module", label: b.name, mod: b.name }); walk(b.blocks, b.name); }
  }); })(p.blocks, null);
  return out; }
function usedOrDone(it) { if (it.kind === "q") { var a = L.session.answers[it.k]; return !!(a && a.v); } return isDone(it.k); }
function phaseCount(p) { var its = phaseItems(p).filter(function (i) { return i.kind !== "module"; }); var d = its.filter(usedOrDone).length; return its.length ? d + "/" + its.length + " done" : ""; }
/* tables whose rows hide an answer (<details>) get a small verdict control on every row, so each row is its own question */
var GRCACHE = {};
function gradeRows(html) {
  if (GRCACHE[html]) return GRCACHE[html];
  var out = { html: html, rows: [] };
  if (html.indexOf("<table") >= 0 && html.indexOf("<details") >= 0) {
    var tp = document.createElement("template"); tp.innerHTML = html;
    tp.content.querySelectorAll("table").forEach(function (tb) {
      var body = tb.tBodies[0] ? tb.tBodies[0].rows : [], any = false;
      Array.prototype.forEach.call(body, function (tr) { if (!tr.querySelector("details") || !tr.cells.length) return; any = true;
        var label = plain(tr.cells[0].textContent), k = "r:" + hkey(label); out.rows.push({ k: k, label: label });
        tr.setAttribute("data-row", k); var td = document.createElement("td"); td.className = "rowv"; td.setAttribute("data-rowk", k); td.setAttribute("data-rowq", label); tr.appendChild(td); });
      if (any && tb.tHead && tb.tHead.rows[0]) { var th = document.createElement("th"); th.textContent = "He said"; tb.tHead.rows[0].appendChild(th); }
    });
    if (out.rows.length) { var w = document.createElement("div"); w.appendChild(tp.content.cloneNode(true)); out.html = w.innerHTML; }
  }
  return (GRCACHE[html] = out);
}
/* the verdict buttons are filled in at draw time, so they always show the current answer */
function rowCtl(k, q) { var a = (L && L.session.answers[k]) || {};
  return '<div class="ctl mini" data-item="' + esc(k) + '" data-q="' + esc(String(q).slice(0, 160)) + '">' + [["right", "✓", "Right"], ["wrong", "✗", "Wrong"], ["partly", "½", "Partly"]].map(function (v) { return '<button class="v" type="button" data-v="' + v[0] + '" title="' + v[2] + '" aria-label="' + v[2] + '" aria-pressed="' + (a.v === v[0]) + '">' + v[1] + '</button>'; }).join("") + '</div>'; }
function fillRows(root) { $$("td[data-rowk]", root).forEach(function (td) { var k = td.getAttribute("data-rowk"); td.innerHTML = rowCtl(k, td.getAttribute("data-rowq")); var a = L.session.answers[k]; td.parentNode.setAttribute("data-v", (a && a.v) || ""); }); }
var KIND = { say: "Say", draw: "Draw", ask: "Ask", show: "Show", "do": "Do", check: "Check" };
function img(path, alt) { return '<figure class="fig"><img data-src="' + esc(path) + '" alt="' + esc(alt || "") + '" hidden><div class="ph">Loading image</div></figure>'; }
function blocks(bs) {
  /* three or more pictures in a row become a tap-to-enlarge grid instead of a long scroll */
  var out = [], run = [];
  function flush() { if (run.length >= 3) out.push('<div class="gallery">' + run.map(block).join("") + '</div>'); else run.forEach(function (b) { out.push(block(b)); }); run = []; }
  (bs || []).forEach(function (b) { if (b.type === "figure" && b.img) run.push(b); else { flush(); out.push(block(b)); } });
  flush(); return out.join("");
}
function block(b) {
  switch (b.type) {
    case "text": var gr = gradeRows(clean(b.html)); if (gr.rows.length) return '<div class="prose">' + gr.html + '</div>';
      if (plain(b.html).length <= 40) return '<div class="prose">' + clean(b.html) + '</div>';
      var tk = textKey(b.html); return '<div class="prose tickable' + (isDone(tk) ? " done" : "") + '" data-tk="' + esc(tk) + '">' + tick_(tk, plain(b.html)) + clean(b.html) + '</div>';
    case "steps": return '<ol class="steps">' + (b.items || []).map(function (s) { var k = s.kind || "do", sk = stepKey(s.html); return '<li class="' + esc(k) + (isDone(sk) ? " done" : "") + '" data-tk="' + esc(sk) + '"><span class="kind ' + esc(k) + '">' + (KIND[k] || esc(k)) + '</span><div class="body prose">' + clean(s.html) + '</div>' + tick_(sk, plain(s.html)) + '</li>'; }).join("") + '</ol>';
    case "module": var mk = modKey(b.name); return '<details class="module' + (isDone(mk) ? " done" : "") + '" data-tk="' + esc(mk) + '"' + (b.level !== "deep" ? " open" : "") + '><summary>' + tick_(mk, b.name) + '<span class="lvl ' + (b.level === "deep" ? "deep" : "core") + '">' + (b.level === "deep" ? "DEEP" : "CORE") + '</span><h3>' + esc(b.name) + '</h3>' + (b.minutes ? '<span class="pill">' + esc(b.minutes) + ' min</span>' : "") + '<span class="chev">›</span></summary><div class="mbody">' + blocks(b.blocks) + '</div></details>';
    case "figure": return b.img ? img(b.img, b.caption).replace("</figure>", (b.caption ? '<figcaption>' + clean(b.caption) + '</figcaption>' : "") + '</figure>') : '<figure class="fig">' + clean(b.html) + '</figure>';
    case "reveal": return '<details class="reveal"><summary>' + esc(b.label || "Answer") + '</summary><div class="prose">' + clean(b.html) + (b.img || []).map(function (i) { return img(i); }).join("") + '</div></details>';
    case "drill": return '<div><div class="label" style="margin-bottom:8px">' + esc(b.title || "Quick-fire drill") + '</div><div class="items">' + (b.items || []).map(function (d, i) { var dk = drillKey(d[0]), a = L.session.answers[dk] || {}; return '<div class="item" data-v="' + esc(a.v || "") + '"><span class="qn">' + (i + 1) + '</span><div><div>' + clean(d[0]) + '</div><details><summary class="linkbtn">Answer</summary><div class="da prose">' + clean(d[1]) + '</div></details></div>' + ctl(dk, null, a, plain(d[0])) + '</div>'; }).join("") + '</div></div>';
    case "video": return videoBlock(b);
    case "quiz": return quizBlock(b);
    case "question": return questionBlock(b);
    default: return b.html ? '<div class="prose">' + clean(b.html) + '</div>' : "";
  }
}
/* YouTube, embedded; "moments" jump the player to a point ("4:32 KCN mechanism") */
function secsOf(t) { if (typeof t === "number") return t; var p = String(t || "0").split(":").map(Number); return p.reduce(function (a, b) { return a * 60 + b; }, 0); }
function vsrc(id, start, auto) { return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?rel=0&modestbranding=1&start=" + secsOf(start) + (auto ? "&autoplay=1" : ""); }
function videoBlock(b) {
  var id = String(b.id || "").replace(/[^A-Za-z0-9_-]/g, "");
  return '<div class="vid"><div class="label" style="margin-bottom:8px">' + esc(b.channel || "Video") + '</div><h3 style="font-size:var(--s-lg);margin-bottom:10px">' + esc(b.title || "") + '</h3>' +
    '<div class="vframe"><iframe loading="lazy" data-vid="' + id + '" src="' + vsrc(id, b.start || 0) + '" title="' + esc(b.title || "Video") + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
    ((b.moments || []).length ? '<div class="qbar" style="margin-top:10px">' + b.moments.map(function (m) { return '<button class="chip" type="button" data-seek="' + id + '" data-t="' + esc(m.t) + '">' + esc(m.t) + ' · ' + esc(m.label || "") + '</button>'; }).join("") + '</div>' : "") +
    (b.note ? '<div class="prose hint" style="margin-top:8px">' + clean(b.note) + '</div>' : "") + '</div>';
}
function ctl(id, marks, a, qtext) {
  a = a || L.session.answers[id] || {};
  return '<div class="ctl" data-item="' + esc(id) + '"' + (qtext ? ' data-q="' + esc(String(qtext).slice(0, 160)) + '"' : "") + '>' + VERD.map(function (v) { return '<button class="v" type="button" data-v="' + v[0] + '" title="' + esc(VHELP[v[0]]) + '" aria-pressed="' + (a.v === v[0]) + '">' + v[1] + '</button>'; }).join("") +
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
  var h = '<div class="qcard"><div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap"><div><h3>' + esc(q.label || "Question") + '</h3>' + (q.source ? '<div class="src">' + esc(q.source) + '</div>' : "") + '</div>' + ((q.img || []).length ? '<button class="btn small" type="button" data-show="' + esc(q.id) + '">Show him</button>' : "") + '</div>' + (q.html ? '<div class="prose">' + clean(q.html) + '</div>' : "") + (q.img || []).map(function (i) { return img(i, q.label); }).join("");
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
function showImg(im) { var p = im.getAttribute("data-src"); if (!p || im.getAttribute("data-on")) return; im.setAttribute("data-on", "1"); var full = /^(students|books)\//.test(p) ? p : lessonBase(L.id) + p;
  fileURL(full).then(function (u) { var ph = im.nextElementSibling; if (u) { im.decoding = "async"; im.src = u; im.hidden = false; if (ph && ph.classList.contains("ph")) ph.remove(); } else if (ph) ph.textContent = "Image not found: " + p; })
    .catch(function () { im.removeAttribute("data-on"); var ph = im.nextElementSibling; if (ph) ph.textContent = "Couldn’t load image. Tap to retry."; }); }
var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); showImg(e.target.__img || e.target); } }); }, { rootMargin: "900px 0px" }) : null;
function loadImages(root) { $$("img[data-src]:not([data-on])", root).forEach(function (im) { var ph = im.nextElementSibling; var tgt = ph && ph.classList.contains("ph") ? ph : im; if (io) { tgt.__img = im; io.observe(tgt); } else showImg(im); }); }
document.addEventListener("toggle", function (e) { if (e.target.open) loadImages(e.target); }, true);
document.addEventListener("click", function (e) { var ph = e.target.closest && e.target.closest(".ph"); if (ph && ph.previousElementSibling && ph.previousElementSibling.tagName === "IMG") showImg(ph.previousElementSibling); });
/* after a lesson opens, quietly fill the device cache with its question images (not the folded-away DEEP extras) */
var prefetchFor = null;
function prefetchLesson() { if (!L || !L.script || prefetchFor === L.id) return; prefetchFor = L.id; var paths = [];
  (function walk(v, deep) { if (!v) return; if (Array.isArray(v)) { v.forEach(function (x) { walk(x, deep); }); return; } if (typeof v !== "object") return;
    var d = deep || v.level === "deep"; ["img", "answerImg"].forEach(function (k) { var x = v[k]; (Array.isArray(x) ? x : x ? [x] : []).forEach(function (pth) { if (!d) paths.push(pth); }); });
    Object.keys(v).forEach(function (k) { if (typeof v[k] === "object") walk(v[k], d); }); })(L.script.phases || L.script, false);
  var q = paths.map(function (p) { return /^(students|books)\//.test(p) ? p : lessonBase(L.id) + p; }).filter(function (p) { return shaOf(p); }), running = 0;
  function pump() { while (running < 3 && q.length) { var p = q.shift(); running++; blobBytes(shaOf(p)).catch(function () {}).then(function () { running--; pump(); }); } }
  setTimeout(pump, 1200); }

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
function labelOf(id) { if (!id) return ""; var a = L.session.answers[id]; if (a && a.q && /^[dr]:/.test(id)) return a.q; var f = itemsList().filter(function (i) { return i.id === id; })[0]; return f ? f.label : id; }

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
  var cov = [], covTxt = [];
  phases().filter(function (p) { return !p.sys; }).forEach(function (p) { var its = phaseItems(p), mods = its.filter(function (i) { return i.kind === "module" && isDone(i.k); }).map(function (i) { return i.label; });
    var steps = its.filter(function (i) { return (i.kind === "step" || i.kind === "text") && isDone(i.k); }).length, qs = its.filter(function (i) { return i.kind === "q"; }), used = qs.filter(usedOrDone), right = used.filter(function (i) { return x.answers[i.k].v === "right"; });
    if (!mods.length && !steps && !used.length) return;
    var line = esc(p.name) + ": " + [mods.length ? mods.map(esc).join(", ") : "", steps ? steps + " step" + (steps > 1 ? "s" : "") + " taught" : "", used.length ? used.length + " question" + (used.length > 1 ? "s" : "") + " used, " + right.length + " right" : ""].filter(Boolean).join(" \u00b7 ");
    cov.push('<li>' + line + '</li>'); covTxt.push(line.replace(/&amp;/g, "&")); });
  if (cov.length) h += '<div class="card" style="padding:16px 18px"><div class="label" style="margin-bottom:8px">What you covered (from your ticks)</div><ul class="list-plain" style="gap:4px">' + cov.join("") + '</ul><button class="btn small" type="button" id="usecov" data-cov="' + esc(covTxt.join("\n")) + '" style="margin-top:10px">Put this in \u201cWhat you actually covered\u201d</button></div>';
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
  var cp = $(".clockpill"); if (cp) cp.classList.toggle("live", r.running);
  if (MODE === "teach") runwayTick(r);
}
setInterval(function () { if (L && replay(L.session.time.log).running) tick(); }, 1000);
function logEvent(e, p) { L.session.time.log.push({ t: now(), e: e, p: p || undefined, d: CFG.device }); L.session.time.editAt = now(); touch(); }

/* ---------------- events ---------------- */
var armed = null;
document.addEventListener("click", function (ev) {
  var t = ev.target.closest("button,img"); if (!t) return;
  if (t.tagName === "IMG") { if (t.closest(".fig") || t.closest(".thumbs")) { $("#zimg").src = t.src; $("#zoom").hidden = false; } return; }
  if (t.id === "zoomx") { closeZoom(); return; }
  if (t.hasAttribute("data-seek") && false) { var fr = $('iframe[data-vid="' + t.getAttribute("data-seek") + '"]'); if (fr) { fr.src = vsrc(t.getAttribute("data-seek"), t.getAttribute("data-t"), true); fr.scrollIntoView({ block: "center", behavior: "smooth" }); } return; }
  if (t.id === "s-clear") { ls("tutor.token", null); toast("Key removed from this device"); settingsView(); return; }
  if (t.id === "s-cache") { try { indexedDB.deleteDatabase("tutor-desk"); } catch (e) {} idbP = null; ls("tutor.tree." + CFG.repo, null); TREE = null; toast("Cache cleared"); return; }
  if (!L || route().indexOf("/lesson/") !== 0) return;
  var x = L.session;
  if (t.hasAttribute("data-tick")) { ev.preventDefault(); ev.stopPropagation(); var k = t.getAttribute("data-tick"); x.done = x.done || {}; var on = !isDone(k);
    x.done[k] = on ? { at: now(), d: CFG.device, label: t.getAttribute("data-lab") } : { off: true, at: now(), label: t.getAttribute("data-lab") };
    t.setAttribute("aria-pressed", String(on)); var host = t.closest("[data-tk]"); if (host) host.classList.toggle("done", on); touch(); railCount(); return; }
  if (t.hasAttribute("data-phase")) { var id = t.getAttribute("data-phase"); var r = replay(x.time.log);
    if (t.getAttribute("data-real") && r.running && r.phase !== id) logEvent("phase", id);
    L.phase = id; drawLesson();
    /* a new part always starts at its top: jump up if we were scrolled past it */
    var pb = $("#phasebox"); if (pb) { var y = pb.getBoundingClientRect().top + window.scrollY - 12; if (window.innerWidth < 900 || window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: "instant" }); } return; }
  if (t.id === "clkgo") { var r2 = replay(x.time.log); var cur = phases().filter(function (p) { return p.id === L.phase && !p.sys; })[0];
    if (r2.running) logEvent("pause"); else { if (x.status === "finished") { x.status = "in-progress"; x.statusAt = now(); } logEvent(r2.secs ? "resume" : "start", cur ? cur.id : (r2.phase || phases()[0].id)); wake(); }
    drawLesson(); return; }
  if (t.id === "clkend") { logEvent("end"); drawLesson(); flush(); toast("Lesson ended. Undo it under Times if that was a mistake."); return; }
  if (t.id === "tm-undo") { var lg = x.time.log; for (var i = lg.length - 1; i >= 0; i--) { if (lg[i].e === "end") { lg.splice(i, 1); break; } } timeEdited(); drawLesson(); toast("“End lesson” undone"); return; }
  if (t.id === "tm-clear") { x.time.edit = {}; timeEdited(); drawLesson(); return; }
  if (t.id === "tm-reset") { if (armed !== "reset") { armed = "reset"; t.textContent = "Tap again to reset the clock"; t.classList.add("confirm"); setTimeout(function () { if (armed === "reset") { armed = null; if (t.isConnected) { t.textContent = "Reset the clock"; t.classList.remove("confirm"); } } }, 4000); return; }
    armed = null; x.time.log = []; timeEdited(); drawLesson(); toast("Clock reset"); return; }
  if (t.hasAttribute("data-logdel")) { x.time.log.splice(+t.getAttribute("data-logdel"), 1); timeEdited(); drawLesson(); return; }
  if (t.id === "usecov") { var ta = $("#fb-cov"); if (ta) { ta.value = (ta.value ? ta.value + "\n" : "") + t.getAttribute("data-cov"); x.feedback.covered = ta.value; x.feedback.at = now(); touch(); } return; }
  if (t.id === "reopen") { x.status = "in-progress"; x.statusAt = now(); touch(); drawLesson(); return; }
  if (t.hasAttribute("data-qf")) { L.filter = t.getAttribute("data-qf"); drawPhase(); return; }
  if (t.hasAttribute("data-ans")) { var qa = t.parentNode.querySelector(".qa"); qa.hidden = !qa.hidden; t.textContent = qa.hidden ? "Show answer" : "Hide answer"; return; }
  if (t.hasAttribute("data-v")) { var box = t.closest("[data-item]"), iid = box.getAttribute("data-item"), v = t.getAttribute("data-v"), a = target(iid);
    a.v = a.v === v ? null : v; a.at = now(); a.d = CFG.device; if (box.getAttribute("data-q")) a.q = box.getAttribute("data-q"); save(iid, a); railCount();
    $$(".v", box).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === a.v)); }); var row = box.closest(".item, tr[data-row]"); if (row) row.setAttribute("data-v", a.v || ""); drawTally(); return; }
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
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-seek]"); if (!t) return; var fr = $('iframe[data-vid="' + t.getAttribute("data-seek") + '"]'); if (fr) { fr.src = vsrc(t.getAttribute("data-seek"), t.getAttribute("data-t"), true); fr.scrollIntoView({ block: "center", behavior: "smooth" }); } });
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
    return Promise.all([fileText(sb + "mistakes.jsonl"), fileText(sb + "tests.jsonl"), fileText(sb + "profile.md")].concat(ids.map(function (i) { return fileJSON(lessonBase(i.id) + "session.json").then(function (d) { i.x = d && norm(d.data); return i; }, function () { return i; }); })))
      .then(function (v) {
        if (route().indexOf("/record") !== 0) return;
        function jl(r) { return r ? r.text.split(/\n/).filter(function (l) { return l.trim(); }).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []; }
        var mistakes = jl(v[0]).reverse(), tests = jl(v[1]), prof = v[2] ? v[2].text : "";
        var mins = 0, n = 0, r = 0; ids.forEach(function (i) { var x = i.x || {}; mins += (x.time && x.time.minutes) || 0; var s = score(x); n += s.n; r += s.r; });
        var h = phead([[CFG.student, ""], ["Record", ""]], CFG.student + "\u2019s record", "Time taught, answers, mistakes and tests.");
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
  /* show the new page at once, so the previous page never sits under the Record tab while this loads */
  app.innerHTML = phead([[CFG.student, ""], ["Record", ""]], CFG.student + "’s record", "Time taught, answers, mistakes and tests.") + '<div class="empty"><h3>Loading his record</h3></div>';
  if (TREE && TREE.length) draw(TREE).catch(function (e) { if (route().indexOf("/record") === 0) fail(e); });
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

/* ---------------- show him: question pictures full screen, nothing else ---------------- */
function slidesOf(p) { var out = []; (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "question" && (b.img || []).length) out.push({ id: b.id, label: b.label, img: b.img }); if (b.blocks) walk(b.blocks); }); })(p && p.blocks); return out; }
var SH = null;
function openShow(which) {
  var p = phases().filter(function (q) { return q.id === L.phase; })[0], sl = slidesOf(p); if (!sl.length) return;
  var i = which === "*" ? 0 : Math.max(0, sl.map(function (x) { return x.id; }).indexOf(which));
  var el = document.createElement("div"); el.className = "show"; el.id = "show";
  el.innerHTML = '<div class="show-top"><span id="sh-lab"></span><span class="num" id="sh-n"></span><button type="button" class="show-x" id="sh-x" aria-label="Close">×</button></div><div class="show-body" id="sh-body"></div><div class="show-nav"><button type="button" id="sh-prev" aria-label="Previous">‹</button><button type="button" id="sh-next" aria-label="Next">›</button></div>';
  document.body.appendChild(el); SH = { sl: sl, i: i }; drawShow();
  try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); } catch (e) {}
  var x0 = null; el.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener("touchend", function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) stepShow(dx < 0 ? 1 : -1); x0 = null; });
}
function drawShow() { var s = SH.sl[SH.i]; $("#sh-lab").textContent = ""; $("#sh-n").textContent = (SH.i + 1) + " / " + SH.sl.length;
  $("#sh-body").innerHTML = s.img.map(function (i) { return '<img data-src="' + esc(i) + '" alt="' + esc(s.label || "") + '" hidden><div class="ph">Loading</div>'; }).join("");
  $$("#sh-body img").forEach(showImg); $("#sh-body").scrollTop = 0; $("#sh-prev").disabled = SH.i === 0; $("#sh-next").disabled = SH.i === SH.sl.length - 1; }
function stepShow(d) { if (!SH) return; var n = SH.i + d; if (n < 0 || n >= SH.sl.length) return; SH.i = n; drawShow(); }
function closeShow() { var el = $("#show"); if (el) el.remove(); SH = null; try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} }
document.addEventListener("click", function (e) { var t = e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-show")) { openShow(t.getAttribute("data-show")); return; }
  if (t.id === "sh-x") closeShow(); else if (t.id === "sh-prev") stepShow(-1); else if (t.id === "sh-next") stepShow(1); });
document.addEventListener("keydown", function (e) { if (!SH) return; if (e.key === "ArrowRight") stepShow(1); else if (e.key === "ArrowLeft") stepShow(-1); else if (e.key === "Escape") closeShow(); });

/* ---------------- revise: his mistakes on a schedule (day 1, 3, 7, 14, 30) ---------------- */
var REV = null, revSaveT = null, GAPS = [1, 3, 7, 14, 30];
function hkey(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "m" + h.toString(36); }
function addDays(iso, n) { var d = pdate(iso); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function revKey() { return "tutor.review." + CFG.repo + "." + CFG.student; }
function loadRevise(force) {
  if (REV && !force) return Promise.resolve(REV);
  var sb = studentBase();
  return loadTree(force).then(function () { return Promise.all([fileText(sb + "mistakes.jsonl"), fileJSON(sb + "review.json")]); }).then(function (v) {
    var ms = v[0] ? v[0].text.split(/\n/).filter(function (l) { return l.trim(); }).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
    ms.forEach(function (m) { m.key = hkey((m.date || "") + "|" + (m.text || m.what || "")); });
    var local = null; try { local = JSON.parse(ls(revKey()) || "null"); } catch (e) {}
    var rv = (v[1] && v[1].data) || {};
    if (local && local.dirty) Object.keys(local.data).forEach(function (k) { var a = local.data[k], b = rv[k]; if (!b || String(a.last) > String(b.last)) rv[k] = a; });
    REV = { ms: ms, rv: rv, sha: v[1] && v[1].sha, dirty: !!(local && local.dirty) }; if (REV.dirty) saveRevise(); return REV; });
}
function dueList(subject) { if (!REV) return []; var t = todayIso();
  return REV.ms.filter(function (m) { var r = REV.rv[m.key]; if (m.fixed && !r) return false; if (r && r.box >= GAPS.length) return false; if (subject && m.subject && m.subject !== subject) return false; return !r || r.due <= t; })
    .sort(function (a, b) { var ra = REV.rv[a.key], rb = REV.rv[b.key]; return String(ra ? ra.due : a.date).localeCompare(String(rb ? rb.due : b.date)); }); }
function markRevise(key, ok) { var r = REV.rv[key] || { box: 0, history: [] }, t = todayIso();
  r.box = ok ? r.box + 1 : 0;
  r.due = !ok ? addDays(t, 1) : r.box >= GAPS.length ? "done" : addDays(t, GAPS[r.box - 1]);
  r.last = now(); r.history = (r.history || []).concat([{ d: t, ok: ok, by: CFG.device }]).slice(-12); REV.rv[key] = r; REV.dirty = true;
  ls(revKey(), JSON.stringify({ dirty: true, data: REV.rv })); clearTimeout(revSaveT); revSaveT = setTimeout(saveRevise, 2500); }
function saveRevise() { if (!REV || !REV.dirty || !navigator.onLine) return; var path = studentBase() + "review.json", mine = JSON.parse(JSON.stringify(REV.rv));
  function put(sha) { return putB64(path, b64enc(JSON.stringify(mine, null, 1)), CFG.student + ": mistakes warm-up (" + CFG.device + ")", sha); }
  setSave("Saving…");
  put(REV.sha).catch(function (e) { if (e.status !== 409 && e.status !== 422) throw e;
    return gh("/repos/" + CFG.repo + "/contents/" + enc(path)).then(function (r) { var remote = r.status === 404 ? {} : JSON.parse(new TextDecoder().decode(b64bytes(r.json.content)));
      Object.keys(remote).forEach(function (k) { if (!mine[k] || String(remote[k].last) > String(mine[k].last)) mine[k] = remote[k]; }); REV.rv = mine; return put(r.status === 404 ? null : r.json.sha); }); })
  .then(function (sha) { REV.sha = sha; REV.dirty = false; ls(revKey(), JSON.stringify({ dirty: false, data: REV.rv })); setSave("Saved " + hhmm(now())); })
  .catch(function () { setSave("Not saved · kept on device", true); }); }
window.addEventListener("online", saveRevise);
var revState = { i: 0, open: false, subj: null, box: null };
function reviseInto(box, subject) {
  box.innerHTML = '<div class="empty"><h3>Loading his mistakes</h3></div>';
  loadRevise().then(function () { revState = { i: 0, open: false, subj: subject || null, box: box }; drawRevise(); })
    .catch(function (e) { box.innerHTML = '<div class="empty"><h3>Couldn’t load his mistakes</h3><p>' + esc(e.message) + '</p></div>'; });
}
function drawRevise() {
  var box = revState.box; if (!box || !box.isConnected) return; var due = dueList(revState.subj), all = REV.ms.length;
  var chips = '<div class="qbar" style="margin-bottom:12px">' + [[null, "All subjects"], ["chem", "Chemistry"], ["maths", "Maths"]].map(function (c) { return '<button class="chip" type="button" data-rsub="' + (c[0] || "") + '" aria-pressed="' + (revState.subj === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>';
  if (!due.length) { box.innerHTML = chips + '<div class="empty"><h3>Nothing due</h3><p>' + (all ? "Every mistake is either mastered or scheduled for a later day." : "No mistakes logged yet. They arrive when Claude closes a lesson.") + '</p></div>'; return; }
  if (revState.i >= due.length) revState.i = 0;
  var m = due[revState.i], r = REV.rv[m.key];
  box.innerHTML = chips + '<div class="rev card"><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill ' + esc(m.subject || "") + '">' + esc(SUBJ[m.subject] || m.subject || "") + '</span>' + (m.topic ? '<span class="pill">' + esc(m.topic) + '</span>' : "") + (m.type ? '<span class="pill">' + esc(VHELP[m.type] || m.type) + '</span>' : "") + '<span class="pill num">' + (revState.i + 1) + ' of ' + due.length + ' due</span>' + (r ? '<span class="pill">round ' + (r.box + 1) + '</span>' : '<span class="pill warn">first time</span>') + '</div>' +
    '<div class="label" style="margin-top:16px">Ask him</div><div class="rev-q">' + clean(m.ask || ("What’s the correct version of this? “" + (m.text || m.what || "") + "”")) + '</div>' +
    (revState.open ? '<div class="qa prose"><b>Answer:</b> ' + clean(m.fix || "") + '<div class="hint" style="margin-top:8px">His mistake (' + esc(m.date || "") + '): ' + clean(m.text || m.what || "") + '</div></div>' : '<div><button class="btn" type="button" data-rev="open">Show answer</button></div>') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="v" type="button" data-v="right" data-rev="ok" aria-pressed="false">✓ Got it</button><button class="v" type="button" data-v="wrong" data-rev="no" aria-pressed="false">✗ Still wrong</button><button class="btn small" type="button" data-rev="skip">Skip for now</button></div></div>';
}
function reviseView() { app.innerHTML = phead([[CFG.student, ""], ["Revise", ""]], "Revise his mistakes", "Five minutes at the start of a lesson. Each one comes back on day 1, 3, 7, 14 and 30 until he gets it right every time.") + '<div id="revbox"></div>'; reviseInto($("#revbox"), subjPick() === "all" ? null : subjPick()); }
document.addEventListener("click", function (e) { var t = e.target.closest("button"); if (!t || !REV || !revState.box || !revState.box.isConnected) return;
  if (t.hasAttribute("data-rsub")) { revState.subj = t.getAttribute("data-rsub") || null; revState.i = 0; revState.open = false; drawRevise(); return; }
  var a = t.getAttribute("data-rev"); if (!a) return; e.stopPropagation(); var due = dueList(revState.subj), m = due[revState.i];
  if (a === "open") { revState.open = true; drawRevise(); return; }
  if (a === "skip") { revState.i = (revState.i + 1) % Math.max(1, due.length); revState.open = false; drawRevise(); return; }
  if (m) { markRevise(m.key, a === "ok"); var nd = REV.rv[m.key].due; toast(a === "ok" ? (nd === "done" ? "Mastered" : "Back on " + fmtDate(nd)) : "Back tomorrow"); }
  revState.open = false; drawRevise(); }, true);

/* ---------------- install as an app ---------------- */
if ("serviceWorker" in navigator && location.protocol === "https:") { window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); }); }
var installEvt = null; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; var b = $("#s-install"); if (b) b.hidden = false; });
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("#s-install"); if (t && installEvt) { installEvt.prompt(); installEvt = null; t.hidden = true; } });

/* ---------------- videos: every relevant lecture, by topic, played here ---------------- */
var VID = { subj: ls("tutor.vsubj") || "chem", q: "", cur: null };
function durTxt(s) { s = +s || 0; return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function videosView() {
  if (subjPick() !== "all") VID.subj = subjPick();
  app.innerHTML = phead([[CFG.student, ""], ["Videos", ""]], "Videos", "Chemistry Tutor (organic) and Maths Genie (Pure), in topic order. Tap one to play it here.") + '<div id="vwrap"><div class="empty"><h3>Loading the video list</h3></div></div>';
  loadTree().then(function () { return fileJSON("videos.json"); }).then(function (r) {
    if (route().indexOf("/videos") !== 0) return;
    if (!r) { $("#vwrap").innerHTML = '<div class="empty"><h3>No video list yet</h3><p>Ask Claude to run tools/build_video_catalogue.py.</p></div>'; return; }
    var tr = {}; (TREE || []).forEach(function (t) { var m = /^transcripts\/youtube\/[a-z]+\/([A-Za-z0-9_-]{11}) .*\.txt$/.exec(t.path); if (m) tr[m[1]] = t.path; });
    VID.all = r.data.videos.map(function (v) { v.transcript = tr[v.id] || v.transcript || null; return v; }); drawVideos();
  }).catch(fail);
}
function drawVideos() {
  var q = VID.q.toLowerCase(), list = VID.all.filter(function (v) { return v.subject === VID.subj && (!q || v.title.toLowerCase().indexOf(q) >= 0 || v.group.toLowerCase().indexOf(q) >= 0); });
  var groups = [], by = {}; list.forEach(function (v) { if (!by[v.group]) { by[v.group] = []; groups.push(v.group); } by[v.group].push(v); });
  var h = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><div class="qbar">' + [["chem", "Chemistry"], ["maths", "Maths"]].map(function (c) { return '<button class="chip" type="button" data-vsub="' + c[0] + '" aria-pressed="' + (VID.subj === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>' +
    '<input type="search" id="vq" placeholder="Search, e.g. chain rule, NMR" value="' + esc(VID.q) + '" style="flex:1 1 240px;min-height:44px;border-radius:12px;border:1px solid var(--line-2);background:var(--surface);padding:0 14px" aria-label="Search videos"></div>';
  h += '<div id="vplayer"></div>';
  h += groups.length ? groups.map(function (g) { return '<div class="section-h" style="margin-top:22px"><h2 style="font-size:var(--s-lg)">' + esc(g) + '</h2><span class="hint">' + by[g].length + '</span></div><div class="items">' + by[g].map(function (v) {
      return '<button type="button" class="item vrow" data-vid="' + esc(v.id) + '" style="text-align:left;border:0;background:transparent;cursor:pointer;width:100%"><span class="qn">▶</span><span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>' + esc(v.title) + '</b><span class="pill num">' + durTxt(v.duration) + '</span>' + (v.kind === "exam questions" ? '<span class="pill warn">exam questions</span>' : "") + (v.transcript ? '<span class="pill ok">transcript</span>' : "") + '</span></button>'; }).join("") + '</div>'; }).join("")
    : '<div class="empty"><h3>No videos match</h3><p>Try a shorter search.</p></div>';
  $("#vwrap").innerHTML = h; if (VID.cur) playVideo(VID.cur, false);
}
function playVideo(id, scroll) {
  var v = (VID.all || []).filter(function (x) { return x.id === id; })[0]; if (!v) return; VID.cur = id;
  var box = $("#vplayer"); if (!box) return;
  box.innerHTML = '<div class="vid" style="margin-bottom:8px"><div class="label" style="margin-bottom:6px">' + esc(v.channel) + ' · ' + esc(v.group) + '</div><h3 style="font-size:var(--s-lg);margin-bottom:10px">' + esc(v.title) + '</h3><div class="vframe"><iframe data-vid="' + esc(v.id) + '" src="' + vsrc(v.id, 0, true) + '" title="' + esc(v.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"><a class="btn small" href="https://www.youtube.com/watch?v=' + esc(v.id) + '" target="_blank" rel="noopener">Open on YouTube</a>' + (v.transcript ? '<button class="btn small" type="button" data-vtr="' + esc(v.id) + '">Show transcript</button>' : '<span class="hint">Transcript not downloaded yet</span>') + '<button class="btn small" type="button" data-vclose>Close</button></div><div id="vtr"></div></div>';
  if (scroll !== false) box.scrollIntoView({ block: "start", behavior: "smooth" });
}
function showTranscript(id) {
  var v = VID.all.filter(function (x) { return x.id === id; })[0], box = $("#vtr"); if (!v || !box) return; box.innerHTML = '<p class="hint">Loading transcript…</p>';
  fileText(v.transcript).then(function (r) { if (!r) { box.innerHTML = '<p class="hint">Transcript not found.</p>'; return; }
    var lines = r.text.split(/\n/).filter(function (l) { return /^\[/.test(l); });
    box.innerHTML = '<div class="prose vtr">' + lines.map(function (l) { var m = /^\[([0-9:]+)\]\s*(.*)$/.exec(l); return m ? '<p><button class="linkbtn num" type="button" data-seek="' + esc(v.id) + '" data-t="' + esc(m[1]) + '">' + esc(m[1]) + '</button> ' + esc(m[2]) + '</p>' : ""; }).join("") + '</div>'; });
}
document.addEventListener("click", function (e) { if (route().indexOf("/videos") !== 0) return; var t = e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-vsub")) { VID.subj = t.getAttribute("data-vsub"); ls("tutor.vsubj", VID.subj); VID.cur = null; drawVideos(); return; }
  if (t.hasAttribute("data-vid") && t.classList.contains("vrow")) { playVideo(t.getAttribute("data-vid")); return; }
  if (t.hasAttribute("data-vtr")) { showTranscript(t.getAttribute("data-vtr")); t.remove(); return; }
  if (t.hasAttribute("data-vclose")) { VID.cur = null; $("#vplayer").innerHTML = ""; return; }
});
document.addEventListener("input", function (e) { if (e.target.id === "vq") { VID.q = e.target.value; clearTimeout(timers.vq); timers.vq = setTimeout(function () { var pos = e.target.selectionStart; drawVideos(); var i = $("#vq"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } }, 250); } });

/* ---------------- subject switch (Both / Chemistry / Maths) ---------------- */
function subjPick() { return ls("tutor.subj") || "all"; }
function subjSync() { $$(".subjsw [data-subj]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-subj") === subjPick())); }); }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".subjsw [data-subj]"); if (!b) return; ls("tutor.subj", b.getAttribute("data-subj")); subjSync();
  if (VID) { VID.subj = subjPick() === "all" ? VID.subj : subjPick(); VID.cur = null; } if (route().indexOf("/lesson/") !== 0) render(); });
subjSync();
function phead(crumbs, title, sub, right) {
  return '<div class="phead"><div class="phead-row"><div style="min-width:0"><div class="crumb">' + crumbs.map(function (c, i) { return (i ? '<span aria-hidden="true">›</span>' : "") + (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : '<span>' + esc(c[0]) + '</span>'); }).join("") + '</div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : "") + '</div>' + (right || "") + '</div></div>';
}
/* maths typesetting: KaTeX loads only the first time a page actually contains \( \), \[ \] or $$ */
var KTX = null, KCDN = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/";
function loadKatex() { if (KTX) return KTX; KTX = new Promise(function (res, rej) {
  var l = document.createElement("link"); l.rel = "stylesheet"; l.href = KCDN + "katex.min.css"; document.head.appendChild(l);
  var k = document.createElement("script"); k.src = KCDN + "katex.min.js"; k.onerror = rej;
  k.onload = function () { var a = document.createElement("script"); a.src = KCDN + "contrib/auto-render.min.js"; a.onload = res; a.onerror = rej; document.head.appendChild(a); };
  document.head.appendChild(k); }); KTX.catch(function () { KTX = null; }); return KTX; }
function typeset(el) { try { renderMathInElement(el, { delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }, { left: "$$", right: "$$", display: true }], throwOnError: false }); } catch (e) {} }
function maths(el) { if (!el || !/\\\(|\\\[|\$\$/.test(el.textContent)) return; if (window.renderMathInElement) return typeset(el); loadKatex().then(function () { if (el.isConnected) typeset(el); }, function () {}); }

/* ---------------- teach mode: the script one chunk at a time ---------------- */
var MODE = "plan", TCH = { id: null, pos: 0, seq: [] };
function teachSeq() {
  var seq = [];
  phases().filter(function (p) { return !p.sys; }).forEach(function (p) {
    seq.push({ t: "phase", p: p });
    (function walk(bs, mod) {
      var run = [];
      function flush() { if (run.length) seq.push({ t: "figs", items: run, p: p, mod: mod }); run = []; }
      (bs || []).forEach(function (b) {
        if (b.type === "figure" && b.img) { run.push(b); return; }
        flush();
        if (b.type === "steps") (b.items || []).forEach(function (it) { seq.push({ t: "step", it: it, key: stepKey(it.html), p: p, mod: mod }); });
        else if (b.type === "text") seq.push({ t: "text", b: b, key: !gradeRows(clean(b.html)).rows.length && plain(b.html).length > 40 ? textKey(b.html) : null, p: p, mod: mod });
        else if (b.type === "module") { seq.push({ t: "mod", b: b, key: modKey(b.name), p: p, mod: b.name }); walk(b.blocks, b.name); seq.push({ t: "modend", b: b, p: p, mod: b.name }); }
        else if (b.type === "quiz") (b.items || []).forEach(function (it, i) { seq.push({ t: "quiz", it: it, n: i + 1, of: b.items.length, p: p, mod: mod }); });
        else if (b.type === "drill") (b.items || []).forEach(function (d, i) { seq.push({ t: "drill", d: d, key: drillKey(d[0]), n: i + 1, of: b.items.length, title: b.title, p: p, mod: mod }); });
        else seq.push({ t: b.type, b: b, p: p, mod: mod });
      });
      flush();
    })(p.blocks, null);
  });
  seq.push({ t: "end" });
  return seq;
}
function tposKey() { return "tutor.tpos." + CFG.student + "." + L.id; }
function sameGroup(a, b) { return a && b && a.p === b.p && a.mod === b.mod; }
function tlabel(kind, ic, text) { return '<div class="tlabel k-' + kind + '"><span class="ic">' + ic + '</span>' + esc(text) + '</div>'; }
function chunkHTML(c, cur) {
  switch (c.t) {
    case "phase": return '<div class="tphase"><div class="label">Part ' + (phases().indexOf(c.p) + 1) + (c.p.start != null ? ' · ' + c.p.start + '–' + c.p.end + ' min' : "") + '</div><h2>' + esc(c.p.name) + '</h2>' + (c.p.show ? '<div class="screen" style="margin-top:16px"><span class="label">On screen</span><div>' + clean(c.p.show) + '</div></div>' : "") + (L.script && L.script.focus && phases()[0] === c.p ? focusTable(L.script.focus) : "") + '</div>';
    case "mod": return tlabel(c.b.level === "deep" ? "deep" : "core", c.b.level === "deep" ? "D" : "C", (c.b.level === "deep" ? "Deep dive" : "Core") + (c.b.minutes ? " · " + c.b.minutes + " min" : "")) + '<h2 style="font-size:var(--s-xl)">' + esc(c.b.name) + '</h2>' + (c.b.level === "deep" && cur ? '<p class="hint">Optional extra depth. Teach it, or skip straight past it.</p>' : "");
    case "modend": return '<p class="hint">End of “' + esc(c.b.name) + '”.</p>';
    case "step": var k = c.it.kind || "do"; return tlabel(k, ({ say: "S", draw: "D", ask: "?", show: "▣", check: "✓" })[k] || "→", KIND[k] || k) + '<div class="big prose">' + clean(c.it.html) + '</div>';
    case "text": var g2 = gradeRows(clean(c.b.html)); return (g2.rows.length ? tlabel("q", "?", "Ask him row by row · " + g2.rows.filter(function (r) { var a = L.session.answers[r.k]; return a && a.v; }).length + " of " + g2.rows.length + " asked") : "") + '<div class="prose big">' + g2.html + '</div>';
    case "figs": return c.items.length > 1 ? '<div class="gallery">' + c.items.map(block).join("") + '</div>' : block(c.items[0]);
    case "quiz": var a = L.session.answers[c.it.id] || {};
      return tlabel("q", "?", "Oral quiz · " + c.n + " of " + c.of + (c.it.page ? " · " + c.it.page : "")) + '<div class="big prose">' + clean(c.it.q) + '</div>' + (cur ? '<details class="reveal" style="margin:10px 0"><summary>Show answer</summary><div class="prose">' + clean(c.it.a) + '</div></details><div class="items"><div class="item" data-v="' + esc(a.v || "") + '"><span class="qn">▸</span><div class="label" style="padding-top:12px">How he did</div>' + ctl(c.it.id) + '</div></div>' : "");
    case "drill": var a2 = L.session.answers[c.key] || {};
      return tlabel("q", "?", (c.title || "Drill") + " · " + c.n + " of " + c.of) + '<div class="big prose">' + clean(c.d[0]) + '</div>' + (cur ? '<details class="reveal" style="margin:10px 0"><summary>Show answer</summary><div class="prose">' + clean(c.d[1]) + '</div></details><div class="items"><div class="item" data-v="' + esc(a2.v || "") + '"><span class="qn">▸</span><div class="label" style="padding-top:12px">How he did</div>' + ctl(c.key, null, a2, plain(c.d[0])) + '</div></div>' : "");
    case "question": return tlabel("q", "Q", "Exam question") + questionBlock(c.b);
    case "end": return '<div class="tphase"><div class="label">Done</div><h2>End of the script</h2><p class="hint">Log times, notes and what to change next time.</p><button class="btn next" type="button" data-tgo="after">After the lesson →</button></div>';
    default: return block(c.b || {});
  }
}
function drawTeach() {
  var s = L.script || {}, x = L.session, subj = s.subject || x.subject; document.body.setAttribute("data-subject", subj); document.body.classList.add("teaching");
  if (TCH.id !== L.id) { TCH = { id: L.id, seq: teachSeq(), pos: +(ls(tposKey()) || 0) }; } else TCH.seq = teachSeq();
  if (TCH.pos >= TCH.seq.length) TCH.pos = TCH.seq.length - 1;
  var c = TCH.seq[TCH.pos], pct = Math.round(100 * TCH.pos / Math.max(1, TCH.seq.length - 1));
  var h = '<div class="teach3">' + runwayHTML(c) + '<section class="stage"><div class="tbar"><div class="tbar-row"><div class="tcrumb">' +
    '<a class="back" style="margin:0" href="#/lesson/' + encodeURIComponent(L.id) + '">← Plan</a><span aria-hidden="true">·</span><b>' + esc((c.p && c.p.name) || "End") + '</b>' + (c.mod ? '<span aria-hidden="true">›</span><span>' + esc(c.mod) + '</span>' : "") + '</div>' +
    '<div class="tmini"><span class="clockpill"><i aria-hidden="true"></i><span class="t" id="clk">0:00</span></span><button class="btn small" id="clkgo" type="button"></button><span class="hint num">' + (TCH.pos + 1) + ' / ' + TCH.seq.length + '</span></div></div>' +
    '<div class="tprog" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div><div class="tstage">';
  /* the current chunk, with the earlier chunks of the same group greyed above it */
  var keep = window.innerWidth < 900 ? 1 : 2, start = TCH.pos; while (start > 0 && TCH.pos - start < keep && sameGroup(TCH.seq[start - 1], c) && TCH.seq[start - 1].t !== "phase" && TCH.seq[start - 1].t !== "mod") start--;
  h += '<div id="tbody">';
  for (var i = start; i <= TCH.pos; i++) h += '<div class="chunk ' + (i === TCH.pos ? "cur" : "past") + '" data-ti="' + i + '">' + chunkHTML(TCH.seq[i], i === TCH.pos) + '</div>';
  var nx = upNext(TCH.pos + 1);
  h += '</div>' + (nx ? '<div class="upnext"><b>UP NEXT</b><span>' + esc(nx) + '</span></div>' : "") + '</div>' + footHTML(c) + '</section></div>';
  app.innerHTML = h; fillRows(app); loadImages(app); maths(app); tick();
  /* keep the whole current chunk in view between the top bar and the bottom buttons; a new part starts at the top */
  var cur = $(".chunk.cur"), bar = $(".tbar"), foot = $(".tfoot");
  if (cur && start < TCH.pos) { var top = bar ? bar.getBoundingClientRect().height : 0, bot = window.innerHeight - (foot ? foot.getBoundingClientRect().top : window.innerHeight), r = cur.getBoundingClientRect(), room = window.innerHeight - top - Math.max(0, bot);
    window.scrollBy(0, r.height > room ? r.top - top - 8 : r.bottom - (window.innerHeight - Math.max(0, bot)) + 12); } else window.scrollTo(0, 0);
  ls(tposKey(), String(TCH.pos));
}
/* the runway: the lesson's parts drawn to the scale of their planned minutes, with the clock as a moving pin */
function pw(p) { return p.start != null && p.end != null ? Math.max(2, p.end - p.start) : 4; }
function runwayHTML(c) {
  var s = L.script || {}, x = L.session, ps = phases().filter(function (p) { return !p.sys; }), ci = c.p ? ps.indexOf(c.p) : ps.length;
  var total = ps.reduce(function (a, p) { return a + pw(p); }, 0), t0 = 0;
  TCH.rw = { total: total, cur: c.p || null, starts: {} };
  var lis = ps.map(function (p, i) {
    var st = p.start != null ? p.start : t0; TCH.rw.starts[p.id] = st; t0 = st + pw(p);
    var its = phaseItems(p), qs = its.filter(function (q) { return q.kind === "q"; }), used = qs.filter(usedOrDone), right = used.filter(function (q) { return x.answers[q.k] && x.answers[q.k].v === "right"; });
    var pm = x.time.phaseMinutes && x.time.phaseMinutes[p.id];
    var sub = [pm ? "took " + pm + " min" : (p.start != null ? p.start + "–" + p.end + " min" : ""), used.length ? right.length + " of " + used.length + " right" : ""].filter(Boolean).join(" · ");
    var mods = "";
    if (i === ci) { var ms = (p.blocks || []).filter(function (b) { return b.type === "module"; });
      if (ms.length) mods = '<div class="mods">' + ms.map(function (b) { var j = seqIndex(function (q) { return q.t === "mod" && q.b === b; }); return '<button type="button" data-tjump="' + j + '" class="' + (c.mod === b.name ? "cur" : isDone(modKey(b.name)) ? "done" : "") + '">' + esc(b.name) + (b.level === "deep" ? " · deep" : "") + '</button>'; }).join("") + '</div>'; }
    var pj = seqIndex(function (q) { return q.t === "phase" && q.p === p; });
    return '<li class="' + (i < ci ? "past" : i === ci ? "cur" : "") + '" style="flex-grow:' + pw(p) + '"><button type="button" data-tjump="' + pj + '"><span class="nm">' + esc(p.name) + '</span>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : "") + '</button>' + mods + '</li>';
  }).join("");
  var subj = s.subject || x.subject, pd = parseId(L.id);
  return '<aside class="runway" aria-label="Lesson runway"><a class="back" href="#/lesson/' + encodeURIComponent(L.id) + '">← Back to Plan</a>' +
    '<span class="tag">' + esc(SUBJ[subj] || subj) + ' · ' + esc(fmtDate(s.date || x.date || pd.date)) + '</span><div class="ttl">' + esc(s.title || x.title || "Lesson") + '</div>' +
    '<div class="rw"><div class="rw-track" aria-hidden="true"><i class="fill" id="rwfill"></i><b class="pin" id="rwpin" hidden></b></div><ol>' + lis + '</ol></div>' +
    '<div class="onclock" id="onclock" hidden><span class="k">ON THE CLOCK</span><span id="onclockt"></span></div></aside>';
}
function seqIndex(f) { for (var i = 0; i < TCH.seq.length; i++) if (f(TCH.seq[i])) return i; return 0; }
function runwayTick(r) {
  var fill = $("#rwfill"), pin = $("#rwpin"), oc = $("#onclock"); if (!fill || !TCH.rw) return;
  var m = r.secs / 60, pc = Math.min(1, m / Math.max(1, TCH.rw.total)) * 100;
  fill.style.height = pc + "%"; pin.style.top = pc + "%"; pin.hidden = !r.secs;
  var p = TCH.rw.cur; if (!oc) return;
  if (!r.secs || !p || p.start == null) { oc.hidden = true; return; }
  var d = Math.round(m - p.start), late = Math.round(m - p.end);
  $("#onclockt").innerHTML = esc(p.name) + " was planned for minute " + p.start + "–" + p.end + ". " + (m < p.start ? "You are <b>" + Math.max(1, -d) + " min ahead</b>." : m > p.end ? "You are <b>" + Math.max(1, late) + " min behind</b>." : "You are <b>on time</b>.");
  oc.hidden = false;
}
/* a short line saying what comes after the current chunk */
function upNext(i) { var c = TCH.seq[i]; while (c && c.t === "modend") c = TCH.seq[++i]; if (!c) return "";
  var t = c.t === "phase" ? "Part: " + c.p.name : c.t === "mod" ? c.b.name : c.t === "step" ? plain(c.it.html) : c.t === "text" ? plain(c.b.html) : c.t === "quiz" ? "Quiz: " + plain(c.it.q) : c.t === "drill" ? "Drill: " + plain(c.d[0]) : c.t === "question" ? "Exam question: " + (c.b.label || "") : c.t === "figs" ? (c.items.length > 1 ? c.items.length + " pictures" : "A picture" + (c.items[0].caption ? ": " + plain(c.items[0].caption) : "")) : c.t === "video" ? "Video: " + (c.b.title || "") : c.t === "end" ? "End of the script" : "";
  return t.length > 120 ? t.slice(0, 118) + "…" : t; }
function footHTML(c) {
  var taughtable = { step: 1, figs: 1, video: 1, reveal: 1, mod: 1 }[c.t] || (c.t === "text" && c.key);
  var mid = "";
  if (c.t === "question" && (c.b.img || []).length) mid += '<button class="btn small" type="button" data-show="' + esc(c.b.id) + '">Show him</button>';
  if (c.t === "mod" && c.b.level === "deep") mid += '<button class="btn small" type="button" data-tskip="mod">Skip this deep dive</button>';
  if (c.t === "phase") mid += '<button class="btn small" type="button" data-tskip="phase">Skip this part</button>';
  var lab = c.t === "phase" ? "Start this part" : c.t === "mod" ? "Teach this" : taughtable ? '<span class="ck" aria-hidden="true">✓</span>Taught · Next' : "Next";
  return '<div class="tfoot"><button class="btn" type="button" data-tgo="-1"' + (TCH.pos === 0 ? " disabled" : "") + '>← Back</button><div class="mid">' + mid + '</div>' +
    (c.t === "end" ? "" : '<button class="btn next" type="button" data-tgo="+1">' + lab + ' <kbd>→</kbd></button>') + '</div>';
}
function setDone(key, label, on) { var x = L.session; x.done = x.done || {}; x.done[key] = on ? { at: now(), d: CFG.device, label: String(label || "").slice(0, 90) } : { off: true, at: now() }; }
function tmove(d, jump) {
  var c = TCH.seq[TCH.pos], x = L.session;
  if (d === 1 && !jump) {
    if (c.key && { step: 1, text: 1, mod: 1 }[c.t] && !isDone(c.key)) { setDone(c.key, c.t === "mod" ? c.b.name : plain(c.t === "step" ? c.it.html : c.b.html), true); touch(); }
  }
  var n = Math.max(0, Math.min(TCH.seq.length - 1, TCH.pos + d)); TCH.pos = n;
  var np = TCH.seq[n] && TCH.seq[n].p, r = replay(x.time.log);
  if (np && r.running && r.phase !== np.id) logEvent("phase", np.id);
  if (np) L.phase = np.id;
  drawTeach();
}
function tskip(what) { var c = TCH.seq[TCH.pos], i = TCH.pos + 1;
  if (what === "mod") { while (i < TCH.seq.length && !(TCH.seq[i].t === "modend" && TCH.seq[i].b === c.b)) i++; i++; }
  else { while (i < TCH.seq.length && TCH.seq[i].t !== "phase" && TCH.seq[i].t !== "end") i++; }
  TCH.pos = Math.min(i, TCH.seq.length - 1); drawTeach(); }
document.addEventListener("click", function (e) { if (MODE !== "teach" || !L) return; var t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-tgo")) { var g = t.getAttribute("data-tgo"); if (g === "after") { MODE = "plan"; L.phase = "_after"; location.hash = "#/lesson/" + encodeURIComponent(L.id); return; } tmove(+g); return; }
  if (t.hasAttribute("data-tskip")) { tskip(t.getAttribute("data-tskip")); return; }
  if (t.hasAttribute("data-tjump")) { tmove(+t.getAttribute("data-tjump") - TCH.pos, true); return; }
  });
document.addEventListener("keydown", function (e) { if (MODE !== "teach" || SH || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return;
  if (e.key === "ArrowRight") tmove(1); else if (e.key === "ArrowLeft") tmove(-1); });

render();
})();
