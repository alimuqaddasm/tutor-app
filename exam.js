/* Exam page for the student (exam.html#t=<token>), the phone upload page (exam.html#p=<token>) and the teacher's
   Student view (exam.html#v=<exam id>: the same page, read-only, with his answers as they are now; needs the exam
   password this browser keeps for the Exams tab, never counts as him and never records time).
   Every poll tells the server which question is on his screen, so it can add up the time on each question.
   Assignment (kind "assignment", Ali 7 Oct): no clock. A home list of sections (a day's maths, a day's chemistry);
   inside one, the usual question screen plus Done, which opens that section's mark schemes under each question.
   The server owns the clock; this page only shows it. Answers are kept on this device first and sent
   to the server every few seconds and on every change, so a dropped connection loses nothing.
   Nothing here ever shows a score, a mark scheme or a correct answer. */
(function () {
"use strict";

var H = parseHash();
var PREVIEW = H.v || "";
var API = (H.api || (PREVIEW && ls("tutor.examApi")) || window.EXAM_API || "").replace(/\/+$/, "");
var TOKEN = H.t || "", PHONE = H.p || "";
var KEY = "exam." + (TOKEN || PHONE || "preview").slice(0, 12);
var follow = true;         // Student view: keep his current question on screen
var SEC = null;            // assignment: the section on screen (null = the list of sections)
try { SEC = sessionStorage.getItem(KEY + ".sec") || null; } catch (e) {}
var AMODE = "one";         // assignment review: one question at a time, or all together
var APRAC = {};            // assignment review: practice area open, per question
var MAXSIDE = 2000, MAXBYTES = 1800000, MAXTEXT = 50000;

function parseHash() {
  var o = {}; (location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }); return o;
}
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function clockTime(ms) { return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200); }
function clean(html) { return window.DOMPurify ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : esc(html); }

/* ---------- talking to the server ---------- */
function headers(extra) {
  var h = extra || {};
  if (TOKEN) h["X-Exam-Token"] = TOKEN;
  if (PHONE) h["X-Phone-Token"] = PHONE;
  if (PREVIEW) h["X-Exam-Password"] = ls("tutor.examPw") || "";
  return h;
}
/* Student view reads the same things through the teacher's side of the server. */
function previewPath(path) {
  var e = "/api/t/exams/" + encodeURIComponent(PREVIEW), m;
  if (/^\/api\/s\/state/.test(path)) return e + "/student";
  if ((m = path.match(/^\/api\/s\/questions\/(.+)$/))) return e + "/questions/" + m[1];
  if ((m = path.match(/^\/api\/s\/files\/(.+)$/))) return "/api/t/files/" + m[1];
  return null;
}
function api(method, path, body, extra) {
  if (PREVIEW) { path = method === "GET" && previewPath(path); if (!path) return Promise.reject(Object.assign(new Error("Student view is read-only"), { status: 403 })); }
  var opts = { method: method, headers: headers(extra), cache: "no-store" };
  if (body instanceof Blob) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  // A request that never answers (bad mobile signal) is given up after a while, so saving and the clock keep going.
  var ctl = window.AbortController ? new AbortController() : null, timer = ctl && setTimeout(function () { ctl.abort(); }, body instanceof Blob ? 60000 : 15000);
  if (ctl) opts.signal = ctl.signal;
  return fetch(API + path, opts).then(function (r) {
    var ct = r.headers.get("Content-Type") || "";
    var p = ct.indexOf("json") >= 0 ? r.json() : r.blob();
    return p.then(function (d) { if (!r.ok) { var e = new Error((d && d.error) || ("Error " + r.status)); e.status = r.status; throw e; } return d; });
  }).then(function (d) { clearTimeout(timer); return d; }, function (e) {
    clearTimeout(timer);
    if (!e.status) e = Object.assign(new Error("No connection"), { status: 0 });   // never show "Failed to fetch"
    throw e;
  });
}
var blobCache = {};
function imageUrl(path) {
  if (blobCache[path]) return Promise.resolve(blobCache[path]);
  return api("GET", path).then(function (b) { return (blobCache[path] = URL.createObjectURL(b)); });
}
function shown(img, path) {
  imageUrl(path).then(function (u) { img.src = u; }, function () { img.alt = "Picture could not load"; });
}

/* question text set like the real papers (Ali, 5 Oct): parts (a), (b), (i) each on their own line with the label in a
   hanging margin; the marks bold at the right, "(2)" for Edexcel maths and "[2 marks]" for AQA chemistry; for AQA the
   words their papers set in bold (Give two, does not, compound X, Step 4). Same as app.js; fonts and spacing are in app.css (.paper). */
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
/* ---------- maths (KaTeX loads only when a question has \( \) or \[ \]) ---------- */
var KTX = null, KCDN = "vendor/katex/";
function loadKatex() {
  if (KTX) return KTX;
  KTX = new Promise(function (res, rej) {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = KCDN + "katex.min.css"; document.head.appendChild(l);
    var k = document.createElement("script"); k.src = KCDN + "katex.min.js"; k.onerror = rej;
    k.onload = function () { var a = document.createElement("script"); a.src = KCDN + "contrib/auto-render.min.js"; a.onload = res; a.onerror = rej; document.head.appendChild(a); };
    document.head.appendChild(k);
  });
  KTX.catch(function () { KTX = null; });   // a failed download is tried again next time
  return KTX;
}
function maths(el) {
  if (!el || !/\\\(|\\\[/.test(el.textContent)) return;
  loadKatex().then(function () { try { renderMathInElement(el, { delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }], throwOnError: false }); } catch (e) {} }, function () {});
}

/* ---------- pictures: shrink before sending ---------- */
function canvasBlob(c, type, q) { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, type, q); }); }
function shrink(file) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var side = MAXSIDE, quality = 0.86;
      (function attempt() {
        var s = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        canvasBlob(c, "image/jpeg", quality).then(function (b) {
          if (b && b.size <= MAXBYTES) return res(b);
          if (quality > 0.6) quality -= 0.12; else side = Math.round(side * 0.8);
          if (side < 400) return rej(new Error("This picture is too large to send."));
          attempt();
        });
      })();
    };
    im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("This picture can't be read here. Save it as JPG or PNG, or use your phone.")); };
    im.src = url;
  });
}

/* ---------- upload outbox (IndexedDB), so a picture waits safely while offline ---------- */
var idb = null;
function db() {
  if (idb) return idb;
  idb = new Promise(function (res, rej) {
    try { var r = indexedDB.open("tutor-exam", 1); r.onupgradeneeded = function () { r.result.createObjectStore("outbox", { keyPath: "id" }); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; } catch (e) { rej(e); }
  });
  return idb;
}
function store(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction("outbox", mode), r = fn(tx.objectStore("outbox")); tx.oncomplete = function () { res(r && r.result); }; tx.onerror = function () { rej(tx.error); }; }); }); }
function outboxAll() { return store("readonly", function (s) { return s.getAll(); }).then(function (all) { return (all || []).filter(function (x) { return x.key === KEY; }); }).catch(function () { return []; }); }
function outboxPut(item) { return store("readwrite", function (s) { return s.put(item); }).catch(function () {}); }
function outboxDel(id) { return store("readwrite", function (s) { return s.delete(id); }).catch(function () {}); }

/* =====================================================================
   STUDENT
   ===================================================================== */
var S = null;              // last state from the server
var offset = 0;            // server clock minus this device's clock
var cur = 0;               // question index on screen
var drafts = {};           // qid -> {text, seq, dirty, savedAt, late}
var pending = [];          // pictures waiting to be sent: {id, q, blob, source, url}
var net = "ok";            // ok | off
var pollTimer = null, flushTimer = null, tickTimer = null, backoff = 0, lastSaveAt = null;

function loadDrafts() { if (PREVIEW) return; try { drafts = JSON.parse(ls(KEY) || "{}") || {}; } catch (e) { drafts = {}; } }
function keepDrafts() { if (!PREVIEW) ls(KEY, JSON.stringify(drafts)); }

function startStudent() {
  if (!TOKEN || TOKEN.length < 32) return fatal("This exam link is not complete", "Ask your teacher to send the link again.");
  loadDrafts();
  outboxAll().then(function (items) {
    items.forEach(function (it) { it.url = URL.createObjectURL(it.blob); pending.push(it); });
    poll();
  });
  window.addEventListener("online", function () { backoff = 0; poll(); flush(); sendPending(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { poll(); flush(); } });
  window.addEventListener("beforeunload", function (e) { if (anyDirty()) { flush(); e.preventDefault(); e.returnValue = ""; } });
  setInterval(function () { if (anyDirty()) flush(); }, 5000);
}

/* the question on his screen, sent with every poll (not while the page is hidden) */
function onScreen() { return !PREVIEW && S && S.questions && S.questions[cur] && writable() && !document.hidden && (!ASG() || SEC) ? S.questions[cur].id : ""; }

/* ---------- assignment helpers ---------- */
function ASG() { return S && S.kind === "assignment"; }
function setSec(id) { SEC = id || null; try { if (SEC) sessionStorage.setItem(KEY + ".sec", SEC); else sessionStorage.removeItem(KEY + ".sec"); } catch (e) {} }
function secOf(id) { return ((S && S.sections) || []).filter(function (x) { return x.id === id; })[0] || null; }
/* the question indexes on screen: a section's in an assignment, all of them in an exam */
function order() { var o = []; (S.questions || []).forEach(function (q, i) { if (!ASG() || q.section === SEC) o.push(i); }); return o; }
function answered(q) { var d = drafts[q.id]; return (d && d.text && d.text.trim()) || (S.uploads || []).some(function (u) { return u.question === q.id; }) || pending.some(function (p) { return p.q === q.id; }); }
function dayText(iso) { if (!iso) return ""; var d = new Date(iso + "T12:00:00"); return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }); }

