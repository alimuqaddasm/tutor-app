/* Exams tab: load an exam Claude built in the repo onto the exam server, run it live, then mark it.
   #/exams            exams Claude wrote (students/<s>/exams/<id>/exam.json) and exams on the server
   #/exams/<id>       time suggestion, student link, Start, + minutes, Lock, live saves, log
   #/exams/<id>/mark  question | answer + pictures + times | mark scheme, marks and comments, Save to repo;
                      Compare puts one question's answer beside its mark scheme, full screen (Ali, 7 Oct)
   Compare also lists the question's marks (M1, A1, B1... from "scheme" in exam.json) to tick (Ali, 7 Oct).
   Claude's marks (claude-marks.json next to exam.json) show on each question with Accept, and Accept all (Ali, 7 Oct).
   Assignments (students/<s>/assignments/<id>/assignment.json, Ali 7 Oct): loaded the same way, no clock, sections with
   Done; marking shows what he had at Done and flags anything changed after it.
   Student view opens exam.html#v=<id>: the student's page, read-only, with his answers as they are now (Ali, 7 Oct).
   The exam server holds the clock and the answers. The tutoring repo holds the questions and mark schemes. */
(function () {
"use strict";
var T = window.TD; if (!T) return;
var $ = T.$, $$ = T.$$, esc = T.esc, app = T.app;
var live = null;            // polling timer for the open exam
var X = null;               // the exam on screen (teacher view)
var R = null;               // the review on screen (marking)
var offset = 0;

function xapi() { return (T.ls("tutor.examApi") || window.EXAM_API || "").replace(/\/+$/, ""); }
function xpw() { return T.ls("tutor.examPw") || ""; }
function ready() { return xapi() && !/example\.workers\.dev/.test(xapi()) && xpw(); }

function call(method, path, body, extra) {
  var h = extra || {}; h["X-Exam-Password"] = xpw();
  // his pictures never change, so the browser may keep them (the server says how long); everything else is always fresh
  var opts = { method: method, headers: h, cache: method === "GET" && /^\/api\/t\/files\//.test(path) ? "default" : "no-store" };
  if (body instanceof Blob) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  // a request that never answers is given up, so the live page keeps polling
  var ctl = window.AbortController ? new AbortController() : null, timer = ctl && setTimeout(function () { ctl.abort(); }, body instanceof Blob ? 60000 : 20000);
  if (ctl) opts.signal = ctl.signal;
  return fetch(xapi() + path, opts).then(function (r) {
    var ct = r.headers.get("Content-Type") || "";
    return (ct.indexOf("json") >= 0 ? r.json() : r.blob()).then(function (d) { if (!r.ok) { var e = new Error((d && d.error) || "Exam server " + r.status); e.status = r.status; throw e; } return d; });
  }).then(function (d) { clearTimeout(timer); return d; }, function (e) {
    clearTimeout(timer);
    if (!e.status) e = Object.assign(new Error("Can’t reach the exam server. Check the internet connection."), { status: 0 });
    throw e;
  });
}
var blobs = {};
function picUrl(path) { if (blobs[path]) return Promise.resolve(blobs[path]); return call("GET", path).then(function (b) { return (blobs[path] = URL.createObjectURL(b)); }); }
function showPics(root) { $$("img[data-xsrc]", root).forEach(function (im) { picUrl(im.getAttribute("data-xsrc")).then(function (u) { im.src = u; }, function () { im.alt = "Picture could not load"; }); }); }
function showRepoPics(root) { $$("img[data-rsrc]", root).forEach(function (im) { T.fileURL(im.getAttribute("data-rsrc")).then(function (u) { if (u) im.src = u; else im.alt = "Not in the repo"; }); }); }

/* "4:32 pm" */
function t12(ms) { if (ms == null) return ""; var d = new Date(ms), h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0"); return (h % 12 || 12) + ":" + m + " " + (h < 12 ? "am" : "pm"); }
function day(ms) { return ms == null ? "" : new Date(ms).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }); }
function mins(n) { n = Math.round(n * 10) / 10; var h = Math.floor(n / 60), m = Math.round((n % 60) * 10) / 10; return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min"; }
function r2(x) { return Math.round(x * 100) / 100; }
/* "6 min 20 s" from seconds */
function dur(sec) { sec = Math.round(sec || 0); var m = Math.floor(sec / 60), s = sec % 60; return m ? m + " min" + (s ? " " + s + " s" : "") : s + " s"; }
function studentView(id) { return "exam.html#v=" + encodeURIComponent(id) + (xapi() !== (window.EXAM_API || "").replace(/\/+$/, "") ? "&api=" + encodeURIComponent(xapi()) : ""); }
function svBtn(id) { return '<a class="btn small" href="' + esc(studentView(id)) + '" target="_blank" rel="noopener" title="Opens his exam page as he sees it, with his answers as they are now. Read-only.">Student view</a>'; }
var LABEL = { draft: "Not opened", waiting: "Waiting", running: "Running", timeup: "Time up", submitted: "Handed in", locked: "Locked", proposed: "Proposed", ready: "Ready" };
var CHIPCLS = { waiting: "live", proposed: "live", running: "ok", ready: "ok", timeup: "bad", submitted: "chem", locked: "chem", draft: "dash" };
function chip(st, kind) { var l = kind === "assignment" && (st === "running" || st === "timeup") ? "Open" : LABEL[st] || T.cap(st); return '<span class="tag xt-' + esc(st) + ' ' + (CHIPCLS[st] || "") + '">' + esc(l) + '</span>'; }
function isAsg(o) { return o && o.kind === "assignment"; }
/* an assignment's questions, flat, each knowing its section */
function flatQs(e) { if (!e) return []; if (!e.sections) return e.questions || []; var out = []; e.sections.forEach(function (x) { (x.questions || []).forEach(function (q) { out.push(Object.assign({ section_id: x.id }, q)); }); }); return out; }
var TYPES = [["short", "Short answer"], ["long", "Long answer"], ["upload_required", "Picture needed"], ["upload_optional", "Picture optional"]];

/* Try-out: practice exams only. They live on the exam server marked "practice", show up only in Try-out,
   and never go to the tutoring repo. Real exams can be looked at in Try-out but not changed. */
var SAMPLE = { title: "Practice exam", subject: "maths", minutes: 15, ratio: 1.2, questions: [
  { id: "q1", label: "Q1", marks: 2, type: "short", text: "<p>Convert 135° to radians. Give your answer in terms of π.</p>", answer: "<p>135 × π/180 = 3π/4 (1 mark method, 1 mark answer)</p>" },
  { id: "q2", label: "Q2", marks: 4, type: "long", text: "<p>Solve 2x² − 5x − 3 = 0. Show your working.</p>", answer: "<p>(2x + 1)(x − 3) = 0 (2 marks), x = 3 (1 mark), x = −1/2 (1 mark)</p>" },
  { id: "q3", label: "Q3", marks: 3, type: "upload_required", text: "<p>Sketch y = x² − 4x + 3. Mark where it crosses both axes. Draw it on the page or take a photo of your paper.</p>", answer: "<p>U shape (1), crosses the x axis at 1 and 3 (1), crosses the y axis at 3 (1)</p>" },
  { id: "q4", label: "Q4", marks: 2, type: "upload_optional", text: "<p>Differentiate y = 3x⁴ − 2x + 7.</p>", answer: "<p>dy/dx = 12x³ − 2 (1 mark each term)</p>" }
] };
function readOnly(e) { return T.isTry && e && !e.practice; }
var RO_NOTE = '<div class="xt-up">Try-out: this is a real exam, so you can look but not change anything. Use a practice exam to try things.</div>';

function makePractice(btn) {
  btn.disabled = true; btn.textContent = "Making…";
  var marks = SAMPLE.questions.reduce(function (s, q) { return s + q.marks; }, 0);
  call("POST", "/api/t/exams", { title: SAMPLE.title + " " + day(Date.now()), subject: SAMPLE.subject, source_path: "", practice: true, ratio: SAMPLE.ratio, base_minutes: SAMPLE.minutes,
    questions: SAMPLE.questions.map(function (q) { return { id: q.id, label: q.label, text_html: q.text, marks: q.marks, type: q.type, suggested_min: Math.round(q.marks * SAMPLE.ratio * 10) / 10 }; }) })
    .then(function (made) { T.toast("Practice exam ready (" + marks + " marks)"); location.hash = "#/exams/" + made.id; },
      function (e) { btn.disabled = false; btn.textContent = "Make a practice exam"; T.toast(e.message); });
}
function deletePractice(id, status) {
  if (!confirm("Delete this practice exam and everything in it?")) return;
  (status === "running" || status === "timeup" ? call("POST", "/api/t/exams/" + id + "/lock") : Promise.resolve())
    .then(function () { return call("DELETE", "/api/t/exams/" + id); })
    .then(function () { T.toast("Practice exam deleted"); if (location.hash === "#/exams") listView(); else location.hash = "#/exams"; }, function (e) { T.toast(e.message); });
}

function stop() { clearTimeout(live); live = null; }
window.addEventListener("hashchange", function () { if ((location.hash || "").indexOf("#/exams/") !== 0) stop(); });

window.examsView = function (r) {
  stop();
  var parts = r.split("/").filter(Boolean);   // ["exams", id, "mark"]
  if (!ready()) {
    app.innerHTML = '<div class="section-h"><h2>Exams</h2></div><div class="empty"><h3>Connect the exam server first</h3><p>Open <a href="#/settings">Settings</a> and fill in <b>Exam server</b> and <b>Exam password</b>.</p></div>';
    return;
  }
  if (parts.length === 1) return listView();
  if (parts[2] === "mark") return markView(decodeURIComponent(parts[1]));
  return examView(decodeURIComponent(parts[1]));
};

/* ===================== list ===================== */
function examFolder(path) { return path.replace(/(exam|assignment)\.json$/, ""); }

function listView() {
  app.innerHTML = '<div class="wrap exams">' + listHead() + '<div class="empty"><b class="t-card">Loading</b></div></div>';
  var base = T.studentBase() + "exams/", abase = T.studentBase() + "assignments/";
  // the repo part draws as soon as it is there; the exam server's part fills in when it answers
  var repoP = T.loadTree().then(function (tree) {
      var files = tree.filter(function (t) { return (t.path.indexOf(base) === 0 && /\/exam\.json$/.test(t.path) && t.path.slice(base.length).split("/").length === 2) ||
        (t.path.indexOf(abase) === 0 && /\/assignment\.json$/.test(t.path) && t.path.slice(abase.length).split("/").length === 2); });
      var has = {}; tree.forEach(function (t) { has[t.path] = 1; });
      return Promise.all(files.map(function (f) { var rp = examFolder(f.path) + "result.json";
        return Promise.all([T.fileJSON(f.path), has[rp] ? T.fileJSON(rp).catch(function () { return null; }) : null]).then(function (v) { return { path: f.path, exam: v[0] && v[0].data, result: v[1] && v[1].data }; }, function (e) { return { path: f.path, error: e.message }; }); }));
    });
  var serverP = call("GET", "/api/t/exams"), done = false;
  repoP.then(function (repo) { if (!done && (location.hash || "") === "#/exams") drawList(repo, null); }, function () {});
  Promise.all([repoP, serverP]).then(function (res) { done = true; if ((location.hash || "") === "#/exams") drawList(res[0], res[1]); })
    .catch(function (e) { app.innerHTML = '<div class="wrap exams">' + listHead() + '<div class="empty"><b class="t-card">Couldn’t load exams</b><span class="hint">' + esc(e.message) + '. Check the exam server and password in <a href="#/settings">Settings</a>.</span></div></div>'; });
}
function listHead() { return '<header class="head"><div class="stack s2"><h1 class="t-page">Exams and assignments</h1><div class="tags">' + T.tag("Exam: timed, on his tablet") + T.tag("Assignment: no clock") + '</div></div>' +
  (T.isTry ? '<button class="btn pri" type="button" data-practice>Make a practice exam</button>' : "") + '</header>'; }
/* "Chapters 1 to 6 (revised, 45 min)" is "Chapters 1 to 6"; "Holiday practice, 23 to 30 Oct" is "Holiday practice": dates and notes are tags */
function rq0(res) { var q = res.questions || []; return q.length && q.every(function (x) { return x.score != null; }); }
function shortTitle(s) { return String(s || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/,\s*\d{1,2}(\s+\w+)?\s+to\s+\d{1,2}\s+\w+$/, "").trim(); }
function dmy(iso) { return iso ? T.fmtDate(iso) : ""; }
function addDay(iso, n) { var p = String(iso).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function drawList(repo, all) {
    var waiting = all == null; all = all || [];
    repo = repo.slice().sort(function (a, b) { return b.path.localeCompare(a.path); });
    var server = all.filter(function (s) { return !s.practice; }), practice = all.filter(function (s) { return s.practice; });
    var loaded = {}; server.forEach(function (s) { if (s.sourcePath) loaded[s.sourcePath] = s; });
    var pracOf = {}; practice.forEach(function (s) { if (s.sourcePath && !pracOf[s.sourcePath]) pracOf[s.sourcePath] = s; });
    var tag = T.tag, h = '<div class="wrap exams">' + listHead();
    if (T.isTry && practice.length) h += '<section class="stack"><h2 class="t-sec">Practice (Try-out)</h2><div class="list">' + practice.map(function (s) {
        return '<div class="li xrow"><div class="stack s2"><div class="tags">' + chip(s.status, s.kind) + tag(s.questions + " questions") + tag(s.totalMarks + " marks") + '</div><b>' + esc(shortTitle(s.title)) + '</b></div><div class="row s2"><a class="btn sm" href="#/exams/' + esc(s.id) + '">Open</a><button class="btn sm quiet" type="button" data-delprac="' + esc(s.id) + '" data-st="' + esc(s.status) + '">Delete</button></div></div>'; }).join("") + '</div></section>';
    var actions = function (r, st, on) {
      return waiting ? '<span class="hint">Checking the exam server…</span>'
        : T.isTry && pracOf[r.path] ? '<a class="btn sm pri" href="#/exams/' + esc(pracOf[r.path].id) + '">Open practice copy</a>' + (on ? '<a class="btn sm" href="#/exams/' + esc(on.id) + '">Look at the real one</a>' : "")
        : T.isTry && on ? '<button class="btn sm pri" type="button" data-praccopy="' + esc(on.id) + '">Practice copy</button><a class="btn sm" href="#/exams/' + esc(on.id) + '">Look at the real one</a>'
        : on ? (on.status === "submitted" || on.status === "locked" ? '<a class="btn sm pri" href="#/exams/' + esc(on.id) + '/mark">Mark</a>' : "") + '<a class="btn sm" href="#/exams/' + esc(on.id) + '">Open</a>'
        : st === "ready" && T.isTry ? '<button class="btn sm pri" type="button" data-pracload="' + esc(r.path) + '">Load a practice copy</button>'
        : st === "ready" ? '<button class="btn sm pri" type="button" data-load="' + esc(r.path) + '">Load to exam server</button>'
        : '<span class="hint">Finish it with Claude first</span>'; };
    var notes = function (e) { return e.why ? '<details class="fold xnotes"><summary>Notes from Claude</summary><p class="hint">' + esc(e.why) + '</p></details>' : ""; };
    var asgs = repo.filter(function (r) { return /\/assignment\.json$/.test(r.path); }), exs = repo.filter(function (r) { return !/\/assignment\.json$/.test(r.path); });
    var examCard = function (r) {
      if (r.error) return '<div class="card pad"><b>' + esc(r.path) + '</b><span class="hint">' + esc(r.error) + '</span></div>';
      var e = r.exam || {}, res = r.result, qs = flatQs(e), marks = qs.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0), st = e.status || "draft", on = loaded[r.path];
      var ext = res && (res.extensions || []).reduce(function (a, x) { return a + (+x.minutes || 0); }, 0), status = on ? on.status : res ? res.status : st, marked = res && res.status === "locked" && rq0(res);
      var rq = res && res.questions || [], worst = null; rq.forEach(function (q) { if (q.score != null && q.marks && (!worst || q.score / q.marks < worst.score / worst.marks)) worst = q; });
      var mixTags = Object.keys(e.mix || {}).map(function (k) { return tag(esc(T.cap(k))); }).join("");
      return '<section class="card xcard" data-subject="' + esc(e.subject || "") + '"><div class="xhead"><div class="stack s3" style="min-width:0;flex:1"><div class="tags">' + (e.subject ? T.subjTag(e.subject) : "") + (e.date ? tag(esc(dmy(e.date))) : "") + (e.minutes ? tag(e.minutes + " min" + (ext ? " + " + ext + " min added" : "")) : "") + tag(qs.length + " questions") + (marked ? tag("Locked \u00b7 marked", "chem") : chip(status, e.kind)) + '</div>' +
        '<h2 class="t-card" title="' + esc(e.title || "") + '">' + esc(shortTitle(e.title || r.path)) + '</h2>' + (mixTags ? '<div class="tags">' + mixTags + '</div>' : "") + '</div>' +
        (res && res.total != null ? '<div class="stack" style="align-items:flex-end;gap:0"><span class="xscore num"><b>' + esc(res.total) + '</b>/' + esc(res.max || marks) + '</span><span class="hint">' + Math.round(100 * res.total / (res.max || marks)) + '% · marks</span></div>' : "") +
        '<div class="stack s2" style="align-items:stretch">' + actions(r, st, on) + '</div></div>' +
        (rq.length ? '<div class="xqs">' + rq.map(function (q) { var src = (qs.filter(function (x) { return x.id === q.id; })[0] || {}).source, f = q.marks ? q.score / q.marks : 0, weak = q === worst && f < 0.6;
          return '<div class="xq' + (weak ? " weak" : "") + '"><span class="tag line">' + esc(q.label || q.id) + '</span><span class="tags">' + (src ? T.refTag(src) : "") + (weak ? tag("Weakest", "live") : "") + '</span><span class="bar' + (weak ? " live" : "") + '"><i style="width:' + Math.round(100 * f) + '%"></i></span><b class="num">' + (q.score != null ? esc(q.score) : "-") + '/' + esc(q.marks) + '</b></div>'; }).join("") + '</div>' : "") +
        notes(e) + '</section>'; };
    var asgCard = function (r) {
      if (r.error) return '<div class="card pad"><b>' + esc(r.path) + '</b><span class="hint">' + esc(r.error) + '</span></div>';
      var a = r.exam || {}, secs = a.sections || [], st = a.status || "draft", on = loaded[r.path], subs = {}, days = {};
      secs.forEach(function (s) { s.subject = s.subject === "chemistry" ? "chem" : s.subject; subs[s.subject] = 1; (days[s.day] = days[s.day] || { date: s.date, secs: [] }).secs.push(s); });
      var dk = Object.keys(days).sort(function (x, y) { return x - y; }), first = days[dk[0]] && days[dk[0]].date || a.opens, last = days[dk[dk.length - 1]] && days[dk[dk.length - 1]].date;
      var range = first && last ? (first.slice(0, 7) === last.slice(0, 7) ? +first.slice(8) + " to " + T.fmtDate(last).replace(/^\w+ /, "") : dmy(first) + " to " + dmy(last)) : "";
      var sc = a.scope || {}, facts = (a.facts || []).map(function (x) { return tag(esc(x)); }).join("");
      return '<section class="card xcard"><div class="xhead"><div class="stack s3" style="min-width:0;flex:1"><div class="tags">' + Object.keys(subs).map(T.subjTag).join("") + (range ? tag(esc(range)) : "") + tag(dk.length + " days") + tag(secs.length + " sections") + (on ? chip(on.status, "assignment") : tag(st === "ready" ? "Not sent yet" : T.cap(st), "dash")) + '</div>' +
        '<h2 class="t-card" title="' + esc(a.title || "") + '">' + esc(shortTitle(a.title || r.path)) + '</h2><div class="tags">' + tag("One link") + tag("Mark scheme opens after Done") + facts + '</div></div><div class="row s2">' + actions(r, st, on) + '</div></div>' +
        (sc.maths || sc.chem ? '<div class="xscope">' + ["maths", "chem"].filter(function (k) { return sc[k]; }).map(function (k) { return '<div class="tags"><span class="lab">' + (k === "maths" ? "Maths" : "Chemistry") + '</span>' + sc[k].map(function (x) { return tag(esc(x), k); }).join("") + '</div>'; }).join("") +
          ((a.leftOut || []).length ? '<div class="tags"><span class="lab">Left out</span>' + a.leftOut.map(function (x) { return tag(esc(x), "dash"); }).join("") + '</div>' : "") + ((a.todo || []).length ? '<div class="tags"><span class="lab">To do</span>' + a.todo.map(function (x) { return tag(esc(x), "live"); }).join("") + '</div>' : "") + '</div>' : "") +
        '<div class="xdays">' + dk.map(function (d) { var D = days[d];
          return '<div class="xday"><span class="tag day">Day ' + esc(d) + '</span><b>' + esc(D.date ? T.fmtDate(D.date) : "") + '</b><span class="row s2">' + D.secs.map(function (s) { return '<span class="dot ' + esc(s.subject) + '" title="' + esc(s.title || "") + '"></span>'; }).join("") + '<span class="hint">' + D.secs.reduce(function (m, s) { return m + (Number(s.suggestMin) || flatQs(s).reduce(function (a2, q) { return a2 + (Number(q.suggestMin) || 0); }, 0)); }, 0).toFixed(0) + ' min</span></span></div>'; }).join("") + '</div>' +
        notes(a) + '</section>'; };
    h += '<section class="stack"><h2 class="t-sec">Exams</h2>' + (exs.length ? exs.map(examCard).join("") : '<div class="empty"><b class="t-card">No exams yet</b><span class="hint">In the lesson chat, Claude proposes an exam when one is due, or ask: “make a test on chapter 5”.</span></div>') + '</section>';
    h += '<section class="stack"><h2 class="t-sec">Assignments</h2>' + (asgs.length ? asgs.map(asgCard).join("") : '<div class="empty"><b class="t-card">No take-home assignments yet</b></div>') + '</section>';
    var extra = server.filter(function (s) { return !s.sourcePath || !repo.some(function (r) { return r.path === s.sourcePath; }); });
    if (extra.length) h += '<section class="stack"><h2 class="t-sec">Only on the exam server</h2><div class="list">' + extra.map(function (s) {
      return '<a class="li xrow" href="#/exams/' + esc(s.id) + '"><div class="stack s2"><div class="tags">' + (s.subject ? T.subjTag(s.subject) : "") + chip(s.status, s.kind) + tag(s.questions + " questions") + tag(s.totalMarks + " marks") + '</div><b>' + esc(shortTitle(s.title)) + '</b></div><span class="hint">' + (s.startedAt ? "Taken " + esc(day(s.startedAt)) : "Loaded " + esc(day(s.createdAt))) + '</span></a>'; }).join("") + '</div></section>';
    app.innerHTML = h + '</div>';
}

/* Join a question's pictures into one (top to bottom), JPEG, small enough for the server. */
function stitch(urls) {
  return Promise.all(urls.map(function (u) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = u; }); })).then(function (ims) {
    // 1400 px wide is sharp on a laptop and a third of the bytes of 1800 (Ali, 8 Oct: loading was far too slow)
    var w = Math.min(1400, Math.max.apply(null, ims.map(function (i) { return i.naturalWidth; })));
    var hs = ims.map(function (i) { return Math.round(i.naturalHeight * w / i.naturalWidth); }), H = hs.reduce(function (a, b) { return a + b + 12; }, -12);
    var c = document.createElement("canvas"); c.width = w; c.height = H; var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, H);
    var y = 0; ims.forEach(function (im, k) { x.drawImage(im, 0, y, w, hs[k]); y += hs[k] + 12; });
    var q = 0.8;
    return (function go() { return new Promise(function (res) { c.toBlob(res, "image/jpeg", q); }).then(function (b) { if (b.size > 1500000 && q > 0.5) { q -= 0.1; return go(); } return b; }); })();
  });
}

