/* Exam page for the student (exam.html#t=<token>) and the phone upload page (exam.html#p=<token>).
   The server owns the clock; this page only shows it. Answers are kept on this device first and sent
   to the server every few seconds and on every change, so a dropped connection loses nothing.
   Nothing here ever shows a score, a mark scheme or a correct answer. */
(function () {
"use strict";

var H = parseHash();
var API = (H.api || window.EXAM_API || "").replace(/\/+$/, "");
var TOKEN = H.t || "", PHONE = H.p || "";
var KEY = "exam." + (TOKEN || PHONE).slice(0, 12);
var MAXSIDE = 2000, MAXBYTES = 1800000;

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
  return h;
}
function api(method, path, body, extra) {
  var opts = { method: method, headers: headers(extra), cache: "no-store" };
  if (body instanceof Blob) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  return fetch(API + path, opts).then(function (r) {
    var ct = r.headers.get("Content-Type") || "";
    var p = ct.indexOf("json") >= 0 ? r.json() : r.blob();
    return p.then(function (d) { if (!r.ok) { var e = new Error((d && d.error) || ("Error " + r.status)); e.status = r.status; throw e; } return d; });
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

/* ---------- maths (KaTeX loads only when a question has \( \) or \[ \]) ---------- */
var KTX = null, KCDN = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/";
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

function loadDrafts() { try { drafts = JSON.parse(ls(KEY) || "{}") || {}; } catch (e) { drafts = {}; } }
function keepDrafts() { ls(KEY, JSON.stringify(drafts)); }

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

function poll() {
  clearTimeout(pollTimer);
  var t0 = Date.now();
  api("GET", "/api/s/state").then(function (d) {
    var t1 = Date.now();
    offset = d.serverNow - Math.round((t0 + t1) / 2);
    setNet("ok");
    var first = !S, was = S && S.status;
    S = d;
    if (d.answers) mergeAnswers(d.answers);
    // Running and "time up" share one screen, so the answer box keeps its cursor when the time runs out.
    if (first || group(was) !== group(d.status) || !$(".ex-q")) render(); else refresh();
    if (was === "waiting" && (d.status === "running" || d.status === "timeup")) toast("The exam has started");
    if (anyDirty()) flush();
    sendPending();
    pollTimer = setTimeout(poll, d.status === "waiting" ? 2000 : d.status === "running" || d.status === "timeup" ? 3000 : 10000);
  }, function (e) {
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
    if (!d) drafts[q] = { text: s.text, seq: s.seq, dirty: false, savedAt: s.savedAt, late: s.late };
    else if (d.dirty && d.seq > s.seq) { /* unsent work on this device is newer: keep it */ }
    else if (!d.dirty) { d.text = s.text; d.seq = Math.max(d.seq || 0, s.seq); d.savedAt = s.savedAt; d.late = s.late; }
    else d.seq = Math.max(d.seq, s.seq + 1);
  });
  keepDrafts();
}

function group(st) { return st === "running" || st === "timeup" ? "open" : st; }
function anyDirty() { return Object.keys(drafts).some(function (q) { return drafts[q].dirty; }); }
function writable() { return S && (S.status === "running" || S.status === "timeup"); }

function fatal(title, msg) {
  clearTimeout(pollTimer);
  $("#ex").innerHTML = '<div class="ex-center"><div><h1>' + esc(title) + '</h1><p>' + esc(msg) + '</p></div></div>';
}

function setNet(n) { net = n; saveState(); }

/* ---------- saving answers ---------- */
function onType(q, text) {
  var d = drafts[q] || (drafts[q] = { text: "", seq: 0, dirty: false });
  if (d.text === text) return;
  d.text = text; d.seq = (d.seq || 0) + 1; d.dirty = true;
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
        if (e.status && e.status < 500 && e.status !== 429) { d.dirty = false; toast(e.message); return; }
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
  el.className = "ex-save";
  var waiting = anyDirty() || pending.length;
  if (net === "off" && waiting) { el.classList.add("off"); el.textContent = "Offline: kept on this computer, will send when back"; return; }
  if (net === "off") { el.classList.add("off"); el.textContent = "Offline: trying to reconnect"; return; }
  if (mode === "saving" || waiting) { el.textContent = "Saving"; return; }
  el.textContent = lastSaveAt ? "Saved " + clockTime(lastSaveAt) : "All saved";
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
  if (S.status === "waiting" || S.status === "draft") {
    m.innerHTML = '<div class="ex-center"><div><div class="ex-pulse"></div><h1>' + esc(S.title) + '</h1><p>Your teacher will start the exam. It will open here on its own; no need to refresh.</p>' +
      (S.baseMinutes ? '<p class="hint" style="margin-top:12px">Time: ' + esc(minutesText(S.baseMinutes)) + '</p>' : "") + '</div></div>';
    return;
  }
  if (S.status === "locked") { m.innerHTML = '<div class="ex-center"><div><h1>The exam has ended</h1><p>Your answers are saved. Your teacher will go through them.</p></div></div>'; return; }
  if (!S.questions || !S.questions.length) { m.innerHTML = '<div class="ex-center"><div><h1>' + esc(S.title) + '</h1><p>No questions yet.</p></div></div>'; return; }
  cur = Math.min(cur, S.questions.length - 1);
  var done = S.status === "submitted";
  m.innerHTML =
    '<header class="ex-top"><div class="ex-title">' + esc(S.title) + (S.practice ? ' <span class="ex-prac">Practice</span>' : "") + '</div><div class="ex-timer num" role="timer" aria-live="off"></div><div class="ex-save" aria-live="polite"></div></header>' +
    '<div class="ex-bannerslot"></div>' +
    '<nav class="ex-dots" aria-label="Questions"></nav>' +
    '<section class="ex-q card"></section>' +
    '<div class="ex-nav"><div class="in"><button class="btn" type="button" data-prev>Previous</button><span class="grow"></span>' +
    (done ? "" : '<button class="btn" type="button" data-handin>Hand in</button>') +
    '<button class="btn accent" type="button" data-next>Next</button></div></div>';
  dots(); question(); banner(); tick(); saveState();
  tickTimer = setInterval(tick, 250);
}

function refresh() { banner(); pics(); dots(); tick(); lockInputs(); }

function minutesText(min) { var h = Math.floor(min / 60), mm = Math.round(min % 60); return (h ? h + " h " : "") + (mm || !h ? mm + " min" : ""); }

function tick() {
  var el = $(".ex-timer"); if (!el || !S) return;
  var now = Date.now() + offset;
  if (S.status === "submitted") { el.className = "ex-timer num"; el.textContent = "Handed in"; return; }
  var left = S.endAt - now;
  if (left <= 0 || S.status === "timeup") { el.className = "ex-timer num up"; el.textContent = "Time is up"; if (S.status === "running") { S.status = "timeup"; banner(); } return; }
  var s = Math.ceil(left / 1000), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  el.textContent = (h ? h + ":" + String(mi).padStart(2, "0") : mi) + ":" + String(se).padStart(2, "0");
  el.className = "ex-timer num" + (left <= 5 * 60000 ? " soon" : "");
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
  var n = $(".ex-dots"); if (!n || !S.questions) return;
  var has = {}; (S.uploads || []).forEach(function (u) { has[u.question] = 1; }); pending.forEach(function (p) { has[p.q] = 1; });
  n.innerHTML = S.questions.map(function (q, i) {
    var d = drafts[q.id], answered = (d && d.text && d.text.trim()) || has[q.id];
    return '<button type="button" class="ex-dot' + (answered ? " done" : "") + '" data-go="' + i + '"' + (i === cur ? ' aria-current="true"' : "") + ' aria-label="Question ' + (i + 1) + (answered ? ", answered" : "") + '">' + (i + 1) + '</button>';
  }).join("");
}

function question() {
  var q = S.questions[cur], box = $(".ex-q"); if (!box) return;
  var d = drafts[q.id] || { text: "" }, ro = !writable();
  var upload = q.type === "upload_required" || q.type === "upload_optional";
  var input = q.type === "short"
    ? '<input type="text" id="ans" autocomplete="off" spellcheck="false" value="' + esc(d.text) + '"' + (ro ? " disabled" : "") + '>'
    : '<textarea id="ans" spellcheck="false"' + (ro ? " disabled" : "") + '>' + esc(d.text) + '</textarea>';
  box.innerHTML =
    '<div class="ex-qhead"><h2>Question ' + (cur + 1) + ' of ' + S.questions.length + (q.label ? ' <span class="hint">(' + esc(q.label) + ')</span>' : "") + '</h2><span class="ex-marks">' + esc(q.marks) + ' mark' + (q.marks === 1 ? "" : "s") + '</span></div>' +
    '<div class="ex-qtext">' + clean(q.text_html) + '</div>' +
    (q.has_img ? '<figure class="ex-qimg"><button type="button" data-zoom><img alt="Question ' + (cur + 1) + ' picture"></button></figure>' : "") +
    '<div class="ex-answer"><label for="ans">' + (upload ? "Working or notes (optional)" : "Your answer") + '</label>' + input +
    (q.type === "upload_required" ? '<p class="ex-need">This question needs a picture of your working.</p>' : "") + '</div>' +
    '<div class="ex-attach"' + (ro ? " hidden" : "") + '>' +
      '<label class="btn small"><input type="file" accept="image/*" multiple hidden data-file>Choose picture</label>' +
      '<button class="btn small" type="button" data-draw>Draw</button>' +
      '<button class="btn small" type="button" data-phone>Use phone</button>' +
    '</div><div class="ex-pics"></div>';
  if (q.has_img) shown($(".ex-qimg img", box), "/api/s/questions/" + encodeURIComponent(q.id) + "/image");
  maths($(".ex-qtext", box));
  var a = $("#ans");
  a.addEventListener("input", function () { onType(q.id, a.value); });
  a.addEventListener("blur", function () { flush(); });
  pics();
  var prev = $("[data-prev]"), next = $("[data-next]");
  if (prev) prev.disabled = cur === 0;
  if (next) next.disabled = cur === S.questions.length - 1;
}

function lockInputs() {
  var ro = !writable(), a = $("#ans"), at = $(".ex-attach"), hi = $("[data-handin]");
  if (a) a.disabled = ro; if (at) at.hidden = ro; if (hi) hi.hidden = ro;
}

function pics() {
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
    '<div class="row"><button class="btn" type="button" data-x>Keep working</button><button class="btn accent" type="button" data-ok' + (pending.length ? " disabled" : "") + '>Hand in</button></div></div>');
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
    var link = location.origin + location.pathname + "#p=" + encodeURIComponent(r.token) + (H.api ? "&api=" + encodeURIComponent(H.api) : "");
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
  if (t.hasAttribute("data-go")) { cur = Number(t.getAttribute("data-go")); flush(); question(); dots(); window.scrollTo(0, 0); }
  else if (t.hasAttribute("data-prev") && cur > 0) { cur--; flush(); question(); dots(); window.scrollTo(0, 0); }
  else if (t.hasAttribute("data-next") && cur < S.questions.length - 1) { cur++; flush(); question(); dots(); window.scrollTo(0, 0); }
  else if (t.hasAttribute("data-handin")) handIn();
  else if (t.hasAttribute("data-draw")) drawDialog(S.questions[cur]);
  else if (t.hasAttribute("data-phone")) phoneDialog(S.questions[cur]);
  else if (t.hasAttribute("data-rm")) removePicture(t.getAttribute("data-rm"));
  else if (t.hasAttribute("data-zoom")) zoom($("img", t).src);
});
document.addEventListener("click", function (e) { var im = e.target.closest(".ex-pic img"); if (im && im.src) zoom(im.src); });
document.addEventListener("change", function (e) {
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
  api("GET", "/api/p/info").then(function (d) { P = d; phoneRender(); }, function (e) {
    if (e.status === 404) return fatal("This phone link is not valid", "Scan the code on the computer again.");
    $("#ex").innerHTML = '<div class="ex-center"><div><h1>No connection</h1><p>Check the phone’s internet. This page keeps trying.</p></div></div>';
    setTimeout(phonePoll, 4000);
  });
}
var phoneQueue = [];
function phoneRender() {
  var open = P.status === "running" || P.status === "timeup";
  $("#ex").innerHTML = '<div class="ex-phone"><h1>' + esc(P.title) + '</h1><p class="hint">Question ' + esc(P.number || "") + (P.label ? " (" + esc(P.label) + ")" : "") + '</p>' +
    (open ? '<label class="btn accent big"><input type="file" accept="image/*" capture="environment" data-cam>Take a photo</label>' +
            '<label class="btn big"><input type="file" accept="image/*" multiple data-gal>Choose from photos</label>' +
            '<p class="hint" style="margin-top:10px">Each photo appears under the question on the computer.</p>'
          : '<div class="ex-banner info">The exam is not open for photos right now.</div>') +
    '<div class="ex-pics" id="phpics"></div></div>';
  phonePics();
}
function phonePics() {
  var box = $("#phpics"); if (!box) return;
  box.innerHTML = (P.uploads || []).map(function (u) { return '<div class="ex-pic"><img alt="Sent photo" data-src="/api/p/files/' + esc(u.id) + '"><div class="meta"><span>Sent ' + esc(clockTime(u.at)) + '</span></div></div>'; }).join("") +
    phoneQueue.map(function (p) { return '<div class="ex-pic pending"><img alt="Photo sending" src="' + p.url + '"><div class="meta"><span>' + (p.err ? esc(p.err) : "Sending") + '</span></div></div>'; }).join("");
  $$("img[data-src]", box).forEach(function (im) { shown(im, im.getAttribute("data-src")); });
}
document.addEventListener("change", function (e) {
  if (!PHONE || !e.target.matches || !e.target.matches("[data-cam],[data-gal]")) return;
  Array.prototype.forEach.call(e.target.files, function (f) {
    shrink(f).then(function (b) { phoneQueue.push({ blob: b, url: URL.createObjectURL(b) }); phonePics(); phoneSend(); }, function (err) { toast(err.message); });
  });
  e.target.value = "";
});
var phoneBusy = false;
function phoneSend() {
  if (phoneBusy || !phoneQueue.length) return;
  phoneBusy = true; var it = phoneQueue[0]; it.err = null; phonePics();
  api("POST", "/api/p/upload", it.blob, { "Content-Type": it.blob.type || "image/jpeg" }).then(function (u) {
    phoneQueue.shift(); blobCache["/api/p/files/" + u.id] = it.url; P.uploads = (P.uploads || []).concat([u]); phoneBusy = false; toast("Photo sent"); phonePics(); phoneSend();
  }, function (e) {
    phoneBusy = false;
    if (e.status && e.status < 500) { phoneQueue.shift(); toast(e.message); phonePics(); phonePoll(); return; }
    it.err = "Waiting for connection"; phonePics(); setTimeout(phoneSend, 4000);
  });
}

/* A different link pasted into the same tab: start again with it. */
window.addEventListener("hashchange", function () { location.reload(); });

/* ---------- go ---------- */
if (!API || /example\.workers\.dev/.test(API)) fatal("The exam server is not set up yet", "Your teacher needs to finish the setup.");
else if (PHONE) startPhone();
else startStudent();
})();