function poll() {
  clearTimeout(pollTimer);
  var t0 = Date.now(), q = onScreen();
  api("GET", "/api/s/state" + (q ? "?q=" + encodeURIComponent(q) : "")).then(function (d) {
    var t1 = Date.now();
    offset = d.serverNow - Math.round((t0 + t1) / 2);
    setNet("ok");
    var first = !S, was = S && S.status;
    S = d;
    if (ASG()) {
      if (PREVIEW && follow && d.on) { var aq = d.questions.filter(function (x) { return x.id === d.on; })[0]; if (aq) { setSec(aq.section); cur = d.questions.indexOf(aq); } }
      if (SEC && !(secOf(SEC) || {}).open) setSec(null);
      if (d.answers) mergeAnswers(asgAnswers(d));
      if (first || group(was) !== group(d.status) || $("#ex").getAttribute("data-asig") !== asgSig()) render(); else asgUpdate();
    } else {
    if (PREVIEW && follow && d.on && d.questions) { var at = d.questions.map(function (x) { return x.id; }).indexOf(d.on); if (at >= 0 && at !== cur) { cur = at; if (!first) { question(); dots(); } } }
    if (d.answers) mergeAnswers(d.answers);
    // Running and "time up" share one screen, so the answer box keeps its cursor when the time runs out.
    if (first || group(was) !== group(d.status) || !$(".ex-q")) render(); else refresh();
    }
    if (was === "waiting" && (d.status === "running" || d.status === "timeup")) toast("The exam has started");
    if (anyDirty()) flush();
    sendPending();
    // the first look at the questions went out before they were on screen: report the question straight away
    pollTimer = setTimeout(poll, PREVIEW ? 3000 : first && onScreen() ? 200 : d.status === "waiting" ? 2000 : d.status === "running" || d.status === "timeup" ? 3000 : 10000);
  }, function (e) {
    if (PREVIEW && e.status === 401) return fatal("Student view needs the exam password", "Open it from the Exams tab on a device where the exam password is set in Settings.");
    if (PREVIEW && e.status === 404) return fatal("No such exam", "It may have been deleted. Go back to the Exams tab.");
    if (e.status === 404) return fatal("This exam link is not valid", "Ask your teacher for the link again.");
    setNet("off");
    if (!S) $("#ex").innerHTML = '<div class="ex-center"><div><div class="ex-pulse"></div><h1>Connecting</h1><p>Trying to reach the exam. Check the internet connection; this page keeps trying.</p></div></div>';
    backoff = Math.min(15000, (backoff || 1000) * 2);
    pollTimer = setTimeout(poll, backoff);
  });
}

function mergeAnswers(server) {
  Object.keys(server).forEach(function (q) {
    var s = server[q], d = drafts[q];
    if (!d) d = drafts[q] = { text: s.text, seq: s.seq, dirty: false, savedAt: s.savedAt, late: s.late };
    else if (d.dirty && d.seq > s.seq) { /* unsent work on this device is newer: keep it */ }
    else if (d.rejected) { /* the server refused this text: keep it on screen and on this device */ }
    else if (!d.dirty) { d.text = s.text; d.seq = Math.max(d.seq || 0, s.seq); d.savedAt = s.savedAt; d.late = s.late; }
    // the same link open in another tab saved newer text: show it here too, so this tab can't send its old copy
    var a = $("#ans");
    if (!d.dirty && !d.rejected && a && S && S.questions && S.questions[cur] && S.questions[cur].id === q && a.value !== d.text) { a.value = d.text; count(a); }
    else d.seq = Math.max(d.seq, s.seq + 1);
  });
  keepDrafts();
}

function group(st) { return st === "running" || st === "timeup" ? "open" : st; }
function anyDirty() { return Object.keys(drafts).some(function (q) { return drafts[q].dirty; }); }
function rejected() { return Object.keys(drafts).filter(function (q) { return drafts[q].rejected; }); }
function writable() { return !PREVIEW && S && (S.status === "running" || S.status === "timeup"); }

function fatal(title, msg) {
  clearTimeout(pollTimer);
  $("#ex").innerHTML = '<div class="ex-center"><div><h1>' + esc(title) + '</h1><p>' + esc(msg) + '</p></div></div>';
}

function setNet(n) { net = n; saveState(); }

/* ---------- saving answers ---------- */
function onType(q, text) {
  var d = drafts[q] || (drafts[q] = { text: "", seq: 0, dirty: false });
  if (d.text === text) return;
  d.text = text; d.seq = (d.seq || 0) + 1; d.dirty = true; delete d.rejected;
  keepDrafts(); saveState();
  clearTimeout(flushTimer); flushTimer = setTimeout(flush, 900);
  dots();
}

var flushing = false;
function flush() {
  if (flushing || !writable()) return;
  var qs = Object.keys(drafts).filter(function (q) { return drafts[q].dirty; });
  if (!qs.length) return;
  flushing = true; saveState("saving");
  var chain = Promise.resolve(), failed = false;
  qs.forEach(function (q) {
    chain = chain.then(function () {
      if (failed) return;
      var d = drafts[q], sentSeq = d.seq, sentText = d.text;
      return api("PUT", "/api/s/answers/" + encodeURIComponent(q), { text: sentText, seq: sentSeq, clientAt: Date.now() }).then(function (r) {
        if (r.stale) { d.seq = Math.max(d.seq, r.seq + 1); return; }   // the server has a newer number: send again with a higher one
        if (d.seq === sentSeq) d.dirty = false;
        d.savedAt = r.savedAt; d.late = r.late; lastSaveAt = r.savedAt;
      }, function (e) {
        if (e.status === 409) { failed = true; poll(); return; }        // exam locked or handed in
        // refused (too long, or anything else the server won't take): keep the text here and say clearly it is not saved
        if (e.status && e.status < 500 && e.status !== 429) { if (d.seq === sentSeq) { d.dirty = false; d.rejected = e.message; } toast(e.message); return; }
        failed = true; setNet("off");
      });
    });
  });
  chain.then(function () {
    flushing = false; keepDrafts();
    if (!failed) { setNet("ok"); backoff = 0; if (anyDirty()) setTimeout(flush, 300); }
    else if (net === "off") { backoff = Math.min(15000, (backoff || 1000) * 2); setTimeout(flush, backoff); }
    saveState();
  });
}

function saveState(mode) {
  var el = $(".ex-save"); if (!el) return;
  el.className = "ex-save status";
  var waiting = anyDirty() || pending.length, bad = rejected();
  if (bad.length) { el.classList.add("bad"); el.textContent = "Not saved: question " + bad.map(function (q) { return qNum(q); }).join(", ") + ". " + drafts[bad[0]].rejected; return; }
  if (net === "off" && waiting) { el.classList.add("off"); el.textContent = "Offline: kept on this computer, will send when back"; return; }
  if (net === "off") { el.classList.add("off"); el.textContent = "Offline: trying to reconnect"; return; }
  if (mode === "saving" || waiting) { el.textContent = "Saving"; return; }
  el.classList.add("ok"); el.innerHTML = '<span class="dot ok"></span>' + (lastSaveAt ? "Saved " + clockTime(lastSaveAt) : "All saved");
}

function qNum(id) { var i = S && S.questions ? S.questions.map(function (q) { return q.id; }).indexOf(id) : -1; return i < 0 ? id : i + 1; }

/* characters left, shown only near the limit */
function count(a) {
  var c = $(".ex-count"); if (!c || !a) return;
  var left = MAXTEXT - a.value.length;
  c.hidden = left > 5000; c.textContent = left >= 0 ? left + " characters left" : "Too long by " + (-left) + " characters: this will not save";
  c.classList.toggle("bad", left < 0);
}

/* ---------- pictures ---------- */
function addPictures(q, files, source) {
  Array.prototype.forEach.call(files, function (f) {
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) { toast(f.name + " is not a picture"); return; }
    shrink(f).then(function (blob) { queuePicture(q, blob, source); }, function (e) { toast(e.message); });
  });
}
function queuePicture(q, blob, source) {
  var item = { id: "p" + Date.now() + Math.random().toString(36).slice(2, 7), key: KEY, q: q, blob: blob, source: source, at: Date.now() };
  outboxPut(item);
  item.url = URL.createObjectURL(blob);
  pending.push(item); pics(); saveState(); sendPending();
}
var sending = false;
function sendPending() {
  if (sending || !pending.length || !writable()) return;
  sending = true;
  var item = pending[0];
  api("POST", "/api/s/uploads/" + encodeURIComponent(item.q), item.blob, { "Content-Type": item.blob.type || "image/jpeg", "X-Upload-Source": item.source }).then(function (u) {
    pending.shift(); outboxDel(item.id);
    blobCache["/api/s/files/" + u.id] = item.url;      // already have the picture: no need to download it again
    S.uploads = (S.uploads || []).concat([u]);
    lastSaveAt = u.at; sending = false; setNet("ok"); pics(); sendPending();
  }, function (e) {
    sending = false;
    if (e.status && e.status < 500 && e.status !== 429) { pending.shift(); outboxDel(item.id); toast(e.message); pics(); saveState(); if (e.status === 409) poll(); else sendPending(); return; }
    setNet("off"); setTimeout(sendPending, Math.min(15000, (backoff || 1000) * 2));
  });
}
function removePicture(id) {
  if (!confirm("Remove this picture?")) return;
  api("DELETE", "/api/s/uploads/" + encodeURIComponent(id)).then(function () {
    S.uploads = (S.uploads || []).filter(function (u) { return u.id !== id; }); pics();
  }, function (e) { toast(e.message); });
}