function loadToServer(path, btn, practice) {
  btn.disabled = true; btn.textContent = "Loading…";
  var folder = examFolder(path);
  T.fileJSON(path).then(function (j) {
    var e = j.data, qs = flatQs(e), asg = isAsg(e);
    var marks = qs.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
    var ratio = Number(e.ratio) || null;
    var base = Number(e.minutes) || (ratio ? Math.ceil(marks * ratio / 5) * 5 : 0);
    var body = { title: e.title, subject: e.subject || "", source_path: path, ratio: ratio, base_minutes: asg ? 0 : base || 0,
      questions: qs.map(function (q, i) { return { id: q.id || "q" + (i + 1), label: q.label || "", text_html: q.text || "", marks: Number(q.marks) || 0, type: q.type || "long", suggested_min: q.suggestMin == null ? null : q.suggestMin, section_id: q.section_id || null, study: q.study || null }; }) };
    if (practice) { body.practice = true; body.title = "Practice: " + body.title; }
    if (asg) { body.kind = "assignment"; body.gap_hours = Number(e.gapHours) || 12; body.sections = e.sections.map(function (x) { return { id: x.id, title: x.title, subject: x.subject, day: x.day, date: x.date, suggest_min: x.suggestMin }; }); }
    var full = function (p) { return /^(students|books)\//.test(p) ? p : folder + p; };
    return call("POST", "/api/t/exams", body).then(function (made) {
      return sendPictures(made.id, e, path, null, function (t) { btn.textContent = t; })
        .then(function (left) { if (left) T.toast(left + " pictures did not load. Open the exam and press Finish loading pictures."); location.hash = "#/exams/" + made.id; });
    });
  }).catch(function (e) { btn.disabled = false; btn.textContent = practice ? "Load a practice copy" : "Load to exam server"; T.toast(e.message); });
}

/* The pictures of an exam or assignment, six at a time: each question's picture and, for an assignment, its mark
   scheme. With `have` (the server's questions), only the ones still missing, so a stopped load can be finished.
   Resolves with how many failed. */
function sendPictures(examId, e, path, have, say) {
  var folder = examFolder(path), asg = isAsg(e), qs = flatQs(e), full = function (p) { return /^(students|books)\//.test(p) ? p : folder + p; };
  var got = {}; (have || []).forEach(function (q) { got[q.id] = q; });
  var jobs = [];
  qs.forEach(function (q, i) {
    var id = q.id || "q" + (i + 1);
    if (q.img && q.img.length && !(have && got[id] && got[id].has_img)) jobs.push({ id: id, kind: "image", paths: q.img });
    if (asg && q.msImg && q.msImg.length && !(have && got[id] && got[id].has_ms)) jobs.push({ id: id, kind: "ms", paths: q.msImg });
  });
  var done = 0, failed = 0, next = 0, t0 = Date.now();
  var tell = function () { var el = (Date.now() - t0) / 1000, left = done ? Math.round(el / done * (jobs.length - done)) : 0;
    say("Pictures " + done + " of " + jobs.length + (done > 2 && left > 5 ? " · about " + (left > 90 ? Math.round(left / 60) + " min" : left + " s") + " left" : "")); };
  var one = function (job) {
    return Promise.all(job.paths.map(full).map(T.fileURL)).then(function (urls) { return stitch(urls.filter(Boolean)); })
      .then(function (b) { return call("PUT", "/api/t/exams/" + examId + "/questions/" + encodeURIComponent(job.id) + "/" + job.kind, b, { "Content-Type": "image/jpeg" }); })
      .catch(function () { failed++; });
  };
  var lane = function () { if (next >= jobs.length) return Promise.resolve(); var job = jobs[next++]; return one(job).then(function () { done++; tell(); return lane(); }); };
  tell();
  var lanes = []; for (var k = 0; k < Math.min(6, jobs.length); k++) lanes.push(lane());
  return Promise.all(lanes).then(function () { return failed; });
}

/* ===================== one exam: set up and run it ===================== */
var papers = [], myRatio = null;   // myRatio: the number typed in "My own number"

function examView(id) {
  app.innerHTML = '<div class="empty"><h3>Loading</h3></div>';
  Promise.all([call("GET", "/api/t/exams/" + encodeURIComponent(id)), call("GET", "/api/t/papers")]).then(function (r) {
    X = r[0]; papers = r[1]; myRatio = null; offset = X.serverNow - Date.now();
    drawExam(); poll(); missingPictures();
  }).catch(function (e) { app.innerHTML = '<div class="empty"><h3>Couldn’t open this exam</h3><p>' + esc(e.message) + '</p><p><a href="#/exams">Back to exams</a></p></div>'; });
}

/* a load that stopped half way (closed tab, lost connection): offer to send only the missing pictures */
function missingPictures() {
  if (!X || !X.sourcePath || X.practice || readOnly(X)) return;
  var mine = X;
  T.loadTree().then(function () { return T.fileJSON(X.sourcePath); }).then(function (j) {
    if (!j || X !== mine) return;
    var e = j.data, qs = flatQs(e), got = {}; X.questions.forEach(function (q) { got[q.id] = q; });
    var n = 0; qs.forEach(function (q) { var s = got[q.id]; if (!s) return; if (q.img && q.img.length && !s.has_img) n++; if (isAsg(e) && q.msImg && q.msImg.length && !s.has_ms) n++; });
    if (!n || $("#xt-miss")) return;
    var bar = document.createElement("div"); bar.id = "xt-miss"; bar.className = "card xt-card xt-claude";
    bar.innerHTML = '<div class="xt-grow"><b>' + n + ' picture' + (n === 1 ? " is" : "s are") + ' not loaded yet</b><p class="hint">The load stopped before the end. This sends only the missing ones.</p></div><button class="btn accent" type="button" data-finishpics>Finish loading pictures</button>';
    var head = $(".xt-head"); if (head) head.parentNode.insertBefore(bar, head.nextSibling);
    $("[data-finishpics]", bar).onclick = function () {
      var b = this; b.disabled = true;
      sendPictures(X.id, e, X.sourcePath, X.questions, function (t) { b.textContent = t; }).then(function (left) {
        T.toast(left ? left + " still failed: press again" : "All pictures loaded");
        examView(X.id);
      });
    };
  }, function () {});
}

function totalMarks() { return X.questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0); }
function paperRatio() { var on = papers.filter(function (p) { return !p.off; }); var m = 0, t = 0; on.forEach(function (p) { m += p.marks; t += p.minutes; }); return m ? t / m : null; }
function ratioNow() { var mode = T.ls("tutor.examRatioMode") || "papers"; if (mode === "number") return myRatio || X.ratio || 1.2; return paperRatio(); }
function link() { return X.token ? new URL("exam.html", location.href).href.split("#")[0] + "#t=" + X.token + (xapi() !== (window.EXAM_API || "").replace(/\/+$/, "") ? "&api=" + encodeURIComponent(xapi()) : "") : ""; }

function drawExam() {
  var st = X.status, started = X.startedAt != null || readOnly(X), total = totalMarks();
  var mode = T.ls("tutor.examRatioMode") || "papers", ratio = ratioNow() || 1.2, sugg = Math.ceil(total * ratio / 5) * 5;
  app.setAttribute("data-subject", X.subject || "");
  var asg = isAsg(X);
  document.body.classList.add("focus");
  var h = '<div class="wrap xexam"><header class="stack s3 xt-head"><div class="crumb"><a href="#/exams">Exams</a><span aria-hidden="true">/</span><span>' + esc(LABEL[st] || T.cap(st)) + '</span></div><div class="head"><div class="stack s2"><div class="tags">' + (X.subject ? T.subjTag(X.subject === "chemistry" ? "chem" : X.subject) : "") + T.tag(X.questions.length + " questions") + T.tag(total + " marks") + (asg ? T.tag((X.sections || []).length + " sections") : "") + '<span id="xt-st">' + chip(st, X.kind) + '</span></div><h1 class="t-title" title="' + esc(X.title) + '">' + esc(shortTitle(X.title)) + '</h1></div>' +
    '<div class="row s2"><a class="btn sm quiet" href="#/exams">All exams</a>' + svBtn(X.id) + '<a class="btn sm pri" href="#/exams/' + esc(X.id) + '/mark">Mark</a>' + (X.practice ? '<button class="btn sm danger" type="button" data-delprac="' + esc(X.id) + '" data-st="' + esc(st) + '">Delete</button>' : "") + '</div></div></header>';
  if (readOnly(X)) h += RO_NOTE.replace("Use a practice exam to try things.", 'Make a practice copy to try it as him.</div><div class="xt-acts"><button class="btn accent" type="button" data-praccopy="' + esc(X.id) + '">Practice copy</button>');
  else if (X.practice) h += '<p class="hint">Practice exam: nothing here goes to the tutoring repo.</p>';

  /* run it */
  h += '<div class="split"><section class="grow card pad-l stack s4 xt-run' + (st === "running" || st === "timeup" ? " on" : "") + '"><div class="row"><span class="status live" id="xt-seen"></span><span class="hint push num" id="xt-times"></span></div><div class="xt-big num" id="xt-left">' + (started ? "" : mins(X.baseMinutes || 0)) + '</div><div class="xt-btns" id="xt-btns"></div></section>';

  /* student link */
  h += '<section class="side-col card pad stack s3"><span class="lab">His link</span>' + (X.token
    ? '<div class="xt-linkrow"><input class="input" type="text" readonly id="xt-link" value="' + esc(link()) + '"><button class="btn sm pri" type="button" data-copy>Copy link</button><button class="btn sm" type="button" data-qr>QR code</button></div><span class="hint">It opens with no login. A new link stops the old one.</span><button class="btn sm quiet" type="button" data-newlink' + (st === "locked" || readOnly(X) ? " disabled" : "") + '>Make a new link</button><div id="xt-qr" class="xt-qrbox" hidden></div>'
    : '<p class="hint">' + (asg ? "Make the link when you are ready to send it. It opens straight away: there is no Start and no clock." : "Make the link when you are ready to send it. He sees a waiting screen until you press Start.") + '</p><button class="btn pri" type="button" data-newlink' + (readOnly(X) ? " disabled" : "") + '>Make student link</button>') + '<div class="tags">' + T.tag("Tablet: open the link") + T.tag("Phone: scan the code to send photos") + '</div></section></div>';

  if (asg) h += '<section class="card pad stack s3"><h2 class="t-sec">Days</h2><p class="hint">Day 1 opens with the link. Each next day opens this many hours after he first opens the day before. "Open this day now" on a day opens it at once.</p>' +
    '<div class="xt-linkrow"><label class="field xt-narrow" style="margin:0"><span>Hours between days</span><input type="number" id="xt-gap" min="0" max="240" step="1" value="' + esc(X.gapHours == null ? 12 : X.gapHours) + '"' + (readOnly(X) ? " disabled" : "") + '></label><button class="btn small" type="button" data-savegap' + (readOnly(X) ? " disabled" : "") + '>Save</button></div></section>';
  /* time suggestion (an assignment has no clock) */
  if (!asg) h += '<details class="card pad stack s3 xfold"' + (started ? "" : " open") + '><summary class="t-sec">Time</summary>' + (readOnly(X) && X.startedAt == null ? '<p>Exam time: <b>' + esc(mins(X.baseMinutes || 0)) + '</b> for ' + total + ' marks.</p>' : started ? '<p>Set at the start: <b>' + esc(mins(X.baseMinutes)) + '</b> for ' + total + ' marks. Use the + buttons above to add time.</p>' :
    '<div class="xt-ratio"><div class="xt-seg" role="group" aria-label="Where the minutes per mark come from"><button type="button" class="chip" data-rmode="papers" aria-pressed="' + (mode === "papers") + '">From past papers</button><button type="button" class="chip" data-rmode="number" aria-pressed="' + (mode === "number") + '">Other amount</button></div>' +
    (mode === "number"
      ? '<div class="field xt-narrow"><label for="xt-ratio">Minutes per mark</label><input type="number" id="xt-ratio" step="0.05" min="0.1" value="' + esc(myRatio || X.ratio || 1.2) + '"></div>'
      : '<table class="xt-table"><thead><tr><th></th><th>Past paper</th><th>Marks</th><th>Minutes</th><th></th></tr></thead><tbody>' + papers.map(function (p, i) {
          return '<tr><td><input type="checkbox" data-paper="' + i + '"' + (p.off ? "" : " checked") + ' aria-label="Use this paper"></td><td>' + esc(p.label) + '</td><td class="num">' + p.marks + '</td><td class="num">' + p.minutes + '</td><td>' + (T.isTry ? "" : '<button class="btn small" type="button" data-delpaper="' + p.id + '" aria-label="Remove ' + esc(p.label) + '">Remove</button>') + '</td></tr>';
        }).join("") + (T.isTry ? "" : '<tr class="xt-add"><td></td><td><input type="text" id="pp-l" placeholder="e.g. Edexcel Paper 2 2022"></td><td><input type="number" id="pp-m" placeholder="100" min="1"></td><td><input type="number" id="pp-t" placeholder="120" min="1"></td><td><button class="btn small" type="button" data-addpaper>Add</button></td></tr>') + '</tbody></table>') +
    '<p class="xt-sugg">' + (ratioNow() ? 'That is <b>' + r2(ratio) + ' min per mark</b>. For ' + total + ' marks: <b>' + sugg + ' min</b> suggested.' : 'Tick a past paper or enter a number.') + ' <button class="btn small" type="button" data-usesugg>Use suggestion</button></p>' +
    '<div class="field xt-narrow"><label for="xt-dur">Exam time (minutes)</label><input class="input" type="number" id="xt-dur" min="1" step="1" value="' + esc(X.baseMinutes || sugg) + '"></div></div>') + '</details>';

  /* questions: a list once he has started; a table to set marks, type and minutes before */
  var lastSec = null;
  if (started) h += '<section class="stack"><h2 class="t-sec">Questions</h2><div class="list">' + X.questions.map(function (q, i) { var head = "";
      if (asg && q.section_id !== lastSec) { lastSec = q.section_id; var sc = (X.sections || []).filter(function (x) { return x.id === q.section_id; })[0] || {};
        head = '<div class="xsec"><b>' + esc(sc.title || q.section_id) + '</b>' + (sc.date ? T.tag(esc(T.fmtDate(sc.date))) : "") + '<span class="hint" data-secst="' + esc(q.section_id) + '">' + secState(sc, true) + '</span></div>'; }
      return head + '<div class="xq run" data-q="' + esc(q.id) + '" data-qrow><span class="tag line">' + esc(q.label) + '</span><span class="tags">' + T.tag((TYPES.filter(function (x) { return x[0] === q.type; })[0] || ["", ""])[1]) + '</span>' + T.tag(esc(q.marks) + " marks") + '<span class="hint" data-saved>-</span></div>'; }).join("") + '</div></section>';
  else h += '<details class="card pad stack s3 xfold" open><summary class="t-sec">Questions <span class="hint">' + X.questions.length + ' · ' + total + ' marks</span></summary><div class="xt-scroll"><table class="xt-table xt-qs"><thead><tr><th>#</th><th>Question</th><th>Marks</th><th>Type</th><th>Minutes</th><th>Saved, time on it</th></tr></thead><tbody>' +
    X.questions.map(function (q, i) {
      var ro = started ? " disabled" : "", head = "";
      if (asg && q.section_id !== lastSec) { lastSec = q.section_id; var sc = (X.sections || []).filter(function (x) { return x.id === q.section_id; })[0] || {};
        head = '<tr class="xt-secrow"><td colspan="6"><b>' + esc(sc.title || q.section_id) + '</b>' + (sc.date ? ' <span class="hint">' + esc(sc.date) + '</span>' : "") + ' · <span data-secst="' + esc(q.section_id) + '">' + secState(sc, true) + '</span></td></tr>'; }
      return head + '<tr data-q="' + esc(q.id) + '" data-qrow><td>' + (i + 1) + '</td><td><b>' + esc(q.label) + '</b>' + (q.has_img ? '<div><img class="xt-thumb" alt="Question picture" data-xsrc="/api/t/exams/' + esc(X.id) + '/questions/' + esc(q.id) + '/image"></div>' : "") + '</td>' +
        '<td><input type="number" class="xt-in" data-f="marks" min="0" step="0.5" value="' + esc(q.marks) + '"' + ro + '></td>' +
        '<td><select data-f="type"' + ro + '>' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (q.type === t[0] ? " selected" : "") + '>' + t[1] + '</option>'; }).join("") + '</select></td>' +
        '<td><input type="number" class="xt-in" data-f="suggested_min" min="0" step="0.5" value="' + esc(q.suggested_min == null ? r2(q.marks * ratio) : q.suggested_min) + '"' + ro + '></td><td class="hint" data-saved></td></tr>';
    }).join("") + '</tbody></table></div><div class="row"><button class="btn pri" type="button" data-savesetup>Save changes</button><span class="hint" id="xt-msg"></span></div></details>';

  /* log */
  h += '<details class="fold"><summary>Log</summary><ul class="xt-log" id="xt-log"></ul></details></div>';
  app.innerHTML = h;
  showPics(app); drawRun(); drawLog();
}

