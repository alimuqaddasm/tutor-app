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
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (window.__tutorTry && /^tutor\.(s|review)\./.test(k)) return null; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
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

/* ---------------- settings ---------------- */
var CFG = {
  get token() { return ls("tutor.token") || ""; },
  get repo() { return ls("tutor.repo") || "alimuqaddasm/tutoring"; },
  get device() { return ls("tutor.device") || "tablet"; },
  get student() { return ls("tutor.student") || "UK-1"; }
};

/* ---------------- device cache (IndexedDB) ---------------- */
var idbP = null;
function idb() { if (idbP) return idbP; idbP = new Promise(function (res) { try { var r = indexedDB.open("tutor-desk", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; } catch (e) { res(null); } }); return idbP; }
function cget(k) { return idb().then(function (d) { if (!d) return null; return new Promise(function (res) { try { var q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result == null ? null : q.result); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } }); }); }
function cput(k, v) { return idb().then(function (d) { if (!d) return; try { d.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) {} }); }

/* try-out mode: this tab saves nothing (no GitHub writes, no lesson or review copies on the device) */
var TRY = window.__tutorTry = (function () { var q = /[?&]try\b/.test(location.search); try { if (q) sessionStorage.setItem("tutor.try", "1"); return sessionStorage.getItem("tutor.try") === "1"; } catch (e) { return q; } })();
/* ---------------- GitHub ---------------- */
var API = "https://api.github.com";
function gh(path, opts) {
  opts = opts || {};
  if (TRY && opts.method && opts.method !== "GET" && !opts.allowTry) { var te = new Error("Try-out mode: nothing is saved"); te.status = 0; te.tryout = true; return Promise.reject(te); }
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
/* many files in one commit (blobs sent a few at a time, then one tree, one commit): far faster than one commit per file.
   files: [{ path, b64 }]. If someone else pushed in between, it builds again on top of theirs. */
function commitFiles(files, msg, onStep) {
  var R0 = "/repos/" + CFG.repo, branch;
  var pool = function (list, n, fn) { var i = 0, out = []; var next = function () { if (i >= list.length) return Promise.resolve(); var k = i++; return fn(list[k], k).then(function (v) { out[k] = v; return next(); }); };
    var w = []; for (var j = 0; j < Math.min(n, list.length); j++) w.push(next()); return Promise.all(w).then(function () { return out; }); };
  var done = 0;
  return gh(R0).then(function (r) { branch = r.json.default_branch || "main";
    return pool(files, 4, function (f) { return gh(R0 + "/git/blobs", { method: "POST", body: { content: f.b64, encoding: "base64" } }).then(function (b) { if (b.status === 404) { var e = new Error("no git data"); e.noGit = true; throw e; } if (onStep) onStep(++done, files.length); return b.json.sha; }); });
  }).catch(function (e) { if (!e.noGit) throw e;   // no git data API here: one file at a time, the old way
    var ch = Promise.resolve(); files.forEach(function (f, k) { ch = ch.then(function () { if (onStep) onStep(k + 1, files.length); return putB64(f.path, f.b64, msg, shaOf(f.path)); }); }); return ch.then(function () { return null; });
  }).then(function (shas) { if (!shas) return;
    var attempt = function (left) {
      return gh(R0 + "/git/ref/heads/" + enc(branch)).then(function (ref) { var head = ref.json.object.sha;
        return gh(R0 + "/git/commits/" + head).then(function (c) {
          return gh(R0 + "/git/trees", { method: "POST", body: { base_tree: c.json.tree.sha, tree: files.map(function (f, k) { return { path: f.path, mode: "100644", type: "blob", sha: shas[k] }; }) } });
        }).then(function (t) { return gh(R0 + "/git/commits", { method: "POST", body: { message: msg, tree: t.json.sha, parents: [head] } }); })
          .then(function (nc) { return gh(R0 + "/git/refs/heads/" + enc(branch), { method: "PATCH", body: { sha: nc.json.sha } }); });
      }).catch(function (e) { if (left > 0 && e.status === 422) return attempt(left - 1); throw e; });
    };
    return attempt(3).then(function () { files.forEach(function (f, k) { setTreeSha(f.path, shas[k]); }); });
  });
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
  catch (e) { var er = new Error(path.split("/").slice(-2).join("/") + " is not valid JSON (" + e.message + "). Ask for the file to be fixed."); er.broken = true; throw er; } }); }
function fileText(path) { var sha = shaOf(path); if (!sha) return Promise.resolve(null); return blobBytes(sha).then(function (b) { return { text: new TextDecoder().decode(b), sha: sha }; }); }
var urlCache = {};
function fileURL(path) { var sha = shaOf(path); if (!sha) return Promise.resolve(null); if (urlCache[sha]) return Promise.resolve(urlCache[sha]);
  return blobBytes(sha).then(function (b) { var t = /\.png$/i.test(path) ? "image/png" : /\.mp4$/i.test(path) ? "video/mp4" : /\.webm$/i.test(path) ? "video/webm" : /\.pdf$/i.test(path) ? "application/pdf" : /\.svg$/i.test(path) ? "image/svg+xml" : "image/jpeg"; var u = URL.createObjectURL(new Blob([b], { type: t })); urlCache[sha] = u; return u; }); }
function studentBase() { return "students/" + CFG.student + "/"; }
function lessonBase(id) { return studentBase() + "lessons/" + id + "/"; }

/* ---------------- status + toast ---------------- */
var saveEl = $("#save"), timers = {};
function setSave(t, err) { saveEl.textContent = t; saveEl.className = "save" + (err ? " err" : ""); }
function toast(t) { var el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(timers.toast); timers.toast = setTimeout(function () { el.hidden = true; }, 3000); }

/* ---------------- session model ---------------- */
/* "skipped" = he did not attempt it; "tskip" = Ali skipped the question on purpose (not a verdict, never a mistake) */
/* the verdicts, always in this order (DESIGN.md). "Not asked" is Ali's choice, not a verdict: no score, never a mistake */
var VERD = [["right", '<span class="vi">\u2713</span>Right'], ["partly", '<span class="vi">\u00bd</span>Partly'], ["wording", '<span class="vi">\u2248</span>Wording'], ["terminology", '<span class="vi">Aa</span>Terminology'], ["wrong", '<span class="vi">\u2715</span>Wrong'], ["skipped", '<span class="vi">\u2212</span>No answer'], ["tskip", "Not asked"]];
var VHELP = { right: "right", wrong: "wrong", wording: "right idea, wrong wording", terminology: "wrong term used", partly: "partly right", skipped: "he did not attempt it", tskip: "not asked: your choice, not a verdict" };
function asked(v) { return !!v && v !== "tskip"; }
function parseId(id) { var m = /^(\d{4}-\d{2}-\d{2})-([a-z]+)/.exec(id) || []; return { date: m[1] || "", subject: m[2] || "" }; }
function newSession(id, script) {
  var p = parseId(id);
  return { v: 2, lesson: id, student: CFG.student, subject: (script && script.subject) || p.subject, date: (script && script.date) || p.date, title: (script && script.title) || "",
    status: "not-started", time: { log: [], edit: {}, started: null, ended: null, minutes: null, phaseMinutes: {} }, answers: {}, extra: [], work: [], feedback: {}, devices: [], updated: null };
}
var PREVIEW_FIX = "2026-10-01T12:00:00Z";
function norm(s) { if (s && s.done && !((s.time && s.time.log) || []).some(function (e) { return e.e === "start"; })) Object.keys(s.done).forEach(function (k) { var d = s.done[k]; if (d && !d.off && String(d.at) < PREVIEW_FIX) s.done[k] = { off: true, at: PREVIEW_FIX, label: d.label }; }); s.time = s.time || {}; s.time.log = s.time.log || []; s.time.edit = s.time.edit || {}; s.answers = s.answers || {}; s.extra = s.extra || []; s.work = s.work || []; s.feedback = s.feedback || {}; s.devices = s.devices || []; s.done = s.done || {};
  if (s.time.manual && !Object.keys(s.time.edit).length) { s.time.edit = { started: s.time.started, ended: s.time.ended }; delete s.time.manual; } return s; }
/* the lesson was ended with End lesson (its last clock event is "end") */
function endedLog(log) { var l = log || []; return !!l.length && l[l.length - 1].e === "end"; }
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
  if (String(local.makeupAt || "") > String(out.makeupAt || "")) { out.makeup = local.makeup; out.makeupAt = local.makeupAt; }
  var ad = {}; (out.added || []).concat(local.added || []).forEach(function (a) { var o = ad[a.part]; if (!o || String(a.at) > String(o.at)) ad[a.part] = a; });
  out.added = Object.keys(ad).map(function (k) { return ad[k]; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  ["title", "subject", "date"].forEach(function (k) { if (!out[k] && local[k]) out[k] = local[k]; });
  finalizeTime(out); return out;
}

/* ---------------- current lesson + saving ---------------- */
var L = null; /* {id, script, session, sha, dirty, rev, phase, filter, marking} */
function localKey(id) { return "tutor.s." + CFG.repo + "." + CFG.student + "." + id; }
function stash() { if (TRY) return; if (L) ls(localKey(L.id), JSON.stringify({ session: L.session, sha: L.sha, dirty: L.dirty })); }
function touch() { if (!L) return; var x = L.session; x.updated = now(); if (x.devices.indexOf(CFG.device) < 0) x.devices.push(CFG.device);
  if (x.status === "not-started") { x.status = "in-progress"; x.statusAt = now(); } finalizeTime(x);
  if (TRY) { setSave("Try-out \u00b7 not saved"); return; }
  L.dirty = true; L.rev = (L.rev || 0) + 1; stash();
  setSave("Kept on device"); clearTimeout(timers.flush); timers.flush = setTimeout(flush, 4000); }
var flushing = false;
function flush() {
  if (TRY || !L || !L.dirty) return Promise.resolve();
  if (flushing) return flushing.then(function () { return L && L.dirty && !flushing ? flush() : null; });
  if (!navigator.onLine) { setSave("Offline · kept on device", true); return Promise.resolve(); }
  var done; flushing = new Promise(function (r) { done = r; }); setSave("Saving…"); var mine = L, rev = mine.rev || 0; finalizeTime(mine.session);
  var path = lessonBase(mine.id) + "session.json";
  function put(sha) { return putB64(path, b64enc(JSON.stringify(mine.session, null, 1)), CFG.student + " " + mine.id + ": lesson log (" + CFG.device + ")", sha); }
  return put(mine.sha).catch(function (e) {
    if (e.status === 409 || e.status === 422) return gh("/repos/" + CFG.repo + "/contents/" + enc(path)).then(function (r) {
      var remote = r.status === 404 ? null : { data: JSON.parse(new TextDecoder().decode(b64bytes(r.json.content))), sha: r.json.sha };
      mine.session = merge(mine.session, remote && remote.data); if (L === mine) tick(); return put(remote && remote.sha); });
    throw e;
  }).then(function (sha) { mine.sha = sha; mine.dirty = (mine.rev || 0) !== rev;
    ls(localKey(mine.id), JSON.stringify({ session: mine.session, sha: sha, dirty: mine.dirty }));
    setSave(mine.dirty ? "Saving…" : "Saved " + hhmm(now())); flushing = false; done(); if (mine.dirty) setTimeout(flush, 1200); })
  .catch(function (e) { flushing = false; done(); setSave(e.status === 401 || e.status === 403 ? "Key refused" : "Not saved · kept on device", true);
    if (e.status === 401 || e.status === 403) toast("GitHub refused the key. Check it in Settings."); });
}
window.addEventListener("online", flush);
window.addEventListener("storage", function (e) { if (TRY || !L || e.key !== localKey(L.id) || !e.newValue) return; var o = null; try { o = JSON.parse(e.newValue); } catch (x) {} if (!o || !o.session) return;
  L.session = merge(L.session, o.session); if (o.sha && !L.dirty) L.sha = o.sha;
  if (MODE === "student" || !route().match(/^\/lesson\//)) return;
  if (document.visibilityState === "hidden" || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { L.stale = true; tick(); return; }
  drawLesson(); });
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && L && L.stale && route().indexOf("/lesson/") === 0 && MODE !== "student") { L.stale = false; drawLesson(); } });
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
setInterval(function () { if (L && L.dirty) flush(); }, 25000);

/* ---------------- routing ---------------- */
var app = $("#app");
function route() { return (location.hash || "#/").slice(1) || "/"; }
window.addEventListener("hashchange", function () { micFixClose(); if (L && L.dirty) flush(); render(); window.scrollTo(0, 0); });
function nav(r) { var k = r.indexOf("/record") === 0 ? "record" : r.indexOf("/settings") === 0 ? "settings" : r.indexOf("/revise") === 0 ? "revise" : r.indexOf("/videos") === 0 ? "videos" : r.indexOf("/exams") === 0 ? "exams" : "lessons";
  $$("[data-nav]").forEach(function (a) { if (a.getAttribute("data-nav") === k) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#who").textContent = CFG.token ? CFG.student + " · " + CFG.device : ""; if (typeof subjSync === "function") subjSync(); }
function render() {
  var r = route(); nav(r); document.body.removeAttribute("data-subject"); document.body.classList.remove("teaching", "student", "toc-open", "focus", "prep");
  if (!CFG.token && r.indexOf("/settings") !== 0) { location.hash = "#/settings"; return; }
  if (r.indexOf("/settings") === 0) return settingsView();
  if (r.indexOf("/lesson/") === 0) { var rest = decodeURIComponent(r.slice(8)), mm = /\/(teach|student)$/.exec(rest); MODE = mm ? mm[1] : "teach"; PREP = !mm; return lessonView(rest.replace(/\/(teach|student)$/, "")); }
  if (r.indexOf("/new") === 0) return newView();
  if (r.indexOf("/record") === 0) return recordView();
  if (r.indexOf("/revise") === 0) return reviseView();
  if (r.indexOf("/videos") === 0) return videosView();
  if (r.indexOf("/exams") === 0) { if (window.examsView) return window.examsView(r); app.innerHTML = '<div class="empty"><h3>Loading</h3></div>'; return; }
  return lessonsView();
}
function fail(e) { if (e && e.broken) { app.innerHTML = '<div class="empty"><h3>This file is broken</h3><p>' + esc(e.message) + '</p><p><a href="#/">Back to lessons</a></p></div>'; return; }
  app.innerHTML = '<div class="empty"><h3>Couldn’t reach GitHub</h3><p>' + esc(e && e.message || e) + '</p><p>Check your connection, or the key and repo in <a href="#/settings">Settings</a>.</p></div>'; }

/* ---------------- settings ---------------- */
function settingsView() {
  var f = ls("tutor.font") || "jakarta", fl = ls("tutor.flow") || "quick";
  var grp = function (id, title, hint, body) { return '<section class="grp" aria-labelledby="' + id + '"><div class="stack s2"><h2 id="' + id + '" class="t-sec">' + title + '</h2><span class="hint">' + hint + '</span></div>' + body + '</section>'; };
  var fonts = [["jakarta", "Plus Jakarta Sans", "Friendly, the default"], ["hanken", "Hanken Grotesk", "Plain and compact"], ["atkinson", "Atkinson Hyperlegible Next", "Extra readable"]];
  app.innerHTML = '<form class="wrap settings" id="setform" style="gap:0;max-width:1040px">' +
    '<header class="head" style="padding-bottom:var(--s6)"><div class="stack s2"><h1 class="t-page">Settings</h1><div class="tags">' + tag("This device only") + tag("Not saved to GitHub") + '</div></div><span class="tag lg" id="s-msg" aria-live="polite">Not tested yet</span></header>' +
    grp("s1", "GitHub", "Where the lessons live.", '<div class="card pad stack s5"><div class="field"><label for="s-token">GitHub key</label><input class="input" type="password" id="s-token" autocomplete="off" value="' + esc(CFG.token) + '" placeholder="github_pat_…"><div class="tags">' + tag("Fine-grained token") + tag("Contents: read and write") + tag("Stays in this browser") + '</div></div>' +
      '<div class="cols3"><div class="field"><label for="s-repo">Repo</label><input class="input" type="text" id="s-repo" value="' + esc(CFG.repo) + '"></div><div class="field"><label for="s-dev">Device name</label><input class="input" type="text" id="s-dev" value="' + esc(CFG.device) + '" placeholder="Tablet, laptop"></div><div class="field"><label for="s-stu">Student</label><input class="input" type="text" id="s-stu" value="' + esc(CFG.student) + '"></div></div></div>') +
    grp("s2", "Exam server", "For the Exams tab.", '<div class="card pad cols2"><div class="field"><label for="s-xapi">Server address</label><input class="input" type="text" id="s-xapi" value="' + esc(ls("tutor.examApi") || window.EXAM_API || "") + '" placeholder="https://tutor-exams.workers.dev"></div><div class="field"><label for="s-xpw">Exam password</label><input class="input" type="password" id="s-xpw" autocomplete="off" value="' + esc(ls("tutor.examPw") || "") + '"></div></div>') +
    grp("s3", "Teaching", "How Teach behaves.", '<div class="card pad stack s5"><div class="field"><span class="fl">Teach flow</span><div class="cols2" role="group" aria-label="Teach flow">' +
      '<button class="choice" type="button" data-flow="steps" aria-pressed="' + (fl === "steps") + '"><b>Step by step</b><span class="tags">' + tag("Title screens") + tag("One point at a time") + '</span></button>' +
      '<button class="choice" type="button" data-flow="quick" aria-pressed="' + (fl === "quick") + '"><b>Quick flow</b><span class="tags">' + tag("Points beside the picture") + tag("Quiz as one list") + '</span></button></div>' +
      '<div class="tags"><span class="lab">Questions</span>' + tag("Question fills the screen") + tag("Verdicts on the right edge") + tag("A turns to the answer") + '</div></div>' +
      '<div class="field"><span class="fl">Hints in Teach</span><label class="check"><input type="checkbox" data-fold="maths"' + (foldOn("maths") ? " checked" : "") + '>Maths: fold the hints under each question</label><label class="check"><input type="checkbox" data-fold="chem"' + (foldOn("chem") ? " checked" : "") + '>Chemistry: fold the hints the same way</label></div>' +
      '<div class="field"><span class="fl">Clock reminders</span><label class="check"><input type="checkbox" id="s-chime"' + (ls("tutor.chime") === "off" ? "" : " checked") + '>Chime when the clock needs you <span class="hint">The screen still flashes when it is off</span></label></div></div>') +
    grp("s4", "Font", "Questions always keep the exam board’s font.", '<div class="card pad cols3" role="group" aria-label="Font"><input type="hidden" id="s-font" value="' + esc(f) + '">' + fonts.map(function (o) {
      return '<button class="choice" type="button" data-fontpick="' + o[0] + '" aria-pressed="' + (f === o[0]) + '"><span style="font-family:\'' + o[1] + '\',sans-serif;font-size:26px;font-weight:600;line-height:1.2">Aa</span><b>' + o[1].replace(" Next", "") + '</b><span class="hint">' + o[2] + '</span></button>'; }).join("") + '</div>') +
    grp("s5", "This device", "Install, cache and key.", '<div class="card pad stack"><div class="row"><button class="btn" type="button" id="s-install" hidden>Install on this device</button><div class="tags">' + tag("Opens full screen") + tag("Works offline") + '</div></div>' +
      '<div class="row"><button class="btn" type="button" id="s-cache">Clear this device’s cache</button><span class="hint">Reloads lessons from GitHub. Nothing is lost.</span></div><div class="row"><button class="btn danger" type="button" id="s-clear">Remove key from this device</button></div><div class="row"><button class="btn" type="button" data-suggest>Suggest a change</button><button class="btn trytoggle" type="button" data-trytoggle>' + (TRY ? "Leave try-out" : "Try-out") + '</button><span class="hint">Try-out: practise on real lessons, nothing saves.</span></div></div>') +
    '<div class="row savebar"><a class="btn quiet" href="#/">Cancel</a><button class="btn pri" type="submit">Save and test</button></div></form>';
  if (installEvt) $("#s-install").hidden = false;
  if (CFG.token) testConnection();
}
document.addEventListener("change", function (e) { if (e.target.id === "wk-files") { var n = e.target.files.length, p = $("#wk-pick"); if (p) p.textContent = n ? n + (n > 1 ? " files" : " file") + " chosen" : ""; } });
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-fontpick]"); if (!b) return; $("#s-font").value = b.getAttribute("data-fontpick");
  $$("[data-fontpick]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); });
function testConnection() {
  var m = $("#s-msg"), say = function (txt, cls) { if (!m) return; m.className = "tag lg" + (cls ? " " + cls : ""); m.innerHTML = (cls === "ok" ? '<span class="dot ok"></span>' : "") + esc(txt); };
  say("Testing…");
  return gh("/repos/" + CFG.repo).then(function (r) {
    if (r.status === 404) { say("Repo not found, or the key can’t see it", "bad"); return; }
    var p = r.json.permissions || {}; if (p.push) say("Connected · can read and save", "ok"); else say("Connected, but the key can’t save", "live");
  }).catch(function (e) { say(e.status === 401 ? "GitHub refused the key" : "Couldn’t connect: " + e.message, "bad"); });
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
      HOMEALL = items; var sp = subjPick(); items = items.filter(function (it) { var sj = (it.s && it.s.subject) || (it.x && it.x.subject) || parseId(it.id).subject; return sp === "all" || sj === sp; });
      app.innerHTML = homeHTML(items); fillHomeRevise(); fillHomeAsg(); warmUpNext(HOMEALL);
    });
  }
  if (!$(".home")) app.innerHTML = '<div class="empty"><h3>Loading lessons</h3></div>';
  if (TREE && TREE.length) loadMakeup().then(function () { return draw(TREE); }).catch(function () {});
  loadTree(true).then(function (tr) { return loadMakeup().then(function () { return draw(tr); }); }).catch(function (e) { if (!TREE || !TREE.length) fail(e); else setSave("Offline", true); });
}
function card(it) {
  var p = parseId(it.id), s = it.s || {}, x = it.x || null, subj = s.subject || (x && x.subject) || p.subject;
  var st = x && x.status === "finished" ? '<span class="pill ok">Logged</span>' : x && x.status === "in-progress" ? '<span class="pill warn">In progress</span>' : s.status === "draft" ? '<span class="pill warn">Draft script</span>' : it.script ? '<span class="pill">Script ready</span>' : "";
  var sc = x ? score(x) : { n: 0 };
  return '<a class="card lesson-card" data-subject="' + esc(subj) + '" href="#/lesson/' + encodeURIComponent(it.id) + '"><div class="meta"><span class="pill ' + esc(subj) + '">' + esc(SUBJ[subj] || subj) + '</span><span>' + esc(fmtDate(s.date || (x && x.date) || p.date)) + '</span>' + st +
    (x && x.makeup ? '<span class="pill warn">Make-up</span>' : "") + (x && x.time && x.time.minutes ? '<span class="pill">' + esc(x.time.minutes) + ' min</span>' : "") + (sc.n ? '<span class="pill">' + sc.r + '/' + sc.n + ' right</span>' : "") + (it.marking ? '<span class="pill ok">Marked</span>' : it.work ? '<span class="pill warn">' + it.work + ' photo' + (it.work > 1 ? "s" : "") + '</span>' : "") + '</div>' +
    '<h3>' + esc(lessonTitle(s, x)) + '</h3>' + (s.summary ? '<div class="hint">' + clean(s.summary) + '</div>' : "") + '</a>';
}
function score(x) { var r = 0, n = 0; Object.keys(x.answers || {}).forEach(function (k) { var v = x.answers[k].v; if (!asked(v) || v === "skipped") return; n++; if (v === "right") r++; }); (x.extra || []).forEach(function (e) { if (!asked(e.v) || e.v === "skipped") return; n++; if (e.v === "right") r++; }); return { r: r, n: n }; }

/* ---------------- home: this week, what's up next per subject, recent lessons ---------------- */
var OFFDAYS = [2, 5]; /* Tuesday and Friday: Ali's days off */
function pad2(n) { return String(n).padStart(2, "0"); }
function isoOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function weekDays() { var d = pdate(todayIso()), dow = (d.getDay() + 6) % 7, out = []; for (var i = 0; i < 7; i++) { var x = new Date(d); x.setDate(d.getDate() - dow + i); out.push(isoOf(x)); } return out; }
function subjOf(it) { return (it.s && it.s.subject) || (it.x && it.x.subject) || parseId(it.id).subject; }
function dateOf(it) { return (it.s && it.s.date) || (it.x && it.x.date) || parseId(it.id).date; }
function doneOf(x, k, kind) { if (!x) return false; if (kind === "q") { var a = x.answers && x.answers[k]; return !!(a && asked(a.v)); } var d = x.done && x.done[k]; return !!(d && !d.off); }
function partsOf(s, x) { if (!s || !s.phases) return [];
  return s.phases.map(function (p) { var its = phaseItems(p).filter(function (i) { return i.kind !== "module"; }), d = its.filter(function (i) { return doneOf(x, i.k, i.kind); }).length; return { name: p.name, w: pw(p), f: its.length ? d / its.length : 0 }; }); }
/* tags (Clear Desk: repeated facts are tags, not sentences) */
/* a tag starts with a capital (Ali, 8 Oct), whatever the data says; "pH" and the like stay as they are */
function tag(txt, cls) { txt = String(txt); if (/^[a-z][a-z]/.test(txt)) txt = txt.charAt(0).toUpperCase() + txt.slice(1); return '<span class="tag' + (cls ? " " + cls : "") + '">' + txt + '</span>'; }
function subjTag(sj) { return tag('<span class="dot"></span>' + esc(SUBJ[sj] || sj), esc(sj)); }
function topicTag(s) { var tp = s && s.topic; if (!tp || !(tp.code || tp.name)) return ""; return tag((tp.code ? '<b>' + esc(tp.code) + '</b>' : "") + esc(titleCase(tp.name || "")), "topic"); }
/* first letter upper case on every label (Ali, 8 Oct) */
function cap(s) { s = String(s == null ? "" : s); return s.charAt(0).toUpperCase() + s.slice(1); }
/* "4 binomial expansion" or "3.3.7 optical isomerism" as a topic tag: the number bold, the name after it */
function topicStrTag(s) { var m = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(String(s || "").trim()); if (!m) return s ? tag(esc(titleCase(s)), "topic") : ""; return tag('<b>' + esc(m[1]) + '</b>' + esc(titleCase(m[2])), "topic"); }
/* "Edexcel C3 January 2010 Q8" as a source reference: publisher | paper | question */
var PUBS = ["Maths Genie", "Chemistry Tutor", "Solomon", "Edexcel", "AQA", "OCR", "CGP", "Pearson", "Physics and Maths Tutor", "PMT"];
function refTag(src) { src = String(src || "").replace(/\s*\((?![a-z]{1,4}\))[^)]*\)/g, "").replace(/Trigonometry Worksheet/g, "Trig").replace(/,\s*(?=Q\d)/, " ").trim(); if (!src) return "";
  var q = /\s(Q\d+\w*(?:\s?\([a-z]+\))?)$/.exec(src), qn = q ? q[1] : "", rest = q ? src.slice(0, q.index) : src, pub = "";
  PUBS.forEach(function (p) { if (!pub && rest.indexOf(p) === 0) pub = p; });
  var mid = pub ? rest.slice(pub.length).trim() : rest;
  mid = mid.replace(/^Year (\d) Question Set /, "Y$1 Set ");
  return '<span class="ref">' + (pub ? '<span>' + esc(pub) + '</span>' : "") + (mid ? '<span>' + esc(mid) + '</span>' : "") + (qn ? '<span class="qn">' + esc(qn) + '</span>' : "") + '</span>'; }
function hmin(m) { m = Math.round(+m || 0); var h = Math.floor(m / 60); return h ? h + " h " + (m % 60) + " min" : m + " min"; }
var VCOL = { right: "var(--right)", partly: "var(--partly)", wording: "var(--wording)", terminology: "var(--term)", wrong: "var(--wrong)", skipped: "var(--none)" };
/* the kind of a lesson part, from the start of its name ("Practice: Set 6" is Practice). Older names are matched on their words */
var KINDS = [["Quiz", /^(hard )?(oral )?quiz/i], ["Starter", /^starter/i], ["Re-teach", /^re-?teach/i], ["New", /^(new\b|teach\b)/i], ["Practice", /^practi[cs]e/i], ["Revision", /^revision/i],
  ["Exam", /^(exam|test)\b/i], ["Video", /^video/i], ["Keep it fresh", /^keep it fresh/i], ["Check", /^(exit check|check|last topic)/i], ["Homework", /^(homework|set the)/i], ["If time", /^(if time|extra material)/i],
  ["Bank", /^question bank/i], ["Recycle", /^recycle/i]];
function kindOf(name) { name = String(name || "").trim(); for (var i = 0; i < KINDS.length; i++) if (KINDS[i][1].test(name)) return KINDS[i][0]; var c = /^([^:]{2,16}):/.exec(name); return c ? c[1] : ""; }
function partKinds(s) { var seen = {}; return ((s && s.phases) || []).map(function (p) { return kindOf(p.name); }).filter(function (k) { if (!k || k === "If time" || k === "Bank" || k === "Recycle" || k === "Homework" || seen[k]) return false; seen[k] = 1; return true; }); }
function kindsHTML(s) { var ks = partKinds(s); return ks.length ? '<span class="kinds">' + ks.map(function (k) { return '<span class="k' + (k === "If time" ? " opt" : "") + '">' + esc(k) + '</span>'; }).join("") + '</span>' : ""; }
/* a part's name without its kind ("Practice: Set 6, Q15 to Q18" shows as "Set 6, Q15 to Q18" under a Practice tag) */
function partTitle(name) { var k = kindOf(name), m = /^[^:]{2,24}:\s*(.+)$/.exec(String(name || "")); return titleCase(k && m ? m[1] : name); }
/* the lesson's title is its main topic. Older titles list the parts ("Hard quiz, then Tollens'"): show the part after "then" */
function lessonTitle(s, x) { return lessonParts(s, x).name; }
/* "7.1 Addition formulae" splits into a topic tag (7.1) and the name; "the chapters 1 to 6 test" into an Exam tag and "Chapters 1 to 6" (Ali, 8 Oct) */
function lessonParts(s, x) { var t = (s && s.title) || (x && x.title) || "Lesson";
  if (!(s && s.topic)) { var m = /,\s*then\s+(?:the\s+)?(.+)$/i.exec(t); if (m) t = m[1]; t = t.replace(/,\s*after\s+.+$/i, ""); }
  var c = /^(\d+(?:\.\d+)+)\s+(.+)$/.exec(t), code = c ? c[1] : ""; if (c) t = c[2];
  var e = /^(.+?)\s+(test|exam|mock)$/i.exec(t), exam = !!e; if (e) t = e[1];
  return { name: titleCase(t), code: code, exam: exam }; }
/* the tags a lesson title carries: its section number (when the topic tag doesn't show it already) and Exam */
function lessonTags(s, x) { var p = lessonParts(s, x), tp = s && s.topic; return (p.code && !(tp && tp.code) ? tag('<b>' + esc(p.code) + '</b>', "topic") : "") + (p.exam ? tag("Exam", "live") : ""); }
/* ---------------- missed lessons and make-up time ----------------
   students/<s>/makeup.json = {"start": {"date", "owed", "note"}, "entries": [{"id", "at", "date", "lesson", "subject", "kind": "miss", "by": "ali|student", "minutes", "note", "d"}]}
   A lesson counts as taught when it is finished, has minutes and has feedback. Once its day has passed without that, the
   home page asks: taught or not, and whose miss. Ali's miss adds 45 min; the student's adds 45 only if Ali says so.
   An untaught lesson stays up next and is reused on the next working day (nothing is marked done at midnight).
   Minutes over 45 in a normal lesson, and all the minutes of a make-up lesson, come off the counter. */
var MK = null, HOMEALL = [], LESSON_MIN = 45;
function mkPath() { return studentBase() + "makeup.json"; }
function loadMakeup() { return fileJSON(mkPath()).then(function (r) { if (TRY && MK && MK.student === CFG.student) return MK; MK = { student: CFG.student, data: (r && r.data) || null, sha: r && r.sha }; return MK; }, function () { return MK; }); }
function taughtOK(x) { return !!(x && x.status === "finished" && x.time && +x.time.minutes > 0 && x.feedback && x.feedback.at); }
function isWork(iso) { return OFFDAYS.indexOf(pdate(iso).getDay()) < 0; }
function nextWork(iso) { var d = addDays(iso, 1); while (!isWork(d)) d = addDays(d, 1); return d; }
function mkStart() { return (MK && MK.data && MK.data.start && MK.data.start.date) || "9999"; }
function missesOf(id) { return ((MK && MK.data && MK.data.entries) || []).filter(function (e) { return e.lesson === id && e.kind === "miss"; }); }
/* the day a lesson is now meant for: its own date, or the working day after its last recorded miss */
function dueOf(it) { var ms = missesOf(it.id).map(function (e) { return e.date; }).sort(); return ms.length ? nextWork(ms[ms.length - 1]) : dateOf(it); }
function pendingAsks(items) { var t = todayIso();
  return items.filter(function (it) { return dateOf(it) >= mkStart() && !taughtOK(it.x) && (it.script || it.x) && dueOf(it) < t; })
    .map(function (it) { return { it: it, due: dueOf(it) }; }).sort(function (a, b) { return a.due.localeCompare(b.due); }); }
function makeupSum(items) { var d = MK && MK.data; if (!d || !d.start) return null; var o = { start: +d.start.owed || 0, missed: 0, short: 0, over: 0, made: 0, log: [] };
  (d.entries || []).forEach(function (e) { var m = +e.minutes || 0; o.missed += m;
    o.log.push({ date: e.date || (e.at || "").slice(0, 10), what: (e.lesson ? lessonName(e.lesson) + ": " : "") + (e.by === "ali" ? "you missed it" : e.by === "student" ? "he missed it" : "missed"), m: m }); });
  items.forEach(function (it) { var x = it.x; if (!x || x.status !== "finished" || dateOf(it) < d.start.date) return; var m = +(x.time && x.time.minutes) || 0;
    if (x.makeup) { o.made += m; if (m) o.log.push({ date: dateOf(it), what: lessonName(it.id) + ": make-up lesson, " + m + " min", m: -m }); }
    else if (shortBy(x) === "ali") { var sm = shortMin(x); o.short += sm; o.log.push({ date: dateOf(it), what: lessonName(it.id) + ": " + Math.round(m) + " min taught, you cut it short", m: sm }); }
    else { o.over += Math.max(0, m - LESSON_MIN); if (m > LESSON_MIN) o.log.push({ date: dateOf(it), what: lessonName(it.id) + ": " + m + " min taught, " + (m - LESSON_MIN) + " over " + LESSON_MIN, m: -(m - LESSON_MIN) }); } });
  o.log.sort(function (a, b) { return b.date.localeCompare(a.date); });
  o.owed = Math.round(o.start + o.missed + o.short - o.over - o.made); return o; }
function mkSide(o) { var el = $("#mkside"); if (!el) return; el.hidden = !o; if (o) el.querySelector("b").textContent = Math.max(0, o.owed); }
document.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("[data-mkjump]"); if (!a) return; e.preventDefault(); var c = $("#mkcard"); if (c) { c.scrollIntoView({ block: "center", behavior: "smooth" }); c.classList.add("flash"); setTimeout(function () { c.classList.remove("flash"); }, 1200); } });
function makeupCard(items) { var o = makeupSum(items); if (!o) return "";
  var ln = function (k, v) { return '<div class="statline"><span>' + k + '</span><b>' + v + '</b></div>'; };
  return '<div class="statcard mkcard" id="mkcard"><span class="k">Make-up owed</span><div class="row base s2"><span class="big">' + Math.max(0, o.owed) + '</span><span class="hint">min</span></div>' +
    ln("Before " + esc(fmtDate(MK.data.start.date)), o.start) + ln("Missed lessons", "+" + Math.round(o.missed)) + (o.short ? ln("Cut short by you", "+" + o.short) : "") + ln("Taught over " + LESSON_MIN + " min", "\u2212" + Math.round(o.over)) + ln("Make-up lessons", "\u2212" + Math.round(o.made)) +
    (o.log.length ? '<details class="mklog"><summary>Details (' + o.log.length + ')</summary><ul>' + o.log.map(function (l) { return '<li><span class="num">' + esc(fmtDate(l.date)) + '</span><span>' + esc(l.what) + '</span><b class="num">' + (l.m > 0 ? "+" : "\u2212") + Math.abs(Math.round(l.m)) + '</b></li>'; }).join("") + '</ul></details>' : "") +
    '<span class="hint">Tick \u201cMake-up lesson\u201d when you finish or log one.</span></div>'; }
function lessonName(id) { var p = parseId(id); return (SUBJ[p.subject] || p.subject || "Lesson") + " " + (p.date ? fmtDate(p.date) : id); }
function askHTML(items) { var asks = pendingAsks(items); if (!asks.length) return "";
  return '<section class="asks" aria-label="Lessons to confirm">' + asks.map(function (a) { var it = a.it, s = it.s || {}, x = it.x, sj = subjOf(it);
    return '<div class="ask card" data-subject="' + esc(sj) + '" data-ask="' + esc(it.id) + '" data-due="' + esc(a.due) + '"><div class="ask-q">' + subjTag(sj) + tag(esc(fmtDate(a.due)), "day") + '<b>Was it taught?</b>' + tag(esc(lessonTitle(s, x)), "line") + (a.due !== dateOf(it) ? tag("Moved from " + esc(fmtDate(dateOf(it))), "dash") : "") + '</div>' +
      '<div class="ask-a"><a class="btn" href="#/lesson/' + encodeURIComponent(it.id) + '" data-askyes="' + esc(it.id) + '">Yes, log it</a><button class="btn" type="button" data-miss="ali">No, I missed it</button><button class="btn" type="button" data-miss="student">No, he missed it</button></div></div>'; }).join("") + '</section>'; }
function saveMakeup(entry) { MK = MK || { student: CFG.student, data: null, sha: null }; MK.data = MK.data || { start: { date: todayIso(), owed: 0 }, entries: [] }; MK.data.entries = MK.data.entries || [];
  MK.data.entries.push(entry); if (TRY) return Promise.resolve("try");
  var path = mkPath();
  function put(data, sha) { return putB64(path, b64enc(JSON.stringify(data, null, 1) + "\n"), CFG.student + ": " + entry.lesson + " not taught (" + entry.by + "'s miss) (" + CFG.device + ")", sha); }
  return put(MK.data, MK.sha).catch(function (e) { if (e.status !== 409 && e.status !== 422) throw e;
    return gh("/repos/" + CFG.repo + "/contents/" + enc(path)).then(function (r) { var remote = r.status === 404 ? { entries: [] } : JSON.parse(new TextDecoder().decode(b64bytes(r.json.content)));
      var ids = {}; (remote.entries || []).forEach(function (x) { ids[x.id] = 1; }); remote.entries = (remote.entries || []).concat(MK.data.entries.filter(function (x) { return !ids[x.id]; }));
      remote.start = remote.start || MK.data.start; MK.data = remote; return put(remote, r.status === 404 ? null : r.json.sha); }); })
  .then(function (sha) { MK.sha = sha; return "saved"; }); }
function recordMiss(box, by, minutes) { var id = box.getAttribute("data-ask"), due = box.getAttribute("data-due"), it = HOMEALL.filter(function (i) { return i.id === id; })[0];
  var e = { id: "miss-" + id + "-" + due, at: now(), date: due, lesson: id, subject: it ? subjOf(it) : parseId(id).subject, kind: "miss", by: by, minutes: minutes, d: CFG.device };
  box.innerHTML = '<div class="ask-q"><b>Saving\u2026</b></div>';
  saveMakeup(e).then(function (how) { toast((how === "try" ? "Try-out: not saved. " : "") + (minutes ? minutes + " min added to make-up time. " : "No make-up time added. ") + "The lesson is now up next for " + fmtDate(nextWork(due)) + "."); lessonsView(); },
    function (er) { MK.data.entries = MK.data.entries.filter(function (x) { return x.id !== e.id; }); toast("Not saved: " + (er.status === 401 || er.status === 403 ? "GitHub refused the key" : navigator.onLine ? "GitHub did not answer, try again" : "you are offline")); lessonsView(); }); }
document.addEventListener("click", function (e) { var y = e.target.closest && e.target.closest("[data-askyes]"); if (y) OPENAT = { id: y.getAttribute("data-askyes"), phase: "_after" }; });
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-miss],[data-mkadd]"); if (!t) return; var box = t.closest("[data-ask]"); if (!box) return;
  if (t.getAttribute("data-miss") === "ali") return recordMiss(box, "ali", LESSON_MIN);
  if (t.getAttribute("data-miss") === "student") { box.querySelector(".ask-a").innerHTML = '<span class="hint">He missed it. Add ' + LESSON_MIN + ' min to the make-up time?</span><button class="btn" type="button" data-mkadd="1">Yes, add ' + LESSON_MIN + ' min</button><button class="btn" type="button" data-mkadd="0">No</button>'; return; }
  recordMiss(box, "student", t.getAttribute("data-mkadd") === "1" ? LESSON_MIN : 0); });
function homeHTML(items) {
  var sp = subjPick(), t = todayIso(), wk = weekDays(), byDay = {};
  items.forEach(function (it) { var d = dateOf(it), sj = subjOf(it), done = !!(it.x && it.x.status === "finished");
    if (done) { (byDay[d] = byDay[d] || []).push({ s: sj, k: "done", tip: SUBJ[sj] + ": taught" }); return; }
    if (d < t) (byDay[d] = byDay[d] || []).push({ s: sj, k: "miss", tip: SUBJ[sj] + ": not taught" });
    var due = dueOf(it); if (due >= t) (byDay[due] = byDay[due] || []).push({ s: sj, k: "plan", tip: SUBJ[sj] + ": planned" + (due !== d ? " (moved from " + fmtDate(d) + ")" : "") }); });
  var week = '<div class="week" aria-label="This week">' + wk.map(function (d) { var dd = pdate(d), off = OFFDAYS.indexOf(dd.getDay()) >= 0;
    return '<div class="wd' + (d === t ? " today" : off ? " off" : "") + '"><span>' + DAY[dd.getDay()] + '</span><span class="n">' + dd.getDate() + '</span><span class="dots">' + (d === t ? "Today" : off ? "Off" : (byDay[d] || []).map(function (o) { return '<i class="' + esc(o.s) + ' ' + o.k + '" title="' + esc(o.tip) + '"></i>'; }).join("")) + '</span></div>'; }).join("") + '</div>';
  var mko = makeupSum(HOMEALL.length ? HOMEALL : items); mkSide(mko);
  var h = '<header class="phead"><div class="phead-row"><div class="stack s3" style="min-width:0"><h1>' + esc(DAYL[pdate(t).getDay()] + " " + pdate(t).getDate() + " " + MONL[pdate(t).getMonth()]) + '</h1><div class="tags">' +
    (sp !== "all" ? subjTag(sp) : "") + tag(OFFDAYS.length ? [1, 2, 3, 4, 5, 6, 0].filter(function (d) { return OFFDAYS.indexOf(d) < 0; }).map(function (d) { return DAY[d]; }).join(" · ") : "Every day") + tag(LESSON_MIN + " min a subject") +
    (mko ? '<a class="mkchip" href="#mkcard" data-mkjump>Make-up owed <b class="num">' + Math.max(0, mko.owed) + '</b> min</a>' : "") + '</div></div>' + week + '</div></header>';
  /* today: the first lesson from today on that is not logged yet, else an invitation to draft one */
  var subs = sp === "all" ? ["maths", "chem"] : [sp], shown = {};
  var tiles = subs.map(function (sj) {
    var mine = items.filter(function (it) { return subjOf(it) === sj; });
    var up = mine.filter(function (it) { return dateOf(it) >= t ? !(it.x && it.x.status === "finished") : dateOf(it) >= mkStart() && !taughtOK(it.x); }).sort(function (a, b) { return dueOf(a).localeCompare(dueOf(b)) || dateOf(a).localeCompare(dateOf(b)); })[0];
    var last = mine.filter(function (it) { return it.x && it.x.status === "finished"; }).sort(function (a, b) { return dateOf(b).localeCompare(dateOf(a)); })[0];
    if (up) { shown[up.id] = 1; var s = up.s || {}, x = up.x, st = x && x.status === "in-progress" ? tag("In progress", "live") : s.status === "draft" ? tag("Draft script") : up.script ? tag("Script ready") : tag("No script", "dash");
      var when = dateOf(up) < t ? (dueOf(up) < t ? tag("Was it taught? See above", "live") : tag("Moved to " + esc(fmtDate(dueOf(up))), "live")) : dateOf(up) > t ? tag(esc(fmtDate(dateOf(up))), "day") : "";
      var ps = partsOf(s, x), mins = ((s.phases || []).reduce(function (m, p) { return Math.max(m, +p.end || 0); }, 0)) || LESSON_MIN;
      var cur = ps.findIndex(function (p) { return p.f < 1; });
      var flow = ps.length ? '<div class="flow ' + esc(sj) + '">' + ps.filter(function (p) { var k = kindOf(p.name); return k !== "Bank" && k !== "Recycle" && k !== "If time"; }).map(function (p, i) { var k = kindOf(p.name) || p.name; if (k === "Keep it fresh") k = "Fresh";
        return '<span style="flex:' + p.w + '"' + (i === cur ? ' class="on"' : k === "If time" ? ' class="opt"' : "") + ' title="' + esc(p.name) + '"><i></i><em>' + esc(k) + '</em></span>'; }).join("") + '</div>' : "";
      return '<article class="tile" data-subject="' + sj + '"><div class="tags">' + subjTag(sj) + topicTag(s) + lessonTags(s, x) + st + when + '</div><h2>' + esc(lessonTitle(s, x)) + '</h2>' + flow +
        '<div class="acts"><a class="btn go" href="#/lesson/' + encodeURIComponent(up.id) + '/teach">Teach ▶</a><a class="btn" href="#/lesson/' + encodeURIComponent(up.id) + '">Prepare</a>' + tag(mins + " min") + '</div></article>'; }
    return '<article class="tile none" data-subject="' + sj + '"><div class="tags">' + subjTag(sj) + tag("No script yet", "dash") + '</div><h2>Next ' + esc(SUBJ[sj].toLowerCase()) + ' lesson</h2>' +
      (last ? '<div class="tags"><span class="hint">Last</span>' + tag(esc(fmtDate(dateOf(last)))) + tag(esc(lessonTitle(last.s, last.x)), "line") + '</div>' : '<p>No script yet: draft the first one.</p>') +
      '<div class="acts"><button class="btn go" type="button" data-askclaude="' + sj + '">Draft it</button><a class="btn quiet" href="#/new">Log without a script</a></div></article>';
  }).join("");
  var rest = items.filter(function (it) { return !shown[it.id]; });
  var rows = rest.map(function (it) {
    var s = it.s || {}, x = it.x, sj = subjOf(it), d = pdate(dateOf(it)), sc = x ? score(x) : { n: 0 }, m = x && x.time && x.time.minutes;
    var st = x && x.status === "finished" ? "" : x && x.status === "in-progress" ? tag("In progress", "live") : s.status === "draft" ? tag("Draft script") : it.script ? tag("Script ready") : "";
    var extra = st + (it.marking ? tag("Marked", "ok") : it.work ? tag(it.work + " photo" + (it.work > 1 ? "s" : "")) : "");
    return '<a class="lrow" data-subject="' + esc(sj) + '" href="#/lesson/' + encodeURIComponent(it.id) + '"><span class="dblock">' + DAY[d.getDay()] + '<b>' + d.getDate() + '</b></span><span class="lt"><b>' + esc(lessonTitle(s, x)) + '</b>' + (kindsHTML(s) || extra || lessonTags(s, x) ? '<span class="tags">' + lessonTags(s, x) + kindsHTML(s) + extra + '</span>' : "") + '</span>' +
      '<span class="score">' + (sc.n ? '<span>' + sc.r + '/' + sc.n + ' right</span><span class="bar"><i style="width:' + Math.round(sc.r / sc.n * 100) + '%"></i></span>' : '<span class="hint">' + (x && x.status === "finished" ? "No verdicts" : "") + '</span>') + '</span>' +
      '<span class="mins' + (m && x.status === "finished" && m < LESSON_MIN - 5 ? " short" : "") + '">' + (m ? esc(Math.round(m)) + '<small> min</small>' : "") + '</span></a>'; }).join("");
  /* this week's numbers */
  var mins = 0, r = 0, n = 0, logged = 0;
  items.forEach(function (it) { if (wk.indexOf(dateOf(it)) < 0 || !it.x) return; if (it.x.time && it.x.time.minutes) mins += +it.x.time.minutes; if (it.x.status === "finished") logged++; var sc = score(it.x); r += sc.r; n += sc.n; });
  var side = '<div class="inkcard" id="homerev"><div class="k">Mistakes warm-up</div><div class="tags"><span class="tag live num" id="homerevn">…</span></div><div class="q" id="homerevq">Loading his mistakes…</div><div class="tags" id="homerevm"></div><a class="btn" href="#/revise">Start warm-up · 5 min</a></div>' +
    '<div class="statcard"><span class="k">This week</span><div class="row base" style="gap:var(--s5)"><span><span class="big">' + Math.floor(mins / 60) + ' h ' + Math.round(mins % 60) + '</span> <span class="hint">taught</span></span><span><span class="big">' + (n ? r + "/" + n : "-") + '</span> <span class="hint">right</span></span></div>' +
    '<div class="statline"><span>Lessons logged</span><b>' + logged + '</b></div></div>';
  side += makeupCard(HOMEALL.length ? HOMEALL : items);
  return h + askHTML(items) + '<div id="homeasg"></div><div class="home"><div><h2 class="sec" style="margin-top:0">Today</h2><div class="tiles">' + tiles + '</div>' + (rows ? '<div class="sech"><h2 class="sec">Recent lessons</h2><a class="link" href="#/record">See all in Record</a></div><div class="rows">' + rows + '</div>' : "") + '</div><div>' + side + '</div></div>';
}
/* take-home assignments (Ali, 8 Oct: "I don't see the assignment"): a strip on the home page that leads to them in Exams */
function fillHomeAsg() {
  var box = $("#homeasg"); if (!box || !TREE) return;
  var base = studentBase() + "assignments/";
  var paths = TREE.filter(function (t) { return t.path.indexOf(base) === 0 && /\/assignment\.json$/.test(t.path) && t.path.slice(base.length).split("/").length === 2; }).map(function (t) { return t.path; });
  if (!paths.length) return;
  Promise.all(paths.map(function (pth) { return fileJSON(pth).then(function (j) { return j && j.data; }, function () { return null; }); })).then(function (list) {
    list = list.filter(function (a) { return a && a.status !== "done"; }); if (!list.length || !$("#homeasg")) return;
    $("#homeasg").innerHTML = list.map(function (a) {
      var secs = a.sections || [], days = secs.reduce(function (m, x) { m[x.day] = 1; return m; }, {});
      var ttl = String(a.title || "Assignment").replace(/,\s*\d{1,2}(\s+\w+)?\s+to\s+\d{1,2}\s+\w+$/, ""), dd = secs.map(function (x) { return x.date; }).filter(Boolean).sort();
      return '<a class="asgstrip" href="#/exams">' + tag("Assignment", "ask") + '<b>' + esc(ttl) + '</b><span class="tags">' + (dd.length ? tag(esc(fmtDate(dd[0]) + " to " + fmtDate(dd[dd.length - 1]))) : "") + tag(Object.keys(days).length + " days") + tag(secs.length + " sections") + (a.status === "ready" ? tag("Not sent yet", "dash") : a.status ? tag(esc(cap(a.status))) : "") + '</span><span class="go">Open in Exams</span></a>';
    }).join("");
  });
}
function fillHomeRevise() {
  var sp = subjPick();
  loadRevise().then(function () { var box = $("#homerev"); if (!box) return; var due = dueList(sp === "all" ? null : sp); $("#homerevn").textContent = due.length + " due today";
    if (!due.length) { $("#homerevq").textContent = "Nothing due today."; $("#homerevm").innerHTML = '<span class="hint">Each mistake comes back on day 1, 3, 7, 14 and 30.</span>'; return; }
    var m = due[0], rv = REV.rv[m.key]; $("#homerevq").textContent = plain(m.ask || m.text || m.what || "");
    $("#homerevm").innerHTML = (m.subject ? subjTag(m.subject) : "") + (m.topic ? tag(esc(m.topic), "line") : "") + (m.type && VTAG[m.type] ? tag(VTAG[m.type][0], VTAG[m.type][1]) : "") + tag(rv ? "Review " + (rv.box + 1) : "First review"); revBadge(); }).catch(function () { var q = $("#homerevq"); if (q) q.textContent = "Couldn’t load the mistakes list."; });
}
var VTAG = { right: ["\u2713 Right", "ok"], partly: ["\u00bd Partly", "partly"], wording: ["\u2248 Wording", "wording"], terminology: ["Aa Terminology", "term"], wrong: ["\u2715 Wrong", "bad"], skipped: ["\u2212 No answer", ""] };
function revBadge() { var b = $("#revbadge"); if (!b || !REV) return; var n = dueList(null).length; b.textContent = n; b.hidden = !n; }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-askclaude]"); if (!b) return;
  var sj = b.getAttribute("data-askclaude"), txt = "/tutor next lesson " + (SUBJ[sj] || sj).toLowerCase() + " for " + CFG.student;
  var done = function () { toast("Copied “" + txt + "”. Paste it into the drafting chat."); };
  try { navigator.clipboard.writeText(txt).then(done, function () { toast("Draft it: “" + txt + "”"); }); } catch (x) { toast("Draft it: “" + txt + "”"); } });

/* ---------------- new unscripted lesson ---------------- */
function newView() {
  var sj = subjPick() === "maths" ? "maths" : "chem";
  app.innerHTML = '<div class="wrap narrow" style="max-width:640px"><header class="stack s3"><div class="crumb"><a href="#/">Lessons</a><span aria-hidden="true">/</span><span>New</span></div><h1 class="t-title">Log a Lesson Without a Script</h1><div class="tags">' + tag("Add notes, photos and times after") + '</div></header>' +
    '<form class="card pad-l stack s5" id="newform"><input type="hidden" id="n-subj" value="' + sj + '"><div class="field"><span class="fl">Subject</span><div class="row" role="group" aria-label="Subject">' +
    [["chem", "Chemistry"], ["maths", "Maths"]].map(function (o) { return '<button class="pick" type="button" data-subject="' + o[0] + '" data-npick="' + o[0] + '" aria-pressed="' + (sj === o[0]) + '"><span class="dot ' + o[0] + '"></span>' + o[1] + '</button>'; }).join("") + '</div></div>' +
    '<div class="field"><label for="n-date">Date</label><input class="input" type="date" id="n-date" value="' + todayIso() + '" required></div>' +
    '<div class="field"><label for="n-title">Main topic</label><input class="input" type="text" id="n-title" required placeholder="e.g. Addition formulae"></div>' +
    '<label class="check"><input type="checkbox" id="n-makeup">Make-up lesson <span class="hint">All its minutes come off make-up owed</span></label>' +
    '<div class="row"><button class="btn pri" type="submit" data-nclock="1">Start the clock now</button><button class="btn" type="submit" data-nclock="0">Log it, no clock</button></div></form></div>';
}
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-npick]"); if (b) { $("#n-subj").value = b.getAttribute("data-npick"); $$("[data-npick]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); return; }
  var c = e.target.closest && e.target.closest("[data-nclock]"); if (c) NEWCLOCK = c.getAttribute("data-nclock") === "1"; });
var NEWCLOCK = false, STARTCLOCK = null;

/* ---------------- lesson view ---------------- */
var OPENAT = null;   // {id, phase}: open a lesson on a given part (the make-up "Yes" opens After the lesson)
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
      var pid = parseId(id);
      if (!script && !remote && !(saved && saved.session) && (!pid.date || !pid.subject)) {   // a mistyped or old address: don't make a lesson out of it
        app.innerHTML = '<div class="empty"><h3>No lesson called “' + esc(id) + '”</h3><p>The address may be mistyped or old. <a href="#/">Back to lessons</a></p></div>'; return; }
      var session, sha = remote ? remote.sha : null, dirty = false;
      if (saved && saved.dirty) { session = remote ? merge(norm(saved.session), remote.data) : norm(saved.session); dirty = true; }
      else session = remote ? norm(remote.data) : newSession(id, script);
      if (!session.title && script) session.title = script.title;
      finalizeTime(session);
      var ph = (L && L.id === id) ? L.phase : OPENAT && OPENAT.id === id ? OPENAT.phase : null; OPENAT = null;
      L = { id: id, script: script, session: session, sha: sha, dirty: dirty, marking: marking, phase: ph, filter: null, rev: 0 };
      if (dirty) flush();
      return loadStores().then(function () { if (L && L.id === id) drawLesson(); });
    });
  }
  if (TRY && L && L.id === id) { drawLesson(); return; }
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
  addedParts().forEach(function (a) { var at = -1; ps.forEach(function (p, i) { if (p.id === a.after) at = i; });
    if (at < 0) ps.push(a.part); else { while (at + 1 < ps.length && ps[at + 1].fromStore && ps[at + 1].after === a.after) at++; ps.splice(at + 1, 0, a.part); } });
  ps.push({ id: "_revise", name: "Mistakes warm-up", sys: 1 }, { id: "_extra", name: "Extra questions", sys: 1 }, { id: "_work", name: "His work", sys: 1 }, { id: "_time", name: "Times", sys: 1 }, { id: "_after", name: "After the lesson", sys: 1 });
  return ps;
}
function drawLesson() {
  if (PREP) { if (!L.phase && L.session.status === "finished") L.phase = "_after"; MODE = /^_/.test(L.phase || "") ? "plan" : "teach"; }
  if (MODE === "teach") return drawTeach();
  if (MODE === "student") return drawStudent();
  var s = L.script || {}, x = L.session, subj = s.subject || x.subject;
  document.body.setAttribute("data-subject", subj);
  var ps = phases(); if (!L.phase || !ps.some(function (p) { return p.id === L.phase; })) L.phase = x.status === "finished" ? "_after" : ps[0].id;
  var r = replay(x.time.log);
  if (/^_/.test(L.phase)) { document.body.classList.add("focus"); app.innerHTML = '<div class="wrap lpage">' + sysPage(L.phase) + '</div>'; var pg = $(".lpage"); fillRows(pg); loadImages(pg); maths(pg); if (L.phase === "_revise") reviseInto($("#revbox"), x.subject); tick(); return; }
  document.body.classList.add("focus");
  var mins = (s.phases || []).reduce(function (m, p) { return Math.max(m, +p.end || 0); }, 0);
  var tags = subjTag(subj) + tag(esc(fmtDate(x.date || s.date))) + topicTag(s) + lessonTags(s, x) + (s.status === "draft" ? tag("Draft script") : "") + (x.status === "finished" ? tag("Logged", "ok") : x.status === "in-progress" ? tag("In progress", "live") : "") + (x.makeup ? tag("Make-up", "live") : "") + (mins ? tag(mins + " min") : "");
  var focus = (s.focus || []).length ? '<div class="tags"><span class="lab">Focus</span>' + s.focus.map(function (f) { return '<button class="tag ask" type="button" data-focus>' + esc(plain(f.want)) + '</button>'; }).join("") + '</div>' : "";
  var real = ps.filter(function (p) { return !p.sys && kindOf(p.name) !== "Bank" && kindOf(p.name) !== "Recycle"; }), ci = real.indexOf(ps.filter(function (p) { return p.id === L.phase; })[0]);
  var flow = real.length > 1 ? '<div class="flow ' + esc(subj) + '" aria-label="Parts" style="padding-top:var(--s2)">' + real.map(function (p, k) { var kd = kindOf(p.name);
    return '<span style="flex:' + pw(p) + '"' + (k === ci ? ' class="on"' : kd === "If time" ? ' class="opt"' : "") + ' title="' + esc(p.name) + '"><i></i><em>' + esc(kd ? kd + (kd === "New" ? " · " + partTitle(p.name) : "") : p.name) + '</em></span>'; }).join("") + '</div>' : "";
  var h = '<header class="band stack lhead2"><div class="crumb"><a href="#/">Lessons</a><span aria-hidden="true">/</span><span>' + esc(SUBJ[subj] || subj) + '</span></div><div class="head"><div class="stack s3" style="min-width:0;flex:1 1 480px"><div class="tags">' + tags + '</div>' +
    '<h1 class="t-title" title="' + esc(s.title || x.title || "") + '">' + esc(lessonTitle(s, x)) + '</h1>' + focus + (!focus && s.summary ? '<span class="hint">' + esc(plain(s.summary)) + '</span>' : "") + '</div>' +
    '<div class="stack s3" style="align-items:flex-end"><div class="seg modes" role="group" aria-label="Mode"><a href="#/lesson/' + encodeURIComponent(L.id) + '" aria-current="true">Plan</a><a href="#/lesson/' + encodeURIComponent(L.id) + '/teach">Teach</a><a href="#/lesson/' + encodeURIComponent(L.id) + '/student" target="_blank" rel="noopener">Student view <svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"></path></svg></a></div>' +
    '<div class="row"><span class="clockpill' + (r.running ? " live" : "") + '"><span class="dot"></span><span id="clk" class="num">0:00</span></span><button class="btn pri" id="clkgo" type="button"></button>' + ((x.time.log || []).length && !endedLog(x.time.log) ? '<button class="btn danger" id="clkend" type="button">End lesson</button>' : "") + '<button class="btn sm quiet" type="button" data-phase="_time">Edit part times</button></div></div></div>' + flow +
    (s.focus && s.focus.length ? '<div id="focusbox" hidden>' + focusTable(s.focus) + '</div>' : "") + '</header>';
  var ICO = { _revise: '<path d="M20 12a8 8 0 1 1-2.34-5.66"></path><path d="M20 4v5h-5"></path>', _extra: '<path d="M12 5v14M5 12h14"></path>', _work: '<rect x="3" y="5" width="18" height="15" rx="2"></rect><circle cx="12" cy="12.5" r="3.5"></circle>', _time: '<circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2 2M9 2h6"></path>', _after: '<path d="M5 12l5 5L20 7"></path>' };
  h += '<div class="lesson"><nav class="rail" aria-label="Lesson parts">' + ps.map(function (p, i) {
    var pm = x.time.phaseMinutes && x.time.phaseMinutes[p.id], planned = p.start != null ? p.start + " to " + p.end + " min" : "", live = x.work.filter(function (w) { return !w.removed; }).length;
    var tm = p.sys ? ({ _revise: REV ? dueList(x.subject).length + " " + (SUBJ[x.subject] || "").toLowerCase() + " due" : "His old mistakes", _extra: x.extra.length ? x.extra.length + " logged" : "None yet", _work: live ? live + (live > 1 ? " photos" : " photo") : "No photos yet", _time: x.time.minutes != null ? Math.round(x.time.minutes) + " min" + (x.time.started ? " · " + hhmm(x.time.started) + (x.time.ended ? " to " + hhmm(x.time.ended) : "") : "") : "Not recorded yet", _after: x.feedback && x.feedback.at ? "Saved " + hhmm(x.feedback.at) : "Notes and finish" })[p.id]
      : [planned, pm ? "took " + pm + " min" : "", phaseCount(p)].filter(Boolean).join(" · ");
    var kd = p.sys ? "" : kindOf(p.name);
    return (p.id === "_revise" ? '<div class="sep"></div><div class="railh">Around the lesson</div>' : i === 0 ? '<div class="railh">Parts</div>' : "") + '<button type="button" class="' + (kd === "If time" ? "opt" : "") + '" data-phase="' + esc(p.id) + '" data-real="' + (p.sys ? "" : "1") + '"' + (p.id === L.phase ? ' aria-current="step"' : "") + '><span class="n">' + (p.sys ? '<svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true">' + ICO[p.id] + '</svg>' : i + 1) + '</span>' + (kd ? '<span class="tags">' + tag(esc(kd), kd === "If time" ? "dash" : "line") + '</span>' : "") + '<span class="nm">' + esc(partTitle(p.name)) + '</span><span class="tm num">' + esc(cap(tm)) + '</span></button>';
  }).join("") + '</nav><section class="page" id="phasebox"></section></div>';
  app.innerHTML = h; drawPhase(); tick(); prefetchLesson(); if (STARTCLOCK === L.id) { STARTCLOCK = null; var cg = $("#clkgo"); if (cg) cg.click(); }
}
function railCount() { var p = phases().filter(function (q) { return q.id === L.phase && !q.sys; })[0]; if (!p) return; var b = $('.rail button[data-phase="' + p.id + '"] .tm'); if (!b) return;
  var pm = L.session.time.phaseMinutes && L.session.time.phaseMinutes[p.id], planned = p.start != null ? p.start + " to " + p.end + " min" : "";
  b.textContent = cap([planned, pm ? "took " + pm + " min" : "", phaseCount(p)].filter(Boolean).join(" \u00b7 "));
}
function drawPhase() {
  var ps = phases(), p = ps.filter(function (q) { return q.id === L.phase; })[0], box = $("#phasebox"), h = "";
    var nq = slidesOf(p).length, kd = kindOf(p.name), real2 = ps.filter(function (q) { return !q.sys; });
    h += '<div class="head" style="align-items:center"><div class="stack s2"><div class="tags">' + tag("Part " + (real2.indexOf(p) + 1)) + (kd ? tag(esc(kd), kd === "If time" ? "dash" : "line") : "") + (p.start != null ? tag(p.start + " to " + p.end + " min", "num") : "") + '</div><h2 class="t-title" style="font-size:28px">' + esc(partTitle(p.name)) + '</h2></div>' + (nq ? '<button class="btn accent-soft" type="button" data-show="*">Show him all ' + nq + '</button>' : "") + '</div>';
    if (p.show) h += '<div class="screen"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg><div class="stack" style="gap:2px"><span class="lab">On his screen</span><div>' + clean(p.show) + '</div></div></div>';
    h += blocks(p.blocks || []);
    var i = ps.indexOf(p), nx = ps[i + 1]; if (nx) h += '<div class="row" style="justify-content:flex-end"><button class="btn accent" type="button" data-phase="' + esc(nx.id) + '" data-real="' + (nx.sys ? "" : "1") + '">Next: ' + esc(nx.sys ? nx.name : partTitle(nx.name)) + ' <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button></div>';
  box.innerHTML = h; fillRows(box); loadImages(box); maths(box); drawTally();
}
function focusTable(rows) { return '<div class="card" style="margin-top:var(--s4);overflow-x:auto"><table class="tbl"><thead><tr><th>Pick your focus</th><th>Spend the time on</th><th>Cut down</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td><b>' + clean(r.want) + '</b></td><td>' + clean(r.spend) + '</td><td>' + clean(r.cut) + '</td></tr>'; }).join("") + '</tbody></table></div>'; }
document.addEventListener("click", function (e) { if (!(e.target.closest && e.target.closest("[data-focus]"))) return; var b = $("#focusbox"); if (b) b.hidden = !b.hidden; });
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
function usedOrDone(it) { if (it.kind === "q") { var a = L.session.answers[it.k]; return !!(a && asked(a.v)); } return isDone(it.k); }
function phaseCount(p) { var its = phaseItems(p).filter(function (i) { return i.kind !== "module"; }); var d = its.filter(usedOrDone).length; return its.length ? d + " of " + its.length + " taught" : ""; }
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
var STEPTAG = { ask: "ask", check: "ok", draw: "bad", say: "chem", show: "maths" };
function block(b) {
  switch (b.type) {
    case "text": var gr = gradeRows(clean(b.html)); if (gr.rows.length) return '<div class="prose">' + gr.html + '</div>';
      if (plain(b.html).length <= 40) return '<div class="prose">' + clean(b.html) + '</div>';
      var tk = textKey(b.html); return '<div class="prose tickable' + (isDone(tk) ? " done" : "") + '" data-tk="' + esc(tk) + '">' + tick_(tk, plain(b.html)) + clean(b.html) + '</div>';
    case "steps": return '<div class="steps">' + (b.items || []).map(function (s) { var k = s.kind || "do", sk = stepKey(s.html); return '<div class="step ' + esc(k) + (isDone(sk) ? " done" : "") + '" data-tk="' + esc(sk) + '"><span class="tag ' + (STEPTAG[k] || "") + '">' + (KIND[k] || esc(cap(k))) + '</span><div class="body prose">' + clean(s.html) + '</div>' + tick_(sk, plain(s.html)) + '</div>'; }).join("") + '</div>';
    case "module": var mk = modKey(b.name), deep = b.level === "deep";
      return '<details class="module' + (deep ? " deep" : "") + (isDone(mk) ? " done" : "") + '" data-tk="' + esc(mk) + '"' + (deep ? "" : " open") + '><summary>' + tag(deep ? "If time" : "Core", deep ? "dash" : "line") + '<h3 class="t-card">' + esc(b.name) + '</h3>' + (b.minutes ? '<span class="tag push num">' + esc(b.minutes) + ' min</span>' : '<span class="push"></span>') + tick_(mk, b.name) + '</summary><div class="mbody">' + blocks(b.blocks) + '</div></details>';
    case "figure": return b.img ? img(b.img, b.caption).replace("</figure>", (b.caption ? '<figcaption>' + clean(b.caption) + '</figcaption>' : "") + '</figure>') : '<figure class="fig">' + clean(b.html) + '</figure>';
    case "reveal": return '<details class="fold"><summary>' + esc(cap(b.label || "Answer")) + '</summary><div class="prose">' + clean(b.html) + (b.img || []).map(function (i) { return img(i); }).join("") + '</div></details>';
    case "drill": return '<div class="stack s3"><span class="lab">' + esc(cap(b.title || "Quick-fire drill")) + '</span><div class="items">' + (b.items || []).map(function (d, i) { var dk = drillKey(d[0]), a = L.session.answers[dk] || {}; return '<div class="item" data-v="' + esc(a.v || "") + '"><span class="qn">' + (i + 1) + '</span><div><div>' + clean(d[0]) + '</div><details><summary class="linkbtn">Answer</summary><div class="da prose">' + clean(d[1]) + '</div></details></div>' + ctl(dk, null, a, plain(d[0])) + '</div>'; }).join("") + '</div></div>';
    case "video": return videoBlock(b);
    case "quiz": return quizBlock(b);
    case "question": return questionBlock(b);
    case "piece": var pk = cvPcKind(b); return '<div class="pcprev">' + tag("Canvas") + tag(esc(cap(pk)), "line") + (b.img ? img(b.img, b.alt || b.caption) : '<div class="prose">' + (pk === "heading" ? '<b>' + esc(titleCase(b.text || plain(b.html))) + '</b>' : b.tex ? "\\[" + esc(b.tex) + "\\]" : clean(b.html || esc(b.text || ""))) + '</div>') + '</div>';
    default: return b.html ? '<div class="prose">' + clean(b.html) + '</div>' : "";
  }
}
/* YouTube, embedded; "moments" jump the player to a point ("4:32 KCN mechanism") */
function secsOf(t) { if (typeof t === "number") return t; var p = String(t || "0").split(":").map(Number); return p.reduce(function (a, b) { return a * 60 + b; }, 0); }
function vsrc(id, start, auto) { return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?rel=0&modestbranding=1&start=" + secsOf(start) + (auto ? "&autoplay=1" : ""); }
/* a video made for the lesson (Manim explainers): {type:"video", src:"videos/manim/x.mp4" or "assets/x.mp4", title, moments}.
   Read from the data repo like a picture; plays here and, as its own item, in the Student view. */
function vidKey(b) { return "v:" + b.src; }
function vidPath(p) { return /^(students|books|boards|videos)\//.test(p) ? p : lessonBase(L.id) + p; }
function localVideo(b, big) {
  return '<video class="lvid' + (big ? " big" : "") + '" controls playsinline preload="metadata" data-vsrc="' + esc(b.src) + '" data-vk="' + esc(vidKey(b)) + '"></video><span class="ph vph">Loading the video\u2026</span>'; }
function loadVideos(root) { $$("video[data-vsrc]:not([data-on])", root).forEach(function (v) { v.setAttribute("data-on", "1"); var ph = v.nextElementSibling;
  fileURL(vidPath(v.getAttribute("data-vsrc"))).then(function (u) { if (u) { v.src = u; if (ph && ph.classList.contains("vph")) ph.remove(); } else if (ph) ph.textContent = "Video not found: " + v.getAttribute("data-vsrc"); })
    .catch(function () { v.removeAttribute("data-on"); if (ph) ph.textContent = "Couldn\u2019t load the video. Reopen the lesson to retry."; }); }); }
function videoBlock(b) {
  var id = String(b.id || "").replace(/[^A-Za-z0-9_-]/g, ""), key = b.src ? vidKey(b) : "yt:" + id;
  var player = b.src ? '<div class="vframe local">' + localVideo(b) + '</div>' : '<div class="vframe"><iframe loading="lazy" data-vid="' + id + '" data-lazysrc="' + vsrc(id, b.start || 0) + '" title="' + esc(b.title || "Video") + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
  var moments = (b.moments || []).length ? '<div class="tags">' + b.moments.map(function (m) { return '<button class="chip" type="button" ' + (b.src ? 'data-lseek="' + esc(vidKey(b)) + '"' : 'data-seek="' + id + '"') + ' data-t="' + esc(m.t) + '">' + esc(m.t) + ' · ' + esc(cap(m.label || "")) + '</button>'; }).join("") + '</div>' : "";
  return '<section class="card vblock"><div class="row" style="padding:var(--s4) var(--s5)">' + tag("Video", "line") + '<div class="stack" style="gap:0;flex:1;min-width:200px"><b style="font-weight:600">' + esc(cap(b.title || "")) + '</b><span class="hint">' + esc(b.src ? "Made for this lesson" : cap(b.channel || "YouTube")) + '</span></div>' +
    '<button class="btn sm" type="button" data-vplay="' + esc(key) + '">Play here</button>' + (b.src ? '<button class="btn sm" type="button" data-show="' + esc(vidKey(b)) + '">Show him</button>' : "") + '</div>' +
    '<div class="vbody stack s3" hidden>' + player + moments + (b.note ? '<div class="prose hint">' + clean(b.note) + '</div>' : "") + '</div></section>';
}
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-vplay]"); if (!b) return; var box = b.closest(".vblock").querySelector(".vbody"); box.hidden = !box.hidden; b.textContent = box.hidden ? "Play here" : "Hide";
  var fr = box.querySelector("iframe[data-lazysrc]"); if (fr && !box.hidden && !fr.src) fr.src = fr.getAttribute("data-lazysrc"); if (!box.hidden) loadVideos(box); });
function ctl(id, marks, a, qtext) {
  a = a || L.session.answers[id] || {};
  return '<div class="ctl" data-item="' + esc(id) + '"' + (qtext ? ' data-q="' + esc(String(qtext).slice(0, 160)) + '"' : "") + '><div class="verdicts">' + VERD.map(function (v) { return '<button class="v" type="button" data-v="' + v[0] + '" title="' + esc(cap(VHELP[v[0]])) + '" aria-pressed="' + (a.v === v[0]) + '">' + v[1] + '</button>'; }).join("") +
    (marks ? '<span class="row s2"><input class="input mk" type="number" min="0" max="' + esc(marks) + '" step="0.5" inputmode="decimal" aria-label="Marks out of ' + esc(marks) + '" data-mk value="' + (a.m != null ? esc(a.m) : "") + '"><span class="hint num">/ ' + esc(marks) + ' marks</span></span>' : "") + '</div>' +
    '<input class="input note" type="text" data-note aria-label="What he said or got wrong" placeholder="What he said or got wrong" value="' + esc(a.note || "") + '"></div>';
}
function quizBlock(b) {
  var items = b.items || [], hasStar = items.some(function (i) { return i.star; });
  var f = L.filter || (hasStar ? "star" : "all"); L.filter = f;
  var topics = {}; items.forEach(function (i) { if (i.topic) topics[i.topic] = 1; });
  var chips = (hasStar ? [["star", "★ Suggested"]] : []).concat([["all", "All " + items.length], ["recall", "Recall"], ["reason", "Reasoning"], ["draw", "Drawing"]]).concat(Object.keys(topics).map(function (t) { return ["t:" + t, t.charAt(0).toUpperCase() + t.slice(1)]; }));
  return pageTags(items) + '<div class="qbar" role="group" aria-label="Filter questions">' + chips.map(function (c) { return '<button class="chip" type="button" data-qf="' + esc(c[0]) + '" aria-pressed="' + (f === c[0]) + '">' + esc(c[1]) + '</button>'; }).join("") + '</div>' +
    '<div class="items">' + items.map(function (it, i) {
      var a = L.session.answers[it.id] || {}, show = f === "all" || (f === "star" && it.star) || f === it.kind || ("t:" + it.topic) === f;
      return '<div class="item" data-v="' + esc(a.v || "") + '"' + (show ? "" : " hidden") + '><span class="qn">' + (i + 1) + '</span><div><div class="tags">' + (it.page ? '<span class="pill">' + esc(it.page) + '</span>' : "") + (it.kind ? '<span class="pill">' + esc({ recall: "Recall", reason: "Reason", draw: "Draw" }[it.kind] || it.kind) + '</span>' : "") + (it.star ? '<span class="pill warn">★</span>' : "") + '</div><div>' + clean(it.q) + '</div><button class="linkbtn" type="button" data-ans>Show answer</button><div class="qa prose" hidden>' + clean(it.a) + '</div></div>' + ctl(it.id) + '</div>';
    }).join("") + '</div>';
}
function questionBlock(q, big) {
  var paper = q.source && /edexcel|solomon|maths genie|pearson/i.test(q.source) || (L.script || {}).subject === "maths" ? "q-edexcel" : "q-aqa";
  var h = '<div class="qcard"><div class="row">' + tag("Question", "line") + (q.source ? refTag(q.source) : tag(esc(q.label || ""), "line")) + '<span class="row push" style="gap:var(--s2)">' + camBtn(q, true) + (!q.board && ((q.img || []).length || (q.parts || []).length) ? '<button class="btn sm" type="button" data-show="' + esc(q.id) + '">Show him</button>' : "") + '</span></div>' +
    (q.html || (q.parts && !big) || (q.img || []).length ? '<div class="card qbody ' + paper + '">' + (q.html ? '<div class="prose">' + clean(q.html) + '</div>' : "") + (q.parts && !big ? twinHTML(q) : "") + (q.board ? boardCanvas(q.board, Math.max(0, LINES[L.id + "|" + q.board.id] || 0), true) : (q.img || []).map(function (i) { return img(i, q.label); }).join("")) + '</div>' : "");
  if (q.answer || (q.answerImg || []).length) h += '<details class="fold reveal"><summary>Mark scheme</summary><div class="prose">' + clean(q.answer || "") + (q.answerImg || []).map(function (i) { return img(i, "Mark scheme"); }).join("") + '</div></details>';
  var a = L.session.answers[q.id] || {};
  if (big) return h + ctlBig(q.id, a, q.label, q.marks) + '</div>';
  return h + '<div class="stack s3 qmark" data-v="' + esc(a.v || "") + '"><span class="lab">How he did</span>' + ctl(q.id, q.marks) + '</div></div>';
}
function drawTally() {
  var old = $("#tally"); if (old) old.remove(); var box = $("#phasebox"); if (!box || L.phase === "_after" || L.phase === "_time") return;
  var c = { right: 0, wrong: 0, wording: 0, terminology: 0, partly: 0 }, n = 0;
  Object.keys(L.session.answers).forEach(function (k) { if (k.indexOf("~") > 0) return; var v = L.session.answers[k].v; if (c[v] != null) { c[v]++; n++; } });
  L.session.extra.forEach(function (e) { if (c[e.v] != null) { c[e.v]++; n++; } });
  var d = document.createElement("div"); d.className = "tally"; d.id = "tally";
  d.innerHTML = n ? '<b>' + c.right + ' / ' + n + '</b><span>right</span><span>✗ ' + c.wrong + '</span><span>wording ' + c.wording + '</span><span>terminology ' + c.terminology + '</span><span>partly ' + c.partly + '</span>' : '<span>Tap a verdict on each answer. Tap it again to undo. Everything saves as you go.</span>';
  box.appendChild(d);
}
function showImg(im) { var p = im.getAttribute("data-src"); if (!p || im.getAttribute("data-on")) return; im.setAttribute("data-on", "1"); var full = /^(students|books|boards)\//.test(p) ? p : lessonBase(L.id) + p;
  fileURL(full).then(function (u) { var ph = im.nextElementSibling; if (u) { im.decoding = "async"; im.src = u; im.hidden = false; if (ph && ph.classList.contains("ph")) ph.remove(); } else if (ph) ph.textContent = "Image not found: " + p; })
    .catch(function () { im.removeAttribute("data-on"); var ph = im.nextElementSibling; if (ph) ph.textContent = "Couldn’t load image. Tap to retry."; }); }
var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); showImg(e.target.__img || e.target); } }); }, { rootMargin: "900px 0px" }) : null;
function loadImages(root) { loadVideos(root); $$("img[data-src]:not([data-on])", root).forEach(function (im) { var ph = im.nextElementSibling; var tgt = ph && ph.classList.contains("ph") ? ph : im; if (io) { tgt.__img = im; io.observe(tgt); } else showImg(im); }); }
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-warmup")) { openWarmup(); return; }
  if (t.id === "wux") { var o = $("#wuov"); if (o) o.remove(); if (MODE === "teach") warmCount(); } });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var o = $("#wuov"); if (o) o.remove(); } });
document.addEventListener("toggle", function (e) { if (e.target.open) loadImages(e.target); }, true);
document.addEventListener("click", function (e) { var ph = e.target.closest && e.target.closest(".ph"); if (ph && ph.previousElementSibling && ph.previousElementSibling.tagName === "IMG") showImg(ph.previousElementSibling); });
/* after a lesson opens (Plan, Teach or Student), quietly fill the device cache with its pictures (not the folded-away
   DEEP extras), including pictures inside answers; in Teach the next few screens' pictures jump the queue */
var prefetchFor = null, pfQ = [], pfRun = 0;
function picsIn(v, deep, out) { out = out || []; if (!v) return out;
  if (typeof v === "string") { var m, re = /data-src="([^"]+)"/g; while ((m = re.exec(v))) out.push(m[1]); return out; }
  if (Array.isArray(v)) { v.forEach(function (x) { picsIn(x, deep, out); }); return out; } if (typeof v !== "object") return out;
  var d = deep || v.level === "deep"; if (d) return out;
  ["img", "answerImg"].forEach(function (k) { var x = v[k]; (Array.isArray(x) ? x : x ? [x] : []).forEach(function (pth) { if (typeof pth === "string") out.push(pth); }); });
  Object.keys(v).forEach(function (k) { if (k !== "img" && k !== "answerImg") picsIn(v[k], d, out); }); return out; }
/* from the home page: the next lesson in each subject gets its pictures fetched in the background,
   so Teach opens with them already on the device */
var warmed = {};
function warmUpNext(items) { var t = todayIso(), bySubj = {};
  items.filter(function (it) { return it.s && dateOf(it) >= addDays(t, -3) && !(it.x && it.x.status === "finished"); })
    .sort(function (a, b) { return dateOf(a).localeCompare(dateOf(b)); })
    .forEach(function (it) { var sj = subjOf(it); if (!bySubj[sj]) bySubj[sj] = it; });
  Object.keys(bySubj).forEach(function (sj) { var it = bySubj[sj]; if (warmed[it.id]) return; warmed[it.id] = 1;
    picsIn(it.s.phases || it.s, false).forEach(function (p) { p = /^(students|books|boards)\//.test(p) ? p : lessonBase(it.id) + p; if (pfQ.indexOf(p) < 0) pfQ.push(p); }); });
  setTimeout(pfPump, 1500); }
function pfPath(p) { return /^(students|books|boards)\//.test(p) ? p : lessonBase(L.id) + p; }
function pfPump() { while (pfRun < 4 && pfQ.length) { var p = pfQ.shift(), sha = shaOf(p); if (!sha) continue; pfRun++; blobBytes(sha).catch(function () {}).then(function () { pfRun--; pfPump(); }); } }
function prefetchLesson() { if (!L || !L.script || prefetchFor === L.id) return; prefetchFor = L.id;
  picsIn(L.script.phases || L.script, false).forEach(function (p) { p = pfPath(p); if (pfQ.indexOf(p) < 0) pfQ.push(p); }); setTimeout(pfPump, 600); }
function prefetchAhead(chunks) { var first = [];
  chunks.forEach(function (c) { if (c) picsIn([c.b, c.it, c.d, c.hints], false).forEach(function (p) { p = pfPath(p); if (first.indexOf(p) < 0) first.push(p); }); });
  pfQ = first.concat(pfQ.filter(function (p) { return first.indexOf(p) < 0; })); pfPump(); }

/* extra questions: asked on the spot, editable any time */
/* the lesson's own pages (Ali, 8 Oct, from the canvas): a crumb back to the plan, tags, a title, then the page */
function sysPage(id) { return id === "_extra" ? extraView() : id === "_work" ? workView() : id === "_time" ? timeView() : id === "_after" ? afterView() : reviseLesson(); }
function pageHead(title, hint, right) { var s = L.script || {}, x = L.session, subj = s.subject || x.subject, first = phases()[0];
  return '<header class="stack s3"><div class="crumb"><button type="button" data-phase="' + esc(first.id) + '" data-real="">' + esc(lessonTitle(s, x)) + '</button><span aria-hidden="true">/</span><span>' + esc(title) + '</span></div>' +
    '<div class="head"><div class="stack s2"><div class="tags">' + subjTag(subj) + tag(esc(fmtDate(x.date || s.date))) + topicTag(s) + '</div><h1 class="t-title">' + esc(titleCase(title)) + '</h1>' + (hint ? '<span class="hint">' + hint + '</span>' : "") + '</div>' + (right || "") + '</div></header>'; }
function reviseLesson() { return pageHead("Mistakes warm-up", "His old mistakes, back on day 1, 3, 7, 14 and 30 until he gets them right.", '<div id="revseg"></div>') + '<div class="tags" id="revtags"></div><div id="revbox" class="stack s5" style="max-width:840px"></div>'; }
function extraView() {
  var x = L.session;
  var h = pageHead("Extra questions", "Anything you asked that isn’t in the script. Wrong ones go into his mistakes.");
  h += '<form class="card pad-l stack s5" id="exform" style="max-width:860px"><div class="field"><label for="ex-q">Question you asked</label><input class="input" type="text" id="ex-q" required placeholder="e.g. Why is propanone’s product not chiral?"></div>' +
    '<div class="field"><span class="fl">How he did</span><div class="verdicts" role="group" aria-label="How he did">' + VERD.filter(function (v) { return v[0] !== "tskip"; }).map(function (v) { return '<button class="v" type="button" data-exv="' + v[0] + '" aria-pressed="false">' + v[1] + '</button>'; }).join("") + '</div></div>' +
    '<div class="field"><label for="ex-note">What he said or got wrong</label><input class="input" type="text" id="ex-note"></div><div><button class="btn pri" type="submit">Add</button></div></form>';
  h += x.extra.length ? '<section class="stack" style="max-width:860px"><div class="head" style="align-items:baseline"><h2 class="t-sec">Asked so far</h2>' + tag(x.extra.length + " logged") + '</div><div class="items">' + x.extra.map(function (e, i) { return '<div class="item" data-v="' + esc(e.v || "") + '"><span class="qn">' + (i + 1) + '</span><div class="row" style="flex-wrap:nowrap"><input class="input" style="font-weight:600" type="text" data-exq="' + esc(e.id) + '" value="' + esc(e.q) + '" aria-label="Question">' + tag(esc(hhmm(e.at))) + '<button class="btn sm danger" type="button" data-exdel="' + esc(e.id) + '">Remove</button></div>' + ctl("x:" + e.id, null, e) + '</div>'; }).join("") + '</div></section>'
    : '<section class="empty" style="max-width:860px"><b class="t-card">None yet</b><span class="hint">Each one shows here with the time. Wrong ones go into his mistakes.</span></section>';
  return h;
}
/* photos of his work */
var CAMIC = '<svg class="icon lg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2"></rect><circle cx="12" cy="12.5" r="3.5"></circle><path d="M8 5l1.5-2h5L16 5"></path></svg>';
function workView() {
  var x = L.session, items = itemsList(), live = x.work.filter(function (w) { return !w.removed; }), m = L.marking;
  var h = pageHead("His work", "", '<div class="tags">' + tag("Goes to GitHub") + tag("Auto-checker marks it") + '</div>');
  h += '<div class="split"><form class="card pad-l stack s5" id="wkform" style="flex:1 1 360px;max-width:420px"><label for="wk-files" class="drop"><span class="cam">' + CAMIC + '</span><b>Take a photo, choose files or paste</b><span class="tags" style="justify-content:center">' + tag("Photos") + tag("PDFs") + tag("Ctrl+V") + tag("Many pages at once") + '</span><span class="hint" id="wk-pick"></span>' +
    '<input id="wk-files" class="sr" type="file" accept="image/*,application/pdf" multiple required></label>' +
    '<div class="field"><label for="wk-item">Which question?</label><select class="input" id="wk-item"><option value="">Whole lesson or several questions</option>' + items.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.label) + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label for="wk-kind">What is it?</label><select class="input" id="wk-kind"><option value="class">Working in the lesson</option><option value="homework">Homework</option><option value="test">Test</option><option value="other">Other</option></select></div>' +
    '<div class="field"><label for="wk-note">Note for the auto-checker <span class="hint" style="font-weight:400">(optional)</span></label><input class="input" type="text" id="wk-note" placeholder="e.g. Page 2 is blurry"></div><div class="row"><button class="btn pri" type="submit" id="wk-go">Upload</button><span class="hint" id="wk-st"></span></div></form>';
  h += '<section class="grow stack"><div class="head" style="align-items:baseline"><h2 class="t-sec">Uploaded</h2><span class="hint">' + (live.length ? "Tap a photo to zoom" : "") + '</span></div>' +
    (live.length ? '<div class="shots">' + live.map(function (w) { return '<div class="stack s2">' + (/\.pdf$/i.test(w.file) ? '<div class="ph" style="aspect-ratio:3/4;border:1px solid var(--line)">PDF</div>' : '<figure class="fig"><img data-src="' + esc(w.file) + '" alt="His work" hidden style="width:100%;aspect-ratio:3/4;object-fit:cover"><div class="ph" style="aspect-ratio:3/4;border:1px solid var(--line)">Loading</div></figure>') +
      '<div class="tags">' + tag(esc(labelOf(w.item) || "Whole lesson"), "line") + tag(esc(hhmm(w.at))) + (w.kind && w.kind !== "class" ? tag(esc(cap(w.kind))) : "") + '<button class="btn sm quiet" type="button" data-wkdel="' + esc(w.file) + '">Remove</button></div>' + (w.note ? '<span class="hint">' + esc(w.note) + '</span>' : "") + '</div>'; }).join("") + '</div>'
      : '<div class="empty" style="padding:var(--s6) var(--s5)"><b class="t-card">No photos yet</b><span class="hint">Upload his answers. The auto-checker reads each one and marks it against the real mark scheme.</span></div>');
  h += m ? '<div class="card pad stack s3"><div class="row"><span class="lab">Auto-checker’s marking</span>' + (m.score != null ? tag(esc(m.score) + "/" + esc(m.max) + " marks", "ok") : "") + '</div>' + (m.summary ? '<p>' + clean(m.summary) + '</p>' : "") + (m.mistakes || []).map(function (k) { var vt = VTAG[k.type] || ["", ""];
      return '<div class="mrow" style="padding:var(--s3) 0"><span class="edge" style="background:' + (VCOL[k.type] || "var(--line-strong)") + '"></span><div class="tags">' + (k.type ? tag(vt[0], vt[1]) : "") + tag(esc(labelOf(k.item) || k.item || ""), "line") + '</div><p>' + clean(k.what || "") + '</p>' + (k.fix ? '<p class="fix"><b>Fix</b> · ' + clean(k.fix) + '</p>' : "") + '</div>'; }).join("") + '</div>'
    : '<div class="empty" style="padding:var(--s6) var(--s5)"><b>Auto-checker’s marking</b><span class="hint">Shows here after the auto-checker reads the photos: each question, the mark and what to fix.</span></div>';
  return h + '</section></div>';
}
function itemsList() { var out = [];
  phases().forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "question") out.push({ id: b.id, label: b.label || b.id }); if (b.type === "quiz") (b.items || []).forEach(function (q, i) { out.push({ id: q.id, label: "Quiz " + (i + 1) + ": " + String(q.q).replace(/<[^>]+>/g, "").slice(0, 60) }); }); if (b.blocks) walk(b.blocks); }); })(p.blocks); });
  L.session.extra.forEach(function (e, i) { out.push({ id: "x:" + e.id, label: "Extra " + (i + 1) + ": " + e.q.slice(0, 60) }); }); return out; }
function labelOf(id) { if (!id) return ""; var a = L.session.answers[id]; if (a && a.q && (/^[dr]:/.test(id) || id.indexOf("~") > 0)) return a.q; var f = itemsList().filter(function (i) { return i.id === id; })[0]; return f ? f.label : id; }

/* times: everything editable, including undoing "End lesson" */
function tval(iso) { return iso ? hhmm(iso) : ""; }
function timeFields(x, withDate) { var t = x.time, ed = t.edit || {}, a = t.auto || {}, r = replay(t.log);
  return '<div class="cols3">' + (withDate ? '<div class="field"><label for="tm-date">Date</label><input class="input" type="date" id="tm-date" data-tm="date" value="' + esc(x.date || parseId(L.id).date) + '"></div>' : "") +
    '<div class="field"><label for="tm-s">Started</label><input class="input" type="time" id="tm-s" data-tm="started" value="' + esc(tval(ed.started || a.started)) + '"><span class="hint">' + (a.started ? "Clock: " + esc(tval(a.started)) : "Clock not started. Type a time.") + '</span></div>' +
    '<div class="field"><label for="tm-e">Ended</label><input class="input" type="time" id="tm-e" data-tm="ended" value="' + esc(tval(ed.ended || a.ended)) + '"><span class="hint">' + (a.ended ? "Clock: " + esc(tval(a.ended)) : r.running ? "Clock still running" : "Not ended. Type a time.") + '</span></div>' +
    '<div class="field"><label for="tm-m">Minutes taught</label><input class="input" type="number" id="tm-m" data-tm="minutes" min="0" step="1" inputmode="numeric" value="' + esc(ed.minutes != null ? ed.minutes : t.minutes != null ? t.minutes : "") + '"><span class="hint">Counted: <b id="tm-now">' + esc(t.minutes != null ? t.minutes : "-") + '</b></span></div></div>'; }
function timeView() {
  var x = L.session, t = x.time, ed = t.edit || {}, a = t.auto || {}, ended = t.log.length && t.log[t.log.length - 1].e === "end";
  var h = pageHead("Part times", "Change anything. Leave a box empty to use the clock’s time.");
  h += '<div class="card pad-l stack s5" style="max-width:860px">' + timeFields(x, true);
  var real = phases().filter(function (p) { return !p.sys; });
  h += '<div class="field"><span class="fl">Minutes per part</span><div class="cols3">' + real.map(function (p) { var e = (ed.phaseMinutes || {})[p.id], k = kindOf(p.name); return '<div class="field"><label for="tp-' + esc(p.id) + '" class="row s2">' + (k ? tag(esc(k), "line") : "") + '<span>' + esc(partTitle(p.name)) + '</span></label><input class="input" type="number" id="tp-' + esc(p.id) + '" data-tp="' + esc(p.id) + '" min="0" step="0.5" inputmode="decimal" value="' + esc(e != null ? e : "") + '" placeholder="' + esc((a.phaseMinutes || {})[p.id] != null ? a.phaseMinutes[p.id] : "") + '"></div>'; }).join("") + '</div></div>';
  h += '<div class="row">' + (ended ? '<button class="btn" type="button" id="tm-undo">Undo “End lesson”</button>' : "") + '<button class="btn" type="button" id="tm-clear">Clear typed times</button><button class="btn danger" type="button" id="tm-reset">Reset the clock</button></div></div>';
  if (t.log.length) h += '<details class="fold" style="max-width:860px"><summary>Clock history (' + t.log.length + ' taps)</summary><div class="list">' + t.log.map(function (e, i) { var pn = e.p ? (phases().filter(function (p) { return p.id === e.p; })[0] || {}).name : "";
    return '<div class="row" style="padding:var(--s2) var(--s4)"><span class="num" style="min-width:3.5em">' + esc(hhmm(e.t)) + '</span><span>' + esc({ start: "Started", pause: "Paused", resume: "Resumed", phase: "Moved to", end: "Ended" }[e.e] || cap(e.e)) + (pn ? " · " + esc(pn) : "") + '</span><span class="hint">' + esc(cap(e.d || "")) + '</span><button class="btn sm danger push" type="button" data-logdel="' + i + '">Delete</button></div>'; }).join("") + '</div></details>';
  return h;
}
function timeEdited() { L.session.time.editAt = now(); touch(); var el = $("#tm-now"); if (el) el.textContent = L.session.time.minutes != null ? L.session.time.minutes : "-"; tick(); }

/* a normal lesson under 45 min (Ali, 6 Oct): on Finish the app asks whose doing it was.
   Ali's: the minutes short go on the make-up time (makeupSum reads session.short). The student's: nothing is added. */
function shortMin(x) { var m = Math.round(+(x.time && x.time.minutes) || 0); return !x.makeup && m > 0 && m < LESSON_MIN ? LESSON_MIN - m : 0; }
function shortBy(x) { return !shortMin(x) ? null : x.short && x.short.by ? x.short.by : undefined; }
function shortAsk(f, x) { var n = shortMin(x), old = $(".shortask", f); if (old) old.remove();
  var box = document.createElement("div"); box.className = "shortask";
  box.innerHTML = '<b>This lesson ran ' + (LESSON_MIN - n) + ' min, ' + n + ' short of ' + LESSON_MIN + '. Why?</b><div class="row"><button class="btn" type="button" data-short="ali">I cut it short: add ' + n + ' min to make-up</button><button class="btn" type="button" data-short="student">He cut it short: add nothing</button></div>';
  var btn = $("button[type=submit]", f); btn.parentNode.parentNode.insertBefore(box, btn.parentNode); box.scrollIntoView({ block: "center" }); }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-short]"); if (!b || !L) return; var f = b.closest("form");
  L.session.short = { by: b.getAttribute("data-short"), at: now() }; b.closest(".shortask").remove(); if (f) f.requestSubmit(); });
document.addEventListener("click", function (e) { if (!(e.target.closest && e.target.closest("[data-shortredo]")) || !L) return; L.session.short = null; touch(); drawLesson(); });
/* after the lesson */
function noteBox(v) { return '<textarea class="note fixnote" data-note rows="1" aria-label="Your note">' + esc(v) + '</textarea>'; }
function afterView() {
  var x = L.session, fb = x.feedback || {}, s = L.script || {}, sc = score(x);
  var cov = [], covTxt = [];
  phases().filter(function (p) { return !p.sys; }).forEach(function (p) { var its = phaseItems(p), mods = its.filter(function (i) { return i.kind === "module" && isDone(i.k); }).map(function (i) { return i.label; });
    var steps = its.filter(function (i) { return (i.kind === "step" || i.kind === "text") && isDone(i.k); }).length, qs = its.filter(function (i) { return i.kind === "q"; }), used = qs.filter(usedOrDone), right = used.filter(function (i) { return x.answers[i.k].v === "right"; });
    if (!mods.length && !steps && !used.length) return;
    var k = kindOf(p.name) || p.name, bits = [used.length ? used.length + " of " + qs.length + " asked" : "", steps ? steps + " point" + (steps > 1 ? "s" : "") + " ticked" : "", mods.length ? mods.length + " section" + (mods.length > 1 ? "s" : "") : ""].filter(Boolean);
    cov.push(tag(esc(k + (bits.length ? " · " + bits[0] : "")), "line"));
    covTxt.push(p.name + ": " + [mods.join(", "), steps ? steps + " points taught" : "", used.length ? used.length + " questions, " + right.length + " right" : ""].filter(Boolean).join(" · ")); });
  var wrong = [], stuckTxt = [], addW = function (lab, v, note) { if (!(asked(v) && v !== "right" && v !== "skipped")) return; var vt = VTAG[v] || [v, ""];
    stuckTxt.push(lab + " (" + VHELP[v] + ")" + (note ? ": " + note : ""));
    wrong.push('<div class="stack s2 newmk ' + esc(v) + '"><div class="tags">' + tag(vt[0], vt[1]) + '</div><span style="font-size:14px"><b>' + esc(lab) + '</b>' + (note ? ": " + esc(note) : "") + '</span></div>'); };
  Object.keys(x.answers).forEach(function (k) { var a = x.answers[k]; if (!a.parts) addW(labelOf(k), a.v, a.note); });
  x.extra.forEach(function (e) { addW(e.q, e.v, e.note); });
  var st = function (b, l, c) { return '<div class="stat" style="padding:var(--s4) 20px"><b style="font-size:24px' + (c ? ";color:" + c : "") + '">' + b + '</b><span class="hint">' + l + '</span></div>'; };
  var h = pageHead("After the lesson", "Read before the next script is drafted.", '<div class="row s2">' + st(x.time.minutes != null ? Math.round(x.time.minutes) + " min" : "-", "Taught") + st(sc.n ? sc.r + "/" + sc.n : "-", "Right") + st(wrong.length, "New mistakes", wrong.length ? "var(--wrong)" : "") + '</div>');
  var notes = Object.keys(x.answers).filter(function (k) { return x.answers[k].note; }).map(function (k) { var a = x.answers[k];
    return '<li data-item="' + esc(k) + '"><div class="tags"><b>' + esc(labelOf(k)) + '</b>' + (a.v && VTAG[a.v] ? tag(VTAG[a.v][0], VTAG[a.v][1]) : "") + '</div>' + noteBox(a.note) + '</li>'; })
    .concat(x.extra.filter(function (e) { return e.note; }).map(function (e) { return '<li data-item="x:' + esc(e.id) + '"><b>' + esc(e.q) + '</b>' + noteBox(e.note) + '</li>'; }));
  function fld(id, label, key, ph, area, def, extra) { var v = fb[key] != null ? fb[key] : (def || ""); return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (extra || "") + (area ? '<textarea class="input" style="min-height:72px" id="' + id + '" data-fb="' + key + '" placeholder="' + esc(ph || "") + '">' + esc(v) + '</textarea>' : '<input class="input" type="text" id="' + id + '" data-fb="' + key + '" value="' + esc(v) + '" placeholder="' + esc(ph || "") + '">') + '</div>'; }
  h += tapBanner() + '<div class="split"><form class="grow card pad-l stack s5" id="fbform">' +
    fld("fb-cov", "What you actually covered", "covered", "e.g. Got to 3c, skipped the NaBH₄ drill", true, covTxt.join("\n"), cov.length ? '<div class="tags">' + cov.join("") + '</div>' : "") +
    (fb.at ? "" : '<span class="hint" style="margin-top:-12px">Filled in from your ticks. Change anything.</span>') +
    fld("fb-stuck", "Where he got stuck", "stuck", "", true, stuckTxt.join("\n")) +
    '<div class="cols2">' + fld("fb-worked", "What worked", "worked", "", true) + fld("fb-change", "What to change next time", "change", "This shapes the next script", true) + fld("fb-hw", "Homework given", "hw", "", false, s.homeworkSummary) + fld("fb-pages", "Book pages to memorise", "pages", "e.g. CGP 172 to 173", false, s.pagesSet) + '</div>' +
    '<div class="field"><span class="fl">How did it go?</span><div class="row s2" role="group" aria-label="How did it go, 1 rough to 5 went really well">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="rate" type="button" data-rate="' + n + '" aria-pressed="' + (fb.rating === n) + '">' + n + '</button>'; }).join("") + '<span class="hint" style="margin-left:var(--s2)">1 rough · 5 went really well</span></div></div>' +
    '<div style="height:1px;background:var(--line)"></div><div class="stack"><span class="fl">Times</span>' + timeFields(x, false) +
    '<label class="check"><input type="checkbox" id="fb-makeup"' + (x.makeup ? " checked" : "") + '>Make-up lesson <span class="hint">All its minutes come off make-up owed</span></label>' +
    (shortBy(x) ? '<span class="hint">' + shortMin(x) + ' min short of ' + LESSON_MIN + ': ' + (shortBy(x) === "ali" ? "you cut it short, so " + shortMin(x) + " min went on make-up owed." : "he cut it short, so nothing was added.") + ' <button class="linkbtn" type="button" data-shortredo>Change</button></span>' : "") + '</div>' +
    '<div class="row"><button class="btn pri" type="submit">' + (x.status === "finished" ? "Save changes" : "Finish and save the lesson") + '</button><button class="btn quiet" type="button" data-phase="_time">Edit part times</button>' + (x.status === "finished" ? '<button class="btn" type="button" id="reopen">Reopen the lesson</button>' : "") + (fb.at ? tag("Saved " + esc(hhmm(fb.at)), "ok") : "") + '</div></form>' +
    '<aside class="side-col stack"><div class="card pad stack"><div class="row"><span class="lab">New mistakes</span>' + tag(wrong.length, wrong.length ? "bad push" : "push") + '</div>' + (wrong.length ? wrong.slice(0, 6).join("") + (wrong.length > 6 ? '<a class="link" href="#/record">See all (' + wrong.length + ')</a>' : "") : '<span class="hint">None. Every answer was right or not asked.</span>') + '</div>' +
    (notes.length ? '<div class="card pad stack s3" id="lessonnotes"><div class="row"><span class="lab">Your notes from the lesson</span>' + tag(notes.length, "push") + '</div><ul class="list-plain notes-list">' + notes.join("") + '</ul><span class="hint">Tap a note to correct it. It saves as you type.</span></div>' : "") + '</aside></div>';
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
function logEvent(e, p) { var t = now(); L.session.time.log.push({ t: t, e: e, p: p || undefined, d: CFG.device }); L.session.time.editAt = now(); clockState(e, t); touch(); }

/* ---------------- events ---------------- */
var armed = null;
document.addEventListener("click", function (ev) {
  var t = ev.target.closest("button,img"); if (!t) return;
  if (t.tagName === "IMG") { if (t.closest(".fig") || t.closest(".tfig") || t.closest(".thumbs")) { var box = t.closest(".chunk.cur, .page, #app") || document,
      all = $$(".fig img, .tfig img, .thumbs img", box).filter(function (i) { return i.src && !i.hidden; });
    openZoom(all.map(function (i) { return i.src; }), Math.max(0, all.indexOf(t))); } return; }
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
    if (MODE === "teach" && !PREP) { L.phase = id; location.hash = "#/lesson/" + encodeURIComponent(L.id); return; }
    if (t.getAttribute("data-real") && r.running && r.phase !== id) logEvent("phase", id);
    L.phase = id; drawLesson();
    /* a new part always starts at its top: jump up if we were scrolled past it */
    var pb = $("#phasebox"); if (pb) { var y = pb.getBoundingClientRect().top + window.scrollY - 12; if (window.innerWidth < 900 || window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: "instant" }); } return; }
  if (t.hasAttribute("data-nagoff")) { TCH.nagOff = true; var nb = t.closest(".clocknag"); if (nb) nb.remove(); return; }
  if (t.id === "clkgo" || t.hasAttribute("data-clkgo")) { var r2 = replay(x.time.log); var cur = phases().filter(function (p) { return p.id === L.phase && !p.sys; })[0];
    if (r2.running) logEvent("pause"); else { if (x.status === "finished") { x.status = "in-progress"; x.statusAt = now(); } logEvent(r2.secs ? "resume" : "start", cur ? cur.id : (r2.phase || phases()[0].id)); wake(); }
    drawLesson(); return; }
  if (t.id === "clkend") { logEvent("end"); drawLesson(); flush(); var nx = ckJSON("tutor.next");
    toast("Lesson ended." + (nx && nx.from === L.id ? " " + subjWord(nx.id) + " at " + hhmm(new Date(nx.at).toISOString()) + "." : "") + " Notes and times: After the lesson. Undo under Times."); return; }
  if (t.id === "tm-undo") { var lg = x.time.log; for (var i = lg.length - 1; i >= 0; i--) { if (lg[i].e === "end") { lg.splice(i, 1); break; } } timeEdited(); drawLesson(); toast("“End lesson” undone"); return; }
  if (t.id === "tm-clear") { x.time.edit = {}; timeEdited(); drawLesson(); return; }
  if (t.id === "tm-reset") { if (armed !== "reset") { armed = "reset"; t.textContent = "Tap again to reset the clock"; t.classList.add("confirm"); setTimeout(function () { if (armed === "reset") { armed = null; if (t.isConnected) { t.textContent = "Reset the clock"; t.classList.remove("confirm"); } } }, 4000); return; }
    armed = null; x.time.log = []; timeEdited(); drawLesson(); toast("Clock reset"); return; }
  if (t.hasAttribute("data-logdel")) { x.time.log.splice(+t.getAttribute("data-logdel"), 1); timeEdited(); drawLesson(); return; }
  if (t.id === "usecov") { var ta = $("#fb-cov"); if (ta) { ta.value = (ta.value ? ta.value + "\n" : "") + t.getAttribute("data-cov"); x.feedback.covered = ta.value; x.feedback.at = now(); touch(); } return; }
  if (t.id === "reopen") { x.status = "in-progress"; x.statusAt = now(); touch(); drawLesson(); return; }
  if (t.hasAttribute("data-qf")) { L.filter = t.getAttribute("data-qf"); ls(qfKey(), L.filter); if (MODE === "teach") drawTeach(); else drawPhase(); return; }
  if (t.hasAttribute("data-ans")) { var qa = t.parentNode.querySelector(".qa"); qa.hidden = !qa.hidden; t.textContent = qa.hidden ? "Show answer" : "Hide answer"; return; }
  if (t.hasAttribute("data-v") && !t.hasAttribute("data-rev") && PREP && MODE === "teach") return;
  if (t.hasAttribute("data-v") && !t.hasAttribute("data-rev") && previewing()) { noteTap(); CK.off = Math.max(CK.off, 3); if (!$("#ckask")) clockAsk("start", { retry: t }); else toast("Start the lesson first to record verdicts"); return; }
  if (t.hasAttribute("data-v") && !t.hasAttribute("data-rev") && MODE === "teach") noteTap();
  if (t.hasAttribute("data-v")) { var box = t.closest("[data-item]"), iid = box.getAttribute("data-item"), v = t.getAttribute("data-v"), a = target(iid);
    if (a.v === v && a.at && Date.now() - Date.parse(a.at) < 600) return;   // a nervous double tap keeps the mark
    if (v === "right" && box.classList.contains("vrail") && BOARD.jumped && Date.now() - BOARD.jumped < 450) return;   // a double tap on ✓ must not mark the question that just opened
    if (a.v === v) { var vw = VHELP[v] || v; toast(vw.charAt(0).toUpperCase() + vw.slice(1) + ": removed"); }
    a.v = a.v === v ? null : v; a.at = now(); a.d = CFG.device; if (box.getAttribute("data-q")) a.q = box.getAttribute("data-q"); save(iid, a); railCount();
    $$(".v", box).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === a.v)); }); var row = box.closest(".item, .qmark, tr[data-row]"); if (row) row.setAttribute("data-v", a.v || ""); drawTally();
    if (box.classList.contains("vrail")) { box.classList.toggle("has", asked_(a.v)); var vm = $(".vr-more", box); if (vm) vm.setAttribute("aria-pressed", String(a.v === "wording" || a.v === "terminology" || a.v === "skipped")); }
    if (MODE === "teach" && box.closest(".slider")) slMarked(iid, a);
    else if (MODE === "teach" && (box.closest(".board") || (box.classList.contains("vrail") && box.closest(".t-board")))) { if (a.v === "wrong" || a.v === "partly" || a.v === "terminology" || a.v === "wording") BOARD.near = iid; else if (a.v === "right") BOARD.open = BOARD.open === iid ? boardJump(iid) : BOARD.open; setTimeout(redrawBoard, a.v === "right" ? 350 : 0); if (a.v === "right") BOARD.jumped = Date.now() + 350; }
    var oc = MODE === "teach" && $(".outline .oc.cur"); if (oc && TCH.seq[TCH.pos]) oc.className = oc.className.replace(/\b[vs]-[a-z]+\b/g, "").trim() + " " + stateOf(TCH.seq[TCH.pos]); return; }
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
    if (t.hasAttribute("data-note")) a.note = t.value; else a.m = t.value === "" ? null : +t.value; a.at = now(); save(iid, a);
    if (t.hasAttribute("data-mk") && t.closest(".slider")) { slSum(SL.q); var tot = $(".chunk.cur .sl-tot"); if (tot) tot.textContent = slTotal(SL.q); } }
  if (t.hasAttribute("data-exq")) { var e = x.extra.filter(function (z) { return z.id === t.getAttribute("data-exq"); })[0]; if (e) { e.q = t.value; e.at = now(); touch(); } }
  if (t.hasAttribute("data-fb")) { x.feedback[t.getAttribute("data-fb")] = t.value; x.feedback.at = now(); touch(); }
  if (t.hasAttribute("data-tm")) { var k = t.getAttribute("data-tm"), ed = x.time.edit;
    if (k === "date") { x.date = t.value; }
    else if (k === "minutes") ed.minutes = t.value === "" ? null : +t.value;
    else { var d = x.date || parseId(L.id).date; ed[k] = t.value ? new Date(d + "T" + t.value).toISOString() : null; }
    timeEdited(); }
  if (t.hasAttribute("data-tp")) { var ed2 = x.time.edit; ed2.phaseMinutes = ed2.phaseMinutes || {}; ed2.phaseMinutes[t.getAttribute("data-tp")] = t.value === "" ? null : +t.value; timeEdited(); }
});
document.addEventListener("change", function (e) { if (e.target.hasAttribute && e.target.hasAttribute("data-fold")) { ls("tutor.fold." + e.target.getAttribute("data-fold"), e.target.checked ? "1" : "0"); toast("Saved on this device"); } });
document.addEventListener("change", function (e) { if (e.target.id !== "fb-makeup" || !L) return; L.session.makeup = e.target.checked; L.session.makeupAt = now(); touch(); toast(e.target.checked ? "Marked as a make-up lesson" : "Not a make-up lesson"); });
document.addEventListener("submit", function (ev) {
  ev.preventDefault(); var f = ev.target;
  if (f.id === "setform") { ls("tutor.token", $("#s-token").value.trim()); ls("tutor.repo", $("#s-repo").value.trim() || "alimuqaddasm/tutoring"); ls("tutor.device", $("#s-dev").value.trim() || "tablet"); ls("tutor.student", $("#s-stu").value.trim() || "UK-1");
    ls("tutor.examApi", $("#s-xapi").value.trim().replace(/\/+$/, "") || null); ls("tutor.examPw", $("#s-xpw").value || null);
    var nf = $("#s-font").value; if (nf !== (ls("tutor.font") || "jakarta")) { ls("tutor.font", nf); location.reload(); return; } TREE = null; nav(route()); testConnection().then(function () { if ($("#s-msg") && /\bok\b/.test($("#s-msg").className)) setTimeout(function () { location.hash = "#/"; }, 900); }); return; }
  if (f.id === "newform") { var id = $("#n-date").value + "-" + $("#n-subj").value;
    /* a lesson (with a script) already lives under this date and subject: open it, or log a separate one beside it */
    var taken = function (k) { return ls(localKey(k)) || (TREE && TREE.some(function (t) { return t.path.indexOf(lessonBase(k)) === 0; })); };
    if (taken(id)) { if (confirm("There is already a " + ($("#n-subj").value === "chem" ? "chemistry" : "maths") + " lesson on this date.\n\nOK: open that lesson.\nCancel: log a separate lesson.")) { location.hash = "#/lesson/" + encodeURIComponent(id); return; }
      for (var n = 2; taken(id + "-" + n); n++) {} id = id + "-" + n; }
    var sess = newSession(id, null); sess.title = $("#n-title").value.trim(); sess.subject = $("#n-subj").value; sess.date = $("#n-date").value; if ($("#n-makeup").checked) { sess.makeup = true; sess.makeupAt = now(); }
    ls(localKey(id), JSON.stringify({ session: sess, sha: null, dirty: true })); STARTCLOCK = NEWCLOCK ? id : null; location.hash = "#/lesson/" + encodeURIComponent(id) + (NEWCLOCK ? "/teach" : ""); return; }
  if (f.id === "tsform") return saveTest();
  if (!L) return; var x = L.session;
  if (f.id === "exform") { var q = $("#ex-q").value.trim(); if (!q) return; var sel = $("[data-exv][aria-pressed='true']");
    x.extra.push({ id: "x" + Date.now().toString(36), q: q, v: sel ? sel.getAttribute("data-exv") : null, note: $("#ex-note").value.trim(), at: now(), d: CFG.device }); touch(); drawLesson(); toast("Added"); return; }
  if (f.id === "fbform") { $$("[data-fb]", f).forEach(function (i) { x.feedback[i.getAttribute("data-fb")] = i.value; }); x.feedback.at = now();
    var fm = $("#fb-min", f); if (fm && +fm.value > 0) { x.time.edit = x.time.edit || {}; x.time.edit.minutes = +fm.value; finalizeTime(x); }
    if (replay(x.time.log).running) logEvent("end");
    if (shortBy(x) === undefined) { shortAsk(f, x); return; }
    x.status = "finished"; x.statusAt = now(); touch(); var mine = L;
    var lg0 = x.time.log, rr = ckJSON("tutor.running"); if (rr && rr.id === L.id) ckJSON("tutor.running", null); ckJSON("tutor.break", null);
    if (lg0.length && !ckJSON("tutor.next")) nextAfter(L.id, lg0[lg0.length - 1].t);   // finished while paused: maths still counts from when the clock stopped
    flush().then(function () { toast(TRY ? "Try-out: nothing was saved" : !mine.dirty ? "Lesson saved to GitHub" : navigator.onLine ? "Not saved yet: kept on this device, it retries by itself" : "Offline: kept on this device, it saves when you are back online"); if (L === mine) drawLesson(); }); return; }
  if (f.id === "wkform") uploadWork();
});
function closeZoom() { $("#zoom").hidden = true; $("#zimg").removeAttribute("src"); ZM = null; }
/* a zoomed picture with others beside it (book pages, boards): the arrow keys, or a swipe, move between them (Ali, 5 Oct) */
var ZM = null;
function openZoom(list, i) { ZM = { list: list, i: i }; zoomShow(); $("#zoom").hidden = false; }
function zoomShow() { if (!ZM) return; var v = ZM.list[ZM.i], n = $("#zoomn");
  (typeof v === "function" ? v() : Promise.resolve(v)).then(function (u) { if (u && ZM) $("#zimg").src = u; });
  if (!n) { n = document.createElement("span"); n.id = "zoomn"; n.className = "zoomn num"; $("#zoom").appendChild(n); }
  n.textContent = ZM.list.length > 1 ? (ZM.i + 1) + " / " + ZM.list.length + "  \u2190 \u2192" : ""; }
function zoomStep(d) { if (!ZM || $("#zoom").hidden) return false; var n = ZM.i + d; if (n < 0 || n >= ZM.list.length) return true; ZM.i = n; zoomShow(); return true; }
document.addEventListener("keydown", function (e) { if ($("#zoom").hidden || !ZM) return;
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); e.stopImmediatePropagation(); zoomStep(e.key === "ArrowRight" ? 1 : -1); } }, true);
(function () { var x0 = null, z = $("#zoom"); z.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  z.addEventListener("touchend", function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) zoomStep(dx < 0 ? 1 : -1); x0 = null; }); })();
$("#zoom").addEventListener("click", function (e) { if (e.target.id === "zoom") closeZoom(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeZoom(); });
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-lseek]"); if (!t) return; var v = $('video[data-vk="' + t.getAttribute("data-lseek") + '"]'); if (v) { v.currentTime = secsOf(t.getAttribute("data-t")); v.play().catch(function () {}); v.scrollIntoView({ block: "center", behavior: "smooth" }); } });
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
  var st = $("#wk-st"), go = $("#wk-go"); go.disabled = true;
  sendWork(files, $("#wk-item").value, $("#wk-kind").value, $("#wk-note").value.trim(), function (i, n) { st.textContent = "Uploading " + i + " of " + n + "…"; })
    .then(function () { go.disabled = false; st.textContent = ""; toast("Uploaded " + files.length + " file" + (files.length > 1 ? "s" : "")); flush(); drawLesson(); })
    .catch(function (e) { go.disabled = false; st.textContent = workErr(e); });
}
function workErr(e) { return e.tryout ? "Try-out mode: the photo is not saved." : (e.status ? "GitHub said " + e.status + ". " : "") + (e.message || "Upload failed") + " Try again."; }
/* each file to GitHub under the lesson's work/ folder, logged in session.work against one question (or the lesson) */
function sendWork(files, item, kind, note, prog, onSaved) {
  var base = lessonBase(L.id) + "work/" + new Date().toISOString().slice(0, 23).replace(/[-:]/g, "").replace("T", "-").replace(".", ""), i = 0;
  function next() { if (i >= files.length) return Promise.resolve();
    var f = files[i++]; if (prog) prog(i, files.length);
    return shrink(f).then(function (r) { var path = base + "-" + (item || "lesson").replace(/[^a-z0-9]+/gi, "") + "-" + i + "." + r.ext;
      return putB64(path, r.b64, CFG.student + " " + L.id + ": his work (" + CFG.device + ")").then(function () { L.session.work.push({ file: path, item: item || null, kind: kind, note: note, at: now(), d: CFG.device }); if (onSaved) onSaved(f, path); touch(); }); }).then(next); }
  return next();
}
/* the camera on a question (Ali, 16 Oct): only questions he solves from a past paper or a problem set, not boards from a video.
   Tap it, pick the photo he sent on WhatsApp, and it is saved to that question */
function camOK(b) { return b && b.type === "question" && !b.board && b.source && !/\bvideo\b/i.test(b.source); }
function camCount(id) { return L.session.work.filter(function (w) { return !w.removed && w.item === id; }).length; }
function camBtn(b, sm) { if (!camOK(b) || PREP) return ""; var n = camCount(b.id);
  return '<button class="btn' + (sm ? " sm" : "") + ' cambtn" type="button" data-cam="' + esc(b.id) + '" title="Add a photo of his work on this question">' + CAMIC.replace("icon lg", "icon") + (n ? n + (n > 1 ? " photos" : " photo") : "His work") + '</button>'; }
/* Ali, 21 Oct: the camera opens a small card on the button, so Teach stays where it is. Paste a photo (Ctrl+V), drop it or choose one;
   the card then shows the photos saved to that question, so he can see the right one went in */
var CAM = null, CAMURL = {};
function camThumbs(id) { var live = L.session.work.filter(function (w) { return !w.removed && w.item === id; });
  return live.length ? live.map(function (w) { var u = CAMURL[w.file];
    return '<span class="campic">' + (/\.pdf$/i.test(w.file) ? '<span class="ph">PDF</span>' : u ? '<img src="' + u + '" alt="Photo of his work">' : '<img data-src="' + esc(w.file) + '" alt="Photo of his work" hidden><span class="ph">Loading</span>') + '<span class="hint">' + esc(hhmm(w.at)) + '</span></span>'; }).join("")
    : '<span class="hint">No photos on this question yet</span>'; }
function camClose() { var el = $("#campop"); if (el) el.remove(); CAM = null; }
function camOpen(btn, id) {
  if (CAM === id && $("#campop")) { camClose(); return; } camClose(); if (!L) return;
  var q = findQ(id) || {}, el = document.createElement("div"); CAM = id;
  el.id = "campop"; el.className = "campop raised"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "His work: " + (q.label || id));
  el.innerHTML = '<div class="row"><span class="lab">His work</span>' + (q.source ? refTag(q.source) : tag(esc(q.label || id), "line")) + '<button class="btn sm quiet push" type="button" data-camx aria-label="Close">\u00d7</button></div>' +
    ((q.img || []).length ? '<div class="camq">' + img(q.img[0], q.label) + '</div>' : "") +
    '<div class="campaste" id="campaste" tabindex="0"><span class="cam">' + CAMIC.replace("icon lg", "icon") + '</span><b>Paste a photo here</b><span class="hint">Ctrl+V, or drop it on this box</span></div>' +
    '<div class="row"><button class="btn sm" type="button" data-camfile>Choose photo</button><span class="hint" id="camst" role="status"></span></div>' +
    '<div class="camshots" id="camshots">' + camThumbs(id) + '</div>';
  document.body.appendChild(el); camPlace(btn); loadImages(el);
  el.addEventListener("load", function () { var b = $('[data-cam="' + id + '"]'); if (b && CAM === id) camPlace(b); }, true);
  var box = $("#campaste"); box.focus({ preventScroll: true });
  box.addEventListener("dragover", function (e) { e.preventDefault(); box.classList.add("on"); });
  box.addEventListener("dragleave", function () { box.classList.remove("on"); });
  box.addEventListener("drop", function (e) { e.preventDefault(); box.classList.remove("on"); camSend(Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || [])); });
}
/* beside the button: above it when there is room (the button is usually low on the screen), never off the edge */
function camPlace(btn) { var el = $("#campop"); if (!el || !btn) return; var r = btn.getBoundingClientRect(), w = Math.min(380, innerWidth - 32), h = el.offsetHeight;
  el.style.width = w + "px"; el.style.left = Math.max(16, Math.min(r.right - w, innerWidth - w - 16)) + "px";
  el.style.top = (r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8)) + "px"; }
function camSend(files) { var q = CAM; files = files.filter(function (f) { return /^image\//.test(f.type) || /pdf$/i.test(f.type) || /\.(jpe?g|png|heic|webp|pdf)$/i.test(f.name || ""); });
  var st = $("#camst"); if (!files.length || !q || !L) { if (st) st.textContent = "No photo found: copy a photo, then paste."; return; }
  sendWork(files, q, "class", "", function (i, n) { if (st) st.textContent = "Saving " + i + " of " + n + "\u2026"; }, function (f, path) { if (!/pdf/i.test(f.type)) CAMURL[path] = URL.createObjectURL(f); })
    .then(function () { flush(); if (CAM === q) { $("#camst").textContent = (files.length > 1 ? files.length + " photos" : "Photo") + " saved " + hhmm(now()); $("#camshots").innerHTML = camThumbs(q); loadImages($("#camshots")); var cb = $('[data-cam="' + q + '"]'); if (cb) camPlace(cb); }
      $$('[data-cam="' + q + '"]').forEach(function (b) { b.outerHTML = camBtn(findQ(q), b.classList.contains("sm")); }); })
    .catch(function (e) { var s2 = $("#camst"); if (s2 && CAM === q) s2.textContent = workErr(e); else toast(workErr(e)); }); }
function camPick() { var inp = $("#camin"); if (!inp) { inp = document.createElement("input"); inp.type = "file"; inp.id = "camin"; inp.className = "sr"; inp.accept = "image/*,application/pdf"; inp.multiple = true; inp.tabIndex = -1; document.body.appendChild(inp);
    inp.addEventListener("change", function () { var files = Array.prototype.slice.call(inp.files || []); inp.value = ""; camSend(files); }); }
  inp.click(); }
function clipFiles(e) { var cd = e.clipboardData, out = []; if (!cd) return out;
  Array.prototype.forEach.call(cd.items || [], function (it) { if (it.kind === "file") { var f = it.getAsFile(); if (f) out.push(f); } });
  if (!out.length) out = Array.prototype.slice.call(cd.files || []); return out; }
document.addEventListener("paste", function (e) {
  if (CAM && $("#campop")) { var f = clipFiles(e); e.preventDefault(); camSend(f); return; }
  var inp = $("#wk-files"); if (!inp || /INPUT|TEXTAREA/.test((e.target || {}).tagName || "") && e.target.id !== "wk-files") return;
  var fs = clipFiles(e); if (!fs.length) return; e.preventDefault();
  try { var dt = new DataTransfer(); fs.forEach(function (f) { dt.items.add(f); }); inp.files = dt.files; } catch (x) { return; }
  inp.dispatchEvent(new Event("change", { bubbles: true })); });
document.addEventListener("click", function (e) { var pop = $("#campop"); if (!pop) return; var t = e.target;
  if (t.closest && t.closest("[data-camx]")) { camClose(); return; }
  if (t.closest && t.closest("[data-camfile]")) { camPick(); return; }
  if (!pop.contains(t) && !(t.closest && t.closest("[data-cam]")) && t.id !== "camin") camClose(); }, true);
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("#campop")) camClose(); });
window.addEventListener("resize", function () { var b = CAM && $('[data-cam="' + CAM + '"]'); if (b) camPlace(b); else camClose(); });
function findQ(id) { var hit = null; phases().forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "question" && b.id === id) hit = b; if (b.blocks) walk(b.blocks); }); })(p.blocks); }); return hit; }

/* ---------------- record ---------------- */
function recordView() {
  var sb = studentBase(), REC = { sj: "all", all: false };
  function head() { return '<header class="stack s2"><h1 class="t-page">' + esc(CFG.student) + '’s record</h1><div class="tags">' + tag('<span class="dot"></span>Edexcel 9MA0 · Pure', "maths") + tag('<span class="dot"></span>AQA 7405 · Organic', "chem") + '</div></header>'; }
  function draw(tree) {
    var ids = lessonIds(tree).filter(function (i) { return i.session; });
    return Promise.all([fileText(sb + "mistakes.jsonl"), fileText(sb + "tests.jsonl"), fileText(sb + "profile.md"), loadMakeup()].concat(ids.map(function (i) {
      return Promise.all([fileJSON(lessonBase(i.id) + "session.json"), i.script ? fileJSON(lessonBase(i.id) + "script.json").catch(function () { return null; }) : null]).then(function (d) { i.x = d[0] && norm(d[0].data); i.s = d[1] && d[1].data; return i; }, function () { return i; }); })))
      .then(function (v) {
        if (route().indexOf("/record") !== 0) return;
        function jl(r) { return r ? r.text.split(/\n/).filter(function (l) { return l.trim(); }).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []; }
        var mistakes = jl(v[0]).reverse(), tests = jl(v[1]), prof = v[2] ? v[2].text : "";
        var mins = 0, n = 0, r = 0; ids.forEach(function (i) { var x = i.x || {}; mins += +(x.time && x.time.minutes) || 0; var s = score(x); n += s.n; r += s.r; });
        var open = mistakes.filter(function (m) { return !m.fixed; }), mko = makeupSum(ids);
        var stat = function (b, l, c) { return '<div class="stat" style="flex:1 1 160px"><b' + (c ? ' style="color:' + c + '"' : "") + '>' + b + '</b><span class="hint">' + l + '</span></div>'; };
        var h = '<div class="wrap record" style="gap:40px">' + head() + '<div class="row" style="gap:var(--s4);align-items:stretch">' + stat(ids.length, "Lessons logged") + stat(hmin(mins), "Taught") + stat(n ? Math.round(100 * r / n) + "%" : "-", "Answers right") +
          stat(open.length, "Mistakes still open", "var(--wrong)") + (mko ? stat(Math.max(0, mko.owed) + " min", "Make-up owed", "var(--live-ink)") : "") + '</div>' +
          '<nav class="jump seg" aria-label="On this page"><a href="#tl" data-jump="tl" aria-current="true">Time log</a><a href="#mi" data-jump="mi">Mistakes</a>' + (mko ? '<a href="#mu" data-jump="mu">Make-up</a>' : "") + '<a href="#ex" data-jump="ex">Exam results</a></nav>';
        h += '<section id="tl" class="stack"><div class="head" style="align-items:baseline"><h2 class="t-sec">Time log</h2><span class="hint">Tap a row to open or correct it</span></div>' +
          (ids.length ? '<div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Date</th><th>Lesson</th><th>Parts</th><th class="n">Start</th><th class="n">Time</th><th class="n">Right</th></tr></thead><tbody>' + ids.map(function (i) {
            var x = i.x || {}, p = parseId(i.id), s = score(x), sj = x.subject || p.subject, m = x.time && x.time.minutes;
            return '<tr data-href="#/lesson/' + encodeURIComponent(i.id) + '"><td class="num" style="white-space:nowrap">' + esc(fmtDate(x.date || p.date)) + '</td><td><span class="row s2" style="flex-wrap:nowrap"><span class="dot ' + esc(sj) + '"></span>' + esc(lessonTitle(i.s, x)) + '</span></td><td>' + kindsHTML(i.s) + '</td>' +
              '<td class="n">' + esc(hhmm(x.time && x.time.started)) + '</td><td class="n">' + (m != null ? (m < LESSON_MIN - 5 ? tag(Math.round(m) + " min", "live") : Math.round(m) + " min") : "") + '</td><td class="n">' + (s.n ? s.r + "/" + s.n : '<span class="hint">None</span>') + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="empty"><b class="t-card">No lessons logged yet</b></div>') + '</section>';
        h += '<section id="mi" class="stack"><div class="head" style="align-items:center"><h2 class="t-sec">Mistakes</h2><div class="row s2"><div class="seg" role="group" aria-label="Subject">' +
          [["all", "Both"], ["chem", "Chemistry"], ["maths", "Maths"]].map(function (o) { return '<button type="button" data-recsj="' + o[0] + '" aria-pressed="' + (o[0] === "all") + '">' + o[1] + '</button>'; }).join("") + '</div>' + tag(open.length + " still open", "bad") + '</div></div><div class="list" id="reclist"></div></section>';
        if (mko) h += '<section id="mu" class="stack"><div class="head" style="align-items:baseline"><h2 class="t-sec">Make-up</h2>' + tag(Math.max(0, mko.owed) + " min owed", "live") + '</div><div class="card" style="overflow-x:auto"><table class="tbl"><tbody>' +
          [["Owed before " + fmtDate(MK.data.start.date), "+" + mko.start], ["Missed lessons", "+" + Math.round(mko.missed)], ["Cut short by you", "+" + mko.short], ["Taught over " + LESSON_MIN + " min", "−" + Math.round(mko.over)], ["Make-up lessons", "−" + Math.round(mko.made)]]
            .map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td class="n">' + esc(l[1]) + ' min</td></tr>'; }).join("") + '</tbody></table></div></section>';
        h += '<section id="ex" class="stack"><div class="head" style="align-items:baseline"><h2 class="t-sec">Exam results</h2><button class="btn sm" type="button" data-addtest>Add an outside result</button></div>' +
          '<form class="card pad stack s4" id="tsform" hidden><div class="cols3"><div class="field"><label for="t-date">Date</label><input class="input" type="date" id="t-date" value="' + todayIso() + '" required></div><div class="field"><label for="t-subj">Subject</label><select class="input" id="t-subj"><option value="maths">Maths</option><option value="chem">Chemistry</option></select></div><div class="field"><label for="t-ti">Exam</label><input class="input" type="text" id="t-ti" required placeholder="e.g. School mock Paper 1"></div></div>' +
          '<div class="cols3"><div class="field"><label for="t-sc">Marks</label><input class="input" type="number" id="t-sc" step="0.5" min="0" required></div><div class="field"><label for="t-max">Out of</label><input class="input" type="number" id="t-max" step="0.5" min="1" required></div><div class="field"><label for="t-no">Notes</label><input class="input" type="text" id="t-no"></div></div><div><button class="btn pri" type="submit">Add the result</button></div></form>' +
          (tests.length ? '<div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Date</th><th>Exam</th><th>Where</th><th class="n">Marks</th><th class="n">%</th></tr></thead><tbody>' + tests.slice().reverse().map(function (x) {
            return '<tr><td class="num" style="white-space:nowrap">' + esc(fmtDate(x.date)) + '</td><td><span class="row s2" style="flex-wrap:nowrap"><span class="dot ' + esc(x.subject) + '"></span>' + esc(cap(x.title || (x.topics ? "Chapters " + x.topics.map(function (s) { return String(s).split(" ")[0]; }).join(", ") : "Exam"))) + '</span>' + (x.notes ? '<div class="hint">' + esc(x.notes) + '</div>' : "") + '</td><td>' + tag(x.exam ? "In the app" : "Outside") + '</td><td class="n">' + esc(x.score) + '/' + esc(x.max) + '</td><td class="n"><b>' + (x.max ? Math.round(100 * x.score / x.max) + "%" : "") + '</b></td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="empty"><b class="t-card">No results yet</b></div>') + '</section>';
        if (prof) h += '<section class="stack"><details class="fold"><summary>His profile</summary><div class="prose" style="max-width:none">' + md(prof) + '</div></details></section>';
        app.innerHTML = h + '</div>';
        var list = function () { var ms = mistakes.filter(function (m) { return REC.sj === "all" || m.subject === REC.sj; }), shown = REC.all ? ms : ms.slice(0, 8);
          $("#reclist").innerHTML = shown.map(function (m) { var vt = VTAG[m.type] || [cap(m.type || ""), ""];
            return '<div class="mrow"' + (m.fixed ? ' style="opacity:.55"' : "") + '><span class="edge" style="background:' + (VCOL[m.type] || "var(--line-strong)") + '"></span><div class="tags">' + (m.subject ? subjTag(m.subject) : "") + (m.type ? tag(vt[0], vt[1]) : "") + topicStrTag(m.topic) + refTag(m.source) + (m.date ? tag(esc(fmtDate(m.date))) : "") + (m.fixed ? tag("Fixed", "ok") : "") + '</div>' +
              '<p style="padding-top:var(--s2);font-weight:500">' + clean(m.text || m.what || "") + '</p>' + (m.fix ? '<p class="fix"><b>Fix</b> · ' + clean(m.fix) + '</p>' : "") + '</div>'; }).join("") +
            (!REC.all && ms.length > shown.length ? '<button class="loadmore" type="button" data-recall>See all (' + ms.length + ')</button>' : "") || '<div class="empty"><b class="t-card">No mistakes</b></div>'; maths($("#reclist")); };
        REC.list = list; list();
        recordView.REC = REC;
      });
  }
  app.innerHTML = '<div class="wrap record">' + head() + '<div class="empty"><b class="t-card">Loading his record</b></div></div>';
  if (TREE && TREE.length) draw(TREE).catch(function (e) { if (route().indexOf("/record") === 0) fail(e); });
  loadTree(true).then(draw).catch(function (e) { if (!TREE || !TREE.length) fail(e); });
}
document.addEventListener("click", function (e) { var R = recordView.REC; if (!R || !e.target.closest) return;
  var b = e.target.closest("[data-recsj]"); if (b) { R.sj = b.getAttribute("data-recsj"); $$("[data-recsj]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); R.list(); return; }
  if (e.target.closest("[data-recall]")) { R.all = true; R.list(); return; }
  if (e.target.closest("[data-addtest]")) { var f = $("#tsform"); f.hidden = !f.hidden; return; }
  var j = e.target.closest("[data-jump]"); if (j) { e.preventDefault(); var s = document.getElementById(j.getAttribute("data-jump")); if (s) s.scrollIntoView({ behavior: "smooth" }); $$("[data-jump]").forEach(function (x) { if (x === j) x.setAttribute("aria-current", "true"); else x.removeAttribute("aria-current"); }); } });
function saveTest() { var sb = studentBase() + "tests.jsonl";
  var t = { date: $("#t-date").value, subject: $("#t-subj").value, score: +$("#t-sc").value, max: +$("#t-max").value, title: $("#t-ti").value.trim(), notes: $("#t-no").value.trim(), device: CFG.device, at: now() };
  setSave("Saving…");
  loadTree(true).then(function () { return fileText(sb); }).then(function (r) { var body = (r ? r.text.replace(/\s*$/, "\n") : "") + JSON.stringify(t) + "\n"; return putB64(sb, b64enc(body), CFG.student + ": test result " + t.date + " (" + CFG.device + ")", r && r.sha); })
    .then(function () { setSave("Saved " + hhmm(now())); toast("Result saved"); recordView(); }).catch(function (e) { setSave("Not saved", true); toast("Couldn’t save: " + e.message); }); }
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
  var p = phases().filter(function (q) { return q.id === L.phase; })[0], sl = slidesOf(p);
  if (which !== "*" && !sl.some(function (x) { return x.id === which; })) { var hp = phases().filter(function (q) { return slidesOf(q).some(function (x) { return x.id === which; }); })[0]; if (hp) sl = slidesOf(hp); }
  if (!sl.length) return;
  var i = which === "*" ? 0 : Math.max(0, sl.map(function (x) { return x.id; }).indexOf(which));
  var el = document.createElement("div"); el.className = "showov"; el.id = "show";
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
  if (t.hasAttribute("data-cam")) { camOpen(t, t.getAttribute("data-cam")); return; }
  if (t.hasAttribute("data-show")) { showHim(t.getAttribute("data-show")); return; }
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
    .sort(function (a, b) { return shufKey(a.key).localeCompare(shufKey(b.key)); }); }
/* the order is shuffled each day, and again with Shuffle (Ali, 11 Oct: "randomize warm up mistakes on every 24 hours") */
function revSeed(bump) { var t = todayIso(), o = null; try { o = JSON.parse(ls("tutor.revseed") || "null"); } catch (e) {} if (!o || o.d !== t) o = { d: t, s: 0 }; if (bump) { o.s++; ls("tutor.revseed", JSON.stringify(o)); } return o.s; }
function shufKey(k) { return hkey(k + "|" + todayIso() + "|" + revSeed()); }
function markRevise(key, ok) { var r = REV.rv[key] || { box: 0, history: [] }, t = todayIso();
  r.box = ok ? r.box + 1 : 0;
  r.due = !ok ? addDays(t, 1) : r.box >= GAPS.length ? "done" : addDays(t, GAPS[r.box - 1]);
  r.last = now(); r.history = (r.history || []).concat([{ d: t, ok: ok, by: CFG.device }]).slice(-12); REV.rv[key] = r; REV.dirty = true;
  if (TRY) { setSave("Try-out \u00b7 not saved"); return; }
  ls(revKey(), JSON.stringify({ dirty: true, data: REV.rv })); clearTimeout(revSaveT); revSaveT = setTimeout(saveRevise, 2500); }
function saveRevise() { if (TRY || !REV || !REV.dirty || !navigator.onLine) return; var path = studentBase() + "review.json", mine = JSON.parse(JSON.stringify(REV.rv));
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
  box.innerHTML = '<div class="empty"><b class="t-card">Loading his mistakes</b></div>';
  loadRevise().then(function () { revState = { i: 0, open: false, subj: subject || null, box: box }; drawRevise(); })
    .catch(function (e) { box.innerHTML = '<div class="empty"><b class="t-card">Couldn’t load his mistakes</b><span class="hint">' + esc(e.message) + '</span></div>'; });
}
function drawRevise() {
  var box = revState.box; if (!box || !box.isConnected) return; var due = dueList(revState.subj), all = REV.ms.length;
  var seg = '<div class="seg" role="group" aria-label="Subject">' + [[null, "Both"], ["chem", "Chemistry"], ["maths", "Maths"]].map(function (c) { return '<button type="button" data-rsub="' + (c[0] || "") + '" aria-pressed="' + (revState.subj === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div>';
  var tg = $("#revtags"); if (tg) tg.innerHTML = tag(due.length + " due today", "live") + tag("5 min · about 8 cards") + tag("Day 1, 3, 7, 14, 30");
  var segbox = $("#revseg"); if (segbox) segbox.innerHTML = seg; else seg = '<div class="row">' + seg + '</div>';
  if (segbox) seg = "";
  if (!due.length) { box.innerHTML = seg + '<div class="empty"><b class="t-card">Nothing due today</b><span class="hint">' + (all ? "Every mistake is either mastered or comes back on a later day." : "No mistakes logged yet. They arrive when the auto-checker closes a lesson.") + '</span></div>'; return; }
  if (revState.i >= due.length) revState.i = 0;
  var m = due[revState.i], r = REV.rv[m.key], bx = r ? r.box : 0, vt = VTAG[m.type];
  box.innerHTML = seg + '<div class="row"><b class="num" style="font-size:15px">Card ' + (revState.i + 1) + ' of ' + due.length + '</b><div class="bar live" style="flex:1"><i style="width:' + Math.max(2, Math.round(100 * (revState.i + 1) / due.length)) + '%"></i></div><button class="btn sm" type="button" data-rev="shuffle" title="A new order. It also changes by itself every day.">Shuffle</button></div>' +
    '<article class="card raised stack s6 revcard"><div class="row"><div class="tags">' + (m.subject ? subjTag(m.subject) : "") + topicStrTag(m.topic) + (vt ? tag(vt[0], vt[1]) : "") + '</div>' +
    '<div class="row s2 push" aria-label="Review ' + (bx + 1) + ' of ' + GAPS.length + ', day ' + GAPS[Math.min(bx, GAPS.length - 1)] + '">' + GAPS.map(function (g, k) { return '<span class="box' + (k < bx ? " done" : k === bx ? " on" : "") + '"><i></i>' + g + '</span>'; }).join("") + '</div></div>' +
    '<div class="stack s3"><span class="lab">Ask him</span><div class="rev-q ' + (m.subject === "maths" ? "q-edexcel" : "q-aqa") + '">' + clean(m.ask || ("What’s the correct version of this? “" + (m.text || m.what || "") + "”")) + '</div></div>' +
    '<details class="fold"' + (revState.open ? " open" : "") + '><summary data-rev="open">Show the answer</summary><div class="stack s2"><div class="prose">' + clean(m.fix || "") + '</div><span class="hint">His mistake' + (m.date ? ", " + esc(fmtDate(m.date)) : "") + ': ' + clean(m.text || m.what || "") + '</span></div></details></article>' +
    '<div class="row" style="gap:var(--s4)"><button class="bigv ok" type="button" data-rev="ok"><span>✓</span>Got it</button><button class="bigv bad" type="button" data-rev="no"><span>✕</span>Still wrong</button><button class="bigv skip" type="button" data-rev="skip">Skip for now</button></div>' +
    '<div class="tags" style="justify-content:center">' + tag("Got it: back on day " + GAPS[Math.min(bx + 1, GAPS.length - 1)]) + tag("Still wrong: day 1 again") + tag("Done after day 30") + '</div>';
  maths(box);
}
function reviseView() { app.innerHTML = '<div class="wrap narrow" style="max-width:840px"><header class="head"><div class="stack s2"><h1 class="t-title">Mistakes Warm-up</h1><div class="tags" id="revtags"></div></div><div id="revseg"></div></header><div id="revbox" class="stack s5"></div></div>'; reviseInto($("#revbox"), subjPick() === "all" ? null : subjPick()); }
document.addEventListener("click", function (e) { var t = e.target.closest("button, summary[data-rev]"); if (!t || !REV || !revState.box || !revState.box.isConnected) return;
  if (t.hasAttribute("data-rsub")) { revState.subj = t.getAttribute("data-rsub") || null; revState.i = 0; revState.open = false; drawRevise(); return; }
  var a = t.getAttribute("data-rev"); if (!a) return; e.stopPropagation(); var due = dueList(revState.subj), m = due[revState.i];
  if (a === "open") { e.preventDefault(); revState.open = !revState.open; drawRevise(); return; }
  if (a === "shuffle") { for (var sh = 0; sh < 12; sh++) { revSeed(true); var nd2 = dueList(revState.subj); if (nd2.length < 2 || nd2[0] !== m) break; } revState.i = 0; revState.open = false; drawRevise(); toast("Shuffled"); return; }
  if (a === "skip") { revState.i = (revState.i + 1) % Math.max(1, due.length); revState.open = false; drawRevise(); return; }
  if (m) { markRevise(m.key, a === "ok"); var nd = REV.rv[m.key].due; toast(a === "ok" ? (nd === "done" ? "Mastered" : "Back on " + fmtDate(nd)) : "Back tomorrow"); }
  revState.open = false; drawRevise(); }, true);

/* ---------------- install as an app ---------------- */
if ("serviceWorker" in navigator && location.protocol === "https:") { window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
  // look for a newer version each time the app comes back to the screen
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") reg.update().catch(function () {}); });
}).catch(function () {}); }); }
var installEvt = null; window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; var b = $("#s-install"); if (b) b.hidden = false; });
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("#s-install"); if (t && installEvt) { installEvt.prompt(); installEvt = null; t.hidden = true; } });

/* ---------------- videos: every relevant lecture, by topic, played here ---------------- */
var VID = { subj: ls("tutor.vsubj") || "chem", q: "", cur: null };
function durTxt(s) { s = +s || 0; return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
var PLAYIC = '<svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"></path></svg>';
function videosView() {
  if (subjPick() !== "all") VID.subj = subjPick();
  VID.more = VID.more || {};
  app.innerHTML = '<div class="wrap videos"><header class="head"><div class="stack s2"><h1 class="t-page">Videos</h1><div class="tags">' + tag('<span class="dot"></span>Chemistry Tutor · Organic', "chem") + tag('<span class="dot"></span>Maths Genie · Pure', "maths") + tag("Topic order") + '</div></div>' +
    '<div class="seg" role="group" aria-label="Subject">' + [["all", "Both"], ["chem", "Chemistry"], ["maths", "Maths"]].map(function (c) { return '<button type="button" data-vsub="' + c[0] + '" aria-pressed="' + (VID.subj === c[0]) + '">' + c[1] + '</button>'; }).join("") + '</div></header>' +
    '<label class="search"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg><span class="sr">Search videos</span><input type="search" id="vq" placeholder="Search, e.g. chain rule, NMR" value="' + esc(VID.q) + '"></label>' +
    '<div id="vplayer"></div><div id="vwrap" class="stack s6"><div class="empty"><b class="t-card">Loading the video list</b></div></div></div>';
  loadTree().then(function () { return fileJSON("videos.json"); }).then(function (r) {
    if (route().indexOf("/videos") !== 0) return;
    if (!r) { $("#vwrap").innerHTML = '<div class="empty"><b class="t-card">No video list yet</b><span class="hint">Run tools/build_video_catalogue.py to make it.</span></div>'; return; }
    var tr = {}; (TREE || []).forEach(function (t) { var m = /^transcripts\/youtube\/[a-z]+\/([A-Za-z0-9_-]{11}) .*\.txt$/.exec(t.path); if (m) tr[m[1]] = t.path; });
    VID.all = r.data.videos.map(function (v) { v.transcript = tr[v.id] || v.transcript || null; return v; }); drawVideos();
  }).catch(fail);
}
function drawVideos() {
  var q = VID.q.toLowerCase(), list = VID.all.filter(function (v) { return (VID.subj === "all" || v.subject === VID.subj) && (!q || v.title.toLowerCase().indexOf(q) >= 0 || v.group.toLowerCase().indexOf(q) >= 0); });
  var groups = [], by = {}; list.forEach(function (v) { if (!by[v.group]) { by[v.group] = []; groups.push(v.group); } by[v.group].push(v); });
  var row = function (v) { var tg = (v.kind === "exam questions" ? tag("Exam questions", "live") : "") + (v.transcript ? "" : tag("No transcript", "dash"));
    return '<button class="li vr" type="button" data-vid="' + esc(v.id) + '"' + (VID.cur === v.id ? ' aria-current="true"' : "") + '><span class="pl">' + PLAYIC + '</span><b>' + esc(v.title) + '</b><span class="tags">' + tg + '</span><span class="hint num" style="text-align:right">' + durTxt(v.duration) + '</span></button>'; };
  $("#vwrap").innerHTML = groups.length ? groups.map(function (g, gi) { var vs = by[g], open = VID.more[g] || q || vs.length <= 4, shown = open ? vs : vs.slice(0, 3);
      return '<section class="stack s3"><div class="row"><h2 class="tags">' + topicStrTag(g).replace('class="tag topic"', 'class="tag topic lg"') + '</h2><span class="hint push">' + vs.length + (vs.length === 1 ? " video" : " videos") + '</span></div><div class="list">' + shown.map(row).join("") +
        (open ? "" : '<button class="loadmore" type="button" data-vgmore="' + esc(g) + '">Show ' + (vs.length - 3) + ' more</button>') + '</div></section>'; }).join("")
    : '<div class="empty"><b class="t-card">No videos match</b><span class="hint">Try a shorter search.</span></div>';
  if (VID.cur) playVideo(VID.cur, false);
}
function playVideo(id, scroll) {
  var v = (VID.all || []).filter(function (x) { return x.id === id; })[0]; if (!v) return; VID.cur = id;
  $$(".vr[data-vid]").forEach(function (b) { if (b.getAttribute("data-vid") === id) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
  var box = $("#vplayer"); if (!box) return;
  box.innerHTML = '<section class="card pad split" style="gap:var(--s5)"><div class="vframe" style="flex:3 1 420px"><iframe data-vid="' + esc(v.id) + '" src="' + vsrc(v.id, 0, true) + '" title="' + esc(v.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
    '<div class="stack s3" style="flex:2 1 280px;min-width:0"><div class="tags">' + topicStrTag(v.group) + tag(durTxt(v.duration)) + tag("Now playing", esc(v.subject)) + '</div><h2 class="t-card">' + esc(v.title) + '</h2>' +
    '<div id="vtr" class="sunk" style="flex:1;min-height:120px;max-height:320px;overflow:auto;padding:var(--s4)">' + (v.transcript ? '<span class="hint">Loading the transcript…</span>' : '<span class="hint">No transcript downloaded yet.</span>') + '</div>' +
    '<div class="row s2"><a class="btn sm quiet" href="https://www.youtube.com/watch?v=' + esc(v.id) + '" target="_blank" rel="noopener">Open on YouTube</a><button class="btn sm quiet push" type="button" data-vclose>Close</button></div></div></section>';
  if (v.transcript) showTranscript(v.id);
  if (scroll !== false) box.scrollIntoView({ block: "start", behavior: "smooth" });
}
function showTranscript(id) {
  var v = VID.all.filter(function (x) { return x.id === id; })[0], box = $("#vtr"); if (!v || !box) return; box.innerHTML = '<p class="hint">Loading transcript…</p>';
  fileText(v.transcript).then(function (r) { if (!r) { box.innerHTML = '<p class="hint">Transcript not found.</p>'; return; }
    var lines = r.text.split(/\n/).filter(function (l) { return /^\[/.test(l); });
    box.innerHTML = '<div class="prose vtr" style="max-height:none;border:0;margin:0;padding:0">' + lines.map(function (l) { var m = /^\[([0-9:]+)\]\s*(.*)$/.exec(l); return m ? '<p><button class="linkbtn num" type="button" data-seek="' + esc(v.id) + '" data-t="' + esc(m[1]) + '">' + esc(m[1]) + '</button> ' + esc(m[2]) + '</p>' : ""; }).join("") + '</div>'; });
}
document.addEventListener("click", function (e) { if (route().indexOf("/videos") !== 0) return; var t = e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-vsub")) { VID.subj = t.getAttribute("data-vsub"); ls("tutor.vsubj", VID.subj); VID.cur = null; $$("[data-vsub]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); $("#vplayer").innerHTML = ""; drawVideos(); return; }
  if (t.hasAttribute("data-vgmore")) { VID.more[t.getAttribute("data-vgmore")] = 1; drawVideos(); return; }
  if (t.hasAttribute("data-vid") && t.classList.contains("vr")) { playVideo(t.getAttribute("data-vid")); return; }
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
var KTX = null, KCDN = "vendor/katex/";
function loadKatex() { if (KTX) return KTX; KTX = new Promise(function (res, rej) {
  var l = document.createElement("link"); l.rel = "stylesheet"; l.href = KCDN + "katex.min.css"; document.head.appendChild(l);
  var k = document.createElement("script"); k.src = KCDN + "katex.min.js"; k.onerror = rej;
  k.onload = function () { var a = document.createElement("script"); a.src = KCDN + "contrib/auto-render.min.js"; a.onload = res; a.onerror = rej; document.head.appendChild(a); };
  document.head.appendChild(k); }); KTX.catch(function () { KTX = null; }); return KTX; }
function typeset(el) { try { renderMathInElement(el, { delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }, { left: "$$", right: "$$", display: true }], throwOnError: false }); } catch (e) {} }
function maths(el) { if (!el || !/\\\(|\\\[|\$\$/.test(el.textContent)) return; if (window.renderMathInElement) return typeset(el); loadKatex().then(function () { if (el.isConnected) typeset(el); }, function () {}); }

/* ---------------- teach mode: the script one chunk at a time ----------------
   Nothing is recorded until the lesson clock runs ("preview"). While it runs, three buttons: "Taught" ticks the chunk
   and moves on, "Next" only moves on (to look ahead), "Skip" records that you skipped it on purpose.
   Every chunk can be reached from the outline. */
var MODE = "plan", TCH = { id: null, pos: 0, seq: [], open: {} };
/* Prepare (Ali, 11 Oct): "Open" shows the same screens as Teach, in the same order and layout, with nothing to record:
   no clock, no ticks, no verdicts, no Show him, no reminders. Its place in the script is kept apart from Teach's. */
var PREP = false;
function quizOn(it, f) { return f === "all" || (f === "star" && it.star) || f === it.kind || ("t:" + it.topic) === f; }
function quizChoices(items) { var hasStar = items.some(function (i) { return i.star; }), topics = {};
  items.forEach(function (i) { if (i.topic) topics[i.topic] = 1; });
  return (hasStar ? [["star", "★ Suggested"]] : []).concat([["all", "All"], ["recall", "Recall"], ["reason", "Reasoning"], ["draw", "Drawing"]])
    .concat(Object.keys(topics).map(function (t) { return ["t:" + t, t.charAt(0).toUpperCase() + t.slice(1)]; }))
    .map(function (c) { return { f: c[0], label: c[1], n: items.filter(function (i) { return quizOn(i, c[0]); }).length }; }).filter(function (c) { return c.n; }); }
function qfKey() { return "tutor.tquiz." + CFG.student + "." + L.id; }
function quizFilter(items) { if (L.filter == null) L.filter = ls(qfKey()) || null; return L.filter || (items.some(function (i) { return i.star; }) ? "star" : "all"); }
function teachSeq() {
  var seq = [];
  phases().filter(function (p) { return !p.sys; }).forEach(function (p) {
    seq.push({ t: "phase", p: p });
    (function walk(bs, mod) {
      (bs || []).forEach(function (b) {
        if (b.type === "figure" && b.img) seq.push({ t: "fig", b: b, p: p, mod: mod });
        else if (b.type === "steps") (b.items || []).forEach(function (it) { seq.push({ t: "step", it: it, key: stepKey(it.html), p: p, mod: mod }); });
        else if (b.type === "text" && !gradeRows(clean(b.html)).rows.length) seq.push({ t: "note", b: b, p: p, mod: mod });
        else if (b.type === "text") seq.push({ t: "text", b: b, key: null, p: p, mod: mod });
        else if (b.type === "module") { seq.push({ t: "mod", b: b, key: modKey(b.name), p: p, mod: b.name }); walk(b.blocks, b.name); }
        else if (b.type === "quiz") { var its = b.items || [], f = quizFilter(its), on = its.filter(function (i) { return quizOn(i, f); });
          seq.push({ t: "quizpick", b: b, p: p, mod: mod });
          on.forEach(function (it, i) { seq.push({ t: "quiz", it: it, n: i + 1, of: on.length, b: b, p: p, mod: mod }); }); }
        else if (b.type === "drill") (b.items || []).forEach(function (d, i) { var dc = { t: "drill", d: d, key: drillKey(d[0]), n: i + 1, of: b.items.length, title: b.title, p: p, mod: mod }, pic = hintPic(b, d);
          if (pic) dc.bd = { id: dc.key, mode: "lines", ids: [dc.key], imgs: [pic], box: b.hintBox || null }; seq.push(dc); });
        else if (b.type !== "piece") seq.push({ t: b.type, b: b, p: p, mod: mod });   // canvas pieces live in Teach's Canvas, not on its screens
      });
    })(p.blocks, null);
  });
  seq.push({ t: "end" });
  /* a board that grows click by click (questions in a row with the same "Board: ..." label, or "grow": true): Ali sees
     the full board on every click, his screen still builds up (Ali, 11 Oct) */
  var run = [];
  seq.concat([{ t: "end" }]).forEach(function (c) { var g = c.t === "question" && (c.b.img || []).length && (c.b.grow || /^board\b/i.test(c.b.label || "")) ? c : null;
    if (g && run.length && (run[0].p !== g.p || run[0].mod !== g.mod || run[0].b.label !== g.b.label)) { done(); }
    if (g) run.push(g); else if (c.t === "question" || c.t === "phase" || c.t === "mod" || c.t === "end") done(); });
  /* one screen for Ali with the full board; "Next line" adds the next line on his screen (Ali, 12 Oct: "I see one board only, he sees a new line every click") */
  function done() { if (run.length > 1) { var c0 = run[0]; c0.full = run[run.length - 1].b.img; c0.lines = run.map(function (c) { return c.b.id; }); c0.bd = { id: c0.b.id, mode: "grow", ids: c0.lines, imgs: run.map(function (c) { return c.b.img[c.b.img.length - 1]; }), whys: run.map(function (c) { return c.b.why || ""; }) }; run.slice(1).forEach(function (c) { c.drop = true; }); } run = []; }
  seq = seq.filter(function (c) { return !c.drop; });
  /* hints: the steps and notes right after a question fold into that question's screen, closed (Ali, 2 Oct:
     "he is good at maths, keep them hidden until I want them"). On by default for maths; Settings switches it. */
  if (foldOn((L.script && L.script.subject) || L.session.subject)) { var fs = [], host = null;
    seq.forEach(function (c) { var q = { quiz: 1, drill: 1, question: 1 }[c.t];
      if (host && (c.t === "step" || c.t === "note") && c.p === host.p && c.mod === host.mod) { host.hints.push(c.t === "step" ? c.it.html : c.b.html); return; }
      host = q ? c : null; if (q) c.hints = []; fs.push(c); });
    seq = fs; }
  /* notes ride on the next screen of the same part; a note with nothing after it in its part stays a screen */
  var out = [], pend = [];
  seq.forEach(function (c) { if (c.t === "note") { pend.push(c); return; }
    if (pend.length) { if (c.t === "phase" || c.t === "end") pend.forEach(function (n) { out.push({ t: "text", b: n.b, key: null, p: n.p, mod: n.mod }); }); else c.notes = pend.map(function (n) { return n.b; }); pend = []; }
    out.push(c); });
  return flowQuick() ? quickSeq(out) : out;
}
/* ---------------- quick flow (Ali, 5 Oct: "too many unnatural ums and pauses") ----------------
   No screens for a part's or a section's title: they ride in a thin strip on the next screen. A section's steps and
   pictures become one screen (points beside the picture). A quiz or drill becomes one board: every question in one
   list, tap one to ask it. Exam questions keep their own screen. Chosen in Settings or from the try-out button. */
function subjNow() { return (L && ((L.script && L.script.subject) || L.session.subject)) || ""; }
function flowQuick() { return (ls("tutor.flow") || "quick") === "quick"; }
var FLOWS = [["steps", "Step by step"], ["quick", "Quick flow"]];
function flowPressed() { $$("button[data-flow]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-flow") === (ls("tutor.flow") || "quick"))); }); }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button[data-flow]"); if (!b) return; ls("tutor.flow", b.getAttribute("data-flow")); flowPressed();
  if (MODE === "teach" && L) drawTeach(); toast("Teach flow: " + b.textContent); });
function quickSeq(seq) {
  var out = [], carry = { notes: [], mods: [] }, last = null;
  function give(c) { if (carry.notes.length) c.notes = carry.notes.concat(c.notes || []); if (carry.mods.length) c.mods = carry.mods.concat(c.mods || []); carry = { notes: [], mods: [] }; out.push(c); last = c; return c; }
  seq.forEach(function (c) {
    if (c.t === "phase") { if (c.notes) carry.notes = carry.notes.concat(c.notes); last = null; return; }
    if (c.t === "mod") { if (c.notes) carry.notes = carry.notes.concat(c.notes); carry.mods.push(c); last = null; return; }
    if (c.t === "step" || c.t === "fig") {
      if (last && last.t === "concept" && last.p === c.p && last.mod === c.mod) { (c.t === "step" ? last.steps : last.figs).push(c); if (c.notes) last.notes = (last.notes || []).concat(c.notes); return; }
      give({ t: "concept", p: c.p, mod: c.mod, steps: c.t === "step" ? [c] : [], figs: c.t === "fig" ? [c] : [], notes: c.notes }); return; }
    if (c.t === "quizpick") return;
    if (c.t === "quiz" || c.t === "drill") {
      var src = c.t === "quiz" ? c.b : "drill:" + (c.p && c.p.id) + ":" + (c.mod || c.title);
      if (last && last.t === "board" && last.src === src) { if (c.t === "drill") last.items.push(c); return; }   // a quiz board already holds its whole block
      if (c.t === "quiz") { var its = c.b.items || [];   // the board shows every question in the block, starred first
        give({ t: "board", src: src, kind: "quiz", b: c.b, p: c.p, mod: c.mod, notes: c.notes, items: its.filter(function (i) { return i.star; }).concat(its.filter(function (i) { return !i.star; })).map(function (it) { return { t: "quiz", it: it, b: c.b, p: c.p, mod: c.mod }; }) }); return; }
      give({ t: "board", src: src, kind: "drill", title: c.mod || c.title, p: c.p, mod: c.mod, notes: c.notes, items: [c] }); return; }
    if (c.t === "end" && (carry.notes.length || carry.mods.length)) { carry.notes.forEach(function (n) { out.push({ t: "text", b: n, key: null, p: c.p, mod: c.mod }); }); carry = { notes: [], mods: [] }; }
    give(c);
  });
  out.forEach(function (c) { if (c.t === "concept") c.key = "c:" + c.steps.map(function (st) { return st.key; }).join("|"); });
  return out;
}
/* question text set like the real papers (Ali, 5 Oct): parts (a), (b), (i) each on their own line with the label in a
   hanging margin; the marks bold at the right, "(2)" for Edexcel maths and "[2 marks]" for AQA chemistry; for AQA the
   words their papers set in bold (Give two, does not, compound X, Step 4). Fonts and spacing are in app.css (.paper). */
function paperHTML(html, subj, marks) {
  var h = clean(String(html || "")), aqa = subj === "chem";
  var parts = h.split(/<br\s*\/?>|\n/i), out = [], stem = [];
  parts.forEach(function (ln) { var m = /^\s*(?:<[^>]+>\s*)*\(?([a-h]|i{1,3}|iv|vi?)\)\s+/i.exec(ln);
    var roman = m && /^(i{1,3}|iv|vi?)$/i.test(m[1]) && out.some(function (p) { return !p.sub; });   // (i) after an (a) is a sub-part
    if (m) out.push({ lab: "(" + m[1].toLowerCase() + ")", sub: !!roman, txt: ln.slice(m[0].length) });
    else if (out.length) out[out.length - 1].txt += "<br>" + ln; else stem.push(ln); });
  function emph(t) { if (!aqa) return t;
    return t.replace(/\b(Give|State|Name|Suggest|Identify|Describe|Explain|Draw|Outline|List|Write|Calculate|Deduce|Complete|Show)( the| your)? (one|two|three|four|five|six)\b/g, "$1$2 <b>$3</b>")
      .replace(/(^|[^<\w-])(not|NOT)(?=[\s,.;:?!])/g, "$1<b>not</b>")
      .replace(/\b(compound|Compound|isomer|Isomer|Step|step|Figure|Table|Equation|substance|Substance|reagent|Reagent|test|Test) ([A-Z]|\d{1,2})\b(?![^<]*>)/g, "$1 <b>$2</b>"); }
  var mk = marks ? '<span class="pmk">' + (aqa ? "[" + marks + " mark" + (+marks === 1 ? "" : "s") + "]" : "(" + marks + ")") + '</span>' : "";
  var body = (stem.length ? '<div class="pstem">' + emph(stem.join("<br>")) + '</div>' : "") +
    out.map(function (p) { return '<div class="ppart' + (p.sub ? " sub" : "") + '"><span class="plab">' + p.lab + '</span><div class="ptxt">' + emph(p.txt) + '</div></div>'; }).join("");
  return '<div class="paper ' + (aqa ? "aqa" : "edx") + '">' + body + mk + '</div>'; }
function boardKey(it) { return it.t === "quiz" ? it.it.id : it.key; }
function boardQ(it) { return it.t === "quiz" ? it.it.q : it.d[0]; }
function boardA(it) { return it.t === "quiz" ? it.it.a : it.d[1]; }
var BOARD = { open: null, near: null, jumped: 0 };   // the question open on the board, and the one whose neighbours are pulled up after a miss
function boardHTML(c) {
  var items = c.items.slice(), asked = 0, right = 0, wrong = 0;
  items.forEach(function (it) { var a = L.session.answers[boardKey(it)]; if (a && asked_(a.v)) { asked++; if (a.v === "right") right++; else if (a.v !== "skipped" && a.v !== "tskip") wrong++; } });
  /* after a miss, the questions from the same book page (or topic) come up right under it */
  if (BOARD.near) { var nb = items.filter(function (it) { return boardKey(it) === BOARD.near; })[0], pg = nb && nb.it && (nb.it.page || nb.it.topic);
    if (pg) { var rel = items.filter(function (it) { return it !== nb && it.it && (it.it.page === pg || it.it.topic === pg) && !asked_((L.session.answers[boardKey(it)] || {}).v); });   // never asked, or skipped by you
      items = items.filter(function (it) { return rel.indexOf(it) < 0; }); var at = items.indexOf(nb) + 1; items.splice.apply(items, [at, 0].concat(rel)); rel.forEach(function (it) { it.rel = true; }); } }
  var h = '<div class="bhead"><b>' + esc(c.kind === "quiz" ? "Oral quiz" : (c.title || "Quick questions")) + '</b><span class="hint">' + items.length + ' questions · tap one to ask it' + (c.kind === "quiz" && items.some(function (it) { return it.it.star; }) ? ' · ★ first' : "") + '</span><span class="bscore num">' + asked + ' asked · ✓ ' + right + ' · ✗ ' + wrong + '</span></div><ol class="board">';
  items.forEach(function (it, i) { var k = boardKey(it), a = L.session.answers[k] || {}, open = BOARD.open === k, star = it.it && it.it.star;
    h += '<li class="brow' + (open ? " open" : "") + (it.rel ? " rel" : "") + (star ? " star" : "") + '" data-v="' + esc(a.v || "") + '">' +
      '<button type="button" class="bq" data-bopen="' + esc(k) + '" aria-expanded="' + open + '"><span class="bn num">' + (i + 1) + '</span><span class="bt">' + (star ? '<i aria-hidden="true">★</i> ' : "") + clean(String(boardQ(it)).replace(/<br\s*\/?>/gi, " \u00b7 ")) + '</span>' +
      (it.it && it.it.page ? '<span class="bpg">' + esc(it.it.page) + '</span>' : it.title && /\(([^)]+)\)/.test(it.title) ? '<span class="bpg">' + esc(/\(([^)]+)\)/.exec(it.title)[1]) + '</span>' : "") + '<span class="bv" aria-hidden="true">' + ({ right: "✓", wrong: "✗", partly: "½", wording: "W", terminology: "T", skipped: "-", tskip: "⏭" }[a.v] || "") + '</span></button>' +
      (open ? '<div class="bbody"><div class="qtext prose">' + paperHTML(boardQ(it), subjNow()) + '</div><div class="bans prose">' + clean(boardA(it)) + '</div>' + (it.t === "drill" ? hintHTML(it) : "") + (a.note ? '<div class="bnote"><b>Note:</b> ' + esc(a.note) + '</div>' : "") + boardNext(items, it) + '</div>' : "") + '</li>'; });
  var oi = items.filter(function (it) { return boardKey(it) === BOARD.open; })[0];
  return h + '</ol>' + vrail(oi ? boardKey(oi) : null, oi ? L.session.answers[boardKey(oi)] : null, oi ? plain(boardQ(oi)) : ""); }
/* the question that opens after a ✓: the next one not yet asked, in the order on screen (wrapping round) */
function boardNextIt(items, it) { var i = items.indexOf(it);
  for (var j = 1; j < items.length; j++) { var n = items[(i + j) % items.length]; if (!asked_((L.session.answers[boardKey(n)] || {}).v)) return n; } return null; }
function boardNext(items, it) { var n = boardNextIt(items, it);
  return '<div class="bnext">' + (n ? '<span class="hint">After \u2713 next:</span> <b class="num">' + (items.indexOf(n) + 1) + '.</b> ' + esc(plain(boardQ(n)).slice(0, 90)) : '<span class="hint">After \u2713: that\u2019s every question on this list</span>') + '</div>'; }
/* the marking buttons as round icons down the right edge (Ali, 5 Oct, "Solid"): they stay put and mark whichever question is open */
var VIC = { right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wrong: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  partly: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18.5" cy="12" r="2"/></svg>' };
/* the verdicts as round buttons down the right edge, in the design's order; the keys stay as Ali learned them */
var KEYV = { 1: "right", 2: "wrong", 3: "partly", 4: "wording", 5: "terminology", 6: "skipped" }, VKEY = { right: 1, wrong: 2, partly: 3, wording: 4, terminology: 5, skipped: 6 };
var VRAIL = [["right", "Right"], ["partly", "Partly"], ["wording", "Wording"], ["terminology", "Terminology"], ["wrong", "Wrong"], ["skipped", "No answer"]];
VIC.wording = '<b aria-hidden="true">≈</b>'; VIC.terminology = '<b aria-hidden="true">Aa</b>'; VIC.skipped = '<b aria-hidden="true">−</b>';
function vrail(id, a, q, o) { a = a || {}; o = o || {}; var off = id ? "" : " disabled";
  return '<div class="ctl big vrail' + (id ? "" : " idle") + (asked_(a.v) ? " has" : "") + '"' + (id ? ' data-item="' + esc(id) + '" data-q="' + esc(String(q || "").slice(0, 160)) + '"' : "") + ' role="toolbar" aria-label="How he did">' +
    (o.flip ? '<button class="vr vr-flip" type="button" ' + o.flip + ' aria-pressed="' + !!o.flipped + '" title="Answer side (A)" aria-label="Answer side"' + (o.flipHidden ? " hidden" : "") + '><span class="vd">A</span><kbd>A</kbd></button><span class="vrsep" aria-hidden="true"></span>' : "") +
    VRAIL.map(function (v) { return '<button class="v vr vr-' + v[0] + '" type="button" data-v="' + v[0] + '" aria-pressed="' + (a.v === v[0]) + '" title="' + v[1] + ' (' + VKEY[v[0]] + ')" aria-label="' + v[1] + '"' + off + '><span class="vd">' + VIC[v[0]] + '</span><kbd>' + VKEY[v[0]] + '</kbd></button>'; }).join("") +
    '<span class="vrsep" aria-hidden="true"></span>' +
    (SR ? '<button class="vr vr-mic" type="button" data-mic title="Say what he said: tap, speak, it stops by itself (or hold M)" aria-label="Say what he said"' + off + '><span class="vd">' + VIC.mic + '</span><span class="vt">Say it</span><kbd>M</kbd></button>' : "") +
    '<button class="vr vr-more" type="button" data-vrmore aria-expanded="false" aria-pressed="' + !!(a.note || a.m != null) + '" title="' + (o.marks ? "Marks and what he said" : "What he said") + '" aria-label="' + (o.marks ? "Marks and note" : "Note") + '"' + off + '><span class="vd">' + VIC.more + '</span></button>' +
    (id ? '<div class="vrmenu" hidden>' + (o.marks ? '<label class="mkin">Marks <input class="input mk" type="number" min="0" step="0.5" inputmode="decimal" aria-label="Marks out of ' + esc(o.marks) + '" data-mk value="' + (a.m != null ? esc(a.m) : "") + '"><span class="hint num">/ ' + esc(o.marks) + '</span></label>' : "") +
      '<input class="input note" type="text" data-note aria-label="What he said or got wrong" placeholder="What he said or got wrong" value="' + esc(a.note || "") + '"></div>' : "") + '</div>'; }
function boardJump(iid) { var c = TCH.seq[TCH.pos]; if (!c || c.t !== "board") return null;
  var keys = $$(".chunk.cur .brow .bq").map(function (b) { return b.getAttribute("data-bopen"); }), byk = {};
  c.items.forEach(function (it) { byk[boardKey(it)] = it; });
  var items = keys.map(function (k) { return byk[k]; }).filter(Boolean), it = byk[iid], n = it && items.indexOf(it) >= 0 ? boardNextIt(items, it) : null;
  return n ? boardKey(n) : null; }
/* exam questions part by part (Ali, 5 Oct): the text set as a twin of the paper; one part big in the middle, the one
   before shrunk above it with its mark, the next peeking below. ✓ gives the part its marks and slides the next one up;
   ✗ and ½ stay. Each part is saved as "<question id>~<part>", and the question keeps the total. */
var SL = { q: null, i: 0, back: false };
/* a part: "lab" names it in the app ("(a)(i)"); "print" is the label the paper prints beside it (default: lab, "" for none);
   "pre" is lead-in text the paper puts above it (e.g. the stages (d)(i) to (iii) share); "mk" the marks as printed ("" for none);
   sub-parts sit inside "q" as <div class="sub"><span class="sl">(i)</span><div>…</div></div> */
function twinPart(p) { var mk = p.mk != null ? p.mk : p.marks != null ? "(" + p.marks + ")" : "", lab = p.print != null ? p.print : p.lab || "";
  return '<div class="tw-pt"><span class="tw-lab">' + clean(lab) + '</span><div class="tw-q">' + (p.pre ? '<div class="tw-pre">' + clean(p.pre) + '</div>' : "") + clean(p.q || "") + '</div></div>' +
    (p.img || []).map(function (i) { return img(i, "Diagram"); }).join("") + (mk ? '<div class="tw-mk">' + clean(mk) + '</div>' : ""); }
function twinStem(q) { return q.stem || q.num || (q.stemImg || []).length ? '<div class="tw-stem">' + (q.num ? '<span class="tw-num">' + clean(q.num) + '</span>' : "") + '<div class="tw-q">' + clean(q.stem || "") + '</div></div>' +
  (q.stemImg || []).map(function (i) { return img(i, "Diagram"); }).join("") : ""; }
function twinHTML(q) { return '<div class="twin"><div class="tw">' + twinStem(q) + (q.parts || []).map(twinPart).join("") + '</div></div>'; }
/* one line of a part for the faded rows: no sub-label, no stray spaces where tags were */
function peekText(h) { return String(h || "").replace(/<span class="sl">[\s\S]*?<\/span>/g, "").replace(/<\/p>|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim(); }
function slKey(q, i) { return q.id + "~" + (q.parts[i].lab || String(i + 1)); }
function slMax(q) { return q.parts.reduce(function (t, p) { return t + (+p.marks || 0); }, 0) || +q.marks || 0; }
function slTotal(q) { var a = L.session.answers[q.id]; return (a && a.m != null ? a.m : 0) + " / " + slMax(q); }
function slSum(q) { var ps = q.parts.map(function (p, i) { return L.session.answers[slKey(q, i)] || {}; }), done = ps.filter(function (a) { return asked_(a.v); });
  var a = L.session.answers[q.id] || {}; a.parts = q.parts.length;
  a.m = done.length ? ps.reduce(function (t, x) { return t + (+x.m || 0); }, 0) : null;
  a.v = !done.length ? null : done.length === ps.length && done.every(function (x) { return x.v === "right"; }) ? "right" : done.every(function (x) { return x.v === "wrong" || x.v === "skipped"; }) && done.length === ps.length ? "wrong" : "partly";
  a.at = now(); a.d = CFG.device; a.q = q.label || ""; L.session.answers[q.id] = a; touch(); }
function slMarked(iid, a) { var q = SL.q; if (!q) return; var i = SL.i, p = q.parts[i], mx = +p.marks || 0;
  if (a.v === "right") a.m = mx; else if (a.v === "wrong" || a.v === "skipped") a.m = 0; else if (a.v === "partly") a.m = Math.floor(mx) / 2; else if (!a.v) a.m = null;
  a.mk = mx; a.q = (q.label || "Question") + " " + (p.lab || "part " + (i + 1)); save(iid, a); slSum(q);
  if (a.v === "right") { BOARD.jumped = Date.now() + 350; var n = slNextOpen(q, i); setTimeout(function () { if (n != null) SL.i = n; SL.back = false; slDraw(); }, 350); }
  else slDraw(); }
function slNextOpen(q, i) { for (var j = i + 1; j < q.parts.length; j++) if (!asked_((L.session.answers[slKey(q, j)] || {}).v)) return j; return i + 1 < q.parts.length ? i + 1 : null; }
function slGo(i) { var q = SL.q; if (!q || i < 0 || i >= q.parts.length || i === SL.i) return; SL.i = i; SL.back = false; slDraw(); }
function slFlip() { SL.back = !SL.back; slDraw(); }
function slDraw() { var c = TCH.seq[TCH.pos], cur = $(".chunk.cur"); if (!c || !cur || !$(".slider", cur)) return; cur.innerHTML = stripHTML(c) + chunkHTML(c); maths(cur); loadImages(cur); }
function sliderHTML(c) { var q = c.b;
  if (SL.q !== q) { SL = { q: q, i: 0, back: false }; for (var j = 0; j < q.parts.length; j++) if (!asked_((L.session.answers[slKey(q, j)] || {}).v)) { SL.i = j; break; } }
  var i = SL.i, p = q.parts[i], k = slKey(q, i), a = L.session.answers[k] || {}, hasBack = !!(p.answer || (p.ms || []).length);
  var sym = { right: "\u2713", wrong: "\u2717", partly: "\u00bd", wording: "W", terminology: "T", skipped: "-" };
  var pills = q.parts.map(function (x, j) { var b = L.session.answers[slKey(q, j)] || {};
    return '<button type="button" class="sl-pill' + (j === i ? " cur" : "") + (asked_(b.v) ? " v-" + b.v : "") + '" data-slgo="' + j + '">' + esc(x.lab || String(j + 1)) + (asked_(b.v) ? " " + (b.m != null ? esc(b.m) : sym[b.v] || "") : "") + '</button>'; }).join("");
  function peek(j, cls) { var x = q.parts[j], b = L.session.answers[slKey(q, j)] || {};
    return '<button type="button" class="sl-peek ' + cls + '" data-slgo="' + j + '"><span class="sl-pl">' + esc(x.lab || "") + '</span><span class="sl-pt">' + esc(peekText(x.q)) + '</span>' + (asked_(b.v) ? '<span class="sl-badge v-' + esc(b.v) + '">' + (sym[b.v] || "") + (b.m != null ? " " + esc(b.m) + "/" + esc(x.marks) : "") + '</span>' : "") + '</button>'; }
  var front = '<div class="twin"><div class="tw tw-solo">' + twinPart(p) + '</div></div>';
  var back = '<div class="sl-ms"><div class="sl-msh">Mark scheme \u00b7 ' + esc(p.lab || "") + ' only</div>' + (p.answer ? '<div class="prose">' + clean(p.answer) + '</div>' : "") + (p.ms || []).map(function (m) { return img(m, "Mark scheme"); }).join("") +
    '<label class="sl-mk">Marks <input class="mk" type="number" min="0" step="0.5" inputmode="decimal" data-mk aria-label="Marks out of ' + esc(p.marks) + '" value="' + (a.m != null ? esc(a.m) : "") + '"> / ' + esc(p.marks) + '</label></div>';
  var h = '<div class="slider" data-qid="' + esc(q.id) + '"><div class="sl-hd"><span class="tl-q" aria-hidden="true">Q</span><b>' + esc(q.label || "Exam question") + '</b>' + (q.source ? '<span class="hint">' + esc(q.source) + '</span>' : "") +
    '<span class="sl-pills">' + pills + '</span><span class="sl-tot num">' + slTotal(q) + '</span>' + ((q.img || []).length || q.parts.length ? '<button class="btn small" type="button" data-show="' + esc(q.id) + '">Show him</button>' : "") + '</div>' +
    (twinStem(q) ? '<div class="twin sl-stem"><div class="tw">' + twinStem(q) + '</div></div>' : "") +
    '<div class="sl-deck">' + (i > 0 ? peek(i - 1, "prev") : '<span class="sl-gap"></span>') +
    '<div class="sl-cur' + (SL.back ? " back" : "") + '" data-item="' + esc(k) + '">' + (SL.back ? back : front) + '</div>' +
    (i + 1 < q.parts.length ? peek(i + 1, "next") : '<span class="sl-gap"></span>') + '</div>' +
    '<div class="sl-foot"><span class="hint">' + (i + 1 < q.parts.length ? "\u2713 and " + esc(q.parts[i + 1].lab || "the next part") + " slides up \u00b7 \u2191 \u2193 to move" : "Last part \u00b7 total " + slTotal(q)) + '</span>' +
    (i + 1 < q.parts.length ? '<button type="button" class="btn small" data-slgo="' + (i + 1) + '">Next part \u2193</button>' : "") + '</div>' +
    vrail(k, a, (q.label || "") + " " + (p.lab || ""), { flip: hasBack ? "data-flip" : "", flipped: SL.back }) + '</div>';
  return h; }
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-slgo]"); if (!t || MODE !== "teach") return; slGo(+t.getAttribute("data-slgo")); });
(function () { var y0 = null; document.addEventListener("touchstart", function (e) { y0 = e.target.closest && e.target.closest(".sl-deck") ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener("touchend", function (e) { if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 60) slGo(SL.i + (dy < 0 ? 1 : -1)); }, { passive: true }); })();
function asked_(v) { return !!v && v !== "tskip"; }
function conceptHTML(c) {
  var pts = c.steps.map(function (st) { var kd = st.it.kind || "do"; return '<li class="cp k-' + esc(kd) + '"><span class="ck" aria-hidden="true">' + esc(KIC[kd] || "\u2192") + '</span><div><div class="prose">' + clean(st.it.html) + '</div>' + warmBtn(st) + '</div></li>'; }).join("");
  var figs = c.figs.map(function (f) { return '<figure class="tfig">' + img(f.b.img, plain(f.b.caption) || "Picture") + (f.b.caption ? '<figcaption>' + clean(f.b.caption) + '</figcaption>' : "") + '</figure>'; }).join("");
  return '<div class="concept' + (figs ? " withfig" : "") + '">' + (pts ? '<ul class="cpts">' + pts + '</ul>' : "") + (figs ? '<div class="cfigs">' + figs + '</div>' : "") + '</div>'; }
/* the thin strip above a quick-flow screen: part and time, notes behind an i, the book pages as a row of numbers */
function stripHTML(c) {
  if (!flowQuick()) return notesHTML(c);
  var h = "";   // the top bar already names the part and section
  var notes = (c.notes || []).concat(c.p && c.p.show && c === firstOfPart(c) ? [{ html: '<p><b>On screen:</b></p>' + c.p.show }] : []);
  if (notes.length) h += '<button type="button" class="qs-i" data-qnote aria-expanded="false"><span class="ic">i</span>' + (notes.length > 1 ? notes.length + " notes" : "Note") + '</button>';
  var pages = c.t === "board" ? c.items.map(function (it) { return it.it && it.it.page; }).filter(Boolean) : c.t === "quiz" && c.it.page ? [c.it.page] : [];
  pages = pages.filter(function (p, i) { return pages.indexOf(p) === i; }).sort();
  if (pages.length) h += '<button type="button" class="qs-i qs-bk" data-qpages aria-expanded="false"><span class="ic">\u25a4</span>Book pages ' + pages.length + '</button><span class="qs-pages" hidden>' + pages.map(function (pg) { var im = pageImg(pg); return '<button type="button" class="qs-pg" ' + (im ? 'data-pgimg="' + esc(im) + '"' : "disabled") + ' title="' + esc(((L.script && L.script.pages) || {})[pg] || "") + '">' + esc(pg.replace(/^p\./, "")) + '</button>'; }).join("") + '</span>';
  h = h ? '<div class="qstrip">' + h + '</div>' : "";
  if (notes.length) h += '<div class="qs-notes" hidden>' + notes.map(function (b) { return '<div class="prose">' + clean(b.html) + '</div>'; }).join("") + '</div>';
  return h; }
function firstOfPart(c) { for (var i = 0; i < TCH.seq.length; i++) if (TCH.seq[i].p === c.p) return TCH.seq[i]; return null; }
/* "p.172" -> the book spread that holds it, e.g. books/cgp-aqa-chemistry/p172-173.jpg */
function pageImg(pg) { var n = +String(pg).replace(/\D/g, ""); if (!n || !TREE) return null;
  var hit = TREE.filter(function (t) { var m = /^books\/[^/]+\/p(\d+)(?:-(\d+))?\.(?:jpe?g|png|webp)$/.exec(t.path); return m && n >= +m[1] && n <= +(m[2] || m[1]); })[0];
  return hit ? hit.path : null; }
function foldOn(subj) { var v = ls("tutor.fold." + subj); return v == null ? subj === "maths" : v === "1"; }
function hintsHTML(c) { if (!c.hints || !c.hints.length) return "";
  return '<details class="thints"><summary><span class="ic">?</span><b>Hints for you</b><span class="hint">' + c.hints.length + ' \u00b7 only if he gets stuck</span></summary><div class="prose">' + c.hints.map(function (h) { return '<div class="th">' + clean(h) + '</div>'; }).join("") + '</div></details>'; }
function notesHTML(c) { if (!c.notes) return "";
  return c.notes.map(function (b) { var t = plain(b.html), open = t.length <= 700;
    return '<details class="tnote"' + (open ? " open" : "") + '><summary><span class="ic">i</span><b>Note for you</b><span class="hint">' + esc(t.slice(0, 90)) + (t.length > 90 ? '\u2026' : "") + '</span></summary><div class="prose">' + clean(b.html) + '</div></details>'; }).join(""); }
/* the CGP pages a quiz draws on, grouped under the page heading */
function pageTags(items) { var H = (L.script && L.script.pages) || {}, by = {}, order = [];
  items.forEach(function (it) { if (!it.page) return; var h = H[it.page] || ""; if (!by[h]) { by[h] = {}; order.push(h); } by[h][it.page] = (by[h][it.page] || 0) + 1; });
  if (!order.length) return "";
  return '<div class="ptags">' + order.map(function (h) { return '<span class="ptag">' + (h ? '<b>' + esc(h) + '</b>' : "") + Object.keys(by[h]).sort().map(function (pg) { return '<span class="pp">' + esc(pg) + (by[h][pg] > 1 ? ' <i>\u00d7' + by[h][pg] + '</i>' : "") + '</span>'; }).join("") + '</span>'; }).join("") + '</div>'; }
function qtags(it) { var H = (L.script && L.script.pages) || {}, t = [];
  if (it.tag) t.push('<span class="qt tag">' + esc(it.tag) + '</span>');
  if (it.page) t.push('<span class="qt page">' + esc(it.page) + (H[it.page] ? ' \u00b7 ' + esc(H[it.page]) : "") + '</span>');
  if (it.kind) t.push('<span class="qt kind">' + esc({ recall: "Recall", reason: "Reasoning", draw: "Drawing" }[it.kind] || it.kind) + '</span>');
  if (it.topic) t.push('<span class="qt">' + esc(it.topic) + '</span>');
  return t.length ? '<div class="qtags">' + t.join("") + '</div>' : ""; }
function answerBox(html, page) { var H = (L.script && L.script.pages) || {};
  return '<details class="ans"><summary>Show answer</summary><div class="ansbody">' + (page ? '<div class="src">CGP ' + esc(page) + (H[page] ? ' \u00b7 ' + esc(H[page]) : "") + ' \u00b7 the book\u2019s words</div>' : "") + '<div class="prose">' + clean(html) + '</div></div></details>'; }
/* verdicts, laid out for a live lesson: the three you use most are big; keys 1 to 6 */
var VBIG = [["right", "\u2713", "Right"], ["wrong", "\u2717", "Wrong"], ["partly", "\u00bd", "Partly"]], VSMALL = [["wording", "Wording"], ["terminology", "Terminology"]];
function ctlBig(id, a, q, marks) { a = a || {};
  return '<div class="ctl big" data-item="' + esc(id) + '" data-q="' + esc(String(q || "").slice(0, 160)) + '"><div class="vmain">' +
    VBIG.map(function (v, i) { return '<button class="v vb vb-' + v[0] + '" type="button" data-v="' + v[0] + '" aria-pressed="' + (a.v === v[0]) + '"><span class="vi">' + v[1] + '</span>' + v[2] + '<kbd>' + (i + 1) + '</kbd></button>'; }).join("") +
    '</div>' + (SR ? '<button class="v vmic" type="button" data-mic title="Say what he said: tap, speak, it stops by itself (or hold M)" aria-label="Say what he said"><span class="vi" aria-hidden="true">\u{1F3A4}</span>Say it<kbd>M</kbd></button>' : "") + '<div class="vmore"><span class="hint">Right idea, wrong words:</span>' +
    VSMALL.map(function (v, i) { return '<button class="v vs" type="button" data-v="' + v[0] + '" aria-pressed="' + (a.v === v[0]) + '">' + v[1] + '<kbd>' + (i + 4) + '</kbd></button>'; }).join("") +
    (marks ? '<label class="mkin">Marks <input class="mk" type="number" min="0" step="0.5" inputmode="decimal" aria-label="Marks out of ' + esc(marks) + '" data-mk value="' + (a.m != null ? esc(a.m) : "") + '"><span class="hint num">/ ' + esc(marks) + '</span></label>' : "") +
    '<span class="vsep" aria-hidden="true"></span><button class="v vs" type="button" data-v="skipped" title="He did not attempt it" aria-pressed="' + (a.v === "skipped") + '">No answer<kbd>6</kbd></button></div>' +

    (a.note ? "" : '<button class="linkbtn addnote" type="button">+ Note what he said</button>') + '<input class="note" type="text" data-note aria-label="What he said" placeholder="What he said or got wrong" value="' + esc(a.note || "") + '"' + (a.note ? "" : " hidden") + '></div>'; }
/* say it instead of typing (Ali, 5 Oct): tap the mic (or hold M), say "said electrophile, not nucleophile";
   the browser's own speech-to-text (Chrome, Edge) writes it into that question's note and it is saved.
   The words go to Google or Microsoft to be turned into text; nothing else is recorded. */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null, MIC = null;
function micStart(box) { if (!SR || !box) return; if (MIC) { micStop(); return; }
  if (previewing()) { toast("Preview: press Start lesson first to record notes"); return; }
  var iid = box.getAttribute("data-item"), btn = $("[data-mic]", box), r = new SR(), heard = "";
  r.lang = "en-GB"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  MIC = { r: r, box: box, iid: iid };
  if (btn) { btn.classList.add("on"); btn.lastChild.previousSibling.textContent = "Listening"; }
  r.onresult = function (e) { heard = ""; for (var i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
    var inp = $("input[data-note]", box); if (inp) { inp.hidden = false; inp.value = micJoin(target(iid).note, heard); } };
  r.onerror = function (e) { toast(e.error === "not-allowed" ? "The browser blocked the microphone. Allow it in the address bar." : e.error === "no-speech" ? "Didn\u2019t hear anything" : "Speech to text didn\u2019t work: " + e.error); };
  r.onend = function () { var m = MIC; MIC = null; if (btn) { btn.classList.remove("on"); btn.lastChild.previousSibling.textContent = "Say it"; }
    heard = heard.trim(); if (!heard || !m) return;
    var a = target(iid); a.note = micJoin(a.note, heard); a.at = now(); save(iid, a);
    var inp = $("input[data-note]", box); if (inp) { inp.hidden = false; inp.value = a.note; } var add = $(".addnote", box); if (add) add.remove();
    micFix(iid, box); };
  try { r.start(); } catch (e) { MIC = null; toast("Speech to text didn\u2019t start"); } }
function micStop() { if (MIC) try { MIC.r.stop(); } catch (e) {} }
/* the mic mishears (Ali, 6 Oct): what it heard shows in a box at the bottom for a few seconds, so he can fix it there and then.
   Typing in it changes the note straight away (the input handler finds data-item on the bar); it stays open while he types. */
function micFix(iid, box) { micFixClose(); var a = target(iid), bar = document.createElement("div");
  bar.id = "micfix"; bar.className = "micfix"; bar.setAttribute("data-item", iid); bar.setAttribute("role", "status");
  bar.innerHTML = '<span class="lab">Heard</span><input class="note" type="text" data-note aria-label="Correct the note" value="' + esc(a.note || "") + '"><button class="btn small" type="button" data-micok>OK</button>';
  document.body.appendChild(bar); bar._box = box; micFixTimer(); }
function micFixTimer() { clearTimeout(timers.micfix); timers.micfix = setTimeout(function () { var b = $("#micfix"); if (b && !b.contains(document.activeElement)) micFixClose(); else micFixTimer(); }, 8000); }
function micFixClose() { var b = $("#micfix"); if (!b) return; clearTimeout(timers.micfix);
  var inp = b._box && $("input[data-note]", b._box); if (inp && L) inp.value = target(b.getAttribute("data-item")).note || ""; b.remove(); }
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-micok]")) micFixClose(); });
document.addEventListener("keydown", function (e) { var b = $("#micfix"); if (b && b.contains(e.target) && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); e.target.blur(); micFixClose(); } });
function micJoin(old, add) { old = (old || "").trim(); return old ? old + "; " + add.trim() : add.trim(); }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-mic]"); if (b) { e.preventDefault(); micStart(b.closest("[data-item]")); } });
document.addEventListener("keydown", function (e) { if ((e.key !== "m" && e.key !== "M") || e.repeat || MODE !== "teach" || e.ctrlKey || e.altKey || e.metaKey) return;
  var ae = document.activeElement; if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
  var box = $(".chunk.cur .vrail[data-item]") || $(".chunk.cur .ctl.big:not(.vrail), .tfoot .ctl.big"); if (box && SR) { e.preventDefault(); if (!MIC) micStart(box); } });
document.addEventListener("keyup", function (e) { if ((e.key === "m" || e.key === "M") && MIC) micStop(); });
function tposKey() { return "tutor.tpos." + CFG.student + "." + L.id + (PREP ? ".prep" : ""); }
function live() { return replay(L.session.time.log).running; }
/* Teach before the clock has ever started: rehearsing, so verdict taps are not recorded */
function previewing() { return MODE === "teach" && L && (PREP || !(L.session.time.log || []).length && L.session.status !== "finished"); }
var TLTAG = { q: "ask", ask: "ask", check: "ok", draw: "bad", say: "chem", show: "maths", core: "line", deep: "dash", "do": "line" };
function tlabel(kind, ic, text) { return '<div class="tlabel k-' + kind + '"><span class="tag lg ' + (TLTAG[kind] || "line") + '">' + esc(cap(text)) + '</span></div>'; }
var KIC = { say: "S", draw: "D", ask: "?", show: "▣", check: "✓" };
/* how many lines of a growing board are on his screen (kept on this device for the lesson) */
/* Ali's screen and his build together, one piece per tap (Ali, 14 Oct). A board is c.bd: {id, mode, ids, imgs, whys}.
   mode "grow": click-by-click pictures; mode "lines": one worked answer given line by line as hints (his turn).
   LINES[lesson|board] is the step on his screen: -1 nothing sent yet; 0 the question alone; then each piece. */
var LINES = {};
function bdKey(bd) { return bd.mode + ":" + bd.imgs.join("|") + (bd.box ? "@" + bd.box.join(",") : ""); }
function bdInfo(bd) { return Board.info(bdKey(bd)); }
function seenAt(c) { var v = LINES[L.id + "|" + c.bd.id]; return v == null ? -1 : v; }
function lineAt(c) { return Math.max(0, seenAt(c)); }
function bdSteps(c) { var b = bdInfo(c.bd); return b ? b.steps.length - 1 : null; }
function bdGroup(c, step) { var b = bdInfo(c.bd); return b && b.steps[step] ? b.steps[step].group : -1; }
function lineBtn(c) { var s = seenAt(c), n = bdSteps(c), hint = c.bd.mode === "lines";
  if (hint) return s < 1 ? "Give him a hint: line 1" : n != null && s >= n ? "Hints done · start again" : "Next hint line (" + (s + 1) + (n != null ? " of " + n : "") + ")";
  return s < 0 ? (PREP ? "Start the board" : "Show him the question") : n != null && s >= n ? "Start again" : "Next (" + (s + 1) + (n != null ? " of " + n : "") + ")"; }
var BANIM = null; // the board whose newest piece should write in on the next draw
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-line]"); if (!t || !L) return;
  var c = (TCH.seq || [])[TCH.pos]; if (!c || !c.bd) return; var n = bdSteps(c); if (n == null) return;
  var ln = seenAt(c) + 1; if (c.bd.mode === "lines" && ln < 1) ln = 1; if (ln > n) ln = c.bd.mode === "lines" ? -1 : 0;
  LINES[L.id + "|" + c.bd.id] = ln; BANIM = c.bd.id; if (!PREP && ln >= 0) showBoard(c, ln); drawTeach(); });
/* his turn (Ali, 14 Oct): the worked answer can go to him one line at a time, only when he is stuck */
function hintPic(b, d) { if (!/his turn/i.test(b.title || "") && !b.hints || !b.hintBox) return null; var m = /data-src="([^"]+)"/.exec(String(d[1] || "")); return m ? m[1] : null; }
function hintHTML(c) { if (!c || !c.bd) return ""; var s = seenAt(c);
  return '<div class="bhint stack s3"><div class="row"><span class="lab">' + (s < 1 ? "Stuck? Give him the answer one line at a time" : "Given to him so far") + '</span><button class="btn sm accent-soft push" type="button" data-hint="' + esc(c.key) + '">' + esc(lineBtn(c)) + '</button></div>' + (s >= 1 ? boardCanvas(c.bd, s, false) : "") + '</div>'; }
function hintChunk(k) { var hit = null; (TCH.seq || []).forEach(function (c) { if (c.t === "drill" && c.key === k) hit = c; if (c.t === "board") c.items.forEach(function (it) { if (it.t === "drill" && it.key === k) hit = it; }); }); return hit; }
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-hint]"); if (!t || !L) return;
  var c = hintChunk(t.getAttribute("data-hint")); if (!c || !c.bd) return;
  var go = function () { var n = bdSteps(c); if (n == null) return; var ln = seenAt(c) + 1; if (ln < 1) ln = 1; if (ln > n) ln = -1;
    LINES[L.id + "|" + c.bd.id] = ln; BANIM = c.bd.id; if (!PREP && ln >= 1) showBoard(c, ln); drawTeach(); };
  if (bdSteps(c) != null) go(); else Promise.all(c.bd.imgs.map(function (p) { return fileURL(/^(students|books|boards)\//.test(p) ? p : lessonBase(L.id) + p); }))
    .then(function (us) { return Board.analyse(bdKey(c.bd), us, c.bd.mode, c.bd.box); }).then(go).catch(function () { toast("Couldn\u2019t load the answer picture"); }); });
/* a canvas for a board, with its step labels beside it; boardMount() draws it once the pictures are in */
function boardCanvas(bd, step, ghost) { return '<div class="bwrap' + (bd.whys && bd.whys.some(Boolean) ? " has-why" : "") + '"><div class="bcvbox"><canvas class="bcv" data-bd="' + esc(JSON.stringify(bd)) + '" data-bstep="' + step + '"' + (ghost ? ' data-bghost="1"' : "") + ' role="img" aria-label="' + (bd.mode === "lines" ? "Hint lines" : "Board") + '"></canvas><div class="ph">Loading board</div></div><div class="bwhy" aria-live="polite"></div></div>'; }
function boardMount(root, anim) { $$("canvas.bcv", root).forEach(function (cv) { var bd = JSON.parse(cv.getAttribute("data-bd")), step = +cv.getAttribute("data-bstep"), ghost = cv.hasAttribute("data-bghost");
  Promise.all(bd.imgs.map(function (p) { return fileURL(/^(students|books|boards)\//.test(p) ? p : lessonBase(L.id) + p); })).then(function (us) {
    if (us.some(function (u) { return !u; })) throw new Error("missing");
    return Board.analyse(bdKey(bd), us, bd.mode, bd.box); }).then(function (b) { var ph = cv.nextElementSibling; if (ph && ph.classList.contains("ph")) ph.remove();
    Board.draw(cv, b, step, { ghost: ghost, animate: anim, hl: getComputedStyle(document.documentElement).getPropertyValue("--wording-wash").trim() || "#FBF3D2" });
    whyLabels(cv.closest(".bwrap").querySelector(".bwhy"), bd, b, step, ghost);
    var lb = document.querySelector('.tfoot [data-line="' + bd.id + '"]'), c = (TCH.seq || [])[TCH.pos]; if (lb && c && c.bd && c.bd.id === bd.id) lb.textContent = lineBtn(c);
    var hb = document.querySelector('[data-hint="' + bd.id + '"]'), hc = hb && hintChunk(bd.id); if (hb && hc) hb.textContent = lineBtn(hc); })
  .catch(function () { var ph = cv.nextElementSibling; if (ph) ph.textContent = "Couldn’t load the board."; }); }); }
/* step labels (the script's "why" on each click), beside the line they explain; the next one faint for Ali */
function whyLabels(box, bd, b, step, ghost) { if (!box || !bd.whys || !bd.whys.some(Boolean)) return; var g = b.steps[step].group, ng = b.steps[step + 1] ? b.steps[step + 1].group : -1;
  box.innerHTML = bd.whys.map(function (w, k) { var r = b.groups[k]; if (!w || !r || (k > g && !(ghost && k === ng))) return "";
    return '<span class="tag ' + (k === g ? "maths" : k > g ? "dash" : "line") + '" style="top:' + (100 * (r.y + r.h / 2) / b.H).toFixed(2) + '%">' + esc(w) + '</span>'; }).join("");
  /* two lines close together: push the later label down so they never sit on each other */
  var last = -1e9; $$(".tag", box).forEach(function (t) { var top = t.offsetTop - t.offsetHeight / 2; if (top < last + 4) { t.style.top = (last + 4 + t.offsetHeight / 2) + "px"; top = last + 4; } last = top + t.offsetHeight; }); }
/* send the board's state to the Student view; without one open, show the picture as before */
function showBoard(c, step) { var g = bdGroup(c, step), id = c.bd.ids[Math.max(0, Math.min(c.bd.ids.length - 1, g))];
  /* always send: a Student view in a window that is not in front may check in only once a minute (Windows and
     Chrome slow its timers), so "not heard from lately" does not mean it is closed (Ali, 14 Oct) */
  if (BC && L) BC.postMessage({ type: "show", lesson: L.id, id: id, board: Object.assign({}, c.bd, { step: step }) });
  if (BC && L && studentSeen[L.id] && Date.now() - studentSeen[L.id] < 180000) {
    toast(c.bd.mode === "lines" ? "Hint line " + step + " is on his screen" : step ? "Step " + step + " is on his screen" : "The question is on his screen"); return; }
  /* no Student view open: the board still builds on Ali's screen (he may be sharing it); say once how to send it */
  if (!showBoard.told) { showBoard.told = true; toast(c.bd.mode === "lines" ? "Open the Student view first, then give the hint" : "Building on your screen. Open the Student view to send it to him"); } }
function chunkKey(c) { return c.t === "quiz" ? c.it.id : c.t === "drill" ? c.key : c.t === "question" ? c.b.id : c.key || null; }
/* what one chunk is, in a few words: for the outline, the greyed lines and "up next" */
/* LaTeX as plain text for short labels (outline, grey lines, up next): a cut-off \( … \) would show raw code */
function texPlain(t) { return String(t).replace(/\\\(|\\\)|\\\[|\\\]/g, "").replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2").replace(/\\sqrt\{?([0-9a-z]+)\}?/g, "\u221a$1")
  .replace(/\\(sin|cos|tan|sec|cosec|cot|ln|log)\b/g, " $1 ").replace(/\\(theta|alpha|beta|pi)\b/g, function (m, g) { return { theta: "\u03b8", alpha: "\u03b1", beta: "\u03b2", pi: "\u03c0" }[g]; })
  .replace(/\\(,|;|!| )/g, " ").replace(/\\(left|right)/g, "").replace(/\^\{?2\}?/g, "\u00b2").replace(/\^\{?3\}?/g, "\u00b3").replace(/[{}]/g, "").replace(/\s+/g, " ").replace(/\b(sin|cos|tan|sec|cosec|cot|ln|log) \(/g, "$1(").trim(); }
function shortOf(c, n) { n = n || 90; var t = c.t === "phase" ? c.p.name : c.t === "mod" ? c.b.name : c.t === "step" ? plain(c.it.html) : c.t === "text" ? plain(c.b.html) :
    c.t === "quizpick" ? "Choose the quiz questions" : c.t === "quiz" ? plain(c.it.q) : c.t === "drill" ? plain(c.d[0]) : c.t === "question" ? (c.b.label || "Exam question") :
    c.t === "fig" ? (plain(c.b.caption) || "Picture") : c.t === "board" ? (c.kind === "quiz" ? "Oral quiz: " : (c.title || "Quick questions") + ": ") + c.items.length + " questions" :
    c.t === "concept" ? (c.mod || (c.steps[0] ? plain(c.steps[0].it.html) : "Pictures")) : c.t === "video" ? "Video: " + (c.b.title || "") : c.t === "reveal" ? (c.b.label || "Reveal") : c.t === "end" ? "End of the script" : (c.t || ""); t = texPlain(t);
  return t.length > n ? t.slice(0, n - 1) + "…" : t; }
function stateOf(c) { if (c.t === "board") { var n = c.items.filter(function (it) { return asked_((L.session.answers[boardKey(it)] || {}).v); }).length; return n ? "done" : ""; }
  if (c.t === "concept") { var ks = c.steps.map(function (st) { return st.key; }); return ks.length && ks.every(isDone) ? "done" : ks.some(function (k) { var d = L.session.done && L.session.done[k]; return d && d.off && d.skip; }) ? "s-skip" : ""; }
  var k = chunkKey(c); if (!k) return ""; if (c.t === "quiz" || c.t === "drill" || c.t === "question") { var a = L.session.answers[k]; return a && a.v ? "v-" + a.v : ""; } var dd = L.session.done && L.session.done[k]; return isDone(k) ? "done" : dd && dd.off && dd.skip ? "s-skip" : ""; }
function iconOf(c) { return c.t === "step" ? (KIC[c.it.kind] || "→") : c.t === "quiz" || c.t === "drill" ? "?" : c.t === "question" ? "Q" : c.t === "fig" ? "▧" : c.t === "video" ? "▶" : c.t === "mod" ? (c.b.level === "deep" ? "D" : "C") : c.t === "quizpick" ? "★" : "¶"; }
function chunkHTML(c) {
  var k = chunkKey(c), tk = k && { step: 1, text: 1, mod: 1 }[c.t] ? '<span class="ctick">' + tick_(k, shortOf(c)) + '</span>' : "";
  switch (c.t) {
    case "phase": var pk = kindOf(c.p.name); return '<div class="tphase stack s4"><div class="tags">' + tag("Part " + (phases().indexOf(c.p) + 1)) + (pk ? tag(esc(pk), pk === "If time" ? "dash" : "line") : "") + (c.p.start != null ? tag(c.p.start + " to " + c.p.end + " min", "num") : "") + '</div><h2>' + esc(partTitle(c.p.name)) + '</h2>' + (c.p.show ? '<div class="screen"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg><div class="stack" style="gap:2px"><span class="lab">On his screen</span><div>' + clean(c.p.show) + '</div></div></div>' : "") + (L.script && L.script.focus && phases()[0] === c.p ? focusTable(L.script.focus) : "") + phasePages(c.p) + '</div>';
    case "mod": return tk + tlabel(c.b.level === "deep" ? "deep" : "core", c.b.level === "deep" ? "D" : "C", (c.b.level === "deep" ? "If time" : "Core") + (c.b.minutes ? " · " + c.b.minutes + " min" : "")) + '<h2 style="font-size:var(--fs-xl)">' + esc(c.b.name) + '</h2>';
    case "step": var kd = c.it.kind || "do"; return tk + tlabel(kd, KIC[kd] || "\u2192", KIND[kd] || kd) + '<div class="big prose">' + clean(c.it.html) + '</div>' + warmBtn(c);
    case "text": var g2 = gradeRows(clean(c.b.html)); return tk + (g2.rows.length ? tlabel("q", "?", "Ask him row by row · " + g2.rows.filter(function (r) { var a = L.session.answers[r.k]; return a && asked(a.v); }).length + " of " + g2.rows.length + " asked") : "") + '<div class="prose big">' + g2.html + '</div>';
    case "fig": return '<figure class="tfig">' + img(c.b.img, plain(c.b.caption) || "Picture") + (c.b.caption ? '<figcaption>' + clean(c.b.caption) + '</figcaption>' : "") + '</figure>';
    case "quizpick": var its = c.b.items || [], f = quizFilter(its);
      return tlabel("q", "\u2605", "Oral quiz \u00b7 which questions?") + '<p class="hint" style="margin:0 0 12px">Pick a set. Only those questions come up next, in order. You can change it from any quiz question.</p><div class="qbar" role="group" aria-label="Quiz questions">' +
        quizChoices(its).map(function (q) { return '<button class="chip" type="button" data-qf="' + esc(q.f) + '" aria-pressed="' + (f === q.f) + '">' + esc(q.label) + ' <b class="num">' + q.n + '</b></button>'; }).join("") + '</div>' +
        '<div class="label" style="margin-top:18px">Book pages in this set</div>' + pageTags(its.filter(function (i) { return quizOn(i, f); }));
    case "quiz": var a = L.session.answers[c.it.id] || {}, pick = seqIndex(function (q) { return q.t === "quizpick" && q.b === c.b; });
      return '<div class="qhead">' + tlabel("q", "?", "Oral quiz \u00b7 " + c.n + " of " + c.of) + '<button class="linkbtn qset" type="button" data-tjump="' + pick + '">Set: ' + esc((quizChoices(c.b.items || []).filter(function (q) { return q.f === quizFilter(c.b.items || []); })[0] || {}).label || "All") + ' \u00b7 change</button></div>' +
        qtags(c.it) + '<div class="qtext prose">' + paperHTML(c.it.q, subjNow()) + '</div>' + answerBox(c.it.a, c.it.book ? c.it.page : null) + hintsHTML(c) + ctlBig(c.it.id, a, plain(c.it.q));
    case "drill": var a2 = L.session.answers[c.key] || {};
      return '<div class="qhead">' + tlabel("q", "?", (c.title || "Drill") + (c.of > 1 ? " \u00b7 " + c.n + " of " + c.of : "")) + '</div><div class="qtext prose">' + paperHTML(c.d[0], subjNow()) + '</div>' + answerBox(c.d[1]) + hintHTML(c) + hintsHTML(c) + ctlBig(c.key, a2, plain(c.d[0]));
    case "question": return (c.b.parts || []).length ? sliderHTML(c) + hintsHTML(c) : (c.bd ? '<div class="tags growtag">' + tag(lineAt(c) <= 0 ? "Question only" : "Step " + lineAt(c) + (bdSteps(c) != null ? " of " + bdSteps(c) : ""), "line") + (bdSteps(c) == null || lineAt(c) < bdSteps(c) ? tag("Faint: what comes next, only you see it", "dash") : "") + (PREP ? "" : tag(seenAt(c) < 0 ? "Not on his screen yet" : "His screen: " + (seenAt(c) ? "step " + seenAt(c) : "the question"))) + '</div>' : "") + questionBlock(c.bd ? Object.assign({}, c.b, { img: c.full, id: c.lines[c.lines.length - 1], board: c.bd }) : c.b, true) + hintsHTML(c);
    case "board": return boardHTML(c);
    case "concept": return conceptHTML(c);
    case "end": return '<div class="tphase stack s4"><div class="tags">' + tag("Done", "ok") + '</div><h2>End of the script</h2><span class="hint">Log times, notes and what to change next time.</span><div class="row"><button class="btn" type="button" data-store>Add a section from the Store</button><button class="btn next" type="button" data-tgo="after">After the lesson</button></div></div>';
    default: return block(c.b || {});
  }
}
function phasePages(p) { var its = []; (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "quiz") its = its.concat(b.items || []); if (b.blocks) walk(b.blocks); }); })(p.blocks);
  return its.length ? '<div class="label" style="margin-top:18px">Book pages in this quiz</div>' + pageTags(its) : ""; }
/* steps that mention the warm-up get a button that opens it here */
function warmBtn(c) { return c.t === "step" && /warm-up/i.test(plain(c.it.html)) ? '<button class="btn small" type="button" data-warmup style="margin-top:12px">Open the mistakes warm-up</button>' : ""; }
function pastLine(c, i) { var st = stateOf(c);
  return '<button type="button" class="pastline ' + st + '" data-tjump="' + i + '"><span class="ic">' + iconOf(c) + '</span><span class="tx">' + esc(shortOf(c, 120)) + '</span>' + (st === "done" ? '<span class="mk">✓ Taught</span>' : st === "s-skip" ? '<span class="mk">Skipped</span>' : st === "v-tskip" ? '<span class="mk">You skipped it</span>' : st === "v-skipped" ? '<span class="mk">No answer</span>' : st ? '<span class="mk">' + esc(cap(st.slice(2))) + '</span>' : "") + '</button>'; }
function drawTeach() {
  var s = L.script || {}, x = L.session, subj = s.subject || x.subject; document.body.setAttribute("data-subject", subj); document.body.classList.add("teaching"); document.body.classList.toggle("prep", PREP);
  var tid = L.id + (PREP ? "|prep" : ""), keepRef = TCH.id === tid && TCH.seq[TCH.pos], ae = document.activeElement, fgo = ae && ae.closest && ae.closest(".tfoot") && ae.getAttribute("data-tgo");
  if (TCH.id !== tid) { TCH = { id: tid, seq: teachSeq(), pos: +(ls(tposKey()) || 0), open: {} }; }
  else { TCH.seq = teachSeq(); if (keepRef) { var j = TCH.seq.findIndex(function (q) { return q.t === keepRef.t && (q.it && q.it === keepRef.it || q.b && q.b === keepRef.b && !q.it && !q.d || q.d && q.d === keepRef.d || q.p === keepRef.p && q.t === "phase"); }); if (j >= 0) TCH.pos = j; } }
  if (TCH.pos >= TCH.seq.length) TCH.pos = TCH.seq.length - 1;
  var c = TCH.seq[TCH.pos], pct = Math.round(100 * TCH.pos / Math.max(1, TCH.seq.length - 1)), lv = live();
  if (c.p) L.phase = c.p.id;
  var pk = c.p ? kindOf(c.p.name) : "", reals = phases().filter(function (p) { return !p.sys && kindOf(p.name) !== "Bank" && kindOf(p.name) !== "Recycle"; });
  var inPart = c.p ? TCH.seq.filter(function (q) { return q.p === c.p; }) : [], pf = inPart.length ? Math.round(100 * (inPart.indexOf(c) + 1) / inPart.length) : 0;
  var h = '<div class="teach3">' + runwayHTML(c) + '<section class="stage"><div class="tbar"><div class="tbar-row"><div class="tcrumb">' +
    '<button class="btn sm outl" type="button" id="toc" aria-label="Outline">☰<span class="olab"> Outline</span></button>' + (PREP ? '<a class="btn sm quiet back" href="#/">Lessons</a>' : '<a class="btn sm quiet back" href="#/lesson/' + encodeURIComponent(L.id) + '" title="Prepare: the same screens, nothing recorded">Prepare</a>') + '' + (pk ? tag(esc(pk), pk === "If time" ? "dash" : "line") : "") + '<b>' + esc(c.p ? (partTitle(c.p.name)) : "End") + '</b>' + (c.mod ? '<span class="hint">· ' + esc(c.mod) + '</span>' : "") + '</div>' +
    '<div class="tmini"><span class="tmore"><button class="btn sm" type="button" data-tmore aria-expanded="false" aria-label="More: warm-up, suggest a change, try-out">⋯<span class="tdot" id="wudot" hidden></span></button>' +
      '<div class="tmenu" hidden>' + (PREP ? '<a class="btn sm pri" href="#/lesson/' + encodeURIComponent(L.id) + '/teach">Teach this lesson</a>' : "") + '<button class="btn sm" type="button" data-store>Add from the Store</button>' + (PREP ? "" : '<button class="btn sm" type="button" data-cvp>Canvas</button>') + '<button class="btn sm" type="button" data-warmup>Warm-up<span class="badge" id="wudue" hidden></span></button><button class="btn sm" type="button" data-suggest>Suggest a change</button><button class="btn sm trytoggle" type="button" data-trytoggle>' + (TRY ? "Leave try-out" : "Try-out") + '</button>' + LPAGES.map(function (q) { return '<button class="btn sm" type="button" data-phase="' + q[0] + '" data-real="">' + q[1] + '</button>'; }).join("") + '</div></span>' +
      (PREP ? "" : '<button class="btn sm" type="button" data-cvp aria-expanded="' + CV.open + '">Canvas</button>') + '<a class="btn sm" href="#/lesson/' + encodeURIComponent(L.id) + '/student" target="_blank" rel="noopener">Student view <svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"></path></svg></a>' +
      '<span class="tag num"><span class="olab">Step </span>' + (TCH.pos + 1) + ' of ' + TCH.seq.length + '</span>' +
      (PREP ? tag("Prepare", "line") + '<a class="btn sm pri" href="#/lesson/' + encodeURIComponent(L.id) + '/teach">Teach</a></div></div>' : (lv ? "" : previewing() ? '<button type="button" class="preview" data-pvhelp title="Nothing is recorded until you press Start lesson, verdicts included. You can still tick a step by hand.">Preview</button>'
        : '<button type="button" class="preview stopped" data-pvhelp title="The clock is stopped. Taught, Skip and verdicts still count.">Clock stopped</button>') +
      '<span class="clockpill' + (lv ? " live" : "") + '"><span class="dot"></span><span class="t" id="clk">0:00</span></span><button class="btn sm' + (lv ? "" : " pri") + (clockNag(lv) ? " nag" : "") + '" id="clkgo" type="button"></button>' + ((L.session.time.log || []).length && !endedLog(L.session.time.log) ? '<button class="btn sm danger" id="clkend" type="button" title="Stops the clock for good. Notes and times go under After the lesson.">End<span class="olab"> lesson</span></button>' : "") + '</div></div>') +
    (reals.length > 1 ? '<div class="flow ' + esc(subj) + ' tflow" aria-hidden="true">' + reals.map(function (p) { var on = p === c.p, past = c.p && reals.indexOf(p) < reals.indexOf(c.p);
      return '<span style="flex:' + pw(p) + '"' + (on ? ' class="on"' : "") + '><i' + (on ? ' style="background:linear-gradient(90deg,var(--accent) ' + pf + '%,var(--line) ' + pf + '%)"' : past ? ' style="background:var(--accent);opacity:.45"' : "") + '></i></span>'; }).join("") + '</div>' : '<div class="tprog" aria-hidden="true"><i style="width:' + pct + '%"></i></div>') +
    (PREP ? "" : clockNag(lv)) + '</div><div class="tstage">';
  /* the last two chunks of the same section as short grey lines, then the current one */
  var keep = window.innerWidth < 900 ? 1 : 2, start = TCH.pos;
  while (start > 0 && TCH.pos - start < keep && TCH.seq[start - 1].p === c.p && TCH.seq[start - 1].mod === c.mod && TCH.seq[start - 1].t !== "phase") start--;
  h += '<div id="tbody">';
  if (!flowQuick()) for (var i = start; i < TCH.pos; i++) h += pastLine(TCH.seq[i], i);
  h += '<div class="chunk cur t-' + c.t + (stateOf(c) === "done" ? " done" : "") + '" data-tk="' + esc(chunkKey(c) || "") + '">' + stripHTML(c) + chunkHTML(c) + '</div>';
  var nx = TCH.seq[TCH.pos + 1];
  h += '</div>' + (nx ? '<button type="button" class="upnext" data-tjump="' + (TCH.pos + 1) + '"><b class="lab">Up next</b><span>' + esc(shortOf(nx, 130)) + '</span></button>' : "") + '</div>' + footHTML(c, lv) + '</section></div>';
  app.innerHTML = h; fillRows(app); loadImages(app); boardMount(app, !!BANIM); BANIM = null; maths(app); tick(); pingStudent();
  window.scrollTo(0, 0); fitBoards(); fitBoard(); applyFit(); warmCount(); prefetchLesson(); prefetchAhead(TCH.seq.slice(TCH.pos + 1, TCH.pos + 5));
  if (fgo) { var fb = $('.tfoot [data-tgo="' + fgo + '"]') || $(".tfoot .btn.next") || $(".tfoot .btn"); if (fb && !fb.disabled) fb.focus({ preventScroll: true }); }
  /* move only the outline's own scroll box: scrollIntoView also scrolled the page down (Ali, 2 Oct) */
  var ol = $(".outline"), oc = $(".outline .cur"); if (ol && oc && ol.clientHeight) ol.scrollTop += oc.getBoundingClientRect().top - ol.getBoundingClientRect().top - ol.clientHeight / 2 + oc.offsetHeight / 2;
  if (window.scrollY) window.scrollTo(0, 0);
  ls(tposKey(), String(TCH.pos));
  if (STARTCLOCK === L.id && !PREP) { STARTCLOCK = null; var cg = $("#clkgo"); if (cg && !live()) cg.click(); }
  checkOther();
}
/* moving through the script with the clock stopped: a bar that stays until the clock runs (Ali, 10 Oct: "sometimes i forget to start it, sometimes i forget to unpause it") */
function clockNag(lv) {
  var bk = ckJSON("tutor.break");
  if (!lv && bk && bk.id === L.id && L.session.status !== "finished") { var left = Math.max(0, Math.ceil((bk.until - Date.now()) / 60000));
    return '<div class="clocknag brk" role="status"><span class="dot" aria-hidden="true"></span><span><b>On a break since ' + esc(hhmm(bk.at)) + '.</b> ' + (left ? left + ' min left, then a reminder.' : 'Time is up.') + '</span><button class="btn sm pri" type="button" data-clkgo>Resume</button><button class="btn sm quiet" type="button" data-ck="more">5 more min</button></div>'; }
  if (lv || !TCH.moved || TCH.nagOff || L.session.status === "finished" || endedLog(L.session.time.log)) return "";
  var never = !(L.session.time.log || []).length;
  return '<div class="clocknag" role="status"><span class="dot" aria-hidden="true"></span><span><b>' + (never ? "The clock has not started." : "The clock is paused.") + '</b> ' + (never ? "Nothing is recorded, verdicts included." : "This time is not counted.") + '</span>' +
    '<button class="btn sm pri" type="button" data-clkgo>' + (never ? "Start lesson" : "Resume") + '</button><button class="btn sm quiet" type="button" data-nagoff>Not now</button></div>';
}
function footHTML(c, lv) {
  var taughtable = { step: 1, mod: 1, concept: 1, board: 1 }[c.t] || (c.t === "text" && c.key), mid = "";
  if (c.bd) mid += '<button class="btn accent-soft" type="button" data-line="' + esc(c.bd.id) + '">' + esc(lineBtn(c)) + '</button>';
  if (c.bd) {} else if (c.t === "question" && (c.b.img || []).length && !PREP) mid += '<button class="btn accent-soft" type="button" data-show="' + esc(c.b.id) + '">Show him</button>';
  if (!c.bd && c.t === "question" && ((c.b.img || []).length || (c.b.parts || []).length) && !PREP) mid += '<button class="btn accent-soft" type="button" data-cvadd="' + esc(c.b.id) + '">Add to canvas</button>';
  if (c.t === "mod") mid += '<button class="btn quiet" type="button" data-tskip="mod">Skip this section</button>';
  if (c.t === "phase") mid += '<button class="btn quiet" type="button" data-tskip="phase">Skip this part</button>';
  // Taught / Skip / Next once the lesson has started (clock running, paused or ended); before that only Next
  var three = !previewing() && taughtable && c.t !== "mod", qk = { quiz: 1, drill: 1, question: 1 }[c.t] && chunkKey(c), qa = qk && L.session.answers[qk];
  var iskip = qk && !PREP ? '<button class="btn dash iskip" type="button" data-tiskip aria-pressed="' + !!(qa && qa.v === "tskip") + '" title="You chose not to ask it: not a verdict, never a mistake">Not asked <kbd>0</kbd></button>' : "";
  var lab = c.t === "phase" ? "Start this part" : c.t === "mod" ? "Teach this" : "Next";
  return '<div class="tfoot' + (three ? " three" : "") + '"><button class="btn" type="button" data-tgo="-1"' + (TCH.pos === 0 ? " disabled" : "") + '><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>Back</button><div class="mid">' + mid + '</div>' +
    (c.t === "end" ? "" : three
      ? '<button class="btn dash skip" type="button" data-tgo="skip" title="You skipped this on purpose: recorded, not ticked">Skip <kbd>S</kbd></button><button class="btn quiet look" type="button" data-tgo="next" title="Move on without ticking">Look ahead <kbd>\u2192</kbd></button><button class="btn next" type="button" data-tgo="+1">Taught, next <kbd>T</kbd><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>'
      : iskip + '<button class="btn next" type="button" data-tgo="+1">' + lab + ' <kbd>\u2192</kbd><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>') + '</div>';
}
/* outline: every part, section and chunk, so any point can be reached; the clock as a pin on a time bar */
function pw(p) { return p.start != null && p.end != null ? Math.max(2, p.end - p.start) : 4; }
function runwayHTML(c) {
  var s = L.script || {}, x = L.session, ps = phases().filter(function (p) { return !p.sys; }), ci = c.p ? ps.indexOf(c.p) : ps.length;
  var timed = ps.filter(function (p) { return p.start != null; }), total = timed.length ? Math.max.apply(null, timed.map(function (p) { return p.end; })) : 45;
  TCH.rw = { total: total, cur: c.p || null };
  var bar = '<div class="tl" aria-hidden="true">' + timed.map(function (p) { return '<span class="' + (ps.indexOf(p) < ci ? "past" : p === c.p ? "cur" : "") + '" style="left:' + (100 * p.start / total) + '%;width:' + (100 * (p.end - p.start) / total) + '%"></span>'; }).join("") + '<b class="pin" id="rwpin" hidden></b></div>';
  var parts = ps.map(function (p, i) {
    var its = phaseItems(p), qs = its.filter(function (q) { return q.kind === "q"; }), used = qs.filter(usedOrDone), right = used.filter(function (q) { return x.answers[q.k] && x.answers[q.k].v === "right"; });
    var pm = x.time.phaseMinutes && x.time.phaseMinutes[p.id];
    var sub = [p.start != null ? p.start + " to " + p.end + " min" : "", pm ? "Took " + pm : "", used.length ? right.length + "/" + used.length + " right" : ""].filter(Boolean).join(" · ");
    var rows = "", lastMod = null;
    TCH.seq.forEach(function (q, j) { if (q.p !== p || q.t === "phase") return;
      if (q.t === "mod") { rows += '<button type="button" class="om' + (j === TCH.pos ? " cur" : "") + (isDone(q.key) ? " done" : "") + '" data-tjump="' + j + '">' + esc(q.b.name) + (q.b.level === "deep" ? ' <small>If time</small>' : "") + '</button>'; lastMod = q.b.name; return; }
      rows += '<button type="button" class="oc ' + stateOf(q) + (j === TCH.pos ? " cur" : "") + (q.mod ? " in" : "") + '" data-tjump="' + j + '"><span class="ic">' + iconOf(q) + '</span><span class="tx">' + esc(shortOf(q, 70)) + '</span></button>'; });
    var open = TCH.open[p.id] != null ? TCH.open[p.id] : i === ci;
    var pj = flowQuick() ? seqIndex(function (q) { return q.p === p; }) : seqIndex(function (q) { return q.t === "phase" && q.p === p; });
    return '<details class="opart' + (i < ci ? " past" : i === ci ? " now" : "") + '" data-pid="' + esc(p.id) + '"' + (open ? " open" : "") + '><summary>' + (kindOf(p.name) ? '<span class="kinds"><span class="k">' + esc(kindOf(p.name)) + '</span></span>' : "") + '<span class="nm">' + esc(partTitle(p.name)) + '</span>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : "") + '</summary>' +
      '<button type="button" class="oc go' + (TCH.pos === pj ? " cur" : "") + '" data-tjump="' + pj + '"><span class="ic">▸</span><span class="tx">Start of this part</span></button>' + rows + '</details>';
  }).join("");
  var subj = s.subject || x.subject, pd = parseId(L.id);
  return '<aside class="runway" aria-label="Lesson outline"><div class="rhead">' + (PREP ? '<a class="back" href="#/">← Lessons</a>' : '<a class="back" href="#/lesson/' + encodeURIComponent(L.id) + '">← Prepare</a>') + '<button class="btn small outl" type="button" id="tocx">Close</button></div>' +
    '<div class="tags">' + subjTag(subj) + tag(esc(fmtDate(s.date || x.date || pd.date))) + lessonTags(s, x) + '</div><div class="ttl">' + esc(lessonTitle(s, x)) + '</div>' +
    bar + '<div class="onclock" id="onclock" hidden><span id="onclockt"></span></div><nav class="outline">' + parts + '</nav></aside>';
}
/* a board or picture fills the space between the top bar and the buttons: no scrolling to see the bottom */
/* question screens without scrolling: Flip is the one layout (Ali, 8 Oct: Classic, Side panel and Floating card removed) */
var flipOn = false;
var LPAGES = [["_extra", "Extra questions"], ["_work", "His work"], ["_time", "Times"], ["_after", "After the lesson"]];
function applyFit() { var cur = $(".chunk.cur"); document.body.setAttribute("data-tlayout", "flip");
  if (!cur || !/\bt-(question|quiz|drill)\b/.test(cur.className) || $(".slider", cur)) return;
  applyFlip(cur); }
/* "flip" (Ali, 2 Oct: the side panel shrinks the question, the floating card covers it): the question has the whole
   screen at full size; the verdict buttons sit in a strip in the bottom bar, so nothing covers it; "Show answer" (key A)
   turns the whole screen into the answer and mark scheme at full size, and back */
function applyFlip(cur) {
  /* front: the question, your notes, and the answer text under it when it fits (Ali, 5 Oct).
     back ("Mark scheme", key A): the answer's pictures and mark schemes at full width, then your hints;
     an answer too long for the front goes to the back as well (fitFront decides, after the pictures load) */
  var ans = document.createElement("div"), left = document.createElement("div"), strip = document.createElement("div"), pics = document.createElement("div");
  ans.className = "fita flipa"; left.className = "fitq"; strip.className = "vstrip"; pics.className = "figrow";
  $$(".tnote", cur).forEach(function (n) { n.open = false; });   // your notes stay with the question (before he starts), folded to one line
  var front = document.createElement("div"), backText = document.createElement("div");
  front.className = "ansfront"; backText.className = "ansback";
  $$(".ans, details.reveal", cur).filter(function (el) { return !el.parentNode.closest(".ans, details.reveal"); }).forEach(function (el) {
    $$("figure.fig", el).forEach(function (f) { pics.appendChild(f); });
    var src = el.querySelector(".src"), pr = el.querySelector(".prose"), txt = pr && pr.textContent.replace(/Loading image/g, "").trim();
    if (txt || src) { var blk = '<div class="ansf-l">Answer</div>' + (src ? src.outerHTML : "") + (pr ? '<div class="prose">' + pr.innerHTML + '</div>' : "");
      front.insertAdjacentHTML("beforeend", blk); backText.insertAdjacentHTML("beforeend", blk); }
    el.remove(); });
  var hints = $$(".thints", cur); hints.forEach(function (h) { h.open = true; });
  var ctlb = $(".ctl.big", cur);
  while (cur.firstChild) left.appendChild(cur.firstChild);
  if (front.childNodes.length) { left.appendChild(front); left.insertAdjacentHTML("beforeend", '<div class="ansmore" hidden>The answer is long: it is on the back. Press <b>A</b>.</div>'); }
  ans.insertAdjacentHTML("afterbegin", '<div class="flip-h">' + esc(shortOf(TCH.seq[TCH.pos], 110)) + '</div>');
  if (pics.childNodes.length) ans.appendChild(pics);   // mark scheme pictures first, at full size (Ali, 5 Oct)
  if (backText.childNodes.length) { backText.hidden = true; ans.appendChild(backText); }
  hints.forEach(function (h) { ans.appendChild(h); });
  var hasBack = !!(pics.childNodes.length || hints.length), hasAns = !!backText.childNodes.length;
  cur.appendChild(left); cur.appendChild(ans); cur.classList.add("fit", "flip"); cur.classList.toggle("flipped", flipOn && (hasBack || hasAns));
  // the button is there whenever there is an answer; fitFront hides it when the back would be empty
  if (ctlb && PREP) { ctlb.remove(); ctlb = null; }
  if (ctlb) { var iid = ctlb.getAttribute("data-item"), mk = $("input[data-mk]", ctlb);
    ctlb.remove(); cur.insertAdjacentHTML("beforeend", vrail(iid, target(iid), ctlb.getAttribute("data-q"), { flip: hasBack || hasAns ? "data-flip" : "", flipped: flipOn && (hasBack || hasAns), flipHidden: !hasBack, marks: mk && mk.getAttribute("aria-label").replace(/\D+/g, "") })); }
  else { strip.innerHTML = hasBack || hasAns ? '<button type="button" class="btn flipbtn" data-flip' + (hasBack ? "" : " hidden") + '>' + (flipOn ? "\u2190 Question" : "Mark scheme") + ' <kbd>A</kbd></button>' : "";
    var foot = $(".tfoot"); if (foot && (hasBack || hasAns)) foot.insertBefore(strip, foot.firstChild); }
  if (front.childNodes.length) maths(front); if (hasAns) maths(backText);
  loadImages(ans); fitQ(); }
/* the answer text sits on the front only when the question (with its picture at full fit) leaves room for it */
function fitFront(cur, left) {
  var front = $(".ansfront", left), more = $(".ansmore", left), back = $(".ansback", cur); if (!front) return;
  front.hidden = false; if (more) more.hidden = true; if (back) back.hidden = true;
  if (more) more.hidden = true;
  var long = left.scrollHeight > left.clientHeight + 1, btn = $("[data-flip]");
  front.hidden = long; if (more) more.hidden = !long; if (back) back.hidden = !long;
  if (long) cur.setAttribute("data-longans", "1"); else cur.removeAttribute("data-longans");
  if (btn) btn.hidden = !long && !$(".flipa .figrow .fig, .flipa .thints", cur); }
function flipIt() { if ($(".chunk.cur .slider")) { slFlip(); return; }
  var cur = $(".chunk.cur.flip"), fb = $("[data-flip]"); if (!cur || !fb || fb.hidden) return; flipOn = !flipOn; cur.classList.toggle("flipped", flipOn);
  if (fb.classList.contains("vr")) fb.setAttribute("aria-pressed", String(flipOn)); else fb.firstChild.textContent = flipOn ? "\u2190 Question " : "Mark scheme "; fitQ(); }
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-flip]"); if (t) flipIt(); });
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-bopen],[data-qnote],[data-qpages],[data-pgimg]"); if (!t || MODE !== "teach") return;
  if (t.hasAttribute("data-qpages")) { var pr = $(".chunk.cur .qs-pages"); if (pr) { pr.hidden = !pr.hidden; t.setAttribute("aria-expanded", String(!pr.hidden)); } return; }
  if (t.hasAttribute("data-bopen")) { var k = t.getAttribute("data-bopen"); BOARD.open = BOARD.open === k ? null : k; redrawBoard(); return; }
  if (t.hasAttribute("data-qnote")) { var nb = $(".chunk.cur .qs-notes"); if (nb) { nb.hidden = !nb.hidden; t.setAttribute("aria-expanded", String(!nb.hidden)); } return; }
  var pgs = $$(".chunk.cur [data-pgimg]"); openZoom(pgs.map(function (b) { return function () { return fileURL(b.getAttribute("data-pgimg")); }; }), Math.max(0, pgs.indexOf(t))); });
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-vrmore]"), m = $(".vrail .vrmenu");
  if (!t) { if (m && !m.hidden && !e.target.closest(".vrmenu")) { m.hidden = true; var b = $("[data-vrmore]"); if (b) b.setAttribute("aria-expanded", "false"); } return; }
  if (!m) return; m.hidden = !m.hidden; t.setAttribute("aria-expanded", String(!m.hidden)); if (!m.hidden && !$(".vrmenu input[data-note]").value) $(".vrmenu input[data-note]").focus(); });
function fitBoard() { var bd = $(".chunk.cur .board"), foot = $(".tfoot"); if (!bd || !foot) return;
  bd.style.maxHeight = Math.max(220, window.innerHeight - bd.getBoundingClientRect().top - foot.getBoundingClientRect().height - 34) + "px"; }
window.addEventListener("resize", function () { if (MODE === "teach") fitBoard(); });
function redrawBoard() { var c = TCH.seq[TCH.pos], cur = $(".chunk.cur"); if (!c || c.t !== "board" || !cur) return;
  var y = $(".chunk.cur .board") && $(".chunk.cur .board").scrollTop; cur.innerHTML = stripHTML(c) + chunkHTML(c); maths(cur); loadImages(cur);
  fitBoard(); var bd = $(".chunk.cur .board"); if (bd && y) bd.scrollTop = y; var o = $(".chunk.cur .brow.open"); if (o && o.scrollIntoView) o.scrollIntoView({ block: "nearest" }); }
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-vmore]"); if (!t) return; var st = t.closest(".vstrip"), on = !st.classList.contains("more"); st.classList.toggle("more", on); t.setAttribute("aria-expanded", String(on)); fitQ(); });
function fitQ() { var cur = $(".chunk.cur.fit"), foot = $(".tfoot"); if (!cur || !foot) return;
  var fh = foot.getBoundingClientRect().height; document.documentElement.style.setProperty("--footh", fh + "px");
  var room = Math.max(300, window.innerHeight - cur.getBoundingClientRect().top - fh - 22); cur.style.height = room + "px";
  var left = cur.classList.contains("flipped") ? cur.querySelector(".fita") : cur.querySelector(".fitq"), ims = $$(".fig img", left).filter(function (i) { return !i.hidden; });
  var front = !cur.classList.contains("flipped") && $(".ansfront", left), more = front && $(".ansmore", left);
  if (front) { front.hidden = true; if (more) more.hidden = false; }   // the question's picture is sized first, leaving room for the "on the back" line
  if (cur.classList.contains("flipped")) { ims.forEach(function (i) { i.style.maxHeight = Math.max(200, left.clientHeight - 60) + "px"; }); return; }   // back: each picture as big as the card; the back scrolls
  fitPics(left, ims); if (front) fitFront(cur, left); }
function fitPics(left, ims) {
  if (!ims.length) return;
  var rows = []; ims.forEach(function (i) { var r = i.closest(".figrow") || i; if (rows.indexOf(r) < 0) rows.push(r); });
  var per = left.clientHeight; ims.forEach(function (i) { i.style.maxHeight = per + "px"; });
  per = Math.min(per, Math.max.apply(null, ims.map(function (i) { return i.getBoundingClientRect().height || per; })));
  for (var k = 0; k < 6 && left.scrollHeight > left.clientHeight + 1 && per > 90; k++) {
    per = Math.max(90, per - (left.scrollHeight - left.clientHeight + 4) / rows.length); ims.forEach(function (i) { i.style.maxHeight = per + "px"; }); } }
document.addEventListener("load", function (e) { if (MODE === "teach" && e.target && e.target.tagName === "IMG" && $(".chunk.cur.fit")) fitQ(); }, true);
window.addEventListener("resize", function () { if (MODE !== "teach" || !L) return; fitQ(); });
function fitBoards() { var f = $(".chunk.cur .tfig"), foot = $(".tfoot"); if (!f || !foot) return;
  var cap = f.querySelector("figcaption"), room = window.innerHeight - f.getBoundingClientRect().top - foot.getBoundingClientRect().height - (cap ? cap.offsetHeight + 10 : 0) - 34;
  var im = f.querySelector("img"); if (im) im.style.maxHeight = Math.max(220, room) + "px"; }
window.addEventListener("resize", function () { if (MODE === "teach") fitBoards(); });
function warmCount() { var subj = (L.script && L.script.subject) || L.session.subject;
  loadRevise().then(function () { var b = $("#wudue"); if (!b) return; var n = dueList(subj).length; b.textContent = n; b.hidden = !n; var d = $("#wudot"); if (d) d.hidden = !n; }).catch(function () {}); }
/* the ⋯ menu in Teach's top bar, and the small Preview / Clock stopped label (tap it for what it means) */
document.addEventListener("click", function (e) { var m = e.target.closest && e.target.closest("[data-tmore]"), menu = $(".tmenu");
  if (m && menu) { menu.hidden = !menu.hidden; m.setAttribute("aria-expanded", String(!menu.hidden)); return; }
  if (menu && !menu.hidden && !(e.target.closest && e.target.closest(".tmenu"))) { menu.hidden = true; var mb = $("[data-tmore]"); if (mb) mb.setAttribute("aria-expanded", "false"); }
  else if (menu && e.target.closest && e.target.closest(".tmenu button")) setTimeout(function () { var mm = $(".tmenu"); if (mm) mm.hidden = true; }, 0);
  var pv = e.target.closest && e.target.closest("[data-pvhelp]"); if (pv) toast(pv.getAttribute("title")); });
function openWarmup() { var subj = (L.script && L.script.subject) || L.session.subject, old = $("#wuov"); if (old) old.remove();
  var el = document.createElement("div"); el.id = "wuov"; el.className = "sug"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Mistakes warm-up");
  el.innerHTML = '<div class="sug-card wu"><div class="sug-head"><h3>Mistakes warm-up \u00b7 ' + esc(SUBJ[subj] || subj) + '</h3><button class="btn small" type="button" id="wux" aria-label="Close">\u00d7</button></div><div id="wubox"></div></div>';
  document.body.appendChild(el); reviseInto($("#wubox"), subj); }
function seqIndex(f) { for (var i = 0; i < TCH.seq.length; i++) if (f(TCH.seq[i])) return i; return 0; }
function runwayTick(r) {
  var pin = $("#rwpin"), oc = $("#onclock"); if (!pin || !TCH.rw) return;
  var m = r.secs / 60; pin.style.left = Math.min(100, 100 * m / Math.max(1, TCH.rw.total)) + "%"; pin.hidden = !r.secs;
  var p = TCH.rw.cur; if (!oc) return;
  if (!r.secs || !p || p.start == null) { oc.hidden = true; return; }
  $("#onclockt").innerHTML = "Minute <b>" + Math.floor(m) + "</b> · this part is planned for " + p.start + " to " + p.end + ". " + (m < p.start ? "<b>" + Math.max(1, Math.round(p.start - m)) + " min ahead</b>" : m > p.end ? "<b>" + Math.max(1, Math.round(m - p.end)) + " min behind</b>" : "<b>On time</b>");
  oc.hidden = false;
}
function setDone(key, label, on, skip) { var x = L.session; x.done = x.done || {}; x.done[key] = on ? { at: now(), d: CFG.device, label: String(label || "").slice(0, 90) } : skip ? { off: true, skip: true, at: now(), d: CFG.device, label: String(label || "").slice(0, 90) } : { off: true, at: now() }; }
/* how: "taught" ticks the chunk you leave (only while the clock runs); "skip" records it as skipped on purpose;
   "next" and "jump" move without recording anything */
function tmove(d, how) {
  var c = TCH.seq[TCH.pos], x = L.session; flipOn = false; BOARD = { open: null, near: null }; TCH.moved = true; noteTap();
  if (how === "skip" && !previewing() && c.key && { step: 1, text: 1 }[c.t]) { setDone(c.key, shortOf(c), false, true); touch(); }
  if (how === "taught" && !previewing() && c.key && { step: 1, text: 1 }[c.t] && !isDone(c.key)) { setDone(c.key, shortOf(c), true); touch(); }
  if (how === "taught" && !previewing() && c.t === "mod" && !isDone(c.key)) { setDone(c.key, c.b.name, true); touch(); }
  if (!previewing() && (how === "taught" || how === "skip") && (c.t === "concept" || c.t === "board" || c.mods)) {   // quick flow: one screen stands for its steps and its section
    (c.steps || []).forEach(function (st) { if (how === "skip") setDone(st.key, shortOf(st), false, true); else if (!isDone(st.key)) setDone(st.key, shortOf(st), true); });
    (c.mods || []).forEach(function (m) { if (how === "skip") setDone(m.key, m.b.name, false, true); else if (!isDone(m.key)) setDone(m.key, m.b.name, true); });
    touch(); }
  var n = Math.max(0, Math.min(TCH.seq.length - 1, TCH.pos + d)); TCH.pos = n;
  var np = TCH.seq[n] && TCH.seq[n].p, r = replay(x.time.log);
  if (np && !PREP && r.running && r.phase !== np.id) logEvent("phase", np.id);
  if (np) L.phase = np.id;
  document.body.classList.remove("toc-open");
  drawTeach();
}
/* "I skipped it": Ali chose not to ask this question. Stored as verdict "tskip" (no score, never a mistake), then on to the next */
function iskipIt() { var c = TCH.seq[TCH.pos], k = chunkKey(c); if (!k || !{ quiz: 1, drill: 1, question: 1 }[c.t]) return;
  var a = L.session.answers[k] || {}; if (a.v !== "tskip") { L.session.answers[k] = { v: "tskip", at: now(), d: CFG.device, q: shortOf(c, 160), note: a.note }; touch(); }
  tmove(1, "next"); }
function tskip(what) { var c = TCH.seq[TCH.pos], i = TCH.pos + 1;
  if (what === "mod") { while (i < TCH.seq.length && TCH.seq[i].p === c.p && TCH.seq[i].mod === c.b.name) i++; }
  else { while (i < TCH.seq.length && TCH.seq[i].t !== "phase" && TCH.seq[i].t !== "end") i++; }
  tmove(Math.min(i, TCH.seq.length - 1) - TCH.pos, "jump"); }
document.addEventListener("click", function (e) { if (MODE !== "teach" || !L) return; var t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-tgo")) { var g = t.getAttribute("data-tgo"); if (e.detail > 1 && g !== "-1") return; if (g === "after") { MODE = "plan"; L.phase = "_after"; location.hash = "#/lesson/" + encodeURIComponent(L.id); return; }
    if (g === "skip") return tmove(1, "skip"); if (g === "next") return tmove(1, "next"); return tmove(+g, +g > 0 ? "taught" : "jump"); }
  if (t.hasAttribute("data-tskip")) { tskip(t.getAttribute("data-tskip")); return; }
  if (t.hasAttribute("data-tiskip")) { iskipIt(); return; }
  if (t.hasAttribute("data-tjump")) { tmove(+t.getAttribute("data-tjump") - TCH.pos, "jump"); return; }
  if (t.id === "toc") { document.body.classList.add("toc-open"); return; }
  if (t.classList.contains("addnote")) { var inp = t.parentNode.querySelector("input[data-note]"); inp.hidden = false; inp.focus(); t.remove(); return; }
  if (t.id === "tocx") { document.body.classList.remove("toc-open"); return; }
});
document.addEventListener("toggle", function (e) { var d = e.target; if (MODE === "teach" && d.classList && d.classList.contains("opart")) TCH.open[d.getAttribute("data-pid")] = d.open; }, true);
document.addEventListener("keydown", function (e) { if (MODE !== "teach" || SH || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return;
  if ($("#wuov") || $("#sug") || $("#campop") || !$("#zoom").hidden || e.ctrlKey || e.altKey || e.metaKey) return;
  if (PREP && /^[0-6]$/.test(e.key)) return;
  if (e.key === "0") { iskipIt(); return; }
  if ((e.key === "a" || e.key === "A") && ($(".chunk.cur.flip") || $(".chunk.cur .slider"))) { flipIt(); return; }
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && $(".chunk.cur .slider")) { e.preventDefault(); slGo(SL.i + (e.key === "ArrowDown" ? 1 : -1)); return; }
  if (/^[1-6]$/.test(e.key)) { var vb = $('.chunk.cur .vrail [data-v="' + KEYV[e.key] + '"]') || $('.chunk.cur .ctl.big [data-v="' + KEYV[e.key] + '"]'); if (vb) vb.click(); return; }
  var three = !!$(".tfoot.three");
  if (e.key === "ArrowRight") tmove(1, three ? "next" : "taught"); else if (e.key === "ArrowLeft") tmove(-1, "jump");
  else if (three && (e.key === "t" || e.key === "T")) tmove(1, "taught"); else if (three && (e.key === "s" || e.key === "S")) tmove(1, "skip"); });

/* ---------------- the store: a chapter's sections, ready to add in the middle of a lesson ----------------
   (Ali, 11 Oct: "I start 7.1, find it too basic: I should not be stuck with 7.1. All teaching material for 7.1 to 7.6
   can be made in one go, just make sure it can be brought up any time.")
   students/<s>/store/<name>/store.json = {subject, topic, title, parts: [{id, code, name, minutes, blocks}]}, the same blocks
   as a script, pictures by their full path. Adding one records {part, store, after, at} in session.added; the part shows
   after the part you are on, in Teach, the outline, Student view and After the lesson. Prepare can look without saving. */
var STORES = {};
function storePaths() { return (TREE || []).filter(function (t) { return new RegExp("^" + studentBase().replace(/[.]/g, "\\.") + "store/[^/]+/store\\.json$").test(t.path); }).map(function (t) { return t.path; }); }
function loadStores() { var ps = storePaths(); return Promise.all(ps.map(function (p) { if (STORES[p] && STORES[p].sha === shaOf(p)) return null;
    return fileJSON(p).then(function (r) { if (r) STORES[p] = { sha: r.sha, data: r.data }; }).catch(function () {}); })).catch(function () {}); }
function storePart(path, id) { var st = STORES[path]; return st && (st.data.parts || []).filter(function (q) { return q.id === id; })[0]; }
function addedList() { return ((L && L.session.added) || []).filter(function (a) { return !a.removed; }).concat(PREP && L && L.prepAdded || []); }
/* one object per added part for the whole lesson: the outline and the screens match parts by object, so a fresh copy
   on every draw left an added part with no rows and "Start of this part" jumping to the top (Ali, 14 Oct) */
var ADDED = {};
function addedParts() { var out = []; addedList().forEach(function (a) { var q = storePart(a.store, a.part); if (!q) return;
    var k = (L && L.id) + "|" + a.store + "|" + a.part + "|" + a.after, hit = ADDED[k];
    if (!hit || hit.src !== q) hit = ADDED[k] = { src: q, part: { id: "st-" + q.id, name: q.name, start: null, end: null, blocks: q.blocks || [], show: q.show, fromStore: a.store, after: a.after, code: q.code, introduces: q.introduces } };
    out.push({ after: a.after, part: hit.part }); });
  return out; }
function storeOpen() { var subj = subjNow(), old = $("#stov"); if (old) old.remove();
  var el = document.createElement("div"); el.id = "stov"; el.className = "sug"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Add from the store");
  el.innerHTML = '<div class="sug-card wu"><div class="sug-head"><h3>Add from the Store</h3><button class="btn small" type="button" id="stox" aria-label="Close">×</button></div><div id="stobox" class="stack s4"><div class="empty"><b class="t-card">Loading the store</b></div></div></div>';
  document.body.appendChild(el);
  loadTree(true).then(loadStores).then(storeDraw, function () { $("#stobox").innerHTML = '<div class="empty"><b class="t-card">Couldn’t reach GitHub</b></div>'; }); }
function storeDraw() { var box = $("#stobox"); if (!box) return; var subj = subjNow(), cur = TCH.seq[TCH.pos], here = cur && cur.p, inScript = {};
  ((L.script && L.script.phases) || []).forEach(function (p) { inScript[String(p.name).toLowerCase()] = 1; });
  var tc = L.script && L.script.topic && L.script.topic.code, used = {}; addedList().forEach(function (a) { used[a.store + "#" + a.part] = 1; });
  var stores = Object.keys(STORES).filter(function (p) { var d = STORES[p].data; return !d.subject || d.subject === subj; });
  if (!stores.length) { box.innerHTML = '<div class="empty"><b class="t-card">No store for ' + esc((SUBJ[subj] || subj).toLowerCase()) + ' yet</b><span class="hint">Ask for the chapter’s sections.</span></div>'; return; }
  box.innerHTML = '<p class="hint">' + (PREP ? "Look at a section here. Nothing is saved in Prepare." : "It goes straight after the part you are on" + (here ? " (" + esc(partTitle(here.name)) + ")" : "") + ", and you jump to it.") + '</p>' +
    stores.map(function (p) { var d = STORES[p].data; return '<section class="stack s3"><div class="tags">' + topicTag(d) + tag((d.parts || []).length + " sections") + '</div>' +
      (d.parts || []).map(function (q) { var k = p + "#" + q.id, isIn = used[k], inLesson = inScript[String(q.name).toLowerCase()] || tc && q.code === tc, n = 0;
        (function walk(bs) { (bs || []).forEach(function (b) { if (b.type === "question" || b.type === "drill" || b.type === "quiz") n += b.type === "question" ? 1 : (b.items || []).length; if (b.blocks) walk(b.blocks); }); })(q.blocks);
        return '<div class="storerow' + (isIn ? " on" : "") + '"><div class="stack s2" style="min-width:0"><div class="tags">' + (q.code ? tag('<b>' + esc(q.code) + '</b>', "topic") : "") + (kindOf(q.name) ? tag(esc(kindOf(q.name)), "line") : "") + (q.minutes ? tag(q.minutes + " min") : "") + (n ? tag(n + " questions") : "") + (inLesson ? tag("In this lesson") : "") + (isIn ? tag("Added", "ok") : "") + '</div><b>' + esc(partTitle(q.name)) + '</b></div>' +
          (isIn ? '<button class="btn sm" type="button" data-stgo="' + esc(q.id) + '">Go to it</button><button class="btn sm quiet" type="button" data-strm="' + esc(k) + '">Remove</button>' : '<button class="btn sm pri" type="button" data-stadd="' + esc(k) + '">' + (PREP ? "Look at it" : "Add after this part") + '</button>') + '</div>'; }).join("") + '</section>'; }).join(""); }
function storeJump(pid) { var j = seqIndex(function (c) { return c.p && c.p.id === "st-" + pid; }); if (TCH.seq[j] && TCH.seq[j].p && TCH.seq[j].p.id === "st-" + pid) tmove(j - TCH.pos, "jump"); }
document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-stadd],[data-strm],[data-stgo],#stox,[data-store]"); if (!t || !L) return;
  if (t.hasAttribute("data-store")) { storeOpen(); return; }
  if (t.id === "stox") { var o = $("#stov"); if (o) o.remove(); return; }
  if (t.hasAttribute("data-stgo")) { var o2 = $("#stov"); if (o2) o2.remove(); storeJump(t.getAttribute("data-stgo")); return; }
  var k = (t.getAttribute("data-stadd") || t.getAttribute("data-strm")).split("#"), path = k[0], pid = k[1], cur = TCH.seq[TCH.pos], after = cur && cur.p ? cur.p.id : null;
  if (cur && cur.p && cur.p.fromStore) after = cur.p.after;   // a second addition goes after the first one, not inside it
  if (t.hasAttribute("data-stadd")) { var a = { part: pid, store: path, after: after, at: now(), d: CFG.device };
    if (PREP) { L.prepAdded = (L.prepAdded || []).filter(function (x) { return x.part !== pid; }).concat([a]); }
    else { L.session.added = (L.session.added || []).filter(function (x) { return x.part !== pid; }).concat([a]); touch(); flush(); }
    var o3 = $("#stov"); if (o3) o3.remove(); TCH.seq = teachSeq(); drawTeach(); storeJump(pid); toast(PREP ? "Showing it here. Nothing saved." : "Added after this part"); return; }
  if (t.hasAttribute("data-strm")) { if (PREP) L.prepAdded = (L.prepAdded || []).filter(function (x) { return x.part !== pid; });
    else { (L.session.added || []).forEach(function (x) { if (x.part === pid) { x.removed = true; x.at = now(); } }); touch(); }
    drawTeach(); storeDraw(); toast("Removed from this lesson"); } });

/* ---------------- a clock that does not rely on memory (Ali, 11 Oct) ----------------
   "Sometimes I start a lesson and forget the timer, he asks for a bathroom break and I forget to restart it, and in the
   15 minutes between chemistry and maths I forget to start the maths timer." The app already sees when he is teaching:
   every tap in Teach has a time. So the taps keep a record of their own, and the clock is checked against them.
     1  every Teach tap is kept (first and last, on this device), clock or no clock; After the lesson offers them as the times
     2  clock off and he is teaching: a chime and the screen edge flashes; 2 more screens or 2 minutes on, a full screen
        "Lesson started? Start from 18:12" (his first tap), so no minutes are lost
     3  Pause in Teach is a 5 minute break; at the end a chime and "Back?" (Resume / 5 more min / Lesson over)
     4  chemistry ends: a 15 minute countdown to maths, then a full screen "Maths time"
     5  clock running and no taps for 10 minutes: "Still teaching? End at 17:46"; opening a lesson while another one's
        clock still runs: "Chemistry clock still on. End it at 17:46"
     6  Prepare never asks. Sounds can be turned off in Settings. */
var CK = { id: null, off: 0, offFirst: null, quietUntil: 0, ask: null }, BREAK_MIN = 5, IDLE_MIN = 10, GAP_MIN = 15;
function ckJSON(k, v) { if (v === undefined) { try { return JSON.parse(ls(k) || "null"); } catch (e) { return null; } } ls(k, v === null ? null : JSON.stringify(v)); }
function tapsKey(id) { return "tutor.taps." + CFG.student + "." + id; }
function taps(id) { return ckJSON(tapsKey(id || (L && L.id))) || {}; }
function lessonSubj(id) { return parseId(id).subject || ""; }
function subjWord(id) { var sj = lessonSubj(id); return sj === "maths" ? "Maths" : sj === "chem" ? "Chemistry" : "The other lesson"; }
function ckReset() { CK.off = 0; CK.offFirst = null; CK.quietUntil = 0; }
var AC = null;
document.addEventListener("pointerdown", function () { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch (e) {} }, { passive: true });
function chime(n) { if (ls("tutor.chime") === "off") return; try { if (navigator.vibrate) navigator.vibrate([150, 90, 150]); } catch (e) {}
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); var t0 = AC.currentTime + 0.02;
    [784, 1047, 784, 1047].slice(0, (n || 1) * 2).forEach(function (f, i) { var o = AC.createOscillator(), g = AC.createGain(), at = t0 + i * 0.2;
      o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      o.connect(g); g.connect(AC.destination); o.start(at); o.stop(at + 0.5); }); } catch (e) {} }
function edgeFlash() { document.body.classList.remove("edgeflash"); void document.body.offsetWidth; document.body.classList.add("edgeflash"); setTimeout(function () { document.body.classList.remove("edgeflash"); }, 2600); }
/* a teaching tap in Teach: kept, and checked against the clock */
function noteTap() {
  if (MODE !== "teach" || PREP || !L) return;
  var t = now(), tp = taps(); if (!tp.first) tp.first = t; tp.last = t; tp.n = (tp.n || 0) + 1; tp.ts = (tp.ts || []).concat(t).slice(-400); ckJSON(tapsKey(L.id), tp);
  if (CK.id !== L.id) { CK.id = L.id; ckReset(); }
  if (live() || L.session.status === "finished") { CK.off = 0; CK.offFirst = null; return; }
  if (Date.now() < CK.quietUntil || (!L.session.time.log.length && examStartFor(L))) return;
  CK.off++; if (!CK.offFirst) CK.offFirst = t;
  if (CK.off === 1) { chime(); edgeFlash(); }
  if (CK.off >= 3 || Date.now() - Date.parse(CK.offFirst) >= 120000) clockAsk("start");
}
/* an event at a given time (a back-dated start, an end at the last tap); never before the last one already logged */
function logEventAt(e, p, t) { var lg = L.session.time.log, last = lg.length ? lg[lg.length - 1].t : null; if (last && String(t) < String(last)) t = last;
  lg.push({ t: t, e: e, p: p || undefined, d: CFG.device }); L.session.time.editAt = now(); clockState(e, t); touch(); }
/* which lesson's clock runs, the break, and the countdown to the next lesson: kept on this device */
function clockState(e, t) { if (!L) return; var id = L.id;
  if (e === "start" || e === "resume") { ckJSON("tutor.running", { id: id, at: t || now() }); ckJSON("tutor.break", null); ckReset(); var nx = ckJSON("tutor.next"); if (nx && nx.id === id) ckJSON("tutor.next", null); }
  if (e === "pause" || e === "end") { var r = ckJSON("tutor.running"); if (r && r.id === id) ckJSON("tutor.running", null); }
  if (e === "pause" && MODE === "teach" && !PREP) ckJSON("tutor.break", { id: id, at: t || now(), until: Date.now() + BREAK_MIN * 60000 });
  if (e === "end") { ckJSON("tutor.break", null); nextAfter(id, t || now()); } }
/* chemistry has ended: maths today, if there is a maths lesson today */
function nextAfter(id, t) { var p = parseId(id); if (p.subject !== "chem" || p.date !== todayIso()) return;
  var mid = p.date + "-maths", has = TREE && TREE.some(function (x) { return x.path.indexOf(lessonBase(mid)) === 0; }); if (!has) return;
  var ms = ckJSON(localKey(mid)); if (ms && ms.session && (ms.session.status === "finished" || (ms.session.time.log || []).length)) return;
  ckJSON("tutor.next", { id: mid, from: id, at: Date.parse(t) + GAP_MIN * 60000 }); }
/* the full-screen question: one at a time; every answer is one tap */
function clockAsk(kind, o) { o = o || {}; if (CK.ask || $("#ckask")) return; CK.ask = kind; CK.other = null; var x = L && L.session, tp = L ? taps() : {}, h = "", b = [];
  var B = function (act, label, cls) { b.push('<button class="btn' + (cls ? " " + cls : "") + '" type="button" data-ck="' + act + '">' + label + '</button>'); };
  if (kind === "start") { var never = !(x.time.log || []).length, from = CK.offFirst || tapRun(tp).first || now(), lg = x.time.log, pz = lg.length ? lg[lg.length - 1] : null;
    if (never) { h = '<h2>Lesson started?</h2><p>The clock is not running. Your first tap was at <b>' + esc(hhmm(from)) + '</b>.</p>'; B("startfrom", "Start from " + esc(hhmm(from)), "pri"); B("startnow", "Start now"); B("look", "I’m only looking", "quiet"); }
    else { h = '<h2>Back from the break?</h2><p>The clock paused at <b>' + esc(hhmm(pz.t)) + '</b>. You started teaching again at <b>' + esc(hhmm(from)) + '</b>.</p>'; B("startfrom", "Resume from " + esc(hhmm(from)), "pri"); B("startnow", "Resume now"); B("look", "Still on a break", "quiet"); }
    CK.from = from; CK.retry = o.retry || null; }
  else if (kind === "break") { var bk = ckJSON("tutor.break") || {}; h = '<h2>Break over?</h2><p>Paused at <b>' + esc(hhmm(bk.at)) + '</b>, ' + Math.max(1, Math.round((Date.now() - Date.parse(bk.at)) / 60000)) + ' min ago.</p>'; B("resume", "Resume", "pri"); B("more", "5 more min"); B("endat:" + bk.at, "Lesson over: end at " + esc(hhmm(bk.at)), "quiet"); }
  else if (kind === "idle") { h = '<h2>Still teaching?</h2><p>' + esc(subjWord(o.id)) + ' clock is running. No taps since <b>' + esc(hhmm(o.last)) + '</b> (' + Math.round((Date.now() - Date.parse(o.last)) / 60000) + ' min).</p>'; B("endat:" + o.last, "End at " + esc(hhmm(o.last)), "pri"); B("pauseat:" + o.last, "Pause at " + esc(hhmm(o.last))); B("going", "Still going", "quiet"); CK.other = o.id; }
  else if (kind === "other") { h = '<h2>' + esc(subjWord(o.id)) + ' clock still on</h2><p>It has run since <b>' + esc(hhmm(o.since)) + '</b>.' + (o.last ? ' Last ' + esc(subjWord(o.id).toLowerCase()) + ' tap: <b>' + esc(hhmm(o.last)) + '</b>.' : "") + '</p>'; B("endat:" + (o.last || now()), "End it at " + esc(hhmm(o.last || now())), "pri"); B("keep", "Keep it running", "quiet"); CK.other = o.id; }
  else if (kind === "next") { h = '<h2>' + esc(subjWord(o.id)) + ' time</h2><p>' + esc(subjWord(o.id)) + ' was due at <b>' + esc(hhmm(new Date(o.at).toISOString())) + '</b>, ' + GAP_MIN + ' min after the last lesson.</p>'; B("opennext", "Open " + esc(subjWord(o.id).toLowerCase()) + " and start", "pri"); B("later", "5 more min"); B("nottoday", "Not today", "quiet"); CK.other = o.id; }
  var el = document.createElement("div"); el.id = "ckask"; el.className = "ckask"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = '<div class="ckcard"><span class="ckdot" aria-hidden="true"></span>' + h + '<div class="ckbtns">' + b.join("") + '</div></div>'; document.body.appendChild(el);
  chime(2); edgeFlash(); var f = $(".ckbtns .btn.pri", el); if (f) f.focus(); }
function closeAsk() { var el = $("#ckask"); if (el) el.remove(); CK.ask = null; }
/* another lesson's clock (not the open one): changed straight in its file on GitHub */
function endElsewhere(id, e, t) { var path = lessonBase(id) + "session.json", saved = ckJSON(localKey(id));
  return gh("/repos/" + CFG.repo + "/contents/" + enc(path)).then(function (r) {
    var remote = r.status === 404 ? null : JSON.parse(new TextDecoder().decode(b64bytes(r.json.content))), sha = r.status === 404 ? null : r.json.sha;
    var ss = saved && saved.session ? merge(norm(saved.session), remote) : norm(remote || newSession(id, null)), lg = ss.time.log, last = lg.length ? lg[lg.length - 1].t : null;
    lg.push({ t: last && String(t) < String(last) ? last : t, e: e, d: CFG.device }); ss.time.editAt = now(); finalizeTime(ss);
    if (TRY) return; return putB64(path, b64enc(JSON.stringify(ss, null, 1)), CFG.student + " " + id + ": clock " + e + " (" + CFG.device + ")", sha).then(function (nsha) { ckJSON(localKey(id), { session: ss, sha: nsha, dirty: false }); });
  }).then(function () { var rr = ckJSON("tutor.running"); if (rr && rr.id === id) ckJSON("tutor.running", null); if (e === "end") nextAfter(id, t); toast(subjWord(id) + " clock " + (e === "end" ? "ended" : "paused") + " at " + hhmm(t)); })
  .catch(function () { toast("Couldn’t reach GitHub: open that lesson and end it there"); }); }
document.addEventListener("click", function (ev) { var t = ev.target.closest && ev.target.closest("[data-ck]"); if (!t) return; var a = t.getAttribute("data-ck"), kind = CK.ask, oid = CK.other; closeAsk();
  var mine = L && (!oid || oid === L.id) && route().indexOf("/lesson/") === 0, cur = L && phases().filter(function (p) { return p.id === L.phase && !p.sys; })[0];
  var startAt = function (when) { var r = replay(L.session.time.log); if (L.session.status === "finished") { L.session.status = "in-progress"; L.session.statusAt = now(); }
    logEventAt(r.secs || L.session.time.log.length ? "resume" : "start", cur ? cur.id : (r.phase || phases()[0].id), when); wake(); drawLesson(); if (CK.retry && CK.retry.isConnected) CK.retry.click(); CK.retry = null; };
  if (a === "startfrom") return startAt(CK.from);
  if (a === "startnow") return startAt(now());
  if (a === "look") { CK.quietUntil = Date.now() + 10 * 60000; CK.off = 0; CK.offFirst = null; return; }
  if (a === "resume") return startAt(now());
  if (a === "more") { var bk = ckJSON("tutor.break"); if (bk) { bk.until = Date.now() + 5 * 60000; ckJSON("tutor.break", bk); } return; }
  if (a === "going") { if (oid) { var tp = taps(oid); tp.last = now(); ckJSON(tapsKey(oid), tp); } return; }
  if (a === "keep") { CK.keep = oid; return; }
  if (a === "later") { var nx = ckJSON("tutor.next"); if (nx) { nx.at = Date.now() + 5 * 60000; nx.shown = false; ckJSON("tutor.next", nx); } return; }
  if (a === "nottoday") { ckJSON("tutor.next", null); return; }
  if (a === "opennext") { ckJSON("tutor.next", null); STARTCLOCK = oid; location.hash = "#/lesson/" + encodeURIComponent(oid) + "/teach"; return; }
  var m = /^(endat|pauseat):(.+)$/.exec(a); if (m) { var e = m[1] === "endat" ? "end" : "pause", when = m[2];
    if (e === "end" && kind === "break") { ckJSON("tutor.break", null); }
    if (mine && L && (!oid || oid === L.id)) { logEventAt(e, null, when); if (e === "pause") ckJSON("tutor.break", null); drawLesson(); flush(); toast((e === "end" ? "Ended" : "Paused") + " at " + hhmm(when) + ". Change it under Times."); }
    else endElsewhere(oid, e, when); } });
/* every few seconds: the break, a forgotten clock, and the next lesson */
function clockWatch() { if (!CFG.token || $("#ckask")) return; var tnow = Date.now();
  var bk = ckJSON("tutor.break"); if (bk && L && L.id === bk.id && MODE === "teach" && !PREP && !live() && tnow > bk.until) { if (replay(L.session.time.log).secs && L.session.status !== "finished") return clockAsk("break"); ckJSON("tutor.break", null); }
  var rn = runningLesson();
  var xs = L && MODE === "teach" && !PREP && !L.session.time.log.length && L.session.status !== "finished" ? examStartFor(L) : null;
  if (xs) { var r0 = replay(L.session.time.log); logEventAt("start", L.phase && !(phases().filter(function (p) { return p.id === L.phase; })[0] || {}).sys ? L.phase : (r0.phase || phases()[0].id), xs); wake(); drawLesson(); flush(); toast("Clock started from the exam start, " + hhmm(xs) + ". Exam time counts as lesson time."); return; }
  if (rn && CK.keep !== rn.id && !examLive()) { var tp = taps(rn.id), last = [tp.last, rn.at].filter(Boolean).sort().pop(), vid = L && L.id === rn.id && MODE === "teach" && TCH.seq[TCH.pos] && TCH.seq[TCH.pos].t === "video";
    if (last && tnow - Date.parse(last) > (vid ? 30 : IDLE_MIN) * 60000) return clockAsk("idle", { id: rn.id, last: last }); }
  var nx = ckJSON("tutor.next"); if (nx && tnow >= nx.at && !nx.shown) { if (L && L.id === nx.id && live()) { ckJSON("tutor.next", null); return; } nx.shown = true; ckJSON("tutor.next", nx); return clockAsk("next", nx); }
  var nb = $(".clocknag.brk"); if (nb && L && MODE === "teach") nb.outerHTML = clockNag(live());
  nextBar(); }
setInterval(clockWatch, 5000);
/* the lesson whose clock runs on this device; forgotten if it was stopped on another device or finished */
/* an exam going on now (set by the Exams tab on this device): until its end time, or until it was handed in */
function examLive() { var e = ckJSON("tutor.examlive"); if (!e || !e.startedAt) return null; var tnow = Date.now();
  if (e.doneAt || tnow > Number(e.endAt || 0) + 5 * 60000 || tnow - Number(e.startedAt) > 4 * 3600000) return null; return e; }
/* an exam taken today in this lesson's subject: exam time is lesson time, so a clock never started counts from the exam's start */
function examStartFor(l) { var e = ckJSON("tutor.examlive"); if (!e || !e.startedAt || !l) return null; var st = new Date(Number(e.startedAt));
  if (e.subject !== lessonSubj(l.id) || l.id.indexOf(todayIso()) !== 0) return null;
  var d = st.getFullYear() + "-" + String(st.getMonth() + 1).padStart(2, "0") + "-" + String(st.getDate()).padStart(2, "0"); return d === todayIso() ? st.toISOString() : null; }
function runningLesson() { var rn = ckJSON("tutor.running"); if (!rn) return null;
  var rs = L && L.id === rn.id ? L.session : (ckJSON(localKey(rn.id)) || {}).session;
  if (rs && (!replay((rs.time || {}).log).running || rs.status === "finished")) { ckJSON("tutor.running", null); return null; } return rn; }
/* the countdown to the next lesson, small, at the bottom of every page */
function nextBar() { var nx = ckJSON("tutor.next"), el = $("#nextbar"); if (!nx || nx.shown) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "nextbar"; el.className = "nextbar"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  var left = Math.max(0, Math.ceil((nx.at - Date.now()) / 60000));
  el.innerHTML = '<span class="dot" aria-hidden="true"></span><span><b>' + esc(subjWord(nx.id)) + ' at ' + esc(hhmm(new Date(nx.at).toISOString())) + '</b> · ' + left + ' min</span><button class="btn sm" type="button" data-ck="nottoday">Not today</button>'; CK.other = nx.id; }
/* opening Teach while another lesson's clock still runs */
function checkOther() { if (PREP || MODE !== "teach" || !L || $("#ckask")) return; var rn = runningLesson(); if (!rn || rn.id === L.id || CK.keep === rn.id) return;
  clockAsk("other", { id: rn.id, since: rn.at, last: taps(rn.id).last }); }
/* After the lesson: the taps as the times, when the clock missed the lesson */
/* the run of taps that ends at the last tap: a gap over 45 min (a look at Teach hours before, Ali 11 Oct) starts a new run */
function tapRun(tp) { var ts = tp.ts; if (!ts || !ts.length) return { first: tp.first, last: tp.last }; var i = ts.length - 1;
  while (i > 0 && Date.parse(ts[i]) - Date.parse(ts[i - 1]) <= 45 * 60000) i--; return { first: ts[i], last: ts[ts.length - 1] }; }
function tapTimes() { var x = L.session, tp = tapRun(taps()); if (!tp.first || !tp.last) return null; var m = Math.round((Date.parse(tp.last) - Date.parse(tp.first)) / 60000);
  if (m < 10 || (x.time.minutes || 0) >= m - 5) return null; return { first: tp.first, last: tp.last, m: m }; }
function tapBanner() { var tt = tapTimes(); if (!tt) return "";
  return '<div class="clocknag tapfix" role="status"><span class="dot" aria-hidden="true"></span><span><b>Your taps show ' + esc(hhmm(tt.first)) + ' to ' + esc(hhmm(tt.last)) + ' (' + tt.m + ' min).</b> The clock says ' + Math.round(L.session.time.minutes || 0) + ' min.</span><button class="btn sm pri" type="button" data-usetaps>Use ' + esc(hhmm(tt.first)) + ' to ' + esc(hhmm(tt.last)) + '</button></div>'; }
document.addEventListener("click", function (e) { if (!(e.target.closest && e.target.closest("[data-usetaps]")) || !L) return; var tt = tapTimes(); if (!tt) return;
  var ed = L.session.time.edit = L.session.time.edit || {}; ed.started = tt.first; ed.ended = tt.last; ed.minutes = null; timeEdited(); drawLesson(); toast("Times set from your taps. Change them below if needed."); });
document.addEventListener("change", function (e) { if (e.target.id !== "s-chime") return; ls("tutor.chime", e.target.checked ? null : "off"); toast("Saved on this device"); if (e.target.checked) chime(); });

/* ---------------- student view: the questions only, for his screen (opens in its own tab) ----------------
   Exam questions as pictures, quick questions as text. Never an answer or a mark scheme.
   The teacher's "Show him" sends the question here when this tab is open. */
var STU = null, BC = null;
try { BC = new BroadcastChannel("tutor-desk"); } catch (e) {}
var studentSeen = {};
if (BC) BC.onmessage = function (ev) { var m = ev.data || {};
  if (m.type === "alive") studentSeen[m.lesson] = Date.now();
  if (m.type === "ping" && MODE === "student" && L) BC.postMessage({ type: "alive", lesson: L.id });
  if (m.type === "show" && MODE === "student" && L && m.lesson === L.id && STU) { var k = STU.items.findIndex(function (q) { return q.id === m.id; }); STU.board = m.board || null; STU.banim = !!(m.board && m.board.step); if (k >= 0) { STU.tab = STU.items[k].kind; STU.i = k; drawStudent(); } BC.postMessage({ type: "alive", lesson: L.id }); } };
setInterval(function () { if (BC && MODE === "student" && L) BC.postMessage({ type: "alive", lesson: L.id }); }, 4000);
function pingStudent() { if (BC && MODE === "teach" && L) BC.postMessage({ type: "ping" }); }
window.addEventListener("focus", pingStudent); document.addEventListener("visibilitychange", pingStudent);
/* Show him: to the student tab if one is open for this lesson, otherwise full screen here */
function showHim(id) { if (/^v:/.test(id) && !(BC && L && studentSeen[L.id] && Date.now() - studentSeen[L.id] < 180000)) { toast("Open the Student view first, then press Show him"); return; } if (BC && L && studentSeen[L.id] && Date.now() - studentSeen[L.id] < 180000 && id !== "*") { BC.postMessage({ type: "show", lesson: L.id, id: id }); toast("Sent to the student view"); return; } openShow(id); }
function studentItems() { var out = [];
  phases().filter(function (p) { return !p.sys; }).forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) {
    if (b.type === "question" && (b.parts || []).length) out.push({ kind: "exam", id: b.id, img: [], twin: b, p: p });
    else if (b.type === "question" && (b.img || []).length) out.push({ kind: "exam", id: b.id, img: b.img, p: p });
    else if (b.type === "quiz") (b.items || []).forEach(function (it) { out.push({ kind: "quick", id: it.id, text: it.q, p: p }); });
    else if (b.type === "drill") (b.items || []).forEach(function (d) { out.push({ kind: "quick", id: drillKey(d[0]), text: d[0], p: p }); });
    else if (b.type === "video" && b.src) out.push({ kind: "video", id: vidKey(b), v: b, text: b.title || "Video", p: p });
    if (b.blocks) walk(b.blocks); }); })(p.blocks); });
  return out; }
function drawStudent() {
  document.body.classList.add("student"); document.body.setAttribute("data-subject", (L.script && L.script.subject) || L.session.subject);
  var sig = addedList().map(function (a) { return a.part; }).join();
  if (!STU || STU.id !== L.id) STU = { id: L.id, items: studentItems(), tab: "exam", i: -1, drawer: false, sig: sig };
  else if (STU.sig !== sig) { var keep = STU.items[STU.i]; STU.items = studentItems(); STU.sig = sig; STU.i = keep ? Math.max(0, STU.items.findIndex(function (q) { return q.id === keep.id; })) : -1; }
  STU.canvas = ls("tutor.stumode") !== "questions"; if (STU.canvas) return drawCanvas();
  var list = STU.items.map(function (q, i) { q.i = i; return q; }).filter(function (q) { return q.kind === STU.tab; });
  if (STU.i < 0 || !STU.items[STU.i] || STU.items[STU.i].kind !== STU.tab) STU.i = list.length ? list[0].i : -1;
  var cnt = function (k) { return STU.items.filter(function (q) { return q.kind === k; }).length; }, ne = cnt("exam"), nq = cnt("quick"), nv = cnt("video"), cur = STU.items[STU.i], pos = list.indexOf(cur);
  var one = function (cur) { return cur.kind === "video" ? '<div class="stu-vid">' + localVideo(cur.v, true) + '<div class="stu-vt">' + esc(cur.v.title || "") + '</div></div>' : cur.kind === "exam"
    ? cur.twin ? '<div class="stu-twin">' + twinHTML(cur.twin) + '</div>' : STU.board && STU.board.ids.indexOf(cur.id) >= 0 ? '<div class="stu-fit one">' + boardCanvas(STU.board, STU.board.step) + '</div>' : '<div class="stu-fit ' + (cur.img.length > 1 ? "many" : "one") + '">' + cur.img.map(function (i) { return '<img data-src="' + esc(i) + '" alt="Question" hidden>'; }).join("") + '</div>'
    : '<div class="stu-card"><div class="stu-q">' + paperHTML(cur.text, subjNow()) + '</div>' + (STU.board && STU.board.mode === "lines" && STU.board.ids.indexOf(cur.id) >= 0 ? '<div class="stu-hint">' + boardCanvas(STU.board, STU.board.step) + '</div>' : "") + '</div>'; };
  var grp = cur ? stuGroup(STU.items.indexOf(cur)) : [];
  var view = !cur ? '<div class="empty"><b class="t-card">No questions here</b></div>' : grp.length > 1
    ? '<div class="stu-many" style="--n:' + grp.length + ';--c:' + grp.length + ';--r:1">' + grp.map(function (q) { return '<div class="stu-cell"><span class="stu-cn num">' + (STU.items.indexOf(q) + 1) + '</span>' + one(q) + '</div>'; }).join("") + '</div>' : one(cur);
  var drawer = '<aside class="stu-drawer"' + (STU.drawer ? "" : " hidden") + ' aria-label="Questions"><div class="stu-dh"><div class="modes"><button type="button" data-stab="exam" aria-pressed="' + (STU.tab === "exam") + '">Exam ' + ne + '</button><button type="button" data-stab="quick" aria-pressed="' + (STU.tab === "quick") + '">Quick ' + nq + '</button>' + (nv ? '<button type="button" data-stab="video" aria-pressed="' + (STU.tab === "video") + '">Video ' + nv + '</button>' : "") + '</div><button class="btn small" type="button" id="stufs">Full screen</button><button class="btn small" type="button" id="stux">Close</button></div>' +
    '<p class="hint">Only the question or video shows on his screen. Move with the arrow keys, a swipe, or the faint \u2039 \u203a at the edges; \u201cShow him\u201d in Teach sends a question here.</p><nav class="stu-list">' +
    list.map(function (q, k) { return '<button type="button" class="stu-item' + (q === cur ? " cur" : "") + '" data-si="' + q.i + '"><span class="n num">' + (k + 1) + '</span>' + (q.kind === "exam" && q.img.length ? '<img data-src="' + esc(q.img[0]) + '" alt="" hidden><span class="ph"></span>' : '<span class="tx">' + (q.kind === "video" ? "\u25b6 " : "") + esc(plain(q.text).slice(0, 80)) + '</span>') + '</button>'; }).join("") + '</nav></aside>';
  var at = STU.items.indexOf(cur);
  /* his screen (canvas Student board): a faint menu and "2 of 9" at the top, the question in a white card, round arrows at the edges, the items as chips below */
  var short = function (q) { var m = /Q\d+\w*(\s?\([a-z]+\))?/.exec(q.id && q.twin ? (q.twin.label || "") : q.kind === "exam" ? String(q.lab || "") : ""); return q.kind === "video" ? "Video" : q.kind === "quick" ? "Quick" : m ? m[0].replace(/\s/g, "") : "Question"; };
  STU.items.forEach(function (q) { if (q.kind === "exam" && !q.lab) { var b0 = null; (function find(bs) { (bs || []).forEach(function (b) { if (b.id === q.id) b0 = b; if (b.blocks) find(b.blocks); }); })(q.p.blocks); q.lab = b0 && (b0.label || b0.source) || ""; } });
  var from = Math.max(0, Math.min(at - 2, STU.items.length - 6)), chips = STU.items.slice(from, from + 6);
  var CHEV = function (d) { return '<svg class="icon lg" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6") + '"></path></svg>'; };
  app.innerHTML = '<div class="stu clean"><header class="stu-top"><button class="stu-menu" type="button" id="stumenu" aria-label="Choose a question"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg></button>' + inkButton() + '<span class="push"></span>' + cvModeSeg() + '<div class="seg stu-n" role="group" aria-label="Questions on screen">' + [1, 2, 3, 4].map(function (n) { return '<button type="button" data-stun="' + n + '" aria-pressed="' + (stuN() === n) + '" title="' + (n === 1 ? "One question at a time" : n + " questions together") + '">' + n + '</button>'; }).join("") + '</div>' + (cur ? tag((grp.length > 1 ? (at + 1) + " to " + (STU.items.indexOf(grp[grp.length - 1]) + 1) : (at + 1)) + " of " + STU.items.length, "num") : "") + '</header>' + inkTools() + '<main class="stu-view" data-pos="' + (pos + 1) + '/' + list.length + '">' + view + '</main>' +
    '<button class="stu-edge prev" type="button" data-sgo="-1" aria-label="Previous question"' + (at <= 0 ? " disabled" : "") + '>' + CHEV(-1) + '</button><button class="stu-edge next" type="button" data-sgo="1" aria-label="Next question"' + (at < 0 || STU.items.indexOf(grp[grp.length - 1]) >= STU.items.length - 1 ? " disabled" : "") + '>' + CHEV(1) + '</button>' +
    (STU.items.length > 1 ? '<nav class="stu-chips" aria-label="Questions">' + chips.map(function (q) { return '<button type="button" class="it" data-si="' + q.i + '"' + (q === cur ? ' aria-current="true"' : "") + '>' + (q.kind === "video" ? '<svg class="icon sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"></path></svg>' : "") + (STU.items.indexOf(q) + 1) + ' \u00b7 ' + esc(short(q)) + '</button>'; }).join("") + (STU.items.length > 6 ? '<button type="button" class="it" id="stumore">More</button>' : "") + '</nav>' : "") + drawer + '</div>';
  var chh = $(".stu-chips"); if (chh) $(".stu").style.setProperty("--chipsh", chh.offsetHeight + "px");
  $$(".stu-view img").forEach(showImg); loadImages(app); stuArrange(); boardMount(app, !!STU.banim); STU.banim = false; maths(app); prefetchLesson(); inkMount();
  var ci = $(".stu-item.cur"); if (ci && STU.drawer) ci.scrollIntoView({ block: "nearest" });
  if (BC) BC.postMessage({ type: "alive", lesson: L.id });
}
/* several questions on his screen: the arrangement that shows them biggest (Ali, 12 Oct: "17 and 18 side by side isn't right").
   Wide questions stack one above the other, tall ones sit side by side, four can go 2 by 2. Each cell's shape comes from its
   pictures once they load (pictures in one cell stack); a typed question or board counts as a wide card until then */
function stuArrange() { var box = $(".stu-many"); if (!box) return; var cells = $$(".stu-cell", box), n = cells.length, v = $(".stu-view"); if (!v || n < 2) return;
  var cs = getComputedStyle(v), W = v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), H = v.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), gap = 16, pad = 40;
  var ar = cells.map(function (c) { var ims = $$("img", c).filter(function (i) { return i.naturalWidth; }); if (!ims.length) return 2.4;
    var w = Math.max.apply(null, ims.map(function (i) { return i.naturalWidth; })); return w / ims.reduce(function (h, i) { return h + i.naturalHeight * w / i.naturalWidth; }, 0); });
  var best = null; for (var c = 1; c <= n; c++) { var r = Math.ceil(n / c); if ((c - 1) * r >= n && c > 1) continue;
    var cw = (W - gap * (c - 1)) / c - pad, ch = (H - gap * (r - 1)) / r - pad; if (cw <= 0 || ch <= 0) continue;
    var sc = Math.min.apply(null, ar.map(function (a) { return Math.min(cw, ch * a) / a; }));   // the smallest picture's height decides
    if (!best || sc > best.sc) best = { c: c, r: r, sc: sc }; }
  if (!best || innerWidth <= 760) best = { c: 1, r: n };
  box.style.setProperty("--c", best.c); box.style.setProperty("--r", best.r); box.setAttribute("data-c", best.c); }
document.addEventListener("load", function (e) { if (e.target.tagName === "IMG" && e.target.closest && e.target.closest(".stu-many")) stuArrange(); }, true);
addEventListener("resize", function () { if (MODE === "student") stuArrange(); });
/* arrows, swipes and the edge buttons go through every question in script order, exam and quick alike */
function stuGo(d) { var g = stuGroup(STU.i), k = d > 0 ? STU.items.indexOf(g[g.length - 1]) + 1 : Math.max(0, STU.i - (stuN() > 1 ? stuN() * 2 - 1 : 1)); if (d < 0 && STU.i === 0 || k >= STU.items.length) return; STU.i = k; STU.tab = STU.items[k].kind; drawStudent(); }
/* 1, 2 or 3 questions on his screen at once (Ali, 11 Oct: "he made one graph, I clicked right, then the second: let me put two or three together") */
function stuN() { return Math.max(1, Math.min(4, +(ls("tutor.stun") || 1))); }
function stuGroup(at) { var cur = STU.items[at], g = cur ? [cur] : []; if (!cur || cur.kind === "video") return g;
  for (var k = at + 1; k < STU.items.length && g.length < stuN(); k++) { var q = STU.items[k]; if (q.kind === "video") continue; if (q.kind !== cur.kind) break; g.push(q); } return g; }   // a walkthrough video between two questions does not split them
(function () { var x0 = null, y0 = null;
  document.addEventListener("touchstart", function (e) { if (MODE !== "student" || !STU || STU.canvas || STU.drawer || e.touches.length !== 1 || INK.pen || INK.finger) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  document.addEventListener("touchend", function (e) { if (x0 == null || MODE !== "student" || !STU) return; var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) stuGo(dx < 0 ? 1 : -1); }, { passive: true }); })();
document.addEventListener("click", function (e) { if (MODE !== "student" || !STU) return; var t = e.target.closest && e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-stab")) { STU.tab = t.getAttribute("data-stab"); STU.i = -1; drawStudent(); }
  else if (t.hasAttribute("data-si")) { STU.i = +t.getAttribute("data-si"); STU.drawer = false; drawStudent(); }
  else if (t.hasAttribute("data-sgo")) stuGo(+t.getAttribute("data-sgo"));
  else if (t.hasAttribute("data-stun")) { ls("tutor.stun", t.getAttribute("data-stun")); drawStudent(); }
  else if (t.id === "stumenu" || t.id === "stumore") { STU.drawer = !STU.drawer; drawStudent(); }
  else if (t.id === "stux") { STU.drawer = false; drawStudent(); }
  else if (t.id === "stupen" || t.hasAttribute("data-ink")) inkTool(t);
  else if (t.id === "stufs") { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (x) {} } });
document.addEventListener("keydown", function (e) { if (MODE !== "student" || !STU || STU.canvas || e.ctrlKey || e.altKey || e.metaKey || !$("#zoom").hidden) return; if (e.key === "Escape" && STU.drawer) { STU.drawer = false; drawStudent(); return; } if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); stuGo(1); } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); stuGo(-1); } });

/* ---------------- pen on Student view (Ali, 17 Oct): he writes on his screen while sharing it, instead of the tablet's own screen-write ----------------
   Like Samsung Notes: a pen (8 colours) and a highlighter (4), three sizes, an eraser that wipes only where it passes, cutting the
   lines it crosses (Ali, 18 Oct: "erasing is very robotic and laggy"), Undo and Redo, and a stroke held still at its end turns into
   a straight line. The S Pen always writes; a finger still swipes and taps (unless "Pen and finger" is on, which also lets a mouse
   write). The S Pen's side button erases. Only a pen that presses (pressure above 0) writes: a hovering pen never does, whatever its
   buttons say (some tablets report the button held in the air as the tip being down). Ink belongs to the screen (the questions showing)
   and lives only in this tab: it is never saved. When you move on, the ink stays for when you come back (Keep) or goes (Clear). */
var INK = { pages: {}, undo: {}, redo: {}, key: "", tool: "pen", pc: 0, hc: 0, ps: 1, hs: 1, finger: false, open: false, more: false, cur: null, cv: null, raf: 0, pen: false, diag: "", arm: 0, hov: false, rs: /^[012]$/.test(ls("tutor.inkrs")) ? +ls("tutor.inkrs") : 1, ec: null, em: ls("tutor.inkem") === "area" ? "area" : "line" };
var INKCOL = { pen: [["--ink-1", "Black"], ["--ink-2", "Grey"], ["--ink-3", "Red"], ["--ink-4", "Orange"], ["--ink-5", "Green"], ["--ink-6", "Blue"], ["--ink-7", "Purple"], ["--ink-8", "Pink"]],
  hl: [["--hl-1", "Yellow"], ["--hl-2", "Green"], ["--hl-3", "Pink"], ["--hl-4", "Blue"]] };
var INKW = { pen: [2, 3.5, 6], hl: [12, 20, 32] }, INKER = [8, 14, 24];   // eraser radius in px: Thin, Medium, Thick
function inkKeep() { return ls("tutor.inkkeep") !== "clear"; }
function inkKey() { if (STU && STU.canvas) { var cs = cvState(); return L.id + ":cv:" + cs.ep + ":" + cs.cur; } return STU && STU.i >= 0 ? L.id + ":" + stuGroup(STU.i).map(function (q) { return q.id; }).join("|") : ""; }
function inkPage() { return INK.pages[INK.key] || (INK.pages[INK.key] = []); }
function inkStack(o) { return o[INK.key] || (o[INK.key] = []); }
function inkSnap() { inkStack(INK.undo).push(inkPage().slice()); INK.redo[INK.key] = []; }   // before each change: what Undo goes back to
function inkButton() { return '<button class="stu-menu stu-pen" type="button" id="stupen" aria-label="Pen" aria-expanded="' + INK.open + '"' + ((INK.pages[inkKey()] || []).length ? ' data-has="1"' : "") + '><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"></path><path d="M14 7l3 3"></path></svg></button>'; }
function inkTools() {
  var seg = function (lab, items, show) { return '<div class="stack s2">' + (show ? '<span class="lab">' + lab + '</span>' : "") + '<div class="seg" role="group" aria-label="' + lab + '">' + items.join("") + '</div></div>'; };
  var b = function (attr, on, txt) { return '<button type="button" data-ink="' + attr + '" aria-pressed="' + on + '">' + txt + '</button>'; };
  var t = INK.tool, writes = t !== "rub", col = t === "hl" ? INK.hc : INK.pc, size = t === "hl" ? INK.hs : t === "rub" ? INK.rs : INK.ps;
  return '<div class="stu-tools card raised"' + (INK.open ? "" : " hidden") + ' aria-label="Pen">' +
    seg("Tool", [b("t-pen", t === "pen", "Pen"), b("t-hl", t === "hl", "Highlighter"), b("t-rub", t === "rub", "Eraser")]) +
    (writes ? '<div class="stu-inkrow" role="group" aria-label="Colour">' + INKCOL[t].map(function (c, k) { return '<button type="button" class="stu-dot' + (t === "hl" ? " hl" : "") + '" data-ink="c' + k + '" aria-pressed="' + (col === k) + '" aria-label="' + c[1] + '" style="--dot:var(' + c[0] + ')"></button>'; }).join("") + '</div>' : "") +
    (writes ? "" : seg("Erase", [b("e-line", INK.em === "line", "Whole line"), b("e-area", INK.em === "area", "Area")])) +
    seg("Size", [b("w0", size === 0, "Thin"), b("w1", size === 1, "Medium"), b("w2", size === 2, "Thick")]) +
    '<div class="stu-inkrow"><button class="btn small" type="button" data-ink="undo"' + (inkStack(INK.undo).length ? "" : " disabled") + '>Undo</button><button class="btn small" type="button" data-ink="redo"' + (inkStack(INK.redo).length ? "" : " disabled") + '>Redo</button><button class="btn small" type="button" data-ink="clear"' + (inkPage().length ? "" : " disabled") + '>Clear ink</button>' +
      '<button class="btn small" type="button" data-ink="more" aria-expanded="' + INK.more + '">More</button></div>' +
    (INK.more ? '<div class="stu-inkmore">' + (STU && STU.canvas ? "" : seg("When you move on", [b("keep", inkKeep(), "Keep ink"), b("drop", !inkKeep(), "Clear ink")], true)) +
      seg("Writes with", [b("pen", !INK.finger, "S Pen"), b("finger", INK.finger, "Pen and finger")], true) +
      '<p class="hint" id="inkdiag">' + esc(INK.diag || "Pen button check: hold the S Pen button and touch the screen") + '</p>' + recTools() + '</div>' : "") + '</div>'; }
/* Record pen: for a few seconds, every pen, touch, mouse and key event the browser sends is written down, so Ali can paste it
   to us and we can see exactly what his tablet reports for the S Pen button (18 Oct: none of our guesses matched it) */
var REC = { on: false, end: 0, t0: 0, rows: [], out: "", tm: 0 }, RECMS = 8000;
var RECEV = ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerover", "pointerout", "touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mouseup", "contextmenu", "auxclick", "keydown", "keyup", "selectstart"];
function recTools() { var left = Math.max(0, Math.ceil((REC.end - Date.now()) / 1000));
  return '<div class="stu-inkrow"><button class="btn small" type="button" data-ink="rec"' + (REC.on ? " disabled" : "") + '>' + (REC.on ? "Recording, " + left + " s" : "Record pen") + '</button>' +
    (REC.out && !REC.on ? '<button class="btn small" type="button" data-ink="copy">Copy</button>' : "") +
    '<span class="hint">' + (REC.on ? "Hover, press the button, touch, write" : REC.out ? "Copy it and paste it in the chat" : "8 seconds of what the pen sends") + '</span></div>' +
    (REC.out && !REC.on ? '<textarea class="input stu-reclog" readonly rows="6" aria-label="Pen record">' + esc(REC.out) + '</textarea>' : ""); }
function recEv(e) { if (!REC.on) return; var p = e.pressure, r, k = e.type, tg = e.target;
  if (k.indexOf("key") === 0 && tg && tg.closest && tg.closest("input, textarea, select, [contenteditable]")) return;   // typing (a password too) is never written down
  if (k.indexOf("touch") === 0) { var t = (e.changedTouches || [])[0] || {}; r = k + " " + (t.touchType || "?") + " n" + (e.touches ? e.touches.length : "?") + " force " + (t.force == null ? "?" : Math.round(t.force * 100) / 100); }
  else if (k.indexOf("key") === 0) r = k + " " + e.key + " " + e.code;
  else if (k === "selectstart") r = k;
  else r = k + " " + (e.pointerType || "mouse") + " buttons " + e.buttons + " button " + e.button + (p == null ? "" : " p" + (p > 0 ? "+" : "0")) + (e.pointerId == null ? "" : " id " + e.pointerId);
  var last = REC.rows[REC.rows.length - 1], pr = p == null ? null : Math.round(p * 100) / 100, tx = e.tiltX, ty = e.tiltY, rg = function (o, k, v) { o[k] = [Math.min(o[k][0], v), Math.max(o[k][1], v)]; };
  if (last && last.r === r) { last.n++; if (pr != null) { last.lo = Math.min(last.lo, pr); last.hi = Math.max(last.hi, pr); } if (tx != null && last.tx) { rg(last, "tx", tx); rg(last, "ty", ty); } return; }
  if (REC.rows.length < 400) REC.rows.push({ t: Math.round(performance.now() - REC.t0), r: r, n: 1, lo: pr, hi: pr, tx: tx == null ? null : [tx, tx], ty: ty == null ? null : [ty, ty] }); }
function recRange(a) { return a[0] === a[1] ? "" + a[0] : a[0] + "-" + a[1]; }
function recStart() { REC.on = true; REC.rows = []; REC.out = ""; REC.t0 = performance.now(); REC.end = Date.now() + RECMS;
  RECEV.forEach(function (n) { addEventListener(n, recEv, { capture: true, passive: true }); });
  clearInterval(REC.tm); REC.tm = setInterval(function () { if (Date.now() >= REC.end) recStop(); else inkRefresh(); }, 1000); inkRefresh(); }
function recStop() { clearInterval(REC.tm); REC.on = false; RECEV.forEach(function (n) { removeEventListener(n, recEv, { capture: true, passive: true }); });
  REC.out = "Tutor Desk " + APP_VERSION + " · " + navigator.userAgent + "\n" + (REC.rows.length ? REC.rows.map(function (x) { return "+" + x.t + "ms " + x.r + (x.lo == null ? "" : " pressure " + (x.lo === x.hi ? x.lo : x.lo + "-" + x.hi)) + (x.tx ? " tilt " + recRange(x.tx) + "," + recRange(x.ty) : "") + (x.n > 1 ? " x" + x.n : ""); }).join("\n") : "nothing came through");
  inkRefresh(); }
function recCopy() { var ta = $(".stu-reclog"), done = function (ok) { var b = $('[data-ink="copy"]'); if (b) b.textContent = ok ? "Copied" : "Select it and copy"; };
  if (ta) { ta.focus(); ta.select(); }
  try { navigator.clipboard.writeText(REC.out).then(function () { done(true); }, function () { done(document.execCommand && document.execCommand("copy")); }); } catch (x) { done(false); } }
function inkRefresh() { var tl = $(".stu-tools"), pb = $("#stupen"); if (tl) tl.outerHTML = inkTools(); if (pb) pb.outerHTML = inkButton(); if (STU && STU.canvas) cvInkSave(); }
function inkTool(t) { var a = t.getAttribute("data-ink"), pg;
  if (t.id === "stupen") INK.open = !INK.open;
  else if (/^t-/.test(a)) INK.tool = a.slice(2);
  else if (a === "e-line" || a === "e-area") { INK.em = a.slice(2); ls("tutor.inkem", INK.em); }
  else if (/^c\d$/.test(a)) INK[INK.tool === "hl" ? "hc" : "pc"] = +a.slice(1);
  else if (/^w\d$/.test(a)) { INK[INK.tool === "hl" ? "hs" : INK.tool === "rub" ? "rs" : "ps"] = +a.slice(1); if (INK.tool === "rub") ls("tutor.inkrs", INK.rs); }
  else if (a === "undo" && inkStack(INK.undo).length) { inkStack(INK.redo).push(inkPage()); INK.pages[INK.key] = INK.undo[INK.key].pop(); inkDraw(); }
  else if (a === "redo" && inkStack(INK.redo).length) { inkStack(INK.undo).push(inkPage()); INK.pages[INK.key] = INK.redo[INK.key].pop(); inkDraw(); }
  else if (a === "clear" && inkPage().length) { inkSnap(); INK.pages[INK.key] = []; inkDraw(); }
  else if (a === "keep" || a === "drop") ls("tutor.inkkeep", a === "keep" ? "keep" : "clear");
  else if (a === "pen" || a === "finger") INK.finger = a === "finger";
  else if (a === "more") INK.more = !INK.more;
  else if (a === "rec") { if (!REC.on) recStart(); return; }
  else if (a === "copy") { recCopy(); return; }
  inkRefresh();
  $(".stu") && $(".stu").classList.toggle("inking", INK.finger); }
/* after each draw of his screen: drop the last screen's ink if Clear is chosen, then show this screen's */
function inkMount() { var k = inkKey();
  if (INK.key && INK.key !== k && !inkKeep() && INK.key.indexOf(":cv:") < 0) { delete INK.pages[INK.key]; delete INK.undo[INK.key]; delete INK.redo[INK.key]; }
  INK.key = k; INK.cur = null;
  var st = $(".stu"); if (!st) return; st.classList.toggle("inking", INK.finger);
  INK.cv = document.createElement("canvas"); INK.cv.className = "stu-ink"; INK.cv.setAttribute("aria-hidden", "true"); st.appendChild(INK.cv); inkDraw(); }
function inkDraw() { cancelAnimationFrame(INK.raf); INK.raf = requestAnimationFrame(inkPaint); }
function inkCtx() { var cv = INK.cv; if (!cv || !cv.isConnected) return null; var dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineJoin = "round"; return g; }
function inkCol(s) { return getComputedStyle(document.documentElement).getPropertyValue(INKCOL[s.t === "hl" ? "hl" : "pen"][s.c][0]).trim() || "#1B2130"; }
function inkWidth(s) { return INKW[s.t === "hl" ? "hl" : "pen"][s.w == null ? 1 : s.w] * (INK.map ? INK.map.s : 1); }
function inkPaint() { var g = inkCtx(); if (!g) return; inkMap(); g.clearRect(0, 0, innerWidth, innerHeight);
  var pg = inkPage(), cols = {}, line = function (s) { var p = s.p.map(inkXY), hl = s.t === "hl", k = (hl ? "h" : "p") + s.c; g.globalAlpha = hl ? .4 : 1; g.lineCap = hl ? "butt" : "round";
    g.strokeStyle = cols[k] || (cols[k] = inkCol(s)); g.lineWidth = inkWidth(s); g.beginPath(); g.moveTo(p[0][0], p[0][1]);
    if (p.length === 1) g.lineTo(p[0][0] + .1, p[0][1]);
    for (var i = 1; i < p.length - 1; i++) g.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
    if (p.length > 1) g.lineTo(p[p.length - 1][0], p[p.length - 1][1]); g.stroke(); };
  pg.filter(function (s) { return s.t === "hl"; }).forEach(line); pg.filter(function (s) { return s.t !== "hl"; }).forEach(line); g.globalAlpha = 1;   // highlighter under the pen, as in Samsung Notes
  if (INK.ec) { g.lineWidth = 1.5; g.strokeStyle = "rgba(27,33,48,.45)"; g.beginPath(); g.arc(INK.ec[0], INK.ec[1], INK.ec[2], 0, 2 * Math.PI); g.stroke(); } }   // where the eraser is
/* while writing with the pen, only the new piece of the line is drawn (redrawing every line on each move made it lag) */
function inkPiece(c) { var s = c.s, n = s.p.length; if (s.t === "hl" || s.line || n < 2) { inkDraw(); return; }
  var g = c.g || (c.g = inkCtx()); if (!g) return; var p0 = inkXY(s.p[Math.max(0, n - 3)]), p1 = inkXY(s.p[n - 2]), p2 = inkXY(s.p[n - 1]);
  g.globalAlpha = 1; g.lineCap = "round"; g.strokeStyle = c.col || (c.col = inkCol(s)); g.lineWidth = inkWidth(s); g.beginPath();
  if (n === 2) { g.moveTo(p1[0], p1[1]); g.lineTo((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); }
  else { g.moveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); g.quadraticCurveTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); }
  g.stroke(); }
/* a point is kept as fractions of the screen; on the canvas, in page units (the page is 1000 wide) so it scrolls and moves with the page */
function inkMap() { var pg = STU && STU.canvas && $(".cv-page"), r = pg && pg.getBoundingClientRect(); INK.map = r && r.width ? { l: r.left, t: r.top, s: r.width / CVW } : null; return INK.map; }
function inkXY(p) { var m = INK.map; return m ? [m.l + p[0] * m.s, m.t + p[1] * m.s] : [p[0] * innerWidth, p[1] * innerHeight]; }
function inkPt(e) { var m = INK.map; return m ? [(e.clientX - m.l) / m.s, (e.clientY - m.t) / m.s] : [e.clientX / innerWidth, e.clientY / innerHeight]; }
/* the eraser. Whole line: a line goes when the eraser touches it. Area: only what is under the eraser goes, and a line it cuts
   becomes two (keeping its colour, size and the piece it belongs to). The screen points of each line are worked out once per move. */
function inkScreen() { return inkPage().map(function (s) { var p = s.p.map(inkXY), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  p.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; });
  return { s: s, p: p, b: [x0, y0, x1, y1], h: inkWidth(s) / 2 }; }); }
function inkSegD(x, y, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0; return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y); }
function inkRub(c, list) { var r = INKER[INK.rs], out = [], hit = false;
  c.sc.forEach(function (o) { var R = r + o.h, bb = o.b, near = list.filter(function (q) { return q[0] > bb[0] - R && q[0] < bb[2] + R && q[1] > bb[1] - R && q[1] < bb[3] + R; });
    if (!near.length) { out.push(o); return; }
    if (INK.em !== "area") { var cut = near.some(function (q) { if (o.p.length === 1) return Math.hypot(o.p[0][0] - q[0], o.p[0][1] - q[1]) < R; for (var i = 1; i < o.p.length; i++) if (inkSegD(q[0], q[1], o.p[i - 1], o.p[i]) < R) return true; return false; });
      if (cut) hit = true; else out.push(o); return; }
    var runs = [], run = [], gone = false, keep = function (sp, pp) { if (near.some(function (q) { return Math.hypot(pp[0] - q[0], pp[1] - q[1]) < R; })) { gone = true; if (run.length) runs.push(run); run = []; } else run.push([sp, pp]); };
    o.s.p.forEach(function (sp, i) { if (i) { var a = o.p[i - 1], b = o.p[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.ceil(d / 3);   // long pieces (a straight line) are filled in, so the eraser can cut them too
        if (k > 1 && near.some(function (q) { return inkSegD(q[0], q[1], a, b) < R + 3; })) for (var j = 1; j < k; j++) { var t = j / k, sa = o.s.p[i - 1]; keep([sa[0] + (sp[0] - sa[0]) * t, sa[1] + (sp[1] - sa[1]) * t], [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
      keep(sp, o.p[i]); });
    if (run.length) runs.push(run);
    if (!gone) { out.push(o); return; } hit = true;
    runs.forEach(function (rn) { var ns = {}; Object.keys(o.s).forEach(function (k) { if (k !== "p" && k !== "p0" && k !== "line") ns[k] = o.s[k]; }); ns.p = rn.map(function (x) { return x[0]; });
      out.push({ s: ns, p: rn.map(function (x) { return x[1]; }), b: o.b, h: o.h }); }); });
  if (hit) { c.sc = out; INK.pages[INK.key] = out.map(function (o) { return o.s; }); c.hit = true; }
  var q = list[list.length - 1]; INK.ec = [q[0], q[1], r]; inkDraw(); }
/* the S Pen side button: tablets report it as the right button (2), as an eraser (32), or only as a right-click; and it may be
   pressed after the pen is already down. Any of these turns the stroke into rubbing out. */
function inkSide(e) { return !!((e.buttons & 2) || (e.buttons & 32) || e.button === 2 || e.button === 5); }
/* rubbing along the path, every few px from the last eraser point, so a quick flick can't jump over a thin line */
function inkRubTo(c, pts) { var list = [], step = Math.max(3, INKER[INK.rs] / 2);
  pts.forEach(function (pt) { var pp = inkXY(pt), a = c.lp || pp, d = Math.hypot(pp[0] - a[0], pp[1] - a[1]), k = Math.max(1, Math.ceil(d / step));
    for (var i = 1; i <= k; i++) list.push([a[0] + (pp[0] - a[0]) * i / k, a[1] + (pp[1] - a[1]) * i / k]); c.lp = pp; });
  if (!c.sc) c.sc = inkScreen(); inkRub(c, list); }
function inkToRub(c) { if (c.rub) return; c.rub = true; if (c.s) { var pg = inkPage(), k = pg.indexOf(c.s); if (k >= 0) pg.splice(k, 1); c.s = null; clearTimeout(c.tm); c.sc = null; inkDraw(); } }
function inkSeen(e, how) { var side = how || (inkSide(e) ? "seen" : inkArmed(e) ? "while hovering" : ""), c = INK.cur;
  if (c) { if (side) c.seen = true; else if (c.seen) return; }   // once seen in a stroke, the line keeps saying so until the next touch
  var t = "Pen button check: " + (side ? "button seen (" + side + ")" : "no button") + " · " + (e.pointerType || "?") + " · buttons " + e.buttons + " · button " + e.button + " · pressure " + (e.pressure == null ? "?" : Math.round(e.pressure * 100) / 100);
  if (t !== INK.diag) { INK.diag = t; var d = $("#inkdiag"); if (d) d.textContent = t; } }
/* a stroke held still at its end for a moment snaps to a straight line from where it began; moving on drags that line's end */
function inkHold(c) { clearTimeout(c.tm); c.tm = setTimeout(function () { var s = c.s; if (INK.cur !== c || !s || s.line || s.p.length < 3) return;
  var a = s.p[0], z = s.p[s.p.length - 1], az = inkXY(a), zz = inkXY(z); if (Math.hypot(zz[0] - az[0], zz[1] - az[1]) < 24) return;
  s.p = [a, z]; s.line = true; inkDraw(); }, 600); }
function inkCan(e) { if (MODE !== "student" || !STU || STU.drawer || !INK.cv) return false;
  var t = e.target; return !!(t.closest && t.closest(".stu-view, .cv-view") && !t.closest("button, a, input, select, textarea, video")); }   // a tap on a button still works
function inkPress(e) { return e.pointerType !== "pen" || e.pressure > 0; }   // a pen writes only while it presses: hovering, its pressure is 0
/* the S Pen button, as in Samsung Notes (Ali, 18 Oct): "the moment I click the button it becomes an eraser, I rub out, I release
   it and it becomes a pen again". Some tablets send the button as buttons 2 or 32; Ali's Tab S7 FE sends it as the tip being
   down (buttons 1) with no pressure, and keeps saying so, with no pressure, even while the pen rubs on the glass. So the button
   pressed above the screen starts the eraser at once, and it follows the pen until the button is let go. Only a press that
   follows plain hovering counts: the end of a stroke (tip still down, pressure gone) never starts it. */
function inkArm(e) { if (!(inkSide(e) || (e.buttons & 1))) { INK.arm = 0; INK.hov = true; return; }   // hovering, no button
  if (!INK.arm) INK.arm = e.timeStamp || 1;
  if (INK.hov && !INK.cur && MODE === "student" && inkCan(e)) { INK.lp = { x: e.clientX, y: e.clientY, id: e.pointerId, el: e.target }; inkHeld(!inkSide(e)); }
  INK.hov = false; }
function inkArmed(e) { return e.pointerType === "pen" && !!INK.arm && (e.timeStamp || 0) - INK.arm > 80; }
function inkStart(e, rub) { e.preventDefault(); inkMap();
  rub = rub || INK.tool === "rub" || inkSide(e) || inkArmed(e); var pt = inkPt(e), redo = inkStack(INK.redo); inkSnap();
  INK.cur = { id: e.pointerId, rub: rub, s: rub ? null : { t: INK.tool, c: INK.tool === "hl" ? INK.hc : INK.pc, w: INK.tool === "hl" ? INK.hs : INK.ps, p: [pt] }, redo: redo, ax: e.clientX, ay: e.clientY, seen: inkSide(e) };
  if (rub) inkRubTo(INK.cur, [pt]); else { inkPage().push(INK.cur.s); inkDraw(); inkHold(INK.cur); }
  try { e.target.setPointerCapture(e.pointerId); INK.cur.el = e.target; } catch (x) {} }
function inkEnd(c) { clearTimeout(c.tm); INK.cur = null; INK.ec = null; if (c.s && STU && STU.canvas) cvStrokeDone(c.s);
  if (c.rub && !c.hit) { inkStack(INK.undo).pop(); INK.redo[INK.key] = c.redo; }   // erased nothing: nothing to undo, and Redo stays
  try { if (c.el && c.el.hasPointerCapture(c.id)) c.el.releasePointerCapture(c.id); } catch (x) {}
  inkDraw(); inkRefresh(); }
document.addEventListener("pointerdown", function (e) {
  INK.pen = e.pointerType === "pen";   // Chrome sends the S Pen's touch events too: while it is down they are not a swipe
  if (!inkCan(e)) return;
  if (e.pointerType !== "touch" || INK.finger) inkSeen(e);
  if (e.pointerType !== "pen" && !INK.finger && !(e.pointerType === "mouse" && inkSide(e))) return;   // a right-button press erases: some tablets send the S Pen with its button held that way
  if (!inkPress(e)) { inkArm(e); return; }   // the button pressed above the screen also fires pointerdown: nothing touches yet
  if (e.pointerType === "pen") INK.hov = false;
  if (INK.cur && INK.cur.held) { if (INK.cur.tip && !inkSide(e)) inkUnheld(INK.cur); else return; }   // pressure: it was the pen landing, not the button
  inkStart(e);
}, true);
/* the held-button eraser: it starts where the pen is and erases until the button is let go (a circle shows where). Chrome also
   sends a right-click about half a second after the pen touches with the button held (Ali's pen record); that starts it too if
   the button press itself went unseen. A tablet whose "tip down, no pressure" was only a pen landing sends pressure next: then
   whatever the eraser took comes back and the stroke writes. */
function inkHeld(tip) { var p = INK.lp; inkStart({ preventDefault: function () {}, clientX: p.x, clientY: p.y, pointerId: p.id, pointerType: "pen", buttons: 1, button: -1, target: p.el }, true); INK.cur.held = true; INK.cur.tip = !!tip; INK.cur.seen = true; }
function inkUnheld(c) { INK.cur = null; INK.ec = null; var u = inkStack(INK.undo).pop(); if (c.hit && u) INK.pages[INK.key] = u; INK.redo[INK.key] = c.redo; inkDraw(); }
document.addEventListener("pointermove", function (e) { var c = INK.cur;
  if (e.pointerType === "pen") INK.lp = { x: e.clientX, y: e.clientY, id: e.pointerId, el: e.target };
  if (c && c.held && e.pointerId === c.id) {
    if (e.pressure > 0 && c.tip && !inkSide(e)) { inkUnheld(c); c = null; }   // pressure: it was the pen landing, not the button
    else if (!(e.buttons & 1) && !inkSide(e)) { inkEnd(c); INK.arm = 0; INK.hov = true; return; } }   // button let go: a pen again
  else if (e.pointerType === "pen" && !inkPress(e)) { if (c && e.pointerId === c.id) inkEnd(c); if (MODE === "student") inkArm(e); return; }   // above the screen (or lifted with its button still held: no pointerup comes yet)
  if (e.pointerType === "pen" && e.pressure > 0) INK.hov = false;
  if (!c && e.pointerType === "pen" && e.pressure > 0 && inkCan(e)) { inkSeen(e); inkStart(e); return; }   // pressed down after its button: some tablets send no new pointerdown
  if (!c || e.pointerId !== c.id) return; e.preventDefault(); inkSeen(e); inkMap();
  if (inkSide(e)) inkToRub(c);
  var pts = (e.getCoalescedEvents ? e.getCoalescedEvents() : []).concat([e]).map(inkPt);
  if (c.rub) { inkRubTo(c, pts); return; }
  pts.forEach(function (pt) { if (c.s.line) c.s.p[1] = pt; else { c.s.p.push(pt); inkPiece(c); } });
  if (c.s.line) inkDraw();
  if (Math.hypot(e.clientX - c.ax, e.clientY - c.ay) > 3) { c.ax = e.clientX; c.ay = e.clientY; if (!c.s.line) inkHold(c); } }, true);
/* some tablets send the side button as a right-click: no menu on his screen, and the stroke becomes rubbing out */
document.addEventListener("contextmenu", function (e) { if (MODE !== "student" || !(INK.cur || INK.pen || INK.arm)) return; e.preventDefault(); inkSeen({ pointerType: "pen", buttons: "?", button: "?" }, "right-click");
  if (INK.cur) inkToRub(INK.cur); else if (inkArmed({ pointerType: "pen", timeStamp: e.timeStamp }) && INK.lp && INK.lp.el && INK.lp.el.isConnected && inkCan(e)) inkHeld(false); }, true);   // only on his page itself, and not from a pen last seen on a page since replaced
/* Chrome on Android turns "S Pen button held + drag" into its own text selection (Ali's Tab S7 FE, 17 Oct): nothing on his
   screen is ever selectable (app.css), and any selection Chrome still starts is stopped and noted in the pen button check */
document.addEventListener("selectstart", function (e) { if (MODE !== "student" || e.target.closest && e.target.closest("input, textarea")) return; e.preventDefault(); inkSeen({ pointerType: "pen", buttons: "?", button: "?" }, "Chrome tried to select text"); if (INK.cur) inkToRub(INK.cur); }, true);
document.addEventListener("selectionchange", function () { if (MODE !== "student" || document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return; var sel = getSelection(); if (sel && !sel.isCollapsed) sel.removeAllRanges(); });
["pointerup", "pointercancel"].forEach(function (n) { document.addEventListener(n, function (e) { if (e.pointerType === "pen") { INK.pen = false; INK.arm = 0; } var c = INK.cur;
  if (n === "pointercancel" && c && e.pointerId === c.id) { INK.diag = "Pen button check: the browser took over the stroke · " + (e.pointerType || "?"); var d = $("#inkdiag"); if (d) d.textContent = INK.diag; }
  if (c && e.pointerId === c.id) inkEnd(c); }, true); });
document.addEventListener("pointerout", function (e) { if (e.pointerType !== "pen" || e.relatedTarget) return; INK.arm = 0; if (INK.cur && INK.cur.held && e.pointerId === INK.cur.id) inkEnd(INK.cur); }, true);   // the pen taken out of range with its button held: the erase ends, the next touch writes
addEventListener("resize", function () { if (MODE === "student") inkDraw(); });

/* ---------------- the teaching canvas (Ali, 17 Oct: "a blank canvas onto which ready-made pieces are dropped") ----------------
   Student view on the tablet is a page he writes on with the S Pen; Teach on the laptop puts questions onto it. The two are
   different devices, so each action goes through the exam server (/api/t/canvas/<lesson>) and both screens replay the same
   log: add, rm (remove), top (move to the top), new (new page), go (show a page), pos (where a piece sits), reset (clear it all). Only the tablet
   knows how tall a piece is, so it lays the pieces out and sends their places back; the laptop's list follows them.
   Pages are 1000 units wide and grow down. Ink stays on the tablet, one ink page per canvas page, kept on the device.
   A stroke belongs to the piece above it, so it moves, scales and goes with that piece; writing that reaches the next
   question pushes it down. The student sees the page and the pen only: the list lives in Teach. */
var CVW = 1000, CVGAP = 360, CVX = 40, CVWD = 920;   // page width, writing space under a question, left edge and width of a new piece
var CV = { id: null, log: [], seq: 0, local: [], busy: false, err: "", sel: null, laying: false, open: false, ans: {}, drag: null, ptr: "" };
function cvApi() { return (ls("tutor.examApi") || window.EXAM_API || "").replace(/\/+$/, ""); }
function cvReady() { return !!(cvApi() && ls("tutor.examPw")); }
function cvReset(id) { if (CV.id !== id) CV = { id: id, log: [], seq: 0, local: [], busy: false, err: "", sel: null, laying: false, open: CV.open, ans: {}, drag: null, ptr: "" }; }
function cvFetch(method, body) {
  return fetch(cvApi() + "/api/t/canvas/" + encodeURIComponent(CV.id) + (method === "GET" ? "?after=" + CV.seq : ""), { method: method, cache: "no-store",
    headers: Object.assign({ "X-Exam-Password": ls("tutor.examPw") || "" }, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "exam server " + r.status); return d; }); }); }
/* send actions: shown at once (kept in CV.local until the server's copy comes back), taken back if the server refuses */
function cvSend(acts) { if (!L) return Promise.resolve(false); cvReset(L.id);
  if (!cvReady()) { toast("Set the exam password on this device first (Exams tab)"); return Promise.resolve(false); }
  acts.forEach(function (a) { a.k = a.k || Math.random().toString(36).slice(2, 10); }); CV.local = CV.local.concat(acts); cvChanged();
  return cvFetch("POST", { actions: acts }).then(function () { cvPoll(); return true; }, function (e) { var ks = acts.map(function (a) { return a.k; });
    CV.local = CV.local.filter(function (a) { return ks.indexOf(a.k) < 0; }); cvChanged(); toast("Couldn’t reach the exam server: " + e.message); return false; }); }
function cvPoll() { if (!CV.id || CV.busy || !cvReady()) return Promise.resolve(); CV.busy = true; var id = CV.id;
  return cvFetch("GET").then(function (d) { CV.busy = false; if (CV.id !== id) return; var n = (d.actions || []).length, was = CV.err || !CV.loaded; CV.err = ""; if (!d.more) CV.loaded = true;   // loaded only once the whole log is in, or ink of later pieces would look orphaned
    if (n) { CV.log = CV.log.concat(d.actions); CV.seq = d.actions[n - 1].seq; var seen = {}; CV.log.forEach(function (x) { if (x.a.k) seen[x.a.k] = 1; });
      CV.local = CV.local.filter(function (a) { return !seen[a.k]; }); cvChanged(); if (d.more) return cvPoll(); }
    else if (was) cvChanged(); },
    function (e) { CV.busy = false; if (CV.err !== e.message) { CV.err = e.message; cvChanged(); } }); }
/* the canvas as the log leaves it: pages of pieces, each piece {u, ref, x, y, w}; y is null until the tablet has placed it */
function cvState() { var st = { pages: [{ items: [] }], cur: 0, ep: 0 }, n = 0;
  var find = function (u) { for (var i = 0; i < st.pages.length; i++) for (var j = 0; j < st.pages[i].items.length; j++) if (st.pages[i].items[j].u === u) return { it: st.pages[i].items[j], pg: st.pages[i] }; return null; };
  CV.log.map(function (x) { return x.a; }).concat(CV.local).forEach(function (a) { var f = a.u ? find(a.u) : null;
    if (a.t === "add" && !f && (a.ref || a.pc)) (st.pages[a.pg] || st.pages[st.cur]).items.push({ u: a.u, ref: String(a.ref || "typed"), pc: a.pc || null, of: a.of || null, x: +a.x || CVX, y: null, w: +a.w || CVWD, n: n++ });
    else if (a.t === "rm" && f) f.pg.items = f.pg.items.filter(function (x) { return x !== f.it && x.of !== a.u; });
    else if (a.t === "pos" && f) { f.it.x = +a.x || 0; f.it.y = +a.y || 0; f.it.w = +a.w || CVWD; f.it.top = false; }
    else if (a.t === "top" && f) f.it.top = true;
    else if (a.t === "new") { st.pages.push({ items: [] }); st.cur = st.pages.length - 1; }
    else if (a.t === "go" && st.pages[a.n]) st.cur = a.n;
    else if (a.t === "reset") st = { pages: [{ items: [] }], cur: 0, ep: st.ep + 1 }; });   // Clear canvas: ink is kept by clearing round (ep), so the old ink is left behind
  st.pages.forEach(function (pg) { pg.items.sort(function (a, b) { return (a.y == null ? 1e9 + a.n : a.y) - (b.y == null ? 1e9 + b.n : b.y); }); });
  return st; }
function cvWhere(st, ref) { for (var i = 0; i < st.pages.length; i++) if (st.pages[i].items.some(function (x) { return x.ref === ref; })) return i; return -1; }
/* what can go on the page, from the lesson: the questions (as in the questions view: exam pictures, typed parts, quick
   questions), the script's pieces ({"type": "piece"}: a heading, equation, structure or text, phase 2) and each question's
   solution lines ("solution": [...], dropped under that question). Pieces Ali types in Teach travel in the action itself (pc). */
function cvItems() { var m = {}; (STU && STU.id === L.id ? STU.items : studentItems()).forEach(function (q) { if (q.kind !== "video") m[q.id] = q; });
  phases().filter(function (p) { return !p.sys; }).forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) {
    if (b.type === "piece" && b.id) m[b.id] = { kind: "piece", id: b.id, pc: b, p: p };
    if (b.type === "question" && b.id) (b.solution || []).forEach(function (ln, k) { var id = b.id + "#" + (k + 1); m[id] = { kind: "line", id: id, pc: ln, q: b.id, n: k + 1, p: p }; });
    if (b.blocks) walk(b.blocks); }); })(p.blocks); });
  return m; }
function cvOf(it, items) { return it.pc ? { kind: "piece", id: "typed", pc: it.pc } : items[it.ref]; }
function cvIsQ(q) { return !!q && (q.kind === "exam" || q.kind === "quick"); }
function cvPcKind(pc) { return pc.kind || (pc.tex ? "equation" : pc.img ? "structure" : "text"); }
var CVPCW = { heading: 900, equation: 600, structure: 500, text: 900 };   // a new piece's width by kind (pieces can give their own "w")
function cvPcLabel(pc) { var k = cvPcKind(pc); return k === "structure" ? (pc.alt || pc.caption || "Structure") : pc.tex ? "\\(" + pc.tex + "\\)" : k === "heading" ? titleCase(plain(pc.text || pc.html)) : plain(pc.text || pc.html).slice(0, 90); }
function cvLabel(q) { if (!q) return "Not in this lesson"; if (q.kind === "piece") return cvPcLabel(q.pc); if (q.kind === "line") return "Line " + q.n + ": " + cvPcLabel(q.pc);
  var f = cvFind(q.id), b = f && f.q; return q.kind === "exam" ? (b && (b.label || b.source) || "Question") : plain(q.text).slice(0, 90); }
function cvFind(ref) { var hit = null; phases().filter(function (p) { return !p.sys; }).forEach(function (p) { (function walk(bs) { (bs || []).forEach(function (b) {
    if (hit) return; if (b.type === "question" && b.id === ref) hit = { q: b, p: p };
    else if (b.type === "quiz") (b.items || []).forEach(function (it) { if (!hit && it.id === ref) hit = { it: it, p: p }; });
    else if (b.type === "drill") (b.items || []).forEach(function (d) { if (!hit && drillKey(d[0]) === ref) hit = { d: d, p: p }; });
    if (b.blocks) walk(b.blocks); }); })(p.blocks); }); return hit; }
function cvAnswerHTML(ref) { var f = cvFind(ref); if (!f) return ""; var h = "";
  if (f.q) { h = (f.q.answer ? clean(f.q.answer) : "") + (f.q.parts || []).map(function (pt) { return pt.answer ? '<p><b>' + esc(pt.label || pt.part || "") + '</b></p>' + clean(pt.answer) : ""; }).join("") +
    (f.q.answerImg || []).map(function (i) { return '<figure class="fig"><img data-src="' + esc(i) + '" alt="Mark scheme" hidden><div class="ph">Loading image</div></figure>'; }).join(""); }
  else if (f.it) h = clean(f.it.a || ""); else if (f.d) h = clean(f.d[1] || "");
  return h || '<p class="hint">No answer in the script.</p>'; }

/* ----- the tablet: the page ----- */
function cvModeSeg() { var on = STU && STU.canvas; return '<div class="seg cv-mode" role="group" aria-label="Student view"><button type="button" data-cvmode="canvas" aria-pressed="' + !!on + '">Canvas</button><button type="button" data-cvmode="questions" aria-pressed="' + !on + '">Questions</button></div>'; }
function drawCanvas() { cvReset(L.id);
  if ($(".stu.cv") && $(".stu.cv").getAttribute("data-l") === L.id) { cvSync(); return; }   // a refresh from another device: keep the page and its pictures
  app.innerHTML = '<div class="stu clean cv" data-l="' + esc(L.id) + '"><header class="stu-top">' + inkButton() + '<span class="push"></span><span class="cv-pages"></span>' + cvModeSeg() + '</header>' + inkTools() +
    '<main class="cv-view"><div class="cv-page"></div></main></div>';
  inkMount(); cvInkLoad().then(function () { inkDraw(); inkRefresh(); }); cvSync(); cvPoll(); prefetchLesson();
  if (BC) BC.postMessage({ type: "alive", lesson: L.id }); }
function cvPage(st) { st = st || cvState(); return st.pages[st.cur]; }
function cvScale() { var pg = $(".cv-page"); return pg && pg.clientWidth ? pg.clientWidth / CVW : 1; }
function cvEl(u) { return $('.cv-item[data-u="' + u + '"]'); }
function cvH(u) { var el = cvEl(u); return el ? el.offsetHeight / cvScale() : 0; }
/* bring the page in line with the log: add and drop pieces, move them, page tags, ink page */
function cvSync() { var root = $(".stu.cv"), page = $(".cv-page"); if (!root || !page) return; var st = cvState(), pg = st.pages[st.cur], items = cvItems(), s = cvScale(), seen = {};
  page.style.setProperty("--cvs", s);
  if (!cvReady()) { if (root.hasAttribute("data-setup")) return; page.innerHTML = '<div class="cv-setup card pad stack"><b class="t-card">Connect this tablet to Teach</b><span class="hint">Teach on the laptop sends questions here through the exam server. Type the exam password once on this device.</span><div class="row s2"><input class="input" type="password" id="cvpw" autocomplete="current-password" aria-label="Exam password" placeholder="Exam password"><button class="btn pri" type="button" id="cvpwgo">Save password</button></div></div>'; root.setAttribute("data-setup", "1"); return; }
  if (root.hasAttribute("data-setup")) { root.removeAttribute("data-setup"); page.innerHTML = ""; }
  pg.items.forEach(function (it) { seen[it.u] = 1; var el = cvEl(it.u), q = cvOf(it, items);
    if (!el) { el = document.createElement("div"); el.className = "cv-item k-" + (q ? q.kind : "none"); el.setAttribute("data-u", it.u);
      el.innerHTML = (q ? cvPieceHTML(q) : '<div class="cv-card hint">Not in this lesson</div>') + '<button type="button" class="cv-ctl grip" data-cvgrip aria-label="Move"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"></path></svg></button><button type="button" class="cv-ctl x" data-cvrm aria-label="Remove"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button><button type="button" class="cv-ctl size" data-cvsize aria-label="Resize"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v8h-8M20 20L12 12"></path></svg></button>';
      page.appendChild(el); $$("img", el).forEach(showImg); maths(el); }
    if (CV.drag && (CV.drag.u === it.u || CV.drag.att.some(function (a) { return a.u === it.u; }))) return;   // the piece under his finger (and its lines) stays where the finger is
    el.style.left = it.x * s + "px"; el.style.top = (it.y == null ? 0 : it.y) * s + "px"; el.style.width = it.w * s + "px";
    el.classList.toggle("unplaced", it.y == null); el.classList.toggle("sel", CV.sel === it.u); });
  $$(".cv-item", page).forEach(function (el) { if (!seen[el.getAttribute("data-u")]) el.remove(); });
  if (CV.loaded && inkKey() === INK.key) { var ink = INK.pages[INK.key] || [], kept = ink.filter(function (k) { return !k.o || seen[k.o]; }); if (kept.length !== ink.length) { INK.pages[INK.key] = kept; cvInkSave(); } }   // removed in Teach: its working goes with it
  if (CV.sel && !seen[CV.sel]) CV.sel = null;
  var bot = cvBottom(pg); page.style.height = Math.max(bot + 600, ($(".cv-view").clientHeight - 80) / s) * s + "px";
  var pt = $(".cv-pages"); if (pt) pt.innerHTML = '<button class="stu-menu" type="button" data-cvgo="-1" aria-label="Page before"' + (st.cur ? "" : " disabled") + '><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg></button>' + tag("Page " + (st.cur + 1) + " of " + st.pages.length, "num") +
    '<button class="stu-menu" type="button" data-cvgo="1" aria-label="Page after"' + (st.cur < st.pages.length - 1 ? "" : " disabled") + '><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button><button class="btn small" type="button" data-cvnew>New page</button>' + (CV.err ? tag("Offline", "live") : "");
  if (inkKey() !== INK.key) { INK.key = inkKey(); INK.cur = null; inkRefresh(); }
  inkDraw(); cvLay(); }
function cvPieceHTML(q) { if (q.kind === "piece" || q.kind === "line") return cvPcHTML(q.pc, q.kind === "line");
  return q.kind === "exam" ? (q.twin ? '<div class="stu-twin">' + twinHTML(q.twin) + '</div>' : q.img.map(function (i) { return '<img data-src="' + esc(i) + '" alt="Question" hidden>'; }).join(""))
  : '<div class="cv-card"><div class="stu-q">' + paperHTML(q.text, subjNow()) + '</div></div>'; }
/* a heading (Title Case), an equation (KaTeX, display), a structure (a picture), a line of text; a solution line is a little smaller */
function cvPcHTML(pc, line) { var k = cvPcKind(pc);
  if (pc.img) return '<img data-src="' + esc(pc.img) + '" alt="' + esc(pc.alt || "Structure") + '" hidden>';
  if (k === "heading") return '<div class="cv-pc h">' + esc(titleCase(pc.text || plain(pc.html))) + '</div>';
  return '<div class="cv-pc ' + (line ? "ln" : k === "equation" ? "eq" : "tx") + '">' + (pc.tex ? (line ? "\\(" : "\\[") + esc(pc.tex) + (line ? "\\)" : "\\]") : pc.html ? clean(pc.html) : esc(pc.text || "")) + '</div>'; }
/* the lowest point in use on the page: placed pieces (a question keeps its writing space under it) and ink */
function cvBottom(pg, skip) { var b = 0, qs = cvItems();
  pg.items.forEach(function (it) { if (it.y == null || it.u === skip) return; b = Math.max(b, it.y + cvH(it.u) + (cvIsQ(cvOf(it, qs)) && !it.of ? CVGAP : 24)); });
  (INK.pages[inkKey()] || []).forEach(function (s) { s.p.forEach(function (p) { b = Math.max(b, p[1] + 40); }); });
  return Math.max(b, CVX); }
/* pictures first: a piece's height is known only once its pictures are in */
function cvImgs() { var t0 = Date.now(); return new Promise(function (res) { (function wait() { var ims = $$(".cv-page img"); if (Date.now() - t0 > 6000 || ims.every(function (i) { return i.naturalWidth > 0; })) res(); else setTimeout(wait, 100); })(); }); }
/* place new pieces under what is there, and carry out "move to the top"; then send where they went */
function cvLay() { if (CV.laying || !$(".cv-page")) return; var pg = cvPage(); if (!pg.items.some(function (x) { return x.y == null || x.top; })) return; CV.laying = true;
  cvImgs().then(function () { var st = cvState(), pg = st.pages[st.cur], acts = [], top = pg.items.filter(function (x) { return x.top && x.y != null; })[0];
    if (top) acts = cvRestack(pg, top);
    pg.items.filter(function (x) { return x.y == null && !x.of; }).forEach(function (it) { it.y = Math.round(cvBottom(pg)); acts.push({ t: "pos", u: it.u, x: it.x, y: it.y, w: it.w }); });
    pg.items.filter(function (x) { return x.y == null && x.of; }).forEach(function (it) { var o = pg.items.filter(function (x) { return x.u === it.of; })[0]; if (!o || o.y == null) return;
      it.x = Math.min(o.x + 40, CVW - it.w); it.y = Math.round(cvUnder(pg, o)); acts.push({ t: "pos", u: it.u, x: it.x, y: it.y, w: it.w }); acts = acts.concat(cvMakeRoom(pg, o, it.y + cvH(it.u))); });
    pg.items.filter(function (x) { return x.top && x.y == null; }).forEach(function (it) { acts.push({ t: "top", u: it.u }); });   // a new piece moved to the top: once it is placed
    CV.laying = false; if (acts.length) cvSend(acts); }); }
/* just under a question: below the question, the lines already dropped under it, and the writing that belongs to it */
function cvUnder(pg, o) { var b = o.y + cvH(o.u) + 16;
  pg.items.forEach(function (x) { if (x.of === o.u && x.y != null) b = Math.max(b, x.y + cvH(x.u) + 12); });
  (INK.pages[inkKey()] || []).forEach(function (s) { if (s.o === o.u) s.p.forEach(function (p) { b = Math.max(b, p[1] + 24); }); });
  return b; }
/* move a piece with everything that belongs to it (its ink, its dropped lines and their ink); the new places go into acts */
function cvShift(pg, it, dx, dy, acts) { [it].concat(pg.items.filter(function (x) { return x.of === it.u && x.y != null; })).forEach(function (x) {
  cvInkMove(x.u, dx, dy, 1); x.x += dx; x.y += dy; acts.push({ t: "pos", u: x.u, x: x.x, y: x.y, w: x.w }); }); return acts; }
/* the pieces after o move down when something under o now reaches down to "low" */
function cvMakeRoom(pg, o, low) { var acts = [], next = pg.items.filter(function (x) { return !x.of && x.y != null && x.y > o.y; }).sort(function (p, q) { return p.y - q.y; })[0];
  if (!next || low + 24 <= next.y) return acts; var d = Math.round(low + 48 - next.y);
  pg.items.filter(function (x) { return !x.of && x.y != null && x.y >= next.y; }).forEach(function (x) { cvShift(pg, x, 0, d, acts); }); return acts; }
/* move to the top: that piece first, the rest after it in their order, each keeping its writing space, its lines and its ink */
function cvRestack(pg, top) { var old = pg.items.filter(function (x) { return x.y != null && !x.of; }).sort(function (a, b) { return a.y - b.y; }), zone = {};
  old.forEach(function (it, i) { var h = cvUnder(pg, it) - it.y + 8; zone[it.u] = i < old.length - 1 ? Math.max(h, old[i + 1].y - it.y) : h + CVGAP; });
  var y = CVX, acts = []; [top].concat(old.filter(function (x) { return x !== top; })).forEach(function (it) { cvShift(pg, it, 0, y - it.y, acts); y += zone[it.u]; });
  return acts; }
/* ink that belongs to a piece: shifted by (dx, dy) and scaled by k about the piece's top left */
function cvInkMove(u, dx, dy, k, from) { var it = cvPage().items.filter(function (x) { return x.u === u; })[0]; if (!it) return; var ox = from ? from.x : it.x, oy = from ? from.y : it.y;
  (INK.pages[inkKey()] || []).forEach(function (s) { if (s.o !== u) return; var src = from && s.p0 ? s.p0 : s.p; s.p = src.map(function (p) { return [ox + dx + (p[0] - ox) * k, oy + dy + (p[1] - oy) * k]; }); }); }
/* a finished stroke: which piece it belongs to, and push the next question down if the writing reached it */
function cvStrokeDone(s) { var pg = cvPage(), a = s.p[0], best = null;
  pg.items.forEach(function (it) { if (it.y == null || it.of || it.y > a[1]) return; var over = a[0] >= it.x - 20 && a[0] <= it.x + it.w + 20; if (!best || over && !best.over || over === best.over && it.y > best.it.y) best = { it: it, over: over }; });
  s.o = best ? best.it.u : null; if (!best) return;
  var next = pg.items.filter(function (x) { return !x.of && x.y != null && x.y > best.it.y; }).sort(function (p, q) { return p.y - q.y; })[0]; if (next && a[1] >= next.y) return;
  var acts = cvMakeRoom(pg, best.it, Math.max.apply(null, s.p.map(function (p) { return p[1]; }))); if (acts.length) cvSend(acts); }
/* ink lives on the tablet only: kept on the device for the lesson, by canvas page (never in try-out) */
var cvSaveT = 0;
function cvInkSave() { if (TRY || !L) return; clearTimeout(cvSaveT); var id = L.id, pre = id + ":cv:" + cvState().ep + ":"; cvSaveT = setTimeout(function () { var out = {};
  Object.keys(INK.pages).forEach(function (k) { if (k.indexOf(pre) === 0) out[k] = INK.pages[k]; }); cput("cvink:" + id, out); }, 600); }
function cvInkLoad() { var id = L.id; return cget("cvink:" + id).then(function (o) { Object.keys(o || {}).forEach(function (k) { if (!INK.pages[k] || !INK.pages[k].length) INK.pages[k] = o[k]; }); }); }
function cvChanged() { if (MODE === "student" && STU && STU.canvas) cvSync(); if (CV.open) cvPanel(); }
setInterval(function () { if (document.hidden || !L || !CV.id || CV.id !== L.id) return; CV.tick = (CV.tick || 0) + 1;
  if (MODE === "student" && STU && STU.canvas) cvPoll(); else if (MODE === "teach" && CV.open && CV.tick % 3 === 0) cvPoll(); }, 500);
addEventListener("resize", function () { if (MODE === "student" && STU && STU.canvas) cvSync(); });
document.addEventListener("scroll", function (e) { if (MODE === "student" && STU && STU.canvas && e.target.classList && e.target.classList.contains("cv-view")) inkDraw(); }, true);

/* a finger scrolls the page (the page itself takes no touch scrolling, so the S Pen writes instead); a tap still picks a piece */
document.addEventListener("pointerdown", function (e) { if (e.pointerType !== "touch" || INK.finger || MODE !== "student" || !STU || !STU.canvas || CV.drag) return;
  var v = e.target.closest && e.target.closest(".cv-view"); if (!v || e.target.closest("button, input, [data-cvgrip], [data-cvsize]")) return;
  CV.pan = { id: e.pointerId, y0: e.clientY, top: v.scrollTop, v: v, moved: false }; });
document.addEventListener("pointermove", function (e) { var p = CV.pan; if (!p || e.pointerId !== p.id) return; var dy = e.clientY - p.y0; if (Math.abs(dy) > 8) p.moved = true; if (p.moved) p.v.scrollTop = p.top - dy; });
["pointerup", "pointercancel"].forEach(function (n) { document.addEventListener(n, function (e) { var p = CV.pan; if (p && e.pointerId === p.id) { CV.pan = null; CV.panned = p.moved ? Date.now() : 0; } }); });
/* tap a piece with a finger (or the mouse) to pick it: then drag it by the cross, resize it by the corner, or remove it */
document.addEventListener("pointerdown", function (e) { CV.ptr = e.pointerType; if (MODE !== "student" || !STU || !STU.canvas) return;
  var h = e.target.closest && e.target.closest("[data-cvgrip],[data-cvsize]"); if (!h) return; var el = h.closest(".cv-item"), u = el.getAttribute("data-u"), it = cvPage().items.filter(function (x) { return x.u === u; })[0]; if (!it) return;
  var att = h.hasAttribute("data-cvsize") ? [] : cvPage().items.filter(function (x) { return x.of === u && x.y != null; }).map(function (x) { return { u: x.u, x: x.x, y: x.y, w: x.w }; });
  e.preventDefault(); inkMap(); CV.drag = { u: u, size: h.hasAttribute("data-cvsize"), id: e.pointerId, x0: e.clientX, y0: e.clientY, from: { x: it.x, y: it.y, w: it.w }, to: { x: it.x, y: it.y, w: it.w }, att: att };
  var mine = [u].concat(att.map(function (a) { return a.u; })); (INK.pages[inkKey()] || []).forEach(function (s) { if (mine.indexOf(s.o) >= 0) s.p0 = s.p; }); try { h.setPointerCapture(e.pointerId); } catch (x) {} }, true);
document.addEventListener("pointermove", function (e) { var d = CV.drag; if (!d || e.pointerId !== d.id) return; e.preventDefault(); var s = cvScale(), dx = (e.clientX - d.x0) / s, dy = (e.clientY - d.y0) / s, f = d.from, el = cvEl(d.u); if (!el) return;
  if (d.size) { var w = Math.max(160, Math.min(CVW - f.x, f.w + dx)); d.to = { x: f.x, y: f.y, w: Math.round(w) }; el.style.width = w * s + "px"; cvInkMove(d.u, 0, 0, w / f.w, f); }
  else { d.to = { x: Math.round(Math.max(0, Math.min(CVW - 80, f.x + dx))), y: Math.round(Math.max(0, f.y + dy)), w: f.w }; el.style.left = d.to.x * s + "px"; el.style.top = d.to.y * s + "px"; cvInkMove(d.u, d.to.x - f.x, d.to.y - f.y, 1, f);
    d.att.forEach(function (a) { var ae = cvEl(a.u); if (ae) { ae.style.left = (a.x + d.to.x - f.x) * s + "px"; ae.style.top = (a.y + d.to.y - f.y) * s + "px"; } cvInkMove(a.u, d.to.x - f.x, d.to.y - f.y, 1, a); }); }
  inkDraw(); }, true);
["pointerup", "pointercancel"].forEach(function (n) { document.addEventListener(n, function (e) { var d = CV.drag; if (!d || e.pointerId !== d.id) return; CV.drag = null;
  (INK.pages[inkKey()] || []).forEach(function (s) { delete s.p0; }); cvInkSave();
  var ddx = d.to.x - d.from.x, ddy = d.to.y - d.from.y;
  if (ddx || ddy || d.to.w !== d.from.w) cvSend([{ t: "pos", u: d.u, x: d.to.x, y: d.to.y, w: d.to.w }].concat(d.att.map(function (a) { return { t: "pos", u: a.u, x: a.x + ddx, y: a.y + ddy, w: a.w }; }))); }, true); });
document.addEventListener("click", function (e) { if (MODE !== "student" || !STU) return; var t = e.target.closest && e.target.closest("[data-cvmode],[data-cvgo],[data-cvnew],[data-cvrm],#cvpwgo,.cv-item,.cv-page"); if (!t) return;
  if (t.hasAttribute("data-cvmode")) { ls("tutor.stumode", t.getAttribute("data-cvmode") === "questions" ? "questions" : null); INK.cur = null; app.innerHTML = ""; drawStudent(); return; }
  if (!STU.canvas) return;
  if (t.id === "cvpwgo") { var v = ($("#cvpw").value || "").trim(); if (!v) return; ls("tutor.examPw", v); cvSync(); cvPoll().then(function () { if (CV.err) toast("The exam server says: " + CV.err); }); return; }
  var st = cvState();
  if (t.hasAttribute("data-cvgo")) { var n = st.cur + +t.getAttribute("data-cvgo"); if (st.pages[n]) cvSend([{ t: "go", n: n }]); return; }
  if (t.hasAttribute("data-cvnew")) { cvSend([{ t: "new" }]); return; }
  if (t.hasAttribute("data-cvrm")) { var u = t.closest(".cv-item").getAttribute("data-u"); INK.pages[inkKey()] = (INK.pages[inkKey()] || []).filter(function (s) { return s.o !== u; }); CV.sel = null; cvInkSave(); cvSend([{ t: "rm", u: u }]); return; }
  if (CV.ptr === "pen" || Date.now() - (CV.panned || 0) < 400 || t.closest(".cv-setup")) return;   // the S Pen writes, and a scroll is not a tap; picking a piece is for a finger
  var it = t.closest(".cv-item"); CV.sel = it && CV.sel !== it.getAttribute("data-u") ? it.getAttribute("data-u") : null; cvSync(); });
document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "cvpw") { e.preventDefault(); var b = $("#cvpwgo"); if (b) b.click(); } });

/* ----- the laptop: Canvas in Teach. What is on his page, its answers, and every question of the lesson to add ----- */
function cvPanel() { var el = $("#cvp"); if (!CV.open || MODE !== "teach" || !L) { if (el) el.remove(); return; } cvReset(L.id);
  if (!el) { el = document.createElement("aside"); el.id = "cvp"; el.className = "cvp card raised"; el.setAttribute("aria-label", "Canvas"); document.body.appendChild(el); }
  var keep = el.querySelector(".cvp-body"), top = keep ? keep.scrollTop : 0, ty = $("#cvtype"), typed = ty ? ty.value : "", typing = ty && document.activeElement === ty;   // a redraw keeps what he is typing
  var st = cvState(), pg = st.pages[st.cur], qs = cvItems(), n = 0, rows = pg.items.filter(function (x) { return !x.of; }), tk = CV.tk || "heading";
  var h = '<div class="sug-head"><h3 class="t-card">Canvas</h3><button class="btn small" type="button" data-cvpx aria-label="Close">×</button></div>' +
    '<div class="row s2"><button class="btn sm" type="button" data-cvgo="-1" aria-label="Page before"' + (st.cur ? "" : " disabled") + '>‹</button>' + tag("Page " + (st.cur + 1) + " of " + st.pages.length, "num") + '<button class="btn sm" type="button" data-cvgo="1" aria-label="Page after"' + (st.cur < st.pages.length - 1 ? "" : " disabled") + '>›</button><button class="btn sm" type="button" data-cvnew>New page</button>' +
    (!cvReady() ? tag("No exam password", "live") : CV.err ? tag("Offline", "live") : "") + '</div><div class="cvp-body stack s4">';
  /* what is on his page, in order; a question opens to its answer and its solution lines to drop under it */
  h += '<section class="stack s2"><span class="lab">On his canvas</span>' + (rows.length ? rows.map(function (it, i) { var q = cvOf(it, qs), open = CV.ans[it.u], isq = cvIsQ(q);
    var lines = isq ? Object.keys(qs).filter(function (k) { return qs[k].kind === "line" && qs[k].q === q.id; }).map(function (k) { return qs[k]; }) : [];
    var under = pg.items.filter(function (x) { return x.of === it.u; });
    return '<div class="cvrow' + (open ? " open" : "") + '"><span class="n num">' + (i + 1) + '</span>' + (isq ? '<button type="button" class="cvlab" data-cvans="' + esc(it.u) + '" aria-expanded="' + !!open + '">' : '<span class="cvlab">') + (q && q.kind === "piece" ? tag(esc(cap(cvPcKind(q.pc))), "line") + ' ' : "") + esc(cvLabel(q)) + (it.y == null ? ' ' + tag("Placing", "dash") : "") + (isq ? '</button>' : '</span>') +
      '<span class="row s2 push"><button class="btn sm" type="button" data-cvtop="' + esc(it.u) + '"' + (i === 0 ? " disabled" : "") + '>Move to top</button><button class="btn sm quiet" type="button" data-cvrm="' + esc(it.u) + '">Remove</button></span>' +
      under.map(function (x) { var lq = cvOf(x, qs); return '<div class="cvsub"><span class="cvlab">' + esc(cvLabel(lq)) + '</span><button class="btn sm quiet" type="button" data-cvrm="' + esc(x.u) + '">Remove</button></div>'; }).join("") +
      (open ? '<div class="cvans stack s3"><div class="prose">' + cvAnswerHTML(it.ref) + '</div>' + (lines.length ? '<div class="stack s2"><span class="lab">Solution lines to drop under it</span>' + lines.map(function (lq) { var on = under.some(function (x) { return x.ref === lq.id; });
          return '<div class="cvsub"><span class="cvlab">' + esc(cvLabel(lq)) + '</span>' + (on ? tag("On his canvas", "ok") : '<button class="btn sm" type="button" data-cvline="' + esc(lq.id) + '" data-of="' + esc(it.u) + '">Drop</button>') + '</div>'; }).join("") + '</div>' : "") + '</div>' : "") + '</div>'; }).join("")
    : '<p class="hint">Empty. What you add shows here and on his screen.</p>') + '</section>';
  /* a heading, equation or line typed now */
  h += '<section class="stack s2"><span class="lab">Type a piece</span><div class="seg" role="group" aria-label="Kind of piece">' + [["heading", "Heading"], ["equation", "Equation"], ["text", "Text"]].map(function (k) { return '<button type="button" data-cvtk="' + k[0] + '" aria-pressed="' + (tk === k[0]) + '">' + k[1] + '</button>'; }).join("") + '</div>' +
    '<div class="row s2"><input class="input cvtype" id="cvtype" type="text" autocomplete="off" aria-label="Text of the piece" placeholder="' + (tk === "equation" ? "LaTeX, e.g. \\sin 2A = 2\\sin A\\cos A" : tk === "heading" ? "e.g. Double Angle Formulae" : "One line") + '"><button class="btn sm pri" type="button" data-cvtype>Add to canvas</button></div></section>';
  /* the script's pieces and questions, by part */
  var group = function (want) { var parts = {}, order = []; Object.keys(qs).forEach(function (k) { var q = qs[k]; if (!want(q)) return; var pid = q.p.id; if (!parts[pid]) { parts[pid] = []; order.push(q.p); } parts[pid].push(q); }); return { parts: parts, order: order }; };
  var list = function (g, attr) { return g.order.map(function (p) { var items = g.parts[p.id], free = items.filter(function (q) { return !pg.items.some(function (x) { return x.ref === q.id; }); }).length, kd = kindOf(p.name);
    return '<div class="stack s2"><div class="row s2">' + (kd ? tag(esc(kd), kd === "If time" ? "dash" : "line") : "") + '<b>' + esc(partTitle(p.name)) + '</b>' + (free > 1 ? '<button class="btn sm push" type="button" data-' + attr + '="' + esc(p.id) + '">Add all ' + free + '</button>' : "") + '</div>' +
      items.map(function (q) { var on = cvWhere(st, q.id); n++; return '<div class="cvrow"><span class="n num">' + n + '</span><span class="cvlab">' + (q.kind === "piece" ? tag(esc(cap(cvPcKind(q.pc))), "line") + ' ' : "") + esc(cvLabel(q)) + '</span><span class="row s2 push">' + (on >= 0 ? tag("Page " + (on + 1), on === st.cur ? "ok" : "") : "") + (on === st.cur ? "" : '<button class="btn sm" type="button" data-cvadd="' + esc(q.id) + '">Add</button>') + '</span></div>'; }).join("") + '</div>'; }).join(""); };
  var gp = group(function (q) { return q.kind === "piece"; }), gq = group(cvIsQ);
  if (gp.order.length) h += '<section class="stack s3"><span class="lab">Add pieces</span>' + list(gp, "cvaddpc") + '</section>';
  h += '<section class="stack s3"><span class="lab">Add questions</span>' + list(gq, "cvaddp") + '</section><div class="row"><button class="btn sm quiet" type="button" data-cvreset>Clear canvas</button><span class="hint">Every page and his writing go.</span></div></div>';
  el.innerHTML = h; var b = el.querySelector(".cvp-body"); if (b) b.scrollTop = top; loadImages(el); maths(el);
  var ty2 = $("#cvtype"); if (ty2) { ty2.value = typed; if (typing) ty2.focus(); }
  $$("[data-cvp]").forEach(function (cb) { cb.setAttribute("aria-expanded", "true"); }); }
function cvRnd() { return Math.random().toString(36).slice(2, 10); }
/* one "add": a piece comes with its width (and is centred if it is an equation or a structure); a solution line with its question */
function cvAddAct(q, st) { var a = { t: "add", u: cvRnd(), pg: st.cur };
  if (q.kind === "piece") { var k = cvPcKind(q.pc), w = Math.min(CVW - CVX, +q.pc.w || CVPCW[k] || CVWD); a.w = w; a.x = k === "equation" || k === "structure" ? Math.round((CVW - w) / 2) : CVX; }
  if (q.id === "typed") a.pc = q.pc; else a.ref = q.id; return a; }
/* act on the canvas as it is now (this lesson's log, read to the end), not as last seen: Add from a Teach screen can come before Canvas was ever opened */
function cvFresh(fn) { if (!L) return; cvReset(L.id); if (!cvReady()) { toast("Set the exam password on this device first (Exams tab)"); return; }
  cvPoll().then(function () { if (!CV.loaded) { toast(CV.err ? "Couldn\u2019t reach the exam server: " + CV.err : "The canvas is still loading. Try again."); return; } fn(); }); }
function cvAdd(refs) { cvFresh(function () { cvAddNow(refs); }); }
function cvAddNow(refs) { var st = cvState(), qs = cvItems(); refs = refs.filter(function (r) { return qs[r] && !cvPage(st).items.some(function (x) { return x.ref === r; }); });
  if (!refs.length) { toast("Already on his canvas"); return; }
  cvSend(refs.map(function (r) { return cvAddAct(qs[r], st); })).then(function (ok) { if (ok) toast(refs.length > 1 ? "Added " + refs.length + " to his canvas" : "Added to his canvas"); }); }
function cvTyped() { var ty = $("#cvtype"), v = ty && ty.value.trim(), k = CV.tk || "heading"; if (!v) { if (ty) ty.focus(); return; }
  var pc = k === "equation" ? { kind: k, tex: v.replace(/^\\[(\[]|\\[)\]]$/g, "") } : { kind: k, text: v };
  cvFresh(function () { cvSend([cvAddAct({ kind: "piece", id: "typed", pc: pc }, cvState())]).then(function (ok) { if (ok) { var t2 = $("#cvtype"); if (t2) t2.value = ""; toast("Added to his canvas"); } }); }); }
document.addEventListener("click", function (e) { if (MODE !== "teach" || !L) return; var t = e.target.closest && e.target.closest("[data-cvp],[data-cvpx],[data-cvadd],[data-cvaddp],[data-cvaddpc],[data-cvline],[data-cvtk],[data-cvtype],[data-cvtop],[data-cvrm],[data-cvans],[data-cvgo],[data-cvnew],[data-cvreset]"); if (!t) return;
  if (t.hasAttribute("data-cvp") || t.hasAttribute("data-cvpx")) { CV.open = t.hasAttribute("data-cvp") && !CV.open; var mn = $(".tmenu"); if (mn) mn.hidden = true; cvReset(L.id); cvPanel(); if (CV.open) cvPoll();
    else $$("[data-cvp]").forEach(function (cb) { cb.setAttribute("aria-expanded", "false"); }); return; }
  var st = cvState();
  if (t.hasAttribute("data-cvadd")) { cvAdd([t.getAttribute("data-cvadd")]); return; }
  if (t.hasAttribute("data-cvaddp") || t.hasAttribute("data-cvaddpc")) { var pid = t.getAttribute("data-cvaddp") || t.getAttribute("data-cvaddpc"), pcs = t.hasAttribute("data-cvaddpc"), qs = cvItems();
    cvAdd(Object.keys(qs).filter(function (k) { return qs[k].p.id === pid && (pcs ? qs[k].kind === "piece" : cvIsQ(qs[k])); })); return; }
  if (t.hasAttribute("data-cvline")) { var ref = t.getAttribute("data-cvline"), of = t.getAttribute("data-of"); cvFresh(function () { var s2 = cvState(), p2 = cvPage(s2);
      if (!p2.items.some(function (x) { return x.u === of; })) { toast("That question is not on this page"); return; }
      if (p2.items.some(function (x) { return x.of === of && x.ref === ref; })) { toast("Already on his canvas"); return; }
      var o = p2.items.filter(function (x) { return x.u === of; })[0]; cvSend([{ t: "add", u: cvRnd(), ref: ref, of: of, pg: s2.cur, w: Math.max(200, Math.min(760, o.w - 40)) }]); }); return; }
  if (t.hasAttribute("data-cvtk")) { CV.tk = t.getAttribute("data-cvtk"); cvPanel(); var ty = $("#cvtype"); if (ty) ty.focus(); return; }
  if (t.hasAttribute("data-cvtype")) { cvTyped(); return; }
  if (t.hasAttribute("data-cvtop")) { cvSend([{ t: "top", u: t.getAttribute("data-cvtop") }]); return; }
  if (t.hasAttribute("data-cvrm")) { cvSend([{ t: "rm", u: t.getAttribute("data-cvrm") }]); return; }
  if (t.hasAttribute("data-cvans")) { var u = t.getAttribute("data-cvans"); CV.ans[u] = !CV.ans[u]; cvPanel(); return; }
  if (t.hasAttribute("data-cvgo")) { var n = st.cur + +t.getAttribute("data-cvgo"); if (st.pages[n]) cvSend([{ t: "go", n: n }]); return; }
  if (t.hasAttribute("data-cvnew")) { cvSend([{ t: "new" }]); return; }
  if (t.hasAttribute("data-cvreset") && confirm("Clear his canvas? Every page and the writing on it goes. You can’t undo this.")) cvSend([{ t: "reset" }]); });
document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "cvtype") { e.preventDefault(); cvTyped(); } }, true);
addEventListener("hashchange", function () { setTimeout(function () { if (MODE !== "teach" && $("#cvp")) $("#cvp").remove(); }, 0); });

/* ---------------- suggestions: Ali's notes on the app itself, tied to the exact screen ----------------
   Saved to docs/ui-feedback.jsonl in the data repo (never into a lesson). Claude reads that file and answers
   each line with {"id", "status": "done"|"later"|"no", "note"}. Works in try-out mode too. */
var APP_VERSION = "v72", SUG = { open: false, pointing: false, target: "", tags: {} };
var SUGFILE = "docs/ui-feedback.jsonl";
function whereAmI() {
  var r = route(), parts = [];
  parts.push(MODE === "teach" ? "Teach" : MODE === "student" ? "Student view" : r.indexOf("/lesson/") === 0 ? "Plan" : (r.split("/")[1] || "home"));
  if (r.indexOf("/exams/") === 0) parts.push(r.split("/").slice(2).map(decodeURIComponent).join(" · "));
  if (L && r.indexOf("/lesson/") === 0) {
    parts.push(L.id);
    if (MODE === "teach" && TCH.seq[TCH.pos]) { var c = TCH.seq[TCH.pos]; parts.push((c.p ? c.p.name : "") + (c.mod ? " › " + c.mod : "") + " › " + c.t + ": " + shortOf(c, 70)); }
    else if (MODE === "student" && STU && STU.items[STU.i]) parts.push((STU.tab === "exam" ? "exam" : "quick") + " question " + (STU.i + 1));
    else { var p = phases().filter(function (q) { return q.id === L.phase; })[0]; if (p) parts.push(p.name); }
  }
  return parts.join(" · ");
}
function sugPanel() {
  var old = $("#sug"); if (old) old.remove();
  var el = document.createElement("div"); el.id = "sug"; el.className = "sug"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Suggest a change");
  el.innerHTML = '<div class="sug-card stack s5"><div class="row top"><div class="stack s2"><h2 class="t-sec" style="font-size:22px">Suggest a change</h2><div class="tags"><span class="lab">Page</span><span class="tag" id="sug-w">' + esc(cap(whereAmI())) + '</span>' + (SUG.target ? '<span class="tag line sug-t">' + esc(SUG.target) + '</span>' : "") + '</div></div><button class="icon-btn push" type="button" id="sug-x" aria-label="Close" style="border:0;background:var(--sunk)"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>' +
    '<div class="field"><label for="sug-text">What should change, and why?</label><textarea id="sug-text" class="input" style="min-height:140px" placeholder="e.g. The Skip button is too far from my thumb on the tablet"></textarea></div>' +
    '<div class="tags" role="group" aria-label="Kind">' + ["Layout", "Wording", "Hard to find", "Too slow", "Bug", "Missing", "Teaching flow"].map(function (t) { return '<button class="chip" type="button" data-sugtag="' + t + '" aria-pressed="' + !!SUG.tags[t] + '">' + t + '</button>'; }).join("") + '</div>' +
    '<button class="btn dash" type="button" id="sug-point" style="justify-content:flex-start"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"></path><circle cx="12" cy="12" r="3"></circle></svg>' + (SUG.target ? "Point at something else" : "Point at it on the screen") + '</button>' +
    '<button class="btn pri" type="button" id="sug-save">Save suggestion</button><span class="hint" id="sug-st">' + (TRY ? "Try-out: this note is the only thing that gets saved." : "Saved as a note about the app, not into the lesson.") + '</span>' +
    '<div class="stack s2 sug-list" id="sug-list"><span class="lab">Your earlier suggestions</span><div id="sug-items" class="sunk hint" style="padding:var(--s4)">Loading…</div></div></div>';
  document.body.appendChild(el); SUG.open = true; var ta = $("#sug-text"); ta.value = SUG.draft || ""; ta.focus();
  ta.addEventListener("input", function () { SUG.draft = ta.value; });
  loadSugs().then(drawSugs).catch(function () { $("#sug-items").textContent = "Couldn’t load them."; });
}
function loadSugs() { return loadTree(true).then(function () { return fileText(SUGFILE); }).then(function (r) {
  var lines = r ? r.text.split(/\n/).filter(function (l) { return l.trim(); }).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
  var st = {}; lines.forEach(function (x) { if (x.status && x.id && !x.text) st[x.id] = x; });
  return lines.filter(function (x) { return x.text; }).map(function (x) { x.reply = st[x.id] || null; return x; }).reverse(); }); }
function drawSugs(list) { var box = $("#sug-items"); if (!box) return;
  box.innerHTML = list.length ? list.map(function (x) { return '<div class="sug-item"><div><b>' + esc(x.text) + '</b></div><div class="hint">' + esc(fmtDate(x.at.slice(0, 10))) + ' · ' + esc(x.where || "") + '</div>' +
    (x.reply ? '<div class="sug-reply ' + esc(x.reply.status) + '">' + esc({ done: "Done", later: "Later", no: "Not doing" }[x.reply.status] || x.reply.status) + (x.reply.note ? ": " + esc(x.reply.note) : "") + '</div>' : '<div class="sug-reply open">Waiting for a reply</div>') + '</div>'; }).join("") : "None yet."; }
function saveSug() {
  var text = ($("#sug-text").value || "").trim(); if (!text) { $("#sug-text").focus(); return; }
  var item = { id: "s" + Date.now().toString(36), at: now(), device: CFG.device, app: APP_VERSION, tryout: !!TRY, where: whereAmI(), pointed: SUG.target || undefined,
    tags: Object.keys(SUG.tags).filter(function (k) { return SUG.tags[k]; }), screen: window.innerWidth + "×" + window.innerHeight, text: text };
  sugQueue(item); SUG.draft = ""; SUG.target = ""; SUG.tags = {}; closeSug(); toast("Suggestion noted. Sending it\u2026"); sugSend();
}
/* suggestions wait in a small queue on this device until GitHub has them, so the box never makes Ali wait */
var SUGQ_KEY = "tutor.sugq", sugBusy = false;
function sugQueue(item) { var q = []; try { q = JSON.parse(ls(SUGQ_KEY) || "[]"); } catch (e) {} q.push(item); ls(SUGQ_KEY, JSON.stringify(q)); }
function sugSend() { if (sugBusy || !navigator.onLine) return; var q = []; try { q = JSON.parse(ls(SUGQ_KEY) || "[]"); } catch (e) {} if (!q.length) return;
  sugBusy = true;
  function attempt(n) { return gh("/repos/" + CFG.repo + "/contents/" + enc(SUGFILE), { allowTry: true }).then(function (r) {
      var cur = r.status === 404 ? "" : new TextDecoder().decode(b64bytes(r.json.content)), sha = r.status === 404 ? null : r.json.sha;
      return gh("/repos/" + CFG.repo + "/contents/" + enc(SUGFILE), { method: "PUT", allowTry: true, body: { message: "UI suggestion (" + CFG.device + ")", content: b64enc(cur.replace(/\s*$/, cur ? "\n" : "") + q.map(function (i) { return JSON.stringify(i); }).join("\n") + "\n"), sha: sha || undefined } }); })
    .catch(function (e) { if (n < 2 && (e.status === 409 || e.status === 422)) return attempt(n + 1); throw e; }); }
  attempt(0).then(function () { var left = []; try { left = JSON.parse(ls(SUGQ_KEY) || "[]"); } catch (e) {} var ids = q.map(function (i) { return i.id; });
      ls(SUGQ_KEY, JSON.stringify(left.filter(function (i) { return ids.indexOf(i.id) < 0; }))); sugBusy = false; toast(q.length > 1 ? q.length + " suggestions saved. They will be read with the next app changes." : "Suggestion saved. It will be read with the next app changes."); sugSend(); })
    .catch(function (e) { sugBusy = false; toast("Suggestion kept on this device; it sends by itself (" + (e.status === 401 || e.status === 403 ? "GitHub refused the key" : "no connection") + ")."); setTimeout(sugSend, 30000); });
}
window.addEventListener("online", sugSend); setTimeout(sugSend, 3000);
function closeSug() { var el = $("#sug"); if (el) el.remove(); SUG.open = false; }
/* "Point at it": the next tap on the page names that element instead of doing anything */
function describeEl(t) { var b = t.closest("button, a, .chunk, .tile, .lrow, .card, figure, li, h1, h2, h3, nav, aside, header") || t;
  var txt = (b.getAttribute("aria-label") || b.innerText || b.alt || "").replace(/\s+/g, " ").trim().slice(0, 70);
  return (b.tagName.toLowerCase() + (b.className && typeof b.className === "string" ? "." + b.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) + (txt ? " “" + txt + "”" : ""); }
document.addEventListener("click", function (e) {
  if (SUG.pointing) { e.preventDefault(); e.stopPropagation(); SUG.pointing = false; document.body.classList.remove("pointing");
    var t = e.target; t.classList.add("pointed"); setTimeout(function () { t.classList.remove("pointed"); }, 1500); SUG.target = describeEl(t); sugPanel(); return; }
  var b = e.target.closest && e.target.closest("button, a"); if (!b) return;
  if (b.hasAttribute("data-suggest")) { e.preventDefault(); sugPanel(); return; }
  if (b.id === "sug-x") return closeSug();
  if (b.id === "sug-save") return saveSug();
  if (b.id === "sug-point") { closeSug(); SUG.pointing = true; document.body.classList.add("pointing"); toast("Tap the thing you mean"); return; }
  if (b.hasAttribute("data-sugtag")) { var k = b.getAttribute("data-sugtag"); SUG.tags[k] = !SUG.tags[k]; b.setAttribute("aria-pressed", String(SUG.tags[k])); }
}, true);
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && SUG.open) closeSug(); if (e.key === "Escape" && SUG.pointing) { SUG.pointing = false; document.body.classList.remove("pointing"); } });
/* try-out on/off: the button in the sidebar and the Teach top bar (no need to type ?try) */
function tryToggle() { if (TRY) { try { sessionStorage.removeItem("tutor.try"); } catch (e) {} location.href = location.pathname + location.hash; return; }
  var go = function () { location.href = location.pathname + "?try" + location.hash; }; if (L && L.dirty) flush().then(go, go); else go(); }
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-trytoggle]"); if (b) { e.preventDefault(); tryToggle(); } });
$$("[data-trytoggle]").forEach(function (b) { b.textContent = TRY ? "Leave try-out" : "Try-out"; });
/* the try-out marker */
if (TRY) { document.body.classList.add("tryout");
  var tb = document.createElement("div"); tb.className = "trybar";
  tb.innerHTML = '<button class="trydot" type="button" id="trydot" aria-expanded="false" aria-label="Try-out mode: nothing is saved. Open to suggest a change" title="Try-out: nothing is saved"></button><div class="trypanel" hidden><b>Try-out</b><span>Nothing is saved in this tab.</span><button class="btn small" type="button" data-suggest>Suggest a change</button><span class="laysw" role="group" aria-label="Teach flow">' + FLOWS.map(function (f) { return '<button type="button" class="chip" data-flow="' + f[0] + '">' + f[1] + '</button>'; }).join("") + '</span><button class="btn small" type="button" id="tryleave">Leave try-out</button><button class="btn small" type="button" id="tryx" aria-label="Close">\u00d7</button></div>';
  document.body.appendChild(tb);
  var tryOpen = function (on) { tb.querySelector(".trypanel").hidden = !on; tb.classList.toggle("open", on); $("#trydot").setAttribute("aria-expanded", String(on)); };
  $("#trydot").addEventListener("click", function () { tryOpen(tb.querySelector(".trypanel").hidden); });
  $("#tryx").addEventListener("click", function () { tryOpen(false); });
  tb.querySelector("[data-suggest]").addEventListener("click", function () { tryOpen(false); });
  tb.querySelector("#tryleave").addEventListener("click", tryToggle); }
flowPressed();

/* the Exams tab (exams.js) works through these */
window.TD = { cget: cget, cput: cput, tag: tag, subjTag: subjTag, topicStrTag: topicStrTag, refTag: refTag, cap: cap, fmtDate: fmtDate, hmin: hmin, app: app, $: $, $$: $$, esc: esc, clean: clean, ls: ls, toast: toast, maths: maths, CFG: CFG, gh: gh, putB64: putB64, commitFiles: commitFiles, b64enc: b64enc, loadTree: loadTree, shaOf: shaOf, blobBytes: blobBytes, fileJSON: fileJSON, fileURL: fileURL, studentBase: studentBase, isTry: TRY, render: render, openZoom: openZoom };

/* browser tests only (localStorage tutor.test): read the app's state from the test */
if (ls("tutor.test") === "1") window.__t = function (src) { return eval(src); };   // eslint-disable-line no-eval
render();
})();