/* ---------- screens ---------- */
function render() {
  var m = $("#ex");
  clearInterval(tickTimer);
  document.title = S.title ? S.title + " · Exam" : "Exam";
  if (S.subject) document.body.setAttribute("data-subject", S.subject === "chem" ? "chem" : S.subject === "maths" ? "maths" : "");
  if (!PREVIEW && (S.status === "waiting" || S.status === "draft")) {
    m.innerHTML = '<div class="ex-center"><div><div class="ex-pulse"></div><h1>' + esc(S.title) + '</h1><p>Your teacher will start the exam. It will open here on its own; no need to refresh.</p>' +
      (S.baseMinutes ? '<p class="hint" style="margin-top:12px">Time: ' + esc(minutesText(S.baseMinutes)) + '</p>' : "") + '</div></div>';
    return;
  }
  if (!PREVIEW && S.status === "locked") {
    var lost = anyDirty() || pending.length || rejected().length;
    m.innerHTML = '<div class="ex-center"><div><h1>' + (ASG() ? "This assignment is closed" : "The exam has ended") + '</h1>' + (lost
      ? '<p><b>Some of your last work did not reach your teacher before the exam ended.</b> Tell your teacher now; it is still kept on this device.</p>'
      : '<p>Your answers are saved. Your teacher will go through them.</p>') + '</div></div>';
    return;
  }
  if (!S.questions || !S.questions.length) { m.innerHTML = '<div class="ex-center"><div><h1>' + esc(S.title) + '</h1><p>No questions yet.</p></div></div>'; return; }
  if (ASG()) return asgRender(m);
  cur = Math.min(cur, S.questions.length - 1);
  if (order().indexOf(cur) < 0) cur = order()[0] || 0;
  var done = S.status === "submitted";
  var sj = S.subject === "chem" ? "chem" : S.subject === "maths" ? "maths" : "", tot = S.questions.reduce(function (t, q) { return t + (Number(q.marks) || 0); }, 0);
  m.innerHTML =
    '<header class="topbar ex-top"><div class="stack ex-tbox"><b class="ex-title">' + esc(S.title) + '</b><div class="tags">' + (sj ? '<span class="tag ' + sj + '"><span class="dot"></span>' + (sj === "chem" ? "Chemistry" : "Maths") + '</span>' : "") +
      '<span class="tag">' + S.questions.length + ' question' + (S.questions.length === 1 ? "" : "s") + '</span><span class="tag">' + tot + ' marks</span>' + (S.practice ? '<span class="tag live">Practice</span>' : "") + '</div></div>' +
      '<div class="ex-save" aria-live="polite"></div><div class="clockpill ex-timer num" role="timer" aria-live="off"></div><div class="ex-bannerslot"></div></header>' +
    (PREVIEW ? '<div class="ex-preview" role="status"><b>Student view</b> <span class="ex-pvwhat"></span><label class="ex-follow"><input type="checkbox" data-follow' + (follow ? " checked" : "") + '> Follow his question</label></div>' : "") +
    '<nav class="ex-dots" aria-label="Questions"></nav>' +
    '<div class="ex-page"><article class="ex-q card"></article></div>' +
    '<footer class="botbar ex-nav"><button class="btn" type="button" data-prev>Previous</button>' +
    (done || PREVIEW ? '<span class="push"></span>' : '<button class="btn dash push" type="button" data-handin>Hand in exam</button>') +
    '<button class="btn accent lg" type="button" data-next>Next question <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button></footer>';
  dots(); question(); banner(); tick(); saveState(); previewLine();
  tickTimer = setInterval(tick, 250);
}

function refresh() { banner(); pics(); dots(); tick(); lockInputs(); previewLine(); }

/* Student view: what he sees right now, and where he is. */
var SEES = { draft: "the waiting screen (no link made yet)", waiting: "the waiting screen", running: "the questions", timeup: "the questions, with Time is up", submitted: "his answers, handed in", locked: "The exam has ended" };
function previewLine() {
  var el = $(".ex-pvwhat"); if (!el || !S) return;
  var ago = S.lastSeenAt ? Math.round((Date.now() + offset - S.lastSeenAt) / 1000) : null, on = S.on ? qNum(S.on) : null;
  el.textContent = "Read-only, nothing here is saved. He sees " + (SEES[S.status] || S.status) + ". " +
    (ago == null ? "He hasn’t opened his link." : ago < 10 ? "He is connected" + (on ? ", on question " + on + "." : ".") : "Last seen " + (ago < 120 ? ago + " s" : Math.round(ago / 60) + " min") + " ago.");
}

function minutesText(min) { var h = Math.floor(min / 60), mm = Math.round(min % 60); return (h ? h + " h " : "") + (mm || !h ? mm + " min" : ""); }

function tick() {
  var el = $(".ex-timer"); if (!el || !S || ASG()) return;
  var now = Date.now() + offset;
  if (S.status === "submitted") { el.className = "clockpill ex-timer num"; el.textContent = "Handed in"; return; }
  if (S.status === "locked") { el.className = "clockpill ex-timer num"; el.textContent = "Locked"; return; }
  if (!S.startedAt) { el.className = "clockpill ex-timer num"; el.textContent = minutesText(S.baseMinutes || 0) + ", not started"; return; }
  var left = S.endAt - now;
  if (left <= 0 || S.status === "timeup") { el.className = "clockpill ex-timer num up"; el.textContent = "Time is up"; if (S.status === "running") { S.status = "timeup"; banner(); } return; }
  var s = Math.ceil(left / 1000), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  el.innerHTML = (h ? h + ":" + String(mi).padStart(2, "0") : mi) + ":" + String(se).padStart(2, "0") + ' <small>left</small>';
  el.className = "clockpill ex-timer num" + (left <= 5 * 60000 ? " soon" : "");
}

var lastExtCount = null;
function banner() {
  var b = $(".ex-bannerslot"); if (!b) return;
  var n = (S.extensions || []).length, html = "";
  if (S.status === "timeup") html = '<div class="ex-banner up" role="status">Time is up. You can keep working until your teacher ends the exam.</div>';
  else if (S.status === "submitted") html = '<div class="ex-banner info" role="status">You have handed in. Your answers are saved; they can no longer be changed.</div>';
  else if (lastExtCount !== null && n > lastExtCount) { var e = S.extensions[n - 1]; html = '<div class="ex-banner info" role="status">Your teacher added ' + esc(e.minutes) + ' min.</div>'; toast("+" + e.minutes + " min added"); }
  else if (n && b.innerHTML.indexOf("added") >= 0) return;
  lastExtCount = n;
  b.innerHTML = html;
}

function dots() {
  if (ASG()) return asgNav();
  var n = $(".ex-dots"); if (!n || !S.questions) return;
  var has = {}; (S.uploads || []).forEach(function (u) { has[u.question] = 1; }); pending.forEach(function (p) { has[p.q] = 1; });
  n.innerHTML = order().map(function (i, k) {
    var q = S.questions[i], d = drafts[q.id], answered = (d && d.text && d.text.trim()) || has[q.id];
    return '<button type="button" class="ex-dot' + (answered ? " done" : "") + '" data-go="' + i + '"' + (i === cur ? ' aria-current="true"' : "") + ' aria-label="Question ' + (k + 1) + (answered ? ", answered" : "") + '">' + (k + 1) + '</button>';
  }).join("");
}

function question() {
  var q = S.questions[cur], box = $(".ex-q"); if (!box) return;
  var ord = order(), k = ord.indexOf(cur);
  var d = drafts[q.id] || { text: "" }, ro = !writable();
  var upload = q.type === "upload_required" || q.type === "upload_optional";
  var input = q.type === "short"
    ? '<input type="text" id="ans" class="input" autocomplete="off" spellcheck="false" value="' + esc(d.text) + '"' + (ro ? " disabled" : "") + '>'
    : '<textarea id="ans" class="input" spellcheck="false" placeholder="Working or notes"' + (ro ? " disabled" : "") + '>' + esc(d.text) + '</textarea>';
  box.innerHTML =
    '<div class="row ex-qhead"><span class="tag line lg">Question ' + (k + 1) + ' of ' + ord.length + '</span><span class="tag lg">' + esc(q.marks) + ' mark' + (q.marks === 1 ? "" : "s") + '</span>' + (q.type === "upload_required" ? '<span class="tag ask lg push">Photo needed</span>' : "") + '</div>' +
    '<div class="ex-qtext">' + paperHTML(q.text_html, S.subject) + '</div>' +
    (q.has_img ? '<figure class="ex-qimg"><button type="button" data-zoom><img alt="Question ' + (cur + 1) + ' picture"></button></figure>' : "") +
    (upload ? '<div class="sunk stack ex-work"><span class="lab">Your working</span>' +
      (PREVIEW ? '<div class="row ex-pvattach"><span class="btn pri">Send from my phone</span><span class="btn">Take a photo here</span><span class="btn">Choose a photo</span><span class="btn">Draw</span></div>' : "") +
      '<div class="row ex-attach"' + (ro ? " hidden" : "") + '>' +
        '<button class="btn pri" type="button" data-phone><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"></rect><path d="M11 18h2"></path></svg>Send from my phone</button>' +
        '<label class="btn"><input type="file" accept="image/*" capture="environment" hidden data-file>Take a photo here</label>' +
        '<label class="btn"><input type="file" accept="image/*" multiple hidden data-file>Choose a photo</label>' +
        '<button class="btn" type="button" data-draw><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path></svg>Draw</button>' +
      '</div><div class="ex-pics"></div></div>' : "") +
    '<div class="field ex-answer"><label for="ans">' + (upload ? 'Your answer <span class="hint">(optional, the photo is enough)</span>' : "Your answer") + '</label>' + input + '<p class="ex-count hint" hidden></p></div>' +
    (upload ? "" : '<div class="row ex-attach ex-more"' + (ro ? " hidden" : "") + '><label class="btn sm"><input type="file" accept="image/*" multiple hidden data-file>Add a photo</label><button class="btn sm" type="button" data-draw>Draw</button><button class="btn sm" type="button" data-phone>Send from my phone</button></div><div class="ex-pics"></div>');
  if (q.has_img) shown($(".ex-qimg img", box), "/api/s/questions/" + encodeURIComponent(q.id) + "/image");
  maths($(".ex-qtext", box));
  var a = $("#ans");
  a.addEventListener("input", function () { onType(q.id, a.value); count(a); });
  count(a);
  a.addEventListener("blur", function () { flush(); });
  pics();
  var prev = $("[data-prev]"), next = $("[data-next]");
  if (prev) prev.disabled = k <= 0;
  if (next) next.disabled = k >= ord.length - 1;
}