function secState(sc, withBtn) {
  if (!sc) return "";
  if (sc.doneAt != null) return "Finished " + esc(day(sc.doneAt)) + " " + esc(t12(sc.doneAt)) + (sc.tookMin != null ? ", stopwatch " + esc(sc.tookMin) + " min" : "");
  if (sc.open === false) return (sc.opensAt ? "Opens " + esc(day(sc.opensAt)) + " " + esc(t12(sc.opensAt)) : "Not open yet (waits for him to open the day before)") + (withBtn && X && X.id && !readOnly(X) ? ' <button class="btn small" type="button" data-release="' + esc(sc.id) + '">Open this day now</button>' : "");
  return sc.openedAt != null ? "Opened " + esc(day(sc.openedAt)) + " " + esc(t12(sc.openedAt)) : "Open, not looked at yet";
}
function drawRun() {
  var st = X.status, b = $("#xt-btns"); if (!b) return;
  $("#xt-st").innerHTML = chip(st, X.kind);
  var html = "";
  if (readOnly(X)) { b.innerHTML = '<p class="hint">Look only in Try-out.</p>'; b.setAttribute("data-k", ""); }
  else if (isAsg(X)) {
    var nd = (X.sections || []).filter(function (x) { return x.doneAt != null; }).length;
    if (st === "draft" || st === "waiting") html = '<p class="hint">Make the student link (below). It opens at once.</p>';
    if (st === "running" || st === "timeup") html = '<p><b>Open.</b> No clock: he can use it any time until you close it. ' + nd + ' of ' + (X.sections || []).length + ' sections done.</p><a class="btn accent" href="#/exams/' + esc(X.id) + '/mark">Mark the done ones</a> <button class="btn danger" type="button" data-lock>Close it (lock)</button>';
    if (st === "locked") html = '<p><b>Closed ' + esc(day(X.lockedAt)) + ' ' + esc(t12(X.lockedAt)) + '.</b> ' + nd + ' sections done.</p><a class="btn accent" href="#/exams/' + esc(X.id) + '/mark">Mark it</a> <button class="btn" type="button" data-reopen>Reopen</button>';
    if (b.getAttribute("data-k") !== st + html.length) { b.innerHTML = html; b.setAttribute("data-k", st + html.length); }
  }
  else {
  if (st === "draft") html = '<p class="hint">Make the student link first (below).</p>';
  if (st === "waiting") html = '<button class="btn accent xt-start" type="button" data-start>Start the exam</button><p class="hint">' + (X.lastSeenAt && Date.now() + offset - X.lastSeenAt < 10000 ? "He has the exam open and is waiting." : "He hasn’t opened the link yet.") + '</p>';
  if (st === "running" || st === "timeup") html = (st === "timeup" ? '<p class="xt-up">Time is up. Add time or lock.</p>' : "") +
    '<div class="xt-add"><button class="btn" type="button" data-ext="5">+5 min</button><button class="btn" type="button" data-ext="10">+10 min</button><input type="number" id="xt-custom" min="1" max="600" step="1" placeholder="min" aria-label="Minutes to add"><button class="btn" type="button" data-extc>Add</button></div>' +
    '<button class="btn danger" type="button" data-lock>Lock the exam</button>';
  if (st === "submitted") html = '<p><b>He handed in at ' + esc(t12(X.submittedAt)) + '.</b></p><a class="btn accent" href="#/exams/' + esc(X.id) + '/mark">Mark it</a> <button class="btn" type="button" data-lock>Lock</button> <button class="btn" type="button" data-reopen>Reopen</button>';
  if (st === "locked") html = '<p><b>Locked at ' + esc(t12(X.lockedAt)) + '.</b></p><a class="btn accent" href="#/exams/' + esc(X.id) + '/mark">Mark it</a> <button class="btn" type="button" data-reopen>Reopen</button>';
  if (b.getAttribute("data-k") !== st + html.length) { b.innerHTML = html; b.setAttribute("data-k", st + html.length); }
  }
  var tm = $("#xt-times");
  if (tm) tm.textContent = isAsg(X) ? (X.startedAt ? "Opened " + day(X.startedAt) + " " + t12(X.startedAt) : "") : X.startedAt ? "Started " + t12(X.startedAt) + " · original end " + t12(X.originalEndAt) + (X.endAt !== X.originalEndAt ? " · now ends " + t12(X.endAt) : "") : "";
  var seen = $("#xt-seen");
  if (seen) { var ago = X.lastSeenAt ? Math.round((Date.now() + offset - X.lastSeenAt) / 1000) : null; var onq = X.on ? X.questions.map(function (q) { return q.id; }).indexOf(X.on) : -1;
    seen.innerHTML = ago == null ? "Not opened by him yet" : ago < 10 ? '<span class="xt-on"></span>He is connected' + (onq >= 0 ? " · on question " + (onq + 1) : "") : "Last seen " + (ago < 120 ? ago + " s" : Math.round(ago / 60) + " min") + " ago"; }
  tickClock();
}