function lockInputs() {
  var ro = !writable(), a = $("#ans"), at = $(".ex-attach"), hi = $("[data-handin]");
  if (a) a.disabled = ro; if (at) at.hidden = ro; if (hi) hi.hidden = ro;
}

function pics() {
  if (ASG()) return asgPics();
  var box = $(".ex-pics"); if (!box || !S.questions) return;
  var q = S.questions[cur].id, ro = !writable();
  var saved = (S.uploads || []).filter(function (u) { return u.question === q; });
  var wait = pending.filter(function (p) { return p.q === q; });
  var have = $$(".ex-pic", box).map(function (e) { return e.getAttribute("data-id"); }).join(",");
  var want = saved.map(function (u) { return u.id; }).concat(wait.map(function (p) { return p.id; })).join(",") + "|" + ro;
  if (box.getAttribute("data-key") === want && have) return;   // nothing new: don't redraw (avoids flicker every poll)
  box.setAttribute("data-key", want);
  box.innerHTML = saved.map(function (u) {
    return '<div class="ex-pic" data-id="' + esc(u.id) + '"><img alt="Your picture" data-src="/api/s/files/' + esc(u.id) + '"><div class="meta"><span>' + esc(u.source === "phone" ? "Phone" : u.source === "drawing" ? "Drawing" : "Picture") + " · " + esc(clockTime(u.at)) + '</span>' + (ro ? "" : '<button type="button" data-rm="' + esc(u.id) + '" aria-label="Remove picture">Remove</button>') + '</div></div>';
  }).join("") + wait.map(function (p) {
    return '<div class="ex-pic pending" data-id="' + esc(p.id) + '"><img alt="Picture waiting to send" src="' + p.url + '"><div class="meta"><span>Waiting to send</span></div></div>';
  }).join("");
  $$("img[data-src]", box).forEach(function (im) { shown(im, im.getAttribute("data-src")); });
}

/* =====================================================================
   ASSIGNMENT (Ali, 8 Oct; design canvas "Holiday Assignment Design")
   Days open one after another (the server decides). Inside a day: his notebook pages by phone, a stopwatch he
   runs himself, "I'm done". Finishing fixes his answers and opens the mark schemes; after that he can solve a
   question again as practice, and sees Ali's notes (plus what to study where he lost marks).
   ===================================================================== */
function secDone(id) { var x = secOf(id); return !!(x && x.doneAt != null); }
function secQs(id) { return (S.questions || []).filter(function (q) { return q.section === id; }); }
function dayKey(x) { return x.day != null ? x.day : 100000 + x.pos; }
function subjOf(x) { return /^math/i.test(x.subject || x.title) ? "maths" : "chem"; }
function shortTitle(x) { return subjOf(x) === "maths" ? "Maths" : "Chemistry"; }
function whenText(ms) { var d = new Date(ms); return d.toLocaleDateString([], { weekday: "short" }) + " " + clockTime(ms); }
function mainUps(qid) { return (S.uploads || []).filter(function (u) { return u.question === qid && !u.practice; }); }
function pracUps(qid) { return (S.uploads || []).filter(function (u) { return u.question === qid && u.practice; }); }
function hasWork(q) { var a = (S.answers || {})[q.id], d = drafts[q.id]; return (secDone(q.section) ? a && a.text && a.text.trim() : d && d.text && d.text.trim()) || mainUps(q.id).length || (!secDone(q.section) && pending.some(function (p) { return p.q === q.id; })); }

/* what the editable box holds: before finishing, his answer; after, his practice */
function asgAnswers(d) {
  var out = {};
  (d.questions || []).forEach(function (q) {
    var done = (d.sections || []).some(function (x) { return x.id === q.section && x.doneAt != null; });
    var src = done ? (d.practiceAnswers || {})[q.id] : (d.answers || {})[q.id];
    if (src) out[q.id] = src; else if (done) out[q.id] = { text: "", seq: 0, savedAt: null, late: false };
  });
  return out;
}
/* what changes the layout (anything else is updated in place, so typing is never interrupted) */
function asgSig() {
  return JSON.stringify([SEC, AMODE, S.status, (S.sections || []).map(function (x) { return [x.id, x.open, x.doneAt, x.opensAt]; }),
    Object.keys(S.notes || {}).map(function (k) { return [k, S.notes[k].note, !!S.notes[k].study]; }), (S.questions || []).length, SEC ? cur : 0]);
}

/* ---------- stopwatch (his own; no countdown) ---------- */
function swKey() { return KEY + ".sw." + SEC; }
function swGet() { try { return JSON.parse(ls(swKey()) || "null") || { acc: 0, since: null }; } catch (e) { return { acc: 0, since: null }; } }
function swMs() { var w = swGet(); return w.acc + (w.since ? Date.now() - w.since : 0); }
function swSet(run) { var w = swGet(); if (run && !w.since) w.since = Date.now(); if (!run && w.since) { w.acc += Date.now() - w.since; w.since = null; } ls(swKey(), JSON.stringify(w)); swDraw(); }
function swText(ms) { var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(x).padStart(2, "0"); }
function swDraw() { var t = $(".a-swt"), b = $("[data-a-sw]"); if (!t) return; var w = swGet(); t.textContent = swText(swMs()); if (b) b.textContent = w.since ? "Pause" : swMs() ? "Carry on" : "Start"; }
setInterval(function () { if (ASG() && SEC) swDraw(); }, 1000);

/* ---------- one phone link for the whole holiday ---------- */
var phoneTok = ls(KEY + ".phone") || "";
function phoneURL() { return phoneTok ? location.origin + location.pathname + "#p=" + encodeURIComponent(phoneTok) + (H.api ? "&api=" + encodeURIComponent(H.api) : "") : ""; }
function qrInto(box) {
  if (!box) return;
  if (PREVIEW) { box.innerHTML = '<span>His QR code shows here</span>'; return; }
  var draw = function () { try { var qr = qrcode(0, "M"); qr.addData(phoneURL()); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) { box.innerHTML = '<span>' + esc(phoneURL()) + '</span>'; } };
  if (phoneTok) return draw();
  if (!writable()) { box.innerHTML = "<span>Closed</span>"; return; }
  api("POST", "/api/s/phone-token").then(function (r) { phoneTok = r.token; ls(KEY + ".phone", phoneTok); $$(".a-qr").forEach(qrInto); }, function () { box.innerHTML = "<span>No connection: the code shows when you are back online</span>"; });
}
function qrAside(compact) {
  return '<aside class="a-scan' + (compact ? " compact" : "") + '"><h2>' + (compact ? "Snap with your phone" : "Your phone is your scanner") + '</h2>' +
    (compact ? "" : '<p>Scan once. Your phone then shows the open days: pick the question, take the photo, done.</p>') +
    '<div class="a-qr" role="img" aria-label="QR code for your phone"></div>' +
    '<p class="a-follow">' + (compact ? "Already scanned? Your phone follows this screen." : "Works for every day of the holiday") + '</p></aside>';
}

/* ---------- screens ---------- */
function asgRender(m) {
  document.body.classList.add("a-body");
  m.setAttribute("data-asig", asgSig());
  if (!SEC) asgHome(m);
  else if (secDone(SEC)) asgReview(m);
  else asgWork(m);
  $$(".a-qr").forEach(qrInto);
  $$(".a-qimg img[data-src], .a-ms img[data-src]").forEach(function (im) { shown(im, im.getAttribute("data-src")); });
  $$(".a-qtext").forEach(maths);
  asgPics(); asgNav(); saveState(); swDraw(); previewLine();
}
function asgUpdate() { asgPics(); asgNav(); saveState(); previewLine(); }

function pvBar() { return PREVIEW ? '<div class="ex-preview" role="status"><b>Student view</b> <span class="ex-pvwhat"></span><label class="ex-follow"><input type="checkbox" data-follow' + (follow ? " checked" : "") + '> Follow his question</label></div>' : ""; }

var ADAY = null;   // the day picked in the list on his assignment home
function asgHome(m) {
  var secs = S.sections || [], days = [], by = {};
  secs.forEach(function (x) { var k = dayKey(x); if (!by[k]) { by[k] = []; days.push(k); } by[k].push(x); });
  days.sort(function (a, b) { return a - b; });
  var open = days.filter(function (k) { return by[k][0].open; });
  if (ADAY == null || !by[ADAY] || !by[ADAY][0].open) ADAY = open.length ? open[open.length - 1] : days[0];
  var dname = function (k) { var x = by[k][0]; return x.day != null ? "Day " + x.day : x.title; };
  var subjTag = function (x, lg) { var sj = subjOf(x); return '<span class="tag ' + sj + (lg ? " lg" : "") + '"><span class="dot"></span>' + (sj === "chem" ? "Chemistry" : "Maths") + '</span>'; };
  var dayBtn = function (k) {
    var x0 = by[k][0], isOpen = x0.open, done = by[k].filter(function (x) { return x.doneAt != null; }).length;
    var sub = isOpen ? '<span class="row s2">' + by[k].map(function (x) { return '<span class="dot ' + subjOf(x) + (x.doneAt != null ? " faded" : "") + '"></span>'; }).join("") + '<span class="hint">' + (done === by[k].length ? "All done" : done + " of " + by[k].length + " done") + '</span></span>'
      : '<span class="hint">' + (x0.opensAt ? "Opens " + esc(whenText(x0.opensAt)) : "Opens later") + '</span>';
    return '<button type="button" class="a-dayb" data-a-day="' + k + '"' + (k === ADAY ? ' aria-current="true"' : "") + (isOpen ? "" : " disabled") + '><span class="tag' + (k === ADAY ? " day" : "") + '">' + esc(dname(k)) + '</span><span class="stack" style="gap:0">' + sub + '</span></button>';
  };
  var qRow = function (x, q, i) {
    var ups = mainUps(q.id).length, d = drafts[q.id], typed = d && d.text && d.text.trim(), a = (S.answers || {})[q.id];
    var st = ups ? '<span class="status ok"><span class="dot ok"></span>Photo added</span>' : typed || (a && a.text && a.text.trim()) ? '<span class="status ok"><span class="dot ok"></span>Answer typed</span>' : '<span class="status off"><span class="dot off"></span>Not started</span>';
    return '<button type="button" class="li a-qrow" data-a-sec="' + esc(x.id) + '" data-a-qi="' + S.questions.indexOf(q) + '"><span class="tag line lg">Q' + (i + 1) + '</span><span class="a-qlab">' + esc(q.label && q.label !== "Q" + (i + 1) ? q.label : "Question " + (i + 1)) + '</span><span class="tag">' + esc(q.marks) + ' mark' + (q.marks === 1 ? "" : "s") + '</span>' + st + '</button>';
  };
  var secCard = function (x) {
    var qs = secQs(x.id), marks = qs.reduce(function (t, q) { return t + (Number(q.marks) || 0); }, 0), notes = qs.filter(function (q) { return S.notes && S.notes[q.id]; }).length;
    var tags = '<span class="tag day lg">' + esc(dname(dayKey(x))) + '</span>' + subjTag(x, true) + '<span class="tag lg">' + qs.length + ' question' + (qs.length === 1 ? "" : "s") + '</span><span class="tag lg">' + marks + ' marks</span>' + (x.suggestMin ? '<span class="tag lg">About ' + Math.round(x.suggestMin) + ' min</span>' : "");
    if (x.doneAt != null) return '<section class="card pad head a-done"><div class="tags">' + tags + '<span class="tag ok lg">✓ Done</span>' + (notes ? '<span class="tag ask lg">' + notes + ' note' + (notes === 1 ? "" : "s") + ' from Ali</span>' : "") + '</div><button class="btn ' + subjOf(x) + '-soft" type="button" data-a-sec="' + esc(x.id) + '">See mark scheme</button></section>';
    return '<section class="card a-sec" data-subject="' + subjOf(x) + '"><div class="head a-sechead"><div class="stack s2"><div class="tags">' + tags + '</div><span class="hint">Answer on paper. Write every line, then add a photo.</span></div><button class="btn ' + subjOf(x) + '" type="button" data-a-sec="' + esc(x.id) + '">' + (qs.some(hasWork) ? "Carry on" : "Start") + '</button></div>' +
      '<div class="list a-qlist0">' + qs.map(function (q, i) { return qRow(x, q, i); }).join("") + '</div>' +
      '<div class="row a-warn"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z"></path><path d="M12 10v4M12 17h.01"></path></svg>After Done you can’t change your answers. The mark scheme opens.</div></section>';
  };
  m.innerHTML = '<div class="a-root">' +
    '<header class="topbar a-hometop"><div class="stack" style="gap:2px;flex:1;min-width:0"><b class="a-htitle">' + esc(S.title) + '</b><div class="tags"><span class="tag">' + days.length + ' days</span><span class="tag">No clock</span><span class="tag">Saves as you go</span></div></div><div class="ex-save" aria-live="polite"></div></header>' + pvBar() +
    '<div class="a-home2"><nav class="a-days" aria-label="Days">' + days.map(dayBtn).join("") + '</nav>' +
      '<main class="a-main2">' + (ADAY != null && by[ADAY] && by[ADAY][0].open ? by[ADAY].map(secCard).join("") : '<div class="empty"><b class="t-card">Your first day opens soon.</b></div>') + qrAside(false) + '</main></div></div>';
}

function header(x, extra) {
  return '<header class="a-top"><button type="button" class="a-btn" data-a-home>All days</button><span class="a-dot ' + subjOf(x) + '"></span><b class="a-title">' + esc(x.title) + '</b>' + (extra || "") + '<span class="grow"></span><div class="ex-save" aria-live="polite"></div></header>';
}

function asgWork(m) {
  var x = secOf(SEC), qs = secQs(SEC);
  if (!qs.some(function (q) { return S.questions.indexOf(q) === cur; })) cur = S.questions.indexOf(qs[0]);
  var q = S.questions[cur], k = qs.indexOf(q), d = drafts[q.id] || { text: "" }, ro = !writable();
  var input = q.type === "short"
    ? '<input type="text" id="ans" class="input" autocomplete="off" spellcheck="false" value="' + esc(d.text) + '"' + (ro ? " disabled" : "") + '>'
    : '<textarea id="ans" rows="3" spellcheck="false"' + (ro ? " disabled" : "") + '>' + esc(d.text) + '</textarea>';
  m.innerHTML = '<div class="a-root">' + header(x,
      '<div class="a-sw"><span class="a-eyebrow">Stopwatch</span><span class="a-swt">00:00</span>' + (ro ? "" : '<button type="button" class="a-btn dark" data-a-sw>Start</button>') + '</div>') + pvBar() +
    '<div class="a-work">' +
      '<nav class="a-qnav" aria-label="Questions"><div class="a-eyebrow">Questions</div><div class="a-qlist"></div><span class="grow"></span>' +
        (ro ? "" : '<button type="button" class="a-finish" data-a-finish>I\'m done with ' + esc(x.title) + '</button>') + '</nav>' +
      '<main class="a-qcard"><div class="a-qhead"><h2>Question ' + (k + 1) + '</h2>' + (q.label && q.label !== "Q" + (k + 1) ? '<span class="a-meta">' + esc(q.label) + '</span>' : "") + '<span class="grow"></span><b>' + esc(q.marks) + ' mark' + (q.marks === 1 ? "" : "s") + '</b></div>' +
        '<div class="a-qtext">' + paperHTML(q.text_html, subjOf(x) === "chem" ? "chem" : "maths") + '</div>' +
        (q.has_img ? '<figure class="a-qimg"><button type="button" data-zoom><img alt="Question ' + (k + 1) + '" data-src="/api/s/questions/' + esc(q.id) + '/image"></button></figure>' : "") +
        '<div class="a-lab">Your pages for this question</div><div class="a-pages" data-q="' + esc(q.id) + '" data-kind="main"></div>' +
        (ro ? "" : '<div class="a-attach"><label class="a-btn"><input type="file" accept="image/*" multiple hidden data-file>Choose picture</label><button type="button" class="a-btn" data-draw>Draw</button></div>') +
        '<label class="a-lab" for="ans">' + (q.type === "short" ? "Your answer" : "Typed answer or note (optional)") + '</label>' + input + '<p class="ex-count hint" hidden></p>' +
        '<div class="a-qfoot"><button type="button" class="a-btn" data-a-prev' + (k ? "" : " disabled") + '>Previous</button><span class="grow"></span><button type="button" class="a-btn dark" data-a-next' + (k < qs.length - 1 ? "" : " disabled") + '>Next question</button></div>' +
      '</main>' + qrAside(true) +
    '</div></div>';
  var a = $("#ans");
  if (a) { a.addEventListener("input", function () { onType(q.id, a.value); count(a); asgNav(); }); a.addEventListener("blur", function () { flush(); }); count(a); }
}