function tickClock() {
  var el = $("#xt-left"); if (!el || !X) return;
  if (isAsg(X)) { el.textContent = X.status === "locked" ? "Closed" : X.startedAt ? "Open" : "Not sent"; el.className = "xt-big num"; return; }
  if (!X.startedAt) return;
  if (X.status === "submitted" || X.status === "locked") { el.textContent = X.status === "locked" ? "Locked" : "Handed in"; el.className = "xt-big num"; return; }
  var left = X.endAt - (Date.now() + offset);
  if (left <= 0) { el.textContent = "Time up"; el.className = "xt-big num up"; if (X.status === "running") { X.status = "timeup"; drawRun(); } return; }
  var s = Math.ceil(left / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  el.textContent = (hh ? hh + ":" + String(mm).padStart(2, "0") : mm) + ":" + String(ss).padStart(2, "0");
  el.className = "xt-big num" + (left < 5 * 60000 ? " soon" : "");
}
setInterval(function () { if (X && (location.hash || "").indexOf("#/exams/" + X.id) === 0 && !/\/mark$/.test(location.hash)) tickClock(); }, 500);

var EVT = { release: "You opened early:", done: "He finished", created: "Loaded to the exam server", link: "Student link made", "new-link": "New student link (old one stopped)", start: "Started", extend: "Time added", timeup: "Time up", submit: "He handed in", lock: "Locked", reopen: "Reopened", "remove-picture": "He removed a picture" };
function drawLog() {
  var ul = $("#xt-log"); if (!ul) return;
  ul.innerHTML = (X.events || []).slice().reverse().map(function (e) {
    var what = e.kind === "extend" ? e.detail + " at " + t12(e.at) : (EVT[e.kind] || e.kind) + (e.kind === "start" ? " (" + e.detail + ")" : e.kind === "done" ? " " + ((X.sections || []).filter(function (x) { return x.id === e.detail; }).map(function (x) { return x.title; })[0] || e.detail) : "");
    if (isAsg(X)) return '<li><span class="num">' + esc(day(e.at)) + ' ' + esc(t12(e.at)) + '</span> ' + esc(what) + '</li>';
    return '<li><span class="num">' + esc(t12(e.at)) + '</span> ' + esc(what) + '</li>';
  }).join("") || '<li class="hint">Nothing yet.</li>';
}

function poll() {
  stop();
  if (!X) return;
  call("GET", "/api/t/exams/" + X.id + "/live").then(function (d) {
    offset = d.serverNow - Date.now();
    var secSig = function (l) { return JSON.stringify((l || []).map(function (x) { return x.doneAt; })); };
    var changed = d.status !== X.status || d.endAt !== X.endAt || (d.sections && secSig(d.sections) !== secSig(X.sections));
    ["status", "startedAt", "originalEndAt", "endAt", "submittedAt", "lockedAt", "lastSeenAt", "extensions"].forEach(function (k) { X[k] = d[k]; });
    X.on = d.on; if (d.sections) { X.sections = d.sections; d.sections.forEach(function (x) { var el = $('[data-secst="' + x.id + '"]'); if (el) { var nh = secState(x, true); if (el.getAttribute("data-h") !== nh) { el.innerHTML = nh; el.setAttribute("data-h", nh); } } }); }
    drawRun();
    $$("[data-qrow]").forEach(function (tr) { var qid = tr.getAttribute("data-q"), p = d.perQuestion[qid], c = $("[data-saved]", tr); if (!c) return;
      var bits = [];
      if (p && p.lastSave) bits.push("Text " + esc(t12(p.lastSave)) + (p.late ? ' <span class="xt-late">Late</span>' : ""));
      if (p && p.pictures) bits.push(p.pictures + " picture" + (p.pictures > 1 ? "s" : ""));
      if (p && p.seconds) bits.push('<span class="xt-time">' + esc(dur(p.seconds)) + (p.visits > 1 ? " · " + p.visits + " visits" : "") + '</span>');
      if (d.on === qid) bits.push('<span class="xt-now">He is on it now</span>');
      c.innerHTML = bits.join(tr.tagName === "TR" ? "<br>" : " \u00b7 ") || "-"; tr.classList.toggle("xt-here", d.on === qid); });
    if (changed) call("GET", "/api/t/exams/" + X.id).then(function (full) { X.events = full.events; drawLog(); });
  }).catch(function () { var s = $("#xt-seen"); if (s) s.textContent = "Can’t reach the exam server. Retrying."; }).then(function () {
    if (X && (location.hash || "").indexOf("#/exams/" + X.id) === 0 && !/\/mark$/.test(location.hash)) live = setTimeout(poll, X.status === "running" || X.status === "timeup" || X.status === "waiting" ? 2500 : 10000);
  });
}

function act(path, body, okMsg) {
  return call("POST", "/api/t/exams/" + X.id + path, body).then(function (r) { if (okMsg) T.toast(okMsg); return call("GET", "/api/t/exams/" + X.id).then(function (full) { X = full; offset = full.serverNow - Date.now(); drawExam(); poll(); return r; }); })
    .catch(function (e) { T.toast(e.message); });
}

function saveSetup() {
  var qs = X.questions.map(function (q) {
    var tr = $('tr[data-q="' + q.id + '"]');
    return { id: q.id, label: q.label, text_html: q.text_html, marks: Number($('[data-f="marks"]', tr).value) || 0, type: $('[data-f="type"]', tr).value, suggested_min: Number($('[data-f="suggested_min"]', tr).value) };
  });
  var body = { questions: qs, ratio: ratioNow() };
  var dur = Number($("#xt-dur") && $("#xt-dur").value); if (dur > 0) body.base_minutes = dur;
  $("#xt-msg").textContent = "Saving…";
  return call("PUT", "/api/t/exams/" + X.id, body).then(function () { return call("GET", "/api/t/exams/" + X.id); }).then(function (full) { X = full; drawExam(); T.toast("Saved"); })
    .catch(function (e) { $("#xt-msg").textContent = e.message; });
}

function useSuggestion() {
  var ratio = ratioNow(); if (!ratio) { T.toast("Tick a past paper or enter a number first"); return; }
  $("#xt-dur").value = Math.ceil(totalMarks() * ratio / 5) * 5;
  $$('tr[data-q]').forEach(function (tr) { var m = Number($('[data-f="marks"]', tr).value) || 0; $('[data-f="suggested_min"]', tr).value = r2(m * ratio); });
  T.toast("Suggestion filled in. Press Save changes.");
}

/* ===================== marking ===================== */
var repoExam = null, claudeMarks = null;

function markView(id) {
  app.innerHTML = '<div class="empty"><h3>Loading</h3></div>';
  call("GET", "/api/t/exams/" + encodeURIComponent(id) + "/review").then(function (r) {
    R = r; repoExam = null; claudeMarks = null;
    if (r.practice && !r.sourcePath) { repoExam = SAMPLE; return drawMark(); }
    // The mark scheme lives in the repo, next to the exam file Claude wrote; so do Claude's marks, once he has marked it.
    return T.loadTree().then(function () { return r.sourcePath ? Promise.all([T.fileJSON(r.sourcePath), T.fileJSON(examFolder(r.sourcePath) + "claude-marks.json").catch(function () { return null; })]) : [null, null]; })
      .then(function (j) { repoExam = j[0] && j[0].data; claudeMarks = j[1] && j[1].data; }, function () {}).then(drawMark);
  }).catch(function (e) { app.innerHTML = '<div class="empty"><h3>Couldn’t open the marking</h3><p>' + esc(e.message) + '</p><p><a href="#/exams">Back to exams</a></p></div>'; });
}

function lateSplit(q) {
  if (!q.writtenLate) return esc(q.final);
  if (q.atOriginalEnd && q.final.indexOf(q.atOriginalEnd) === 0) return esc(q.atOriginalEnd) + '<mark class="xt-latetext" title="Written after the original end time">' + esc(q.final.slice(q.atOriginalEnd.length)) + '</mark>';
  return '<mark class="xt-latetext" title="Changed after the original end time">' + esc(q.final) + '</mark>';
}

function drawMark() {
  var folder = R.sourcePath ? examFolder(R.sourcePath) : "";
  var rq = {}; flatQs(repoExam).forEach(function (q) { rq[q.id] = q; });
  app.setAttribute("data-subject", R.subject || "");
  var asg = isAsg(R), secs = R.sections || [], filt = asg ? T.ls("tutor.asgFilter") || "done" : "all";
  document.body.classList.add("focus");
  var ext = (R.extensions || []).reduce(function (a, e) { return a + (+e.minutes || 0); }, 0);
  var h = '<div class="xmark"><header class="stack s2 xt-head"><div class="crumb"><a href="#/exams">Exams</a><span aria-hidden="true">/</span><a href="#/exams/' + esc(R.id) + '">' + esc(shortTitle(R.title)) + '</a><span aria-hidden="true">/</span><span>Mark</span></div><div class="head" style="align-items:center"><div class="stack s2"><h1 class="t-title">' + esc(shortTitle(R.title)) + '</h1><div class="tags">' +
    (R.subject ? T.subjTag(R.subject === "chemistry" ? "chem" : R.subject) : "") + chip(R.status, R.kind) + (R.submittedAt ? T.tag("Handed in " + esc(t12(R.submittedAt))) : "") + (ext ? T.tag(ext + " min added") : "") + (R.lockedAt ? T.tag("Locked " + esc(t12(R.lockedAt))) : "") + '</div></div>' +
    '<div class="row s2">' + (asg ? "" : '<button class="btn sm" type="button" data-compare-cur>Side by side</button>') + (claudeMarks ? '<button class="btn sm accent-soft" type="button" data-acceptall' + (readOnly(R) ? " disabled" : "") + '>Accept all Claude’s marks</button>' : "") + svBtn(R.id) + '</div></div></header>';
  /* the footer: total, marked count, previous / next, save */
  var foot = '<footer class="botbar xmfoot"><span class="row s2"><span class="hint">Total</span><b class="num" id="xt-total">' + r2(R.total) + ' / ' + R.max + '</b><span class="tag ok num" id="xt-marked">' + R.marked + ' of ' + R.questions.length + ' marked</span></span><span class="hint" id="xt-repomsg"></span>' +
    '<button class="btn push" type="button" data-mqstep="-1">Previous</button><button class="btn" type="button" data-mqstep="1">Next</button>' +
    (R.practice ? '<span class="hint">Practice exam: marks stay on the exam server only.</span>' : '<button class="btn pri" type="button" data-torepo' + (T.isTry ? " disabled title=\"Try-out mode: nothing is saved\"" : "") + '>Save to tutoring repo</button>') + '</footer>';
  if (readOnly(R)) h += RO_NOTE;
  if (claudeMarks) h += '<div class="card pad row xt-claude"><div class="stack s2" style="flex:1"><div class="tags">' + T.tag("Claude\u2019s marks", "chem") + T.tag(esc(r2(claudeTotal())) + " / " + R.max) + '</div>' + (claudeMarks.summary ? '<span class="hint">' + esc(claudeMarks.summary) + '</span>' : "") + '</div></div>';
  if (!asg && (R.status === "running" || R.status === "timeup" || R.status === "waiting")) h += '<div class="tags">' + T.tag("Still open: answers may change", "live") + '</div>';
  if (asg) h += '<div class="xt-filter"><label for="xt-asgf">Show</label><select id="xt-asgf" data-asgf><option value="done"' + (filt === "done" ? " selected" : "") + '>Sections he has done</option><option value="all"' + (filt === "all" ? " selected" : "") + '>All sections</option>' +
    secs.map(function (x) { return '<option value="' + esc(x.id) + '"' + (filt === x.id ? " selected" : "") + '>' + esc(x.title) + (x.doneAt != null ? " (done)" : "") + '</option>'; }).join("") + '</select>' +
    '<span class="hint">He is marked on what he had when he pressed Done. Anything changed after Done is shown separately: he did it with the mark scheme open.</span></div>';
  var lastSec = null, nIn = 0, shown = 0, vis = [];
  var body = R.questions.map(function (q, i) {
    var r = rq[q.id] || {}, ms = (r.msImg || []).map(function (p) { return /^(students|books)\//.test(p) ? p : folder + p; });
    var head = "";
    if (asg) {
      var sc = secs.filter(function (x) { return x.id === q.section; })[0] || {};
      if (filt === "done" ? sc.doneAt == null : filt !== "all" && filt !== q.section) return "";
      if (q.section !== lastSec) { lastSec = q.section; nIn = 0; head = '<h2 class="xt-sech">' + esc(sc.title || q.section) + ' <span class="hint">' + secState(sc) + '</span></h2>'; }
      nIn++;
    }
    shown++; vis.push({ q: q, i: i, r: r, sec: asg ? (secs.filter(function (x) { return x.id === q.section; })[0] || {}).title : "" });
    return head + '<section class="xt-mq stack s4" data-mq="' + esc(q.id) + '" data-mqi="' + i + '"><div class="row"><span class="tag line">' + esc(q.label || "Q" + (i + 1)) + '</span>' + (r.source ? T.refTag(r.source) : "") + T.tag(q.marks + " mark" + (q.marks === 1 ? "" : "s")) + '<button class="btn sm push" type="button" data-compare="' + i + '" title="His work beside the mark scheme, full screen">Side by side</button></div>' +
      '<div class="xt-3">' +
        '<div class="xt-col"><div class="xt-lab">Question</div><div class="xt-qtext">' + T.clean(q.text_html) + '</div>' + (q.has_img ? '<img class="xt-zoomable" alt="Question picture" data-xsrc="/api/t/exams/' + esc(R.id) + '/questions/' + esc(q.id) + '/image">' : "") + '</div>' +
        '<div class="xt-col"><div class="xt-lab">His work' + (q.finalAt ? ' <span class="hint">Last saved ' + esc(t12(q.finalAt)) + '</span>' : "") + (q.writtenLate ? ' <span class="xt-late">Part written late</span>' : "") + '</div>' + timeLine(q) +
          (asg ? (q.final ? '<div class="xt-ans">' + esc(q.final) + '</div>' : '<p class="hint">No typed answer.</p>') + (q.doneAt == null ? '<p class="hint">He has not finished this part yet.</p>' : "")
            : q.final ? '<div class="xt-ans">' + lateSplit(q) + '</div>' : '<p class="hint">No typed answer.</p>') +
          (q.writtenLate ? '<details class="xt-det"><summary>What he had at the original end time (' + esc(t12(R.originalEndAt)) + ')</summary><div class="xt-ans">' + (q.atOriginalEnd ? esc(q.atOriginalEnd) : '<span class="hint">Nothing yet</span>') + '</div></details>' : "") +
          (q.revisions.length > 1 ? '<details class="xt-det"><summary>' + q.revisions.length + ' saves</summary><ul class="xt-log">' + q.revisions.map(function (v) { return '<li><span class="num">' + esc(t12(v.at)) + '</span> ' + (v.late ? '<span class="xt-late">Late</span> ' : "") + esc(v.text.length > 90 ? v.text.slice(0, 90) + "…" : v.text) + '</li>'; }).join("") + '</ul></details>' : "") +
          (q.uploads.length ? '<div class="xt-pics">' + q.uploads.map(function (u) { return '<figure><img class="xt-zoomable" alt="His picture" data-xsrc="/api/t/files/' + esc(u.id) + '"><figcaption>' + esc(u.source === "phone" ? "Phone" : u.source === "drawing" ? "Drawing" : "Picture") + " " + esc(t12(u.at)) + (u.late ? ' <span class="xt-late">Late</span>' : "") + (u.practice ? ' <span class="xt-late">Practice</span>' : "") + '</figcaption></figure>'; }).join("") + '</div>' : (q.type === "upload_required" ? '<p class="xt-up">No picture, but this question needed one.</p>' : "")) +
        '</div>' +
        '<div class="xt-col"><div class="xt-lab">Mark scheme</div>' + (ms.length ? ms.map(function (p) { return '<img class="xt-zoomable" alt="Mark scheme" data-rsrc="' + esc(p) + '">'; }).join("") : '<p class="hint">' + (repoExam ? "No mark scheme picture for this question." : "The exam file isn’t in the repo, so no mark scheme.") + '</p>') +
          (r.answer ? '<div class="xt-qtext">' + T.clean(r.answer) + '</div>' : "") + '</div>' +
      '</div>' +
      (asg && (q.practiceText || q.uploads.some(function (u) { return u.practice; })) ? '<details class="xt-det xt-after"><summary>He solved it again after finishing (practice, not for marks)</summary>' + (q.practiceText ? '<div class="xt-ans">' + esc(q.practiceText) + '</div>' : "") + '</details>' : "") +
      (asg ? '<div class="xt-notebox"><label for="nt-' + esc(q.id) + '"><b>Note to him</b> <span class="hint">He sees it as soon as it saves' + (studyText(q.study) ? "; if he lost marks he also sees: " + esc(studyText(q.study)) : "") + '</span></label><textarea id="nt-' + esc(q.id) + '" data-note="' + esc(q.id) + '" rows="2"' + (readOnly(R) ? " disabled" : "") + '>' + esc(q.note || "") + '</textarea></div>' : "") +
      '<div data-tsumline>' + tickSummary(q) + '</div>' + '<div data-cline="' + esc(q.id) + '">' + claudeLine(q) + '</div>' +
      '<div class="xt-markrow"><label>Mark <span class="xt-of"><input type="number" class="xt-score" data-score="' + esc(q.id) + '" min="0" max="' + q.marks + '" step="0.5" value="' + (q.score == null ? "" : q.score) + '"' + (readOnly(R) ? " disabled" : "") + '> / ' + q.marks + '</span></label>' +
        '<label class="xt-grow">Comment <textarea data-comment="' + esc(q.id) + '" rows="2"' + (readOnly(R) ? " disabled" : "") + '>' + esc(q.comment || "") + '</textarea></label><span class="hint" data-mstate="' + esc(q.id) + '"></span></div>' +
    '</section>';
  }).join("");
  var cur = vis.some(function (v) { return v.i === R.cur; }) ? R.cur : vis.length ? vis[0].i : -1; R.cur = cur;
  var list = '<nav class="xmlist" aria-label="Questions">' + vis.map(function (v) { return '<button type="button" class="xml" data-mqgo="' + v.i + '"' + (v.i === cur ? ' aria-current="true"' : "") + '><span class="tag line">' + esc(v.q.label || "Q" + (v.i + 1)) + '</span><span class="stack" style="gap:0;min-width:0"><b>' + esc(v.sec || (v.r.source || "").replace(/\s*\([^)]*\)/g, "").slice(0, 34) || "Question " + (v.i + 1)) + '</b></span><b class="num" data-lscore="' + esc(v.q.id) + '">' + (v.q.score == null ? "-" : esc(v.q.score)) + '/' + esc(v.q.marks) + '</b></button>'; }).join("") + '</nav>';
  h += '<div class="xmbody">' + list + '<div class="xmmain">' + body + (asg && !shown ? '<div class="empty"><b class="t-card">' + (filt === "done" ? "He hasn\u2019t pressed Done on any section yet." : "Nothing to show.") + '</b></div>' : "") + '</div></div></div>' + foot;
  app.innerHTML = h; markShow();
  showPics(app); showRepoPics(app); $$(".xt-qtext", app).forEach(T.maths);
}

function markShow() { $$(".xt-mq").forEach(function (s) { s.hidden = +s.getAttribute("data-mqi") !== R.cur; }); $$("[data-mqgo]").forEach(function (b) { if (+b.getAttribute("data-mqgo") === R.cur) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }); }
document.addEventListener("click", function (e) { if (!R || !e.target.closest) return; var g = e.target.closest("[data-mqgo]"); if (g) { R.cur = +g.getAttribute("data-mqgo"); markShow(); window.scrollTo(0, 0); return; }
  var s = e.target.closest("[data-mqstep]"); if (s) { var is = $$(".xt-mq").map(function (x) { return +x.getAttribute("data-mqi"); }), k = is.indexOf(R.cur) + +s.getAttribute("data-mqstep"); if (k >= 0 && k < is.length) { R.cur = is[k]; markShow(); window.scrollTo(0, 0); } return; }
  if (e.target.closest("[data-compare-cur]")) compare(R.cur); });
/* ---- Claude's marks: claude-marks.json {markedAt, summary, questions: {qid: {score, ticks, comment, unsure}}} ---- */
function claudeOf(qid) { return claudeMarks && claudeMarks.questions && claudeMarks.questions[qid] || null; }
function claudeTotal() { return R.questions.reduce(function (a, q) { var c = claudeOf(q.id); return a + (c && c.score != null ? Number(c.score) : 0); }, 0); }
function sameAsClaude(q) { var c = claudeOf(q.id); return c && q.score != null && Number(c.score) === q.score && (q.comment || "") === (c.comment || ""); }
function claudeLine(q) {
  var c = claudeOf(q.id); if (!c) return "";
  var sc = schemeOf(q), t = c.ticks && c.ticks.length === sc.list.length ? sc.list.map(function (it, k) { return c.ticks[k] ? (it.code || it.text) + (it.val > 1 && c.ticks[k] < it.val ? " (" + c.ticks[k] + " of " + it.val + ")" : "") : ""; }).filter(Boolean).join(", ") : "";
  var done = sameAsClaude(q);
  return '<div class="xt-cmark' + (done ? " ok" : "") + '"><div class="xt-grow"><b>Claude: ' + esc(c.score) + ' / ' + q.marks + '</b>' + (t ? ' <span class="hint">' + esc(t) + '</span>' : "") +
    (c.comment ? '<div>' + esc(c.comment) + '</div>' : "") + (c.unsure ? '<div class="xt-unsure">Not sure: ' + esc(c.unsure) + '</div>' : "") + '</div>' +
    (done ? '<span class="xt-now">Accepted</span>' : '<button class="btn small accent" type="button" data-accept="' + esc(q.id) + '"' + (readOnly(R) ? " disabled" : "") + '>Accept Claude\u2019s mark</button>') + '</div>';
}
/* put Claude's mark, ticks and comment into the page's fields and save them as Ali's */
function acceptClaude(qid) {
  var q = R.questions.filter(function (x) { return x.id === qid; })[0], c = claudeOf(qid); if (!q || !c || readOnly(R)) return Promise.resolve();
  var se = $('[data-score="' + qid + '"]'), ce = $('[data-comment="' + qid + '"]'); if (!se) return Promise.resolve();
  se.value = c.score == null ? "" : c.score; ce.value = c.comment || "";
  var ticks = c.ticks && c.ticks.length === schemeOf(q).list.length ? c.ticks.map(Number) : null;
  return saveMark(qid, ticks).then(function () { refreshClaude(qid); if (cmp && R.questions[Number(cmp.getAttribute("data-i"))].id === qid) compare(Number(cmp.getAttribute("data-i"))); });
}
function refreshClaude(qid) { var q = R.questions.filter(function (x) { return x.id === qid; })[0]; $$('[data-cline="' + qid + '"]').forEach(function (el) { el.innerHTML = claudeLine(q); }); }
function acceptAll(btn) {
  var differ = R.questions.filter(function (q) { var c = claudeOf(q.id); return c && q.score != null && Number(c.score) !== q.score; }).length;
  if (differ && !confirm(differ + " question" + (differ === 1 ? " has" : "s have") + " your own mark already. Replace with Claude’s?")) return;
  btn.disabled = true;
  var chain = Promise.resolve();
  R.questions.forEach(function (q) { if (claudeOf(q.id)) chain = chain.then(function () { return acceptClaude(q.id); }); });
  chain.then(function () { btn.disabled = false; T.toast("Claude’s marks accepted. Press Save to tutoring repo when you are happy."); });
}

/* "Time on it: 6 min 20 s over 2 visits" with each visit behind a fold */
function timeLine(q) {
  var v = q.visits || [];
  if (!v.length) return R.startedAt ? '<p class="hint xt-tline">Time on it: not recorded</p>' : "";
  return '<details class="xt-det xt-tline"><summary>Time on it: ' + esc(dur(q.seconds)) + (v.length > 1 ? " over " + v.length + " visits" : "") + '</summary><ul class="xt-log">' +
    v.map(function (x) { return '<li><span class="num">' + esc(t12(x.from)) + '</span> ' + esc(dur((x.to - x.from) / 1000)) + '</li>'; }).join("") + '</ul></details>';
}

/* Compare: one question's answer beside its mark scheme, full screen. Left and right arrows move between questions, Esc closes.
   The mark and comment here are the same as on the page (saved the same way). */
/* The question's mark list: exam.json "scheme" [{part, code, text}], each line worth the number in its code
   (B2 = 2). Without one, one box per mark. */
function repoQ(qid) { return flatQs(repoExam).filter(function (x) { return x.id === qid; })[0] || {}; }
function schemeOf(q) {
  var sc = repoQ(q.id).scheme;
  if (sc && sc.length) return { list: sc.map(function (x) { return { part: x.part || "", code: x.code || "", text: x.text || "", val: Number(String(x.code || "").replace(/\D/g, "")) || 1 }; }) };
  var l = []; for (var k = 0; k < Math.ceil(q.marks); k++) l.push({ part: "", code: "", text: "Mark " + (k + 1), val: 1 });
  return { list: l, generic: true };
}
function ticksOf(q, sc) { return q.ticks && q.ticks.length === sc.list.length ? q.ticks.slice() : sc.list.map(function () { return 0; }); }
function tickSummary(q) {
  if (!q.ticks || !q.ticks.some(function (t) { return t > 0; })) return "";
  var sc = schemeOf(q); if (q.ticks.length !== sc.list.length) return "";
  return '<p class="hint xt-tsum">Ticked: ' + sc.list.map(function (it, k) { return q.ticks[k] ? esc((it.code || it.text) + (it.val > 1 && q.ticks[k] < it.val ? " (" + q.ticks[k] + " of " + it.val + ")" : "")) : ""; }).filter(Boolean).join(", ") + '</p>';
}
function tickRows(sc, ticks, ro) {
  var last = null;
  return sc.list.map(function (it, k) {
    var head = it.part && it.part !== last ? '<div class="xt-tpart">' + esc(it.part) + '</div>' : ""; last = it.part || last;
    var given = ticks[k] || 0;
    var ctl = it.val > 1
      ? '<span class="xt-tvals" role="group" aria-label="Marks for ' + esc(it.code) + '">' + Array.apply(null, Array(it.val + 1)).map(function (_, v) { return '<button type="button" class="chip" data-tickv="' + k + ':' + v + '" aria-pressed="' + (given === v) + '"' + (ro ? " disabled" : "") + '>' + v + '</button>'; }).join("") + '</span>'
      : '<input type="checkbox" data-tick="' + k + '"' + (given ? " checked" : "") + (ro ? " disabled" : "") + ' aria-label="' + esc(it.code || it.text) + '">';
    var tag = it.val > 1 ? "div" : "label";   // a label would send a click on its text to the first number button
    return head + '<' + tag + ' class="xt-trow' + (it.val > 1 ? " multi" : "") + (given ? " on" : "") + '">' + ctl + (it.code ? '<b class="xt-tcode">' + esc(it.code) + '</b>' : "") + '<span class="xt-ttext">' + esc(it.text) + '</span></' + tag + '>';
  }).join("");
}

var cmp = null, cmpTicks = null;
function compare(i) {
  var q = R.questions[i]; if (!q) return;
  var folder = R.sourcePath ? examFolder(R.sourcePath) : "", rq = {};
  flatQs(repoExam).forEach(function (x) { rq[x.id] = x; });
  var r = rq[q.id] || {}, ms = (r.msImg || []).map(function (p) { return /^(students|books)\//.test(p) ? p : folder + p; }), ro = readOnly(R);
  var sc = schemeOf(q); cmpTicks = ticksOf(q, sc);
  if (!cmp) { cmp = document.createElement("div"); cmp.className = "xt-cmp"; cmp.setAttribute("role", "dialog"); cmp.setAttribute("aria-modal", "true"); cmp.setAttribute("aria-label", "Compare answer and mark scheme"); document.body.appendChild(cmp); }
  cmp.setAttribute("data-i", i);
  var subj = /chem/i.test(R.subject || "") ? "chem" : "maths";
  cmp.innerHTML = '<header class="xt-cmphead"><button class="btn sm" type="button" data-cmpx><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>Back to marking</button><div class="tags">' + T.subjTag(subj) + T.tag(esc(shortTitle(R.title))) + T.tag("Side by side") + T.tag(q.marks + " mark" + (q.marks === 1 ? "" : "s")) + (q.seconds ? T.tag(esc(dur(q.seconds)) + " on it") : "") + '</div><span class="xt-grow"></span>' +
      '<div class="seg xt-cmpseg" role="group" aria-label="Questions">' + R.questions.map(function (x, k) { return '<button type="button" data-cmpgo="' + k + '"' + (k === i ? ' aria-pressed="true"' : "") + '>' + esc(x.label || "Q" + (k + 1)) + '</button>'; }).join("") + '</div></header>' +
    '<details class="xt-cmpq"><summary>The question</summary><div class="xt-qtext">' + T.clean(q.text_html) + '</div>' + (q.has_img ? '<img class="xt-zoomable" alt="Question picture" data-xsrc="/api/t/exams/' + esc(R.id) + '/questions/' + esc(q.id) + '/image">' : "") + '</details>' +
    '<div class="xt-cmp2"><section class="xt-col card"><h2 class="t-sec">His work</h2>' +
        (q.doneAt != null ? (q.atDone ? '<div class="xt-ans">' + esc(q.atDone) + '</div>' : "") + (q.changedAfterDone ? '<details class="xt-det xt-after"><summary>Changed after Done: not for marks</summary><div class="xt-ans">' + esc(q.final) + '</div></details>' : "")
          : q.final ? '<div class="xt-ans">' + lateSplit(q) + '</div>' : "") +
        q.uploads.map(function (u) { return '<figure class="xt-cmppic"><img class="xt-zoomable" alt="His picture" data-xsrc="/api/t/files/' + esc(u.id) + '"><figcaption class="hint">' + esc(u.source === "phone" ? "Phone" : u.source === "drawing" ? "Drawing" : "Picture") + " " + esc(t12(u.at)) + (u.late ? ' <span class="xt-late">Late</span>' : "") + (u.practice ? ' <span class="xt-late">Practice</span>' : "") + '</figcaption></figure>'; }).join("") +
        (!q.final && !q.uploads.length ? '<p class="hint">No answer and no picture.</p>' : "") + '</section>' +
      '<section class="xt-col card xt-ticks"><div class="row"><h2 class="t-sec">Mark scheme</h2><span class="hint push" data-tsum></span></div>' + (ms.length ? ms.map(function (p) { return '<img class="xt-zoomable" alt="Mark scheme" data-rsrc="' + esc(p) + '">'; }).join("") : '<p class="hint">No mark scheme picture.</p>') +
        (r.answer ? '<div class="xt-qtext xt-msans">' + T.clean(r.answer) + '</div>' : "") +
        (claudeOf(q.id) ? '<div data-cline="' + esc(q.id) + '">' + claudeLine(q) + '</div>' : "") + (sc.generic ? '<p class="hint">No mark list in the exam file: one box per mark.</p>' : "") + '<div data-tlist>' + tickRows(sc, cmpTicks, ro) + '</div>' +
        '<div class="xt-markrow"><label>Mark <span class="xt-of"><input type="number" class="xt-score" data-cscore="' + esc(q.id) + '" min="0" max="' + q.marks + '" step="0.5" value="' + (q.score == null ? "" : q.score) + '"' + (ro ? " disabled" : "") + '> / ' + q.marks + '</span></label>' +
        '<label class="xt-grow">Comment <textarea data-ccomment="' + esc(q.id) + '" rows="2"' + (ro ? " disabled" : "") + '>' + esc(q.comment || "") + '</textarea></label><span class="hint" data-cstate></span></div></section></div>';
  showPics(cmp); showRepoPics(cmp); $$(".xt-qtext", cmp).forEach(T.maths);
  tickTotal();
  document.documentElement.classList.add("xt-noscroll");
  var f = $("[data-cscore]", cmp); if (f && !ro) f.focus({ preventScroll: true });
}
function closeCompare() {
  if (!cmp) return;
  var i = Number(cmp.getAttribute("data-i")); cmp.remove(); cmp = null; document.documentElement.classList.remove("xt-noscroll");
  var sec = $$("[data-mq]")[i]; if (sec) sec.scrollIntoView({ block: "start" });
}
function tickTotal() { var t = $("[data-tsum]", cmp); if (t) t.textContent = cmpTicks.reduce(function (a, b) { return a + b; }, 0) + " ticked"; }
/* a tick or an untick: the mark becomes the sum of the ticks (you can still type a different mark) */
function setTick(k, v) {
  if (!cmp || readOnly(R)) return;
  var q = R.questions[Number(cmp.getAttribute("data-i"))], sc = schemeOf(q);
  cmpTicks[k] = Math.max(0, Math.min(sc.list[k].val, v));
  $("[data-tlist]", cmp).innerHTML = tickRows(sc, cmpTicks, false);
  var sum = cmpTicks.reduce(function (a, b) { return a + b; }, 0);
  $('[data-cscore="' + q.id + '"]', cmp).value = Math.min(sum, q.marks);
  tickTotal(); compareSave(q.id, cmpTicks.slice());
}
/* copy the Compare box into the page's own fields, then save as usual */
function compareSave(qid, ticks) {
  var s = $('[data-cscore="' + qid + '"]', cmp), c = $('[data-ccomment="' + qid + '"]', cmp), ps = $('[data-score="' + qid + '"]'), pc = $('[data-comment="' + qid + '"]'), st = $("[data-cstate]", cmp);
  if (!s || !ps) return;
  ps.value = s.value; pc.value = c.value; saveMark(qid, ticks);
  var mine = $('[data-mstate="' + qid + '"]'); if (st && mine) { st.textContent = "Saving…"; setTimeout(function () { if (cmp && st) st.textContent = mine.textContent; }, 900); }
}
window.addEventListener("hashchange", function () { closeCompare(); });
document.addEventListener("keydown", function (e) {
  if (!cmp || !$("#zoom").hidden) return;
  if (e.key === "Escape") { closeCompare(); return; }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  var i = Number(cmp.getAttribute("data-i"));
  if (e.key === "ArrowRight" && i < R.questions.length - 1) compare(i + 1);
  if (e.key === "ArrowLeft" && i > 0) compare(i - 1);
});

var markTimers = {};
function studyText(st) { if (!st) return ""; if (st.videos && st.videos.length) return "Maths Genie " + st.videos.length + " videos (" + (st.chapter || "") + ")"; if (st.pages) return st.pages.map(function (p) { return p.topic + " " + p.pages; }).join("; "); return ""; }
function saveMark(qid, ticks) {
  var se = $('[data-score="' + qid + '"]'), ce = $('[data-comment="' + qid + '"]'), st = $('[data-mstate="' + qid + '"]');
  if (!se || !ce || !st) return Promise.resolve();   // the marking page was left; an earlier save already kept the comment
  var s = se.value, c = ce.value;
  if (readOnly(R)) return Promise.resolve();
  var q = R.questions.filter(function (x) { return x.id === qid; })[0];
  var score = s === "" ? null : Number(s);
  if (score != null && (score < 0 || score > q.marks)) { st.textContent = "0 to " + q.marks; return Promise.resolve(); }
  st.textContent = "Saving…";
  var body = { score: score, comment: c }; if (ticks) body.ticks = ticks;
  var ne = $('[data-note="' + qid + '"]'); if (ne) body.note = ne.value;
  return call("PUT", "/api/t/exams/" + R.id + "/marks/" + encodeURIComponent(qid), body).then(function () {
    q.score = score; q.comment = c; st.textContent = "Saved"; if (body.note != null) q.note = body.note;
    if (ticks) { q.ticks = ticks; var ts = $('[data-mq="' + qid + '"] [data-tsumline]'); if (ts) ts.innerHTML = tickSummary(q); }
    R.total = R.questions.reduce(function (a, x) { return a + (x.score || 0); }, 0); R.marked = R.questions.filter(function (x) { return x.score != null; }).length;
    var tot = $("#xt-total"), mk = $("#xt-marked");   // gone if the marking page was left before the save came back
    if (tot) tot.textContent = r2(R.total) + " / " + R.max; if (mk) mk.textContent = R.marked + " of " + R.questions.length + " marked";
    var ls = $('[data-lscore="' + qid + '"]'); if (ls) ls.textContent = (score == null ? "-" : score) + "/" + q.marks;
    if (claudeOf(qid)) refreshClaude(qid);
  }, function (e) { st.textContent = e.message; });
}

/* Copy everything into students/<s>/exams/<folder>/result.json and work/ so Claude can close the exam. */
function saveToRepo(btn) {
  if (T.isTry || R.practice) return;
  var msg = $("#xt-repomsg");
  var folder = R.sourcePath ? examFolder(R.sourcePath) : T.studentBase() + "exams/" + new Date(R.startedAt || Date.now()).toISOString().slice(0, 10) + "-" + (R.subject || "exam") + "-" + R.id + "/";
  btn.disabled = true;
  var files = [], i = 0;
  R.questions.forEach(function (q, qi) { q.uploads.forEach(function (u, k) { files.push({ u: u, path: folder + "work/q" + (qi + 1) + "-" + (k + 1) + (u.mime === "image/png" ? ".png" : u.mime === "image/webp" ? ".webp" : ".jpg") }); }); });
  var result = {
    examId: R.id, kind: R.kind || "exam", sections: R.sections ? R.sections.map(function (x) { return { id: x.id, title: x.title, doneAt: iso(x.doneAt), tookMin: x.tookMin }; }) : undefined, title: R.title, subject: R.subject, source: R.sourcePath || null, savedAt: new Date().toISOString(),
    startedAt: iso(R.startedAt), originalEndAt: iso(R.originalEndAt), endAt: iso(R.endAt), submittedAt: iso(R.submittedAt), lockedAt: iso(R.lockedAt), status: R.status,
    extensions: (R.extensions || []).map(function (e) { return { minutes: e.minutes, at: iso(e.at) }; }),
    total: r2(R.total), max: R.max, marked: R.marked, claudeMarks: claudeMarks ? { total: r2(claudeTotal()), markedAt: claudeMarks.markedAt || null } : null,
    questions: R.questions.map(function (q) {
      return { id: q.id, label: q.label, marks: q.marks, type: q.type, score: q.score, comment: q.comment, final: q.final, finalAt: iso(q.finalAt), atOriginalEnd: q.atOriginalEnd, writtenLate: q.writtenLate,
        note: q.note || undefined, practiceText: q.practiceText || undefined,
        section: q.section || undefined, doneAt: q.doneAt != null ? iso(q.doneAt) : undefined, atDone: q.doneAt != null ? q.atDone : undefined, changedAfterDone: q.doneAt != null ? q.changedAfterDone : undefined,
        revisions: q.revisions.map(function (v) { return { at: iso(v.at), late: v.late, text: v.text, afterDone: v.afterDone || undefined }; }),
        pictures: files.filter(function (f) { return f.u.question === q.id; }).map(function (f) { return { file: f.path.slice(folder.length), source: f.u.source, at: iso(f.u.at), late: f.u.late, afterDone: f.u.afterDone || undefined, practice: f.u.practice || undefined }; }),
        ticks: q.ticks ? (function (sc) { return sc.list.length === q.ticks.length ? sc.list.map(function (it, k) { return { part: it.part, code: it.code || it.text, given: q.ticks[k], of: it.val }; }) : q.ticks; })(schemeOf(q)) : null,
        seconds: q.seconds || 0, visits: (q.visits || []).map(function (v) { return { from: iso(v.from), to: iso(v.to), seconds: Math.round((v.to - v.from) / 1000) }; }) };
    }),
    events: (R.events || []).map(function (e) { return { at: iso(e.at), kind: e.kind, detail: e.detail }; })
  };
  T.loadTree(true).then(function () {
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        msg.textContent = "Picture " + (++i) + " of " + files.length;
        if (T.shaOf(f.path)) return;   // already in the repo
        return call("GET", "/api/t/files/" + f.u.id).then(function (b) { return b.arrayBuffer(); }).then(function (buf) {
          var bytes = new Uint8Array(buf), bin = ""; for (var j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
          return T.putB64(f.path, btoa(bin), "Exam " + R.title + ": his picture " + f.path.split("/").pop());
        });
      });
    });
    return chain.then(function () {
      msg.textContent = "Saving the results";
      var p = folder + "result.json";
      return T.putB64(p, T.b64enc(JSON.stringify(result, null, 1) + "\n"), "Exam " + R.title + ": results " + r2(R.total) + "/" + R.max, T.shaOf(p));
    });
  }).then(function () { msg.textContent = "Saved to " + folder + "result.json. Ask Claude to close the exam."; btn.disabled = false; T.toast("Saved to the tutoring repo"); },
    function (e) { msg.textContent = e.message; btn.disabled = false; });
}
function iso(ms) { return ms == null ? null : new Date(ms).toISOString(); }

/* ===================== events ===================== */
document.addEventListener("click", function (e) {
  if ((location.hash || "").indexOf("#/exams") !== 0) return;
  var b = e.target.closest && e.target.closest("button, img.xt-zoomable"); if (!b) return;
  if (b.tagName === "IMG") { if (b.src) { $("#zimg").src = b.src; $("#zoom").hidden = false; } return; }
  if (b.hasAttribute("data-compare")) return compare(Number(b.getAttribute("data-compare")));
  if (b.hasAttribute("data-cmpgo")) return compare(Number(b.getAttribute("data-cmpgo")));
  if (b.hasAttribute("data-cmpx")) return closeCompare();
  if (b.hasAttribute("data-accept")) return acceptClaude(b.getAttribute("data-accept"));
  if (b.hasAttribute("data-acceptall")) return acceptAll(b);
  if (b.hasAttribute("data-tickv")) { var kv = b.getAttribute("data-tickv").split(":"); return setTick(Number(kv[0]), Number(kv[1])); }
  if (b.hasAttribute("data-practice")) return makePractice(b);
  if (b.hasAttribute("data-delprac")) return deletePractice(b.getAttribute("data-delprac"), b.getAttribute("data-st"));
  if (b.hasAttribute("data-pracload")) return loadToServer(b.getAttribute("data-pracload"), b, true);
  if (b.hasAttribute("data-praccopy")) { b.disabled = true; b.textContent = "Copying…"; return call("POST", "/api/t/exams/" + encodeURIComponent(b.getAttribute("data-praccopy")) + "/practice-copy").then(function (r) { T.toast("Practice copy made"); location.hash = "#/exams/" + r.id; }, function (e) { b.disabled = false; b.textContent = "Practice copy"; T.toast(e.message); }); }
  if (T.isTry && b.hasAttribute("data-load")) return;
  if (b.hasAttribute("data-load")) return loadToServer(b.getAttribute("data-load"), b);
  if (X && readOnly(X) && b.matches("[data-newlink],[data-start],[data-ext],[data-extc],[data-lock],[data-reopen],[data-savesetup],[data-usesugg]")) return;
  if (T.isTry && b.matches("[data-addpaper],[data-delpaper]")) return;
  if (b.hasAttribute("data-newlink")) { if (X.token && !confirm("Make a new link? The old link will stop working.")) return; return act("/link", undefined, "Link ready"); }
  if (b.hasAttribute("data-copy")) { var l = $("#xt-link"); l.select(); (navigator.clipboard ? navigator.clipboard.writeText(l.value) : Promise.reject()).then(function () { T.toast("Link copied"); }, function () { document.execCommand("copy"); T.toast("Link copied"); }); return; }
  if (b.hasAttribute("data-qr")) { var box = $("#xt-qr"); box.hidden = !box.hidden; if (!box.hidden && window.qrcode) { var q = qrcode(0, "M"); q.addData(link()); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } return; }
  if (b.hasAttribute("data-start")) { if (!confirm("Start the exam now? His timer starts at once.")) return; return act("/start", undefined, "Started"); }
  if (b.hasAttribute("data-ext")) return act("/extend", { minutes: Number(b.getAttribute("data-ext")) }, "+" + b.getAttribute("data-ext") + " min added");
  if (b.hasAttribute("data-extc")) { var n = Number($("#xt-custom").value); if (!(n > 0)) { T.toast("Type the minutes first"); return; } return act("/extend", { minutes: n }, "+" + n + " min added"); }
  if (b.hasAttribute("data-lock")) { if (!confirm("Lock the exam? He can't change anything after this. (You can reopen it.)")) return; return act("/lock", undefined, "Locked"); }
  if (b.hasAttribute("data-reopen")) return act("/reopen", undefined, "Reopened");
  if (b.hasAttribute("data-savesetup")) return saveSetup();
  if (b.hasAttribute("data-savegap")) { var g = Number($("#xt-gap").value); return call("PUT", "/api/t/exams/" + X.id, { gap_hours: g }).then(function () { X.gapHours = g; T.toast("Days now open " + g + " h apart"); }, function (er) { T.toast(er.message); }); }
  if (b.hasAttribute("data-release")) { if (!confirm("Open this day for him now?")) return; return act("/sections/" + encodeURIComponent(b.getAttribute("data-release")) + "/release", undefined, "Day opened"); }
  if (b.hasAttribute("data-usesugg")) return useSuggestion();
  if (b.hasAttribute("data-rmode")) { T.ls("tutor.examRatioMode", b.getAttribute("data-rmode")); drawExam(); return; }
  if (b.hasAttribute("data-addpaper")) {
    var body = { label: $("#pp-l").value.trim() || "Past paper", marks: Number($("#pp-m").value), minutes: Number($("#pp-t").value) };
    call("POST", "/api/t/papers", body).then(function () { return call("GET", "/api/t/papers"); }).then(function (p) { papers = p; drawExam(); }, function (er) { T.toast(er.message); }); return;
  }
  if (b.hasAttribute("data-delpaper")) { call("DELETE", "/api/t/papers/" + b.getAttribute("data-delpaper")).then(function () { return call("GET", "/api/t/papers"); }).then(function (p) { papers = p; drawExam(); }); return; }
  if (b.hasAttribute("data-torepo")) return saveToRepo(b);
});
document.addEventListener("change", function (e) {
  if ((location.hash || "").indexOf("#/exams") !== 0) return;
  var t = e.target;
  if (t.hasAttribute("data-paper")) { papers[Number(t.getAttribute("data-paper"))].off = !t.checked; drawExam(); return; }
  if (t.id === "xt-ratio") { myRatio = Number(t.value) || null; drawExam(); return; }
  if (t.hasAttribute("data-score")) { saveMark(t.getAttribute("data-score")); return; }
  if (t.hasAttribute("data-comment")) { saveMark(t.getAttribute("data-comment")); return; }
  if (t.hasAttribute("data-tick")) { setTick(Number(t.getAttribute("data-tick")), t.checked ? 1 : 0); return; }
  if (t.hasAttribute("data-note")) { saveMark(t.getAttribute("data-note")); return; }
  if (t.hasAttribute("data-asgf")) { T.ls("tutor.asgFilter", t.value); drawMark(); return; }
  if (t.hasAttribute("data-cscore")) { compareSave(t.getAttribute("data-cscore")); return; }
  if (t.hasAttribute("data-ccomment")) { compareSave(t.getAttribute("data-ccomment")); return; }
});
document.addEventListener("input", function (e) {
  var t = e.target; if (!t.hasAttribute) return;
  if (t.hasAttribute("data-note")) { var nid = t.getAttribute("data-note"); clearTimeout(markTimers["n" + nid]); markTimers["n" + nid] = setTimeout(function () { saveMark(nid); }, 1200); return; }
  if (t.hasAttribute("data-ccomment")) { var cid = t.getAttribute("data-ccomment"); clearTimeout(markTimers["c" + cid]); markTimers["c" + cid] = setTimeout(function () { compareSave(cid); }, 1200); return; }
  if (!t.hasAttribute("data-comment")) return;
  var id = t.getAttribute("data-comment"); clearTimeout(markTimers[id]); markTimers[id] = setTimeout(function () { saveMark(id); }, 1200);
});

/* The tab may have been opened before this file arrived. */
if ((location.hash || "").indexOf("#/exams") === 0) T.render();
})();