function studyHTML(st) {
  if (!st) return "";
  if (st.videos && st.videos.length) return '<div class="a-study"><b>Watch on Maths Genie</b><ul>' + st.videos.map(function (v) { return '<li><a href="https://www.youtube.com/watch?v=' + encodeURIComponent(v.id) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a></li>'; }).join("") + '</ul></div>';
  if (st.pages && st.pages.length) return '<div class="a-study"><b>Read in ' + esc(st.book || "the book") + '</b><ul>' + st.pages.map(function (p) { return '<li>' + esc((p.topic ? p.topic + ": " : "") + p.pages) + '</li>'; }).join("") + '</ul></div>';
  return "";
}
function noteHTML(q) {
  var n = S.notes && S.notes[q.id]; if (!n || (!n.note && !n.study)) return "";
  return '<section class="a-note"><span class="a-avatar" aria-hidden="true">A</span><div>' + (n.note ? '<b>Ali\'s note</b><p>' + esc(n.note) + '</p>' : '<b>To go over</b>') + studyHTML(n.study) + '</div></section>';
}
function workCol(q) {
  var a = (S.answers || {})[q.id];
  return '<div class="a-col"><div class="a-eyebrow">Your work</div>' + (a && a.text && a.text.trim() ? '<div class="a-typed">' + esc(a.text) + '</div>' : "") +
    '<div class="a-mywork" data-q="' + esc(q.id) + '"></div></div>';
}
function msCol(q) { return '<div class="a-col"><div class="a-eyebrow">Mark scheme</div>' + (q.has_ms ? '<div class="a-ms"><button type="button" data-zoom><img alt="Mark scheme" data-src="/api/s/questions/' + esc(q.id) + '/ms"></button></div>' : '<p class="hint">No mark scheme picture.</p>') + '</div>'; }

function asgReview(m) {
  var x = secOf(SEC), qs = secQs(SEC), ro = !writable();
  if (!qs.some(function (q) { return S.questions.indexOf(q) === cur; })) cur = S.questions.indexOf(qs[0]);
  var q = S.questions[cur], k = qs.indexOf(q), pr = APRAC[q.id];
  var head = header(x, '<span class="a-pill done">Finished ' + esc(whenText(x.doneAt)) + (x.tookMin != null ? ' · ' + esc(x.tookMin) + ' min' : "") + '</span>' +
    '<span class="a-seg" role="group" aria-label="View"><button type="button" data-a-mode="one" aria-pressed="' + (AMODE === "one") + '">One at a time</button><button type="button" data-a-mode="all" aria-pressed="' + (AMODE === "all") + '">All together</button></span>');
  var body;
  if (AMODE === "all") {
    body = '<div class="a-review">' + qs.map(function (qq, i) {
      return '<section class="a-rq"><div class="a-qhead"><h2>Question ' + (i + 1) + '</h2><span class="a-meta">' + esc(qq.marks) + ' marks</span><span class="grow"></span>' + (ro ? "" : '<button type="button" class="a-btn" data-a-again="' + esc(qq.id) + '">Solve it again</button>') + '</div>' +
        '<div class="a-two">' + workCol(qq) + msCol(qq) + '</div>' + noteHTML(qq) + '</section>';
    }).join("") + '</div>';
  } else {
    body = '<div class="a-review"><div class="a-qhead"><h2>Question ' + (k + 1) + '</h2><span class="a-meta">' + esc(q.marks) + ' marks</span><span class="grow"></span>' +
        '<button type="button" class="a-btn" data-a-prev' + (k ? "" : " disabled") + '>Previous</button><button type="button" class="a-btn dark" data-a-next' + (k < qs.length - 1 ? "" : " disabled") + '>Next</button></div>' +
      '<div class="a-two">' + workCol(q) + msCol(q) + '</div>' + noteHTML(q) +
      (ro ? "" : pr
        ? '<section class="a-practice"><div class="a-qhead"><h3>Solving it again</h3><span class="a-meta">Practice: kept for Ali, not marked</span><span class="grow"></span><button type="button" class="a-btn" data-a-again="' + esc(q.id) + '">Close</button></div>' +
          '<div class="a-pages" data-q="' + esc(q.id) + '" data-kind="practice"></div>' +
          '<div class="a-attach"><label class="a-btn"><input type="file" accept="image/*" multiple hidden data-file>Choose picture</label><button type="button" class="a-btn" data-draw>Draw</button></div>' +
          '<label class="a-lab" for="ans">Practice working (optional)</label><textarea id="ans" rows="3" spellcheck="false">' + esc((drafts[q.id] || {}).text || "") + '</textarea></section>'
        : '<div class="a-again"><button type="button" class="a-btn" data-a-again="' + esc(q.id) + '">Solve it again for practice</button><span class="hint">Your marked answer stays as it is.</span></div>') +
      '</div>';
  }
  m.innerHTML = '<div class="a-root">' + head + pvBar() + '<div class="a-revwrap">' + body + (pr && AMODE === "one" ? qrAside(true) : "") + '</div></div>';
  var a = $("#ans");
  if (a) { a.addEventListener("input", function () { onType(q.id, a.value); }); a.addEventListener("blur", function () { flush(); }); }
}

/* the question list down the side of a day */
function asgNav() {
  var box = $(".a-qlist"); if (!box || !SEC) return;
  box.innerHTML = secQs(SEC).map(function (q, i) {
    var n = mainUps(q.id).length + pending.filter(function (p) { return p.q === q.id; }).length, d = drafts[q.id], typed = d && d.text && d.text.trim();
    var st = n ? n + " photo" + (n === 1 ? "" : "s") : typed ? "typed" : "empty";
    return '<button type="button" class="a-qbtn' + (S.questions.indexOf(q) === cur ? " on" : "") + (n || typed ? " has" : "") + '" data-a-q="' + S.questions.indexOf(q) + '"' + (S.questions.indexOf(q) === cur ? ' aria-current="true"' : "") + '><b>Q' + (i + 1) + '</b><span>' + st + '</span></button>';
  }).join("");
  var f = $(".a-follow"); if (f && SEC) { var qq = S.questions[cur]; if (qq && qq.section === SEC) f.textContent = "Already scanned? Your phone follows this screen: it is on Q" + (secQs(SEC).indexOf(qq) + 1) + " now."; }
}

/* photos: his pages before finishing, practice pages after */
function asgPics() {
  $$(".a-pages").forEach(function (box) {
    var qid = box.getAttribute("data-q"), prac = box.getAttribute("data-kind") === "practice", ro = !writable();
    var saved = (prac ? pracUps : mainUps)(qid), wait = pending.filter(function (p) { return p.q === qid; });
    var want = saved.map(function (u) { return u.id; }).concat(wait.map(function (p) { return p.id; })).join(",") + "|" + ro;
    if (box.getAttribute("data-key") === want) return;
    box.setAttribute("data-key", want);
    box.innerHTML = saved.map(function (u) {
      return '<div class="ex-pic" data-id="' + esc(u.id) + '"><img alt="Your page" data-src="/api/s/files/' + esc(u.id) + '"><div class="meta"><span>' + esc(u.source === "phone" ? "Phone" : u.source === "drawing" ? "Drawing" : "Picture") + " · " + esc(clockTime(u.at)) + '</span>' + (ro ? "" : '<button type="button" data-rm="' + esc(u.id) + '" aria-label="Remove picture">Remove</button>') + '</div></div>';
    }).join("") + wait.map(function (p) { return '<div class="ex-pic pending"><img alt="Sending" src="' + p.url + '"><div class="meta"><span>Sending</span></div></div>'; }).join("") +
      (ro ? "" : '<div class="a-snap"><b>' + (saved.length + wait.length ? "Next page?" : "Your first page") + '</b><span>Snap it on your phone</span></div>');
    $$("img[data-src]", box).forEach(function (im) { shown(im, im.getAttribute("data-src")); });
  });
  $$(".a-mywork").forEach(function (box) {
    var qid = box.getAttribute("data-q"), saved = mainUps(qid), want = saved.map(function (u) { return u.id; }).join(",");
    if (box.getAttribute("data-key") === want && box.innerHTML) return;
    box.setAttribute("data-key", want);
    box.innerHTML = saved.length ? saved.map(function (u) { return '<button type="button" class="a-shot" data-zoom><img alt="Your page" data-src="/api/s/files/' + esc(u.id) + '"></button>'; }).join("") : '<p class="hint">No photos for this question.</p>';
    $$("img[data-src]", box).forEach(function (im) { shown(im, im.getAttribute("data-src")); });
  });
}

function openSec(id) {
  flush(); setSec(id); follow = false; AMODE = "one"; APRAC = {};
  cur = S.questions.indexOf(secQs(id)[0]);
  if (writable() && !secDone(id)) api("POST", "/api/s/sections/" + encodeURIComponent(id) + "/open").catch(function () {});
  render(); window.scrollTo(0, 0); if (writable()) poll();
}
function goQ(i) { flush(); cur = i; render(); window.scrollTo(0, 0); if (writable()) poll(); }

/* "I'm done": not yet, or finished (answers fixed, mark schemes open) */
function asgFinish() {
  var x = secOf(SEC), qs = secQs(SEC), work = qs.filter(hasWork), empty = qs.filter(function (q) { return !hasWork(q); }), ms = swMs();
  var d = modal('<div class="ex-box a-finbox" role="dialog" aria-modal="true" aria-labelledby="fin-h"><h2 id="fin-h">Are you finished with ' + esc(x.title) + '?</h2>' +
    '<div class="a-chips"><span class="a-pill done">' + work.length + ' of ' + qs.length + ' questions have work</span>' +
      empty.map(function (q) { return '<span class="a-pill going">Q' + (qs.indexOf(q) + 1) + ' is empty</span>'; }).join("") +
      (ms ? '<span class="a-pill">Stopwatch ' + swText(ms) + '</span>' : "") + '</div>' +
    '<p>If you finish now, the mark schemes open and Ali marks what you have done. You won\'t be able to change these answers after that, but you can solve any question again for practice.</p>' +
    (pending.length ? '<p><b>Some pictures are still sending. Wait a moment first.</b></p>' : "") +
    '<div class="a-choices"><button type="button" class="a-choice" data-x><b>Not yet</b><span>I\'ll come back to it. Nothing opens.</span></button>' +
    '<button type="button" class="a-choice yes" data-ok' + (pending.length ? " disabled" : "") + '><b>Yes, I\'m finished</b><span>Show me the mark schemes. Ali can mark it and leave notes.</span></button></div></div>');
  $("[data-x]", d.el).onclick = function () { swSet(false); d.close(); };
  $("[data-ok]", d.el).onclick = function () {
    this.disabled = true; flush();
    var took = ms ? Math.max(1, Math.round(ms / 60000)) : null;
    var wait = setInterval(function () {
      if (anyDirty() && net === "ok") return;
      clearInterval(wait);
      if (anyDirty()) { d.close(); toast("Can't finish while offline. Your work is kept; try again when connected."); return; }
      api("POST", "/api/s/sections/" + encodeURIComponent(SEC) + "/done", { tookMin: took }).then(function (r) {
        d.close(); swSet(false); x.doneAt = r.doneAt; x.tookMin = r.tookMin; toast("Mark schemes open"); poll();
      }, function (e) { d.close(); toast(e.message); poll(); });
    }, 300);
  };
}

document.addEventListener("click", function (e) {
  if (!ASG()) return;
  var t = e.target.closest && e.target.closest("[data-a-day],[data-a-sec],[data-a-home],[data-a-q],[data-a-prev],[data-a-next],[data-a-sw],[data-a-finish],[data-a-mode],[data-a-again]"); if (!t) return;
  var ord = secQs(SEC || "").map(function (q) { return S.questions.indexOf(q); }), k = ord.indexOf(cur);
  if (t.hasAttribute("data-a-day")) { ADAY = Number(t.getAttribute("data-a-day")); render(); }
  else if (t.hasAttribute("data-a-sec")) { openSec(t.getAttribute("data-a-sec")); if (t.hasAttribute("data-a-qi")) goQ(Number(t.getAttribute("data-a-qi"))); }
  else if (t.hasAttribute("data-a-home")) { flush(); swSet(false); setSec(null); follow = false; render(); window.scrollTo(0, 0); }
  else if (t.hasAttribute("data-a-q")) goQ(Number(t.getAttribute("data-a-q")));
  else if (t.hasAttribute("data-a-prev") && k > 0) goQ(ord[k - 1]);
  else if (t.hasAttribute("data-a-next") && k < ord.length - 1) goQ(ord[k + 1]);
  else if (t.hasAttribute("data-a-sw")) swSet(!swGet().since);
  else if (t.hasAttribute("data-a-finish")) asgFinish();
  else if (t.hasAttribute("data-a-mode")) { AMODE = t.getAttribute("data-a-mode"); render(); }
  else if (t.hasAttribute("data-a-again")) { var qid = t.getAttribute("data-a-again"); APRAC[qid] = !APRAC[qid]; AMODE = "one"; cur = S.questions.map(function (q) { return q.id; }).indexOf(qid); render(); }
});

/* ---------- dialogs ---------- */
function modal(html, cls) {
  var m = document.createElement("div"); m.className = cls || "ex-modal"; m.innerHTML = html; document.body.appendChild(m);
  m.addEventListener("click", function (e) { if (e.target === m && !cls) close(); });
  function close() { m.remove(); document.removeEventListener("keydown", key); }
  function key(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", key);
  return { el: m, close: close };
}

function handIn() {
  var empty = S.questions.filter(function (q) { var d = drafts[q.id]; var pic = (S.uploads || []).some(function (u) { return u.question === q.id; }); return !(d && d.text && d.text.trim()) && !pic; }).length;
  var d = modal('<div class="ex-box" role="dialog" aria-modal="true" aria-labelledby="hi-h"><h2 id="hi-h">Hand in now?</h2><p>After this you can’t change your answers.</p>' +
    (empty ? '<p><b>' + empty + ' question' + (empty === 1 ? " has" : "s have") + ' no answer yet.</b></p>' : "") +
    (pending.length ? '<p><b>Some pictures are still sending. Wait a moment first.</b></p>' : "") +
    (rejected().length ? '<p><b>Question ' + rejected().map(qNum).join(", ") + ' is not saved: ' + esc(drafts[rejected()[0]].rejected) + ' Fix it first.</b></p>' : "") +
    '<div class="row"><button class="btn" type="button" data-ok' + (pending.length ? " disabled" : "") + '>Hand in</button><button class="btn accent" type="button" data-x>Keep working</button></div></div>');
  $("[data-x]", d.el).onclick = d.close;
  $("[data-ok]", d.el).onclick = function () {
    this.disabled = true;
    flush();
    var wait = setInterval(function () {
      if (anyDirty() && net === "ok") return;
      clearInterval(wait);
      if (anyDirty()) { d.close(); toast("Can't hand in while offline. Your work is kept; try again when connected."); return; }
      api("POST", "/api/s/submit").then(function () { d.close(); poll(); }, function (e) { d.close(); toast(e.message); poll(); });
    }, 300);
  };
}

function zoom(src) {
  var d = modal('<button class="btn small" type="button">Close</button><img alt="">', "ex-zoom");
  $("img", d.el).src = src; $("button", d.el).onclick = d.close; d.el.onclick = function (e) { if (e.target.tagName !== "BUTTON") d.close(); };
}

function phoneDialog(q) {
  api("POST", "/api/s/phone-token/" + encodeURIComponent(q.id)).then(function (r) {
    var link = location.origin + location.pathname + "#p=" + encodeURIComponent(r.token) + (H.api ? "&api=" + encodeURIComponent(H.api) : "") + (S.subject === "chem" || S.subject === "maths" ? "&s=" + S.subject : "");
    var d = modal('<div class="ex-box" role="dialog" aria-modal="true" aria-labelledby="ph-h"><h2 id="ph-h">Add a photo from your phone</h2><p>Scan this with your phone’s camera. Photos you take there appear under Question ' + (cur + 1) + ' here.</p>' +
      '<div class="ex-qr"></div><p class="ex-link">' + esc(link) + '</p><div class="row"><button class="btn" type="button" data-x>Done</button></div></div>');
    try { var qr = qrcode(0, "M"); qr.addData(link); qr.make(); $(".ex-qr", d.el).innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    catch (e) { $(".ex-qr", d.el).textContent = "QR code could not load. Type the link below on your phone."; }
    $("[data-x]", d.el).onclick = d.close;
    // While the dialog is open, check for the new photo more often.
    var fast = setInterval(poll, 2000); var c = d.close; d.close = function () { clearInterval(fast); c(); };
    $("[data-x]", d.el).onclick = d.close;
  }, function (e) { toast(e.message); });
}

/* ---------- drawing ---------- */
function drawDialog(q) {
  var d = modal(
    '<div class="ex-tools" role="toolbar" aria-label="Drawing tools">' +
      '<button type="button" class="ex-sw" data-col="#111111" style="background:#111" aria-label="Black" aria-pressed="true"></button>' +
      '<button type="button" class="ex-sw" data-col="#1f5bd8" style="background:#1f5bd8" aria-label="Blue"></button>' +
      '<button type="button" class="ex-sw" data-col="#d12f2f" style="background:#d12f2f" aria-label="Red"></button>' +
      '<span class="sep"></span><button type="button" class="chip" data-size="2" aria-pressed="true">Thin</button><button type="button" class="chip" data-size="5">Thick</button>' +
      '<button type="button" class="chip" data-eraser aria-pressed="false">Eraser</button><button type="button" class="chip" data-grid aria-pressed="false">Grid</button>' +
      '<span class="sep"></span><button type="button" class="btn small" data-undo>Undo</button><button type="button" class="btn small" data-clear>Clear</button>' +
      '<span class="grow"></span><button type="button" class="btn small" data-x>Cancel</button><button type="button" class="btn small accent" data-save>Add to question ' + (cur + 1) + '</button>' +
    '</div><div class="ex-canvaswrap"><canvas aria-label="Drawing area. Draw with mouse, finger or pen."></canvas></div>', "ex-draw");
  var cv = $("canvas", d.el), ctx = cv.getContext("2d"), strokes = [], now = null, col = "#111111", size = 2, eraser = false, grid = false, dpr = Math.min(2, window.devicePixelRatio || 1);
  function fit() { var r = cv.getBoundingClientRect(); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); redraw(); }
  function paper() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!grid) return;
    var w = cv.width / dpr, h = cv.height / dpr; ctx.lineWidth = 1;
    for (var x = 0; x <= w; x += 20) { ctx.strokeStyle = x % 100 === 0 ? "#b9c3d6" : "#e4e9f2"; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke(); }
    for (var y = 0; y <= h; y += 20) { ctx.strokeStyle = y % 100 === 0 ? "#b9c3d6" : "#e4e9f2"; ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }
  }
  function seg(s, a, b) { ctx.strokeStyle = s.col; ctx.lineWidth = s.size * (s.pen ? (0.4 + (b.p || 0.5) * 1.2) : 1); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function line(s) { if (s.pts.length === 1) { seg(s, s.pts[0], { x: s.pts[0].x + .01, y: s.pts[0].y, p: s.pts[0].p }); return; } for (var i = 1; i < s.pts.length; i++) seg(s, s.pts[i - 1], s.pts[i]); }
  function redraw() { paper(); strokes.forEach(line); }
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; }
  cv.addEventListener("pointerdown", function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); now = { col: eraser ? "#ffffff" : col, size: eraser ? 18 : size, pen: e.pointerType === "pen", pts: [pt(e)] }; strokes.push(now); line(now); });
  cv.addEventListener("pointermove", function (e) { if (!now) return; e.preventDefault(); var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; (evs.length ? evs : [e]).forEach(function (ev) { var p = pt(ev), a = now.pts[now.pts.length - 1]; now.pts.push(p); seg(now, a, p); }); });
  function end() { now = null; }
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  function press(sel, on) { $$(sel, d.el).forEach(function (b) { b.setAttribute("aria-pressed", String(b === on)); }); }
  $$("[data-col]", d.el).forEach(function (b) { b.onclick = function () { col = b.getAttribute("data-col"); eraser = false; press("[data-col]", b); $("[data-eraser]", d.el).setAttribute("aria-pressed", "false"); }; });
  $$("[data-size]", d.el).forEach(function (b) { b.onclick = function () { size = Number(b.getAttribute("data-size")); press("[data-size]", b); }; });
  $("[data-eraser]", d.el).onclick = function () { eraser = !eraser; this.setAttribute("aria-pressed", String(eraser)); };
  $("[data-grid]", d.el).onclick = function () { grid = !grid; this.setAttribute("aria-pressed", String(grid)); redraw(); };
  $("[data-undo]", d.el).onclick = function () { strokes.pop(); redraw(); };
  $("[data-clear]", d.el).onclick = function () { if (strokes.length && confirm("Clear the whole drawing?")) { strokes = []; redraw(); } };
  $("[data-x]", d.el).onclick = function () { if (!strokes.length || confirm("Close without adding the drawing?")) close(); };
  $("[data-save]", d.el).onclick = function () {
    if (!strokes.length) { toast("Draw something first"); return; }
    var out = cv;
    if (Math.max(cv.width, cv.height) > MAXSIDE) { var s = MAXSIDE / Math.max(cv.width, cv.height); out = document.createElement("canvas"); out.width = Math.round(cv.width * s); out.height = Math.round(cv.height * s); out.getContext("2d").drawImage(cv, 0, 0, out.width, out.height); }
    canvasBlob(out, "image/png").then(function (b) { return b && b.size <= MAXBYTES ? b : canvasBlob(out, "image/jpeg", 0.9); }).then(function (b) { queuePicture(q.id, b, "drawing"); close(); toast("Drawing added"); });
  };
  var ro = new ResizeObserver(function () { fit(); }); ro.observe(cv);
  function close() { ro.disconnect(); d.close(); }
  fit();
}

/* ---------- clicks and keys ---------- */
document.addEventListener("click", function (e) {
  var t = e.target.closest("button,[data-go]"); if (!t || !S || !S.questions) return;
  if (t.hasAttribute("data-go")) { cur = Number(t.getAttribute("data-go")); moved(); }
  else if (t.hasAttribute("data-prev") && order().indexOf(cur) > 0) { cur = order()[order().indexOf(cur) - 1]; moved(); }
  else if (t.hasAttribute("data-next") && order().indexOf(cur) < order().length - 1) { cur = order()[order().indexOf(cur) + 1]; moved(); }

  else if (t.hasAttribute("data-handin")) handIn();
  else if (t.hasAttribute("data-draw")) drawDialog(S.questions[cur]);
  else if (t.hasAttribute("data-phone")) phoneDialog(S.questions[cur]);
  else if (t.hasAttribute("data-rm")) removePicture(t.getAttribute("data-rm"));
  else if (t.hasAttribute("data-zoom")) zoom($("img", t).src);
});
function moved() {
  flush(); question(); dots(); window.scrollTo(0, 0);
  if (PREVIEW) { if (follow && S.on && S.questions[cur].id !== S.on) { follow = false; var f = $("[data-follow]"); if (f) f.checked = false; } }
  else if (writable()) poll();   // the server starts timing the new question now, not at the next poll
}
document.addEventListener("click", function (e) { var im = e.target.closest(".ex-pic img"); if (im && im.src) zoom(im.src); });
document.addEventListener("change", function (e) {
  if (e.target.hasAttribute && e.target.hasAttribute("data-follow")) { follow = e.target.checked; if (follow) poll(); return; }
  if (e.target.hasAttribute && e.target.hasAttribute("data-file") && S && S.questions) { addPictures(S.questions[cur].id, e.target.files, "file"); e.target.value = ""; }
});

/* =====================================================================
   PHONE
   ===================================================================== */
var P = null;
function startPhone() {
  if (PHONE.length < 32) return fatal("This phone link is not complete", "Scan the code on the computer again.");
  phonePoll();
  window.addEventListener("online", function () { phonePoll(); phoneSend(); });
}
function phonePoll() {
  api("GET", "/api/p/info").then(function (d) {
    P = d;
    if (P.all) { var busy = phoneQueue.length || document.activeElement && document.activeElement.matches && document.activeElement.matches("input"); if (!busy) phoneAll(); else phonePics(); setTimeout(phonePoll, 4000); }
    else phoneRender();
  }, function (e) {
    if (e.status === 404) return fatal("This phone link is not valid", "Scan the code on the computer again.");
    $("#ex").innerHTML = '<div class="ex-center"><div><h1>No connection</h1><p>Check the phone’s internet. This page keeps trying.</p></div></div>';
    setTimeout(phonePoll, 4000);
  });
}
var phoneQueue = [];
function phoneRender() {
  var open = P.status === "running" || P.status === "timeup", qn = P.number ? "Question " + P.number : "this question", sj = H.s === "chem" || H.s === "maths" ? H.s : "";
  if (sj) document.body.setAttribute("data-subject", sj);
  $("#ex").innerHTML = '<div class="ex-phone stack s5"><header class="stack s2"><div class="tags">' + (sj ? '<span class="tag ' + sj + '"><span class="dot"></span>' + (sj === "chem" ? "Chemistry" : "Maths") + '</span>' : "") + '<span class="tag">' + esc(P.title) + '</span><span class="tag line">' + esc(cap(qn)) + (P.label ? " (" + esc(P.label) + ")" : "") + '</span></div>' +
    '<h1>Add a photo</h1><span class="hint">It shows under ' + esc(qn) + ' on the tablet.</span></header>' +
    (open ? '<div class="stack s3"><label class="btn accent full ex-shoot"><input type="file" accept="image/*" capture="environment" data-cam><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>Take a photo</label>' +
            '<label class="btn full ex-choose"><input type="file" accept="image/*" multiple data-gal>Choose a photo</label></div>'
          : '<div class="ex-banner info">The exam is not open for photos right now.</div>') +
    '<section class="list ex-sent" id="phpics"></section><p class="hint ex-keep">Keep this page open until every photo says Sent.</p></div>';
  phonePics();
}
function cap(t) { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); }
function phonePics() {
  var box = $("#phpics"); if (!box) return;
  var mine = (P.uploads || []).filter(function (u) { return !P.all || u.question === PQ; }), queued = phoneQueue.filter(function (p) { return !P.all || p.q === PQ; });
  if (!P.all) {
    var lab = P.number ? "Q" + P.number : "Photo";
    box.hidden = !mine.length && !queued.length;
    box.innerHTML = mine.map(function (u) { return '<div class="li ex-sentrow"><img alt="Sent photo" data-src="/api/p/files/' + esc(u.id) + '"><span class="stack" style="gap:0"><b>' + esc(lab) + '</b><span class="hint">Sent ' + esc(clockTime(u.at)) + '</span></span><svg class="icon ok" viewBox="0 0 24 24" aria-label="Sent"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></div>'; }).join("") +
      queued.map(function (p) { return '<div class="li ex-sentrow"><img alt="Photo sending" src="' + p.url + '"><span class="stack" style="gap:0"><b>' + esc(lab) + '</b><span class="hint">' + (p.err ? esc(p.err) : "Waiting to send") + '</span></span><span class="ex-spin" aria-label="Sending"></span></div>'; }).join("");
  } else
  box.innerHTML = mine.map(function (u) { return '<div class="ex-pic"><img alt="Sent photo" data-src="/api/p/files/' + esc(u.id) + '"><div class="meta"><span>Sent ' + esc(clockTime(u.at)) + '</span></div></div>'; }).join("") +
    queued.map(function (p) { return '<div class="ex-pic pending"><img alt="Photo sending" src="' + p.url + '"><div class="meta"><span>' + (p.err ? esc(p.err) : "Sending") + '</span></div></div>'; }).join("");
  $$("img[data-src]", box).forEach(function (im) { shown(im, im.getAttribute("data-src")); });
}
document.addEventListener("change", function (e) {
  if (!PHONE || !e.target.matches || !e.target.matches("[data-cam],[data-gal]")) return;
  Array.prototype.forEach.call(e.target.files, function (f) {
    var q = P && P.all ? PQ : null;
    shrink(f).then(function (b) { phoneQueue.push({ blob: b, url: URL.createObjectURL(b), q: q }); phonePics(); phoneSend(); }, function (err) { toast(err.message); });
  });
  e.target.value = "";
});
var phoneBusy = false;
function phoneSend() {
  if (phoneBusy || !phoneQueue.length) return;
  phoneBusy = true; var it = phoneQueue[0]; it.err = null; phonePics();
  api("POST", "/api/p/upload" + (it.q ? "?q=" + encodeURIComponent(it.q) : ""), it.blob, { "Content-Type": it.blob.type || "image/jpeg" }).then(function (u) {
    phoneQueue.shift(); blobCache["/api/p/files/" + u.id] = it.url; P.uploads = (P.uploads || []).concat([u]); phoneBusy = false; toast("Photo sent"); phonePics(); phoneSend();
  }, function (e) {
    phoneBusy = false;
    if (e.status && e.status < 500) { phoneQueue.shift(); toast(e.message); phonePics(); phonePoll(); return; }
    it.err = "Waiting for connection"; phonePics(); setTimeout(phoneSend, 4000);
  });
}

/* One phone link for a whole assignment (Ali, 8 Oct): pick the day and the question (it follows the laptop),
   take the photo. */
var PSEC = null, PQ = null, pickedAt = 0;
function phoneAll() {
  document.body.classList.add("a-body");
  var secs = P.sections || [], qs = P.questions || [];
  // follow the laptop unless he picked something himself in the last half minute
  if (P.on && Date.now() - pickedAt > 30000) { var oq = qs.filter(function (q) { return q.id === P.on; })[0]; if (oq) { PSEC = oq.section; PQ = oq.id; } }
  if (!PSEC || !secs.some(function (x) { return x.id === PSEC; })) { var nd = secs.filter(function (x) { return x.doneAt == null; }); PSEC = (nd[nd.length - 1] || secs[secs.length - 1] || {}).id || null; }
  var sq = qs.filter(function (q) { return q.section === PSEC; });
  if (!PQ || !sq.some(function (q) { return q.id === PQ; })) PQ = sq.length ? sq[0].id : null;
  var sec = secs.filter(function (x) { return x.id === PSEC; })[0], open = P.status === "running" || P.status === "timeup", n = sq.map(function (q) { return q.id; }).indexOf(PQ) + 1;
  $("#ex").innerHTML = '<div class="a-phone"><div class="a-eyebrow">' + esc(P.title) + '</div><h1>' + esc(sec ? sec.title : "Nothing open yet") + '</h1>' +
    '<div class="a-pchips">' + secs.slice().reverse().map(function (x) { return '<button type="button" class="a-chip' + (x.id === PSEC ? " on" : "") + '" data-p-sec="' + esc(x.id) + '">' + esc(x.title) + (x.doneAt != null ? " ✓" : "") + '</button>'; }).join("") + '</div>' +
    (sec ? '<div class="a-lab">Which question is this page for?</div><div class="a-pqs">' + sq.map(function (q, i) { return '<button type="button" class="a-pq' + (q.id === PQ ? " on" : "") + '" data-p-q="' + esc(q.id) + '">' + (i + 1) + '</button>'; }).join("") + '</div>' +
      (P.on === PQ ? '<p class="hint">Follows the laptop: it is on Q' + n + ' there too.</p>' : "") +
      (sec.doneAt != null ? '<p class="hint">This part is finished: new photos are kept as practice.</p>' : "") +
      (open ? '<label class="a-shoot ' + subjOf(sec) + '"><input type="file" accept="image/*" capture="environment" data-cam>Take photo of Q' + n + '</label>' +
        '<label class="a-btn wide"><input type="file" accept="image/*" multiple data-gal>Choose from photos</label>' : '<div class="ex-banner info">The assignment is closed.</div>') +
      '<div class="a-lab">Sent for Q' + n + '</div><div class="ex-pics" id="phpics"></div>' : '<p>Your next day opens later.</p>') + '</div>';
  phonePics();
}
document.addEventListener("click", function (e) {
  if (!PHONE || !P || !P.all) return;
  var t = e.target.closest && e.target.closest("[data-p-sec],[data-p-q]"); if (!t) return;
  pickedAt = Date.now();
  if (t.hasAttribute("data-p-sec")) { PSEC = t.getAttribute("data-p-sec"); PQ = null; }
  else PQ = t.getAttribute("data-p-q");
  phoneAll();
});

/* A different link pasted into the same tab: start again with it. */
window.addEventListener("hashchange", function () { location.reload(); });

/* ---------- go ---------- */
if (!API || /example\.workers\.dev/.test(API)) fatal("The exam server is not set up yet", "Your teacher needs to finish the setup.");
else if (PHONE) startPhone();
else if (PREVIEW) { document.body.classList.add("ex-isprev"); poll(); }
else startStudent();
})();
