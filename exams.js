/* Exams tab: load an exam Claude built in the repo onto the exam server, run it live, then mark it.
   #/exams            exams Claude wrote (students/<s>/exams/<id>/exam.json) and exams on the server
   #/exams/<id>       time suggestion, student link, Start, + minutes, Lock, live saves, log
   #/exams/<id>/mark  question | answer + pictures + times | mark scheme, marks and comments, Save to repo
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
  var opts = { method: method, headers: h, cache: "no-store" };
  if (body instanceof Blob) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  return fetch(xapi() + path, opts).then(function (r) {
    var ct = r.headers.get("Content-Type") || "";
    return (ct.indexOf("json") >= 0 ? r.json() : r.blob()).then(function (d) { if (!r.ok) { var e = new Error((d && d.error) || "Exam server " + r.status); e.status = r.status; throw e; } return d; });
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
var LABEL = { draft: "Not opened", waiting: "Waiting", running: "Running", timeup: "Time up", submitted: "Handed in", locked: "Locked", proposed: "Proposed", ready: "Ready" };
function chip(st) { return '<span class="xt-chip xt-' + esc(st) + '">' + esc(LABEL[st] || st) + '</span>'; }
var TYPES = [["short", "Short answer"], ["long", "Long answer"], ["upload_required", "Picture needed"], ["upload_optional", "Picture optional"]];

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
function examFolder(path) { return path.replace(/exam\.json$/, ""); }

function listView() {
  app.innerHTML = '<div class="section-h"><h2>Exams</h2></div><div class="empty"><h3>Loading</h3></div>';
  var base = T.studentBase() + "exams/";
  Promise.all([
    T.loadTree().then(function (tree) {
      var files = tree.filter(function (t) { return t.path.indexOf(base) === 0 && /\/exam\.json$/.test(t.path) && t.path.slice(base.length).split("/").length === 2; });
      return Promise.all(files.map(function (f) { return T.fileJSON(f.path).then(function (j) { return { path: f.path, exam: j && j.data }; }, function (e) { return { path: f.path, error: e.message }; }); }));
    }),
    call("GET", "/api/t/exams")
  ]).then(function (res) {
    var repo = res[0].sort(function (a, b) { return b.path.localeCompare(a.path); }), server = res[1];
    var loaded = {}; server.forEach(function (s) { if (s.sourcePath) loaded[s.sourcePath] = s; });
    var h = '<div class="section-h"><h2>Exams</h2></div>';
    h += '<h3 class="xt-h3">From Claude</h3>';
    if (!repo.length) h += '<div class="empty"><p>No exams yet. In the lesson chat, Claude proposes an exam when one is due, or ask: <i>“make a test on chapter 5”</i>.</p></div>';
    else h += '<div class="xt-list">' + repo.map(function (r) {
      if (r.error) return '<div class="card xt-row"><div><b>' + esc(r.path) + '</b><p class="hint">' + esc(r.error) + '</p></div></div>';
      var e = r.exam || {}, qs = e.questions || [], marks = qs.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0), st = e.status || "draft", on = loaded[r.path];
      return '<div class="card xt-row" data-subject="' + esc(e.subject || "") + '"><div class="xt-grow"><div class="xt-title">' + esc(e.title || r.path) + ' ' + chip(st) + '</div>' +
        '<div class="hint">' + qs.length + ' question' + (qs.length === 1 ? "" : "s") + ' · ' + marks + ' marks' + (e.date ? " · " + esc(e.date) : "") + '</div>' +
        (e.why ? '<p class="xt-why">' + esc(e.why) + '</p>' : "") + '</div><div class="xt-acts">' +
        (on ? '<a class="btn small" href="#/exams/' + esc(on.id) + '">Open</a>'
            : st === "ready" ? '<button class="btn small accent" type="button" data-load="' + esc(r.path) + '">Load to exam server</button>'
            : '<span class="hint">Finish it with Claude first (status “ready”)</span>') +
        '</div></div>';
    }).join("") + '</div>';
    h += '<h3 class="xt-h3">On the exam server</h3>';
    if (!server.length) h += '<p class="hint">Nothing loaded yet.</p>';
    else h += '<div class="xt-list">' + server.map(function (s) {
      return '<a class="card xt-row xt-link" href="#/exams/' + esc(s.id) + '" data-subject="' + esc(s.subject || "") + '"><div class="xt-grow"><div class="xt-title">' + esc(s.title) + ' ' + chip(s.status) + '</div>' +
        '<div class="hint">' + s.questions + ' questions · ' + s.totalMarks + ' marks · ' + (s.startedAt ? "taken " + esc(day(s.startedAt)) : "loaded " + esc(day(s.createdAt))) + '</div></div></a>';
    }).join("") + '</div>';
    app.innerHTML = h;
  }).catch(function (e) { app.innerHTML = '<div class="section-h"><h2>Exams</h2></div><div class="empty"><h3>Couldn’t load exams</h3><p>' + esc(e.message) + '</p><p>Check the exam server and password in <a href="#/settings">Settings</a>.</p></div>'; });
}

/* Join a question's pictures into one (top to bottom), JPEG, small enough for the server. */
function stitch(urls) {
  return Promise.all(urls.map(function (u) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = u; }); })).then(function (ims) {
    var w = Math.min(1800, Math.max.apply(null, ims.map(function (i) { return i.naturalWidth; })));
    var hs = ims.map(function (i) { return Math.round(i.naturalHeight * w / i.naturalWidth); }), H = hs.reduce(function (a, b) { return a + b + 12; }, -12);
    var c = document.createElement("canvas"); c.width = w; c.height = H; var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, H);
    var y = 0; ims.forEach(function (im, k) { x.drawImage(im, 0, y, w, hs[k]); y += hs[k] + 12; });
    var q = 0.88;
    return (function go() { return new Promise(function (res) { c.toBlob(res, "image/jpeg", q); }).then(function (b) { if (b.size > 1800000 && q > 0.5) { q -= 0.12; return go(); } return b; }); })();
  });
}

function loadToServer(path, btn) {
  btn.disabled = true; btn.textContent = "Loading…";
  var folder = examFolder(path);
  T.fileJSON(path).then(function (j) {
    var e = j.data, qs = e.questions || [];
    var marks = qs.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
    var ratio = Number(e.ratio) || null;
    var base = Number(e.minutes) || (ratio ? Math.ceil(marks * ratio / 5) * 5 : 0);
    var body = { title: e.title, subject: e.subject || "", source_path: path, ratio: ratio, base_minutes: base || 0,
      questions: qs.map(function (q, i) { return { id: q.id || "q" + (i + 1), label: q.label || "", text_html: q.text || "", marks: Number(q.marks) || 0, type: q.type || "long", suggested_min: q.suggestMin == null ? null : q.suggestMin }; }) };
    return call("POST", "/api/t/exams", body).then(function (made) {
      var chain = Promise.resolve();
      qs.forEach(function (q, i) {
        var imgs = (q.img || []).map(function (p) { return /^(students|books)\//.test(p) ? p : folder + p; });
        if (!imgs.length) return;
        chain = chain.then(function () {
          btn.textContent = "Pictures " + (i + 1) + "/" + qs.length;
          return Promise.all(imgs.map(T.fileURL)).then(function (urls) { return stitch(urls.filter(Boolean)); })
            .then(function (b) { return call("PUT", "/api/t/exams/" + made.id + "/questions/" + encodeURIComponent(body.questions[i].id) + "/image", b, { "Content-Type": "image/jpeg" }); });
        });
      });
      return chain.then(function () { location.hash = "#/exams/" + made.id; });
    });
  }).catch(function (e) { btn.disabled = false; btn.textContent = "Load to exam server"; T.toast(e.message); });
}

/* ===================== one exam: set up and run it ===================== */
var papers = [], myRatio = null;   // myRatio: the number typed in "My own number"

function examView(id) {
  app.innerHTML = '<div class="empty"><h3>Loading</h3></div>';
  Promise.all([call("GET", "/api/t/exams/" + encodeURIComponent(id)), call("GET", "/api/t/papers")]).then(function (r) {
    X = r[0]; papers = r[1]; myRatio = null; offset = X.serverNow - Date.now();
    drawExam(); poll();
  }).catch(function (e) { app.innerHTML = '<div class="empty"><h3>Couldn’t open this exam</h3><p>' + esc(e.message) + '</p><p><a href="#/exams">Back to exams</a></p></div>'; });
}

function totalMarks() { return X.questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0); }
function paperRatio() { var on = papers.filter(function (p) { return !p.off; }); var m = 0, t = 0; on.forEach(function (p) { m += p.marks; t += p.minutes; }); return m ? t / m : null; }
function ratioNow() { var mode = T.ls("tutor.examRatioMode") || "papers"; if (mode === "number") return myRatio || X.ratio || 1.2; return paperRatio(); }
function link() { return X.token ? new URL("exam.html", location.href).href.split("#")[0] + "#t=" + X.token + (xapi() !== (window.EXAM_API || "").replace(/\/+$/, "") ? "&api=" + encodeURIComponent(xapi()) : "") : ""; }

function drawExam() {
  var st = X.status, started = X.startedAt != null, total = totalMarks();
  var mode = T.ls("tutor.examRatioMode") || "papers", ratio = ratioNow() || 1.2, sugg = Math.ceil(total * ratio / 5) * 5;
  app.setAttribute("data-subject", X.subject || "");
  var h = '<div class="section-h xt-head"><h2>' + esc(X.title) + '</h2><span id="xt-st">' + chip(st) + '</span><span class="xt-grow"></span><a class="btn small" href="#/exams">All exams</a><a class="btn small" href="#/exams/' + esc(X.id) + '/mark">Mark</a></div>';

  /* run it */
  h += '<section class="card xt-card xt-run"><div class="xt-clock"><div class="xt-big num" id="xt-left">' + (started ? "" : mins(X.baseMinutes || 0)) + '</div><div class="hint" id="xt-times"></div><div class="hint" id="xt-seen"></div></div><div class="xt-btns" id="xt-btns"></div></section>';

  /* student link */
  h += '<section class="card xt-card"><h3>Student link</h3>' + (X.token
    ? '<div class="xt-linkrow"><input type="text" readonly id="xt-link" value="' + esc(link()) + '"><button class="btn small accent" type="button" data-copy>Copy</button><button class="btn small" type="button" data-qr>QR</button></div><p class="hint">Send this to him. It opens the exam with no login. Making a new link stops the old one.</p><button class="btn small" type="button" data-newlink' + (st === "locked" ? " disabled" : "") + '>Make a new link</button><div id="xt-qr" class="xt-qrbox" hidden></div>'
    : '<p class="hint">Make the link when you are ready to send it. He sees a waiting screen until you press Start.</p><button class="btn accent" type="button" data-newlink>Make student link</button>') + '</section>';

  /* time suggestion */
  h += '<section class="card xt-card"><h3>Time</h3>' + (started ? '<p>Set at the start: <b>' + esc(mins(X.baseMinutes)) + '</b> for ' + total + ' marks. Use the + buttons above to add time.</p>' :
    '<div class="xt-ratio"><div class="xt-seg" role="group" aria-label="Where the minutes per mark come from"><button type="button" class="chip" data-rmode="papers" aria-pressed="' + (mode === "papers") + '">From past papers</button><button type="button" class="chip" data-rmode="number" aria-pressed="' + (mode === "number") + '">My own number</button></div>' +
    (mode === "number"
      ? '<div class="field xt-narrow"><label for="xt-ratio">Minutes per mark</label><input type="number" id="xt-ratio" step="0.05" min="0.1" value="' + esc(myRatio || X.ratio || 1.2) + '"></div>'
      : '<table class="xt-table"><thead><tr><th></th><th>Past paper</th><th>Marks</th><th>Minutes</th><th></th></tr></thead><tbody>' + papers.map(function (p, i) {
          return '<tr><td><input type="checkbox" data-paper="' + i + '"' + (p.off ? "" : " checked") + ' aria-label="Use this paper"></td><td>' + esc(p.label) + '</td><td class="num">' + p.marks + '</td><td class="num">' + p.minutes + '</td><td><button class="btn small" type="button" data-delpaper="' + p.id + '" aria-label="Remove ' + esc(p.label) + '">Remove</button></td></tr>';
        }).join("") + '<tr class="xt-add"><td></td><td><input type="text" id="pp-l" placeholder="e.g. Edexcel Paper 2 2022"></td><td><input type="number" id="pp-m" placeholder="100" min="1"></td><td><input type="number" id="pp-t" placeholder="120" min="1"></td><td><button class="btn small" type="button" data-addpaper>Add</button></td></tr></tbody></table>') +
    '<p class="xt-sugg">' + (ratioNow() ? 'That is <b>' + r2(ratio) + ' min per mark</b>. For ' + total + ' marks: <b>' + sugg + ' min</b> suggested.' : 'Tick a past paper or enter a number.') + ' <button class="btn small" type="button" data-usesugg>Use suggestion</button></p>' +
    '<div class="field xt-narrow"><label for="xt-dur">Exam time (minutes)</label><input type="number" id="xt-dur" min="1" step="1" value="' + esc(X.baseMinutes || sugg) + '"></div></div>') + '</section>';

  /* questions */
  h += '<section class="card xt-card"><h3>Questions <span class="hint">(' + X.questions.length + ', ' + total + ' marks)</span></h3><div class="xt-scroll"><table class="xt-table xt-qs"><thead><tr><th>#</th><th>Question</th><th>Marks</th><th>Type</th><th>Minutes</th><th>Saved</th></tr></thead><tbody>' +
    X.questions.map(function (q, i) {
      var ro = started ? " disabled" : "";
      return '<tr data-q="' + esc(q.id) + '"><td>' + (i + 1) + '</td><td><b>' + esc(q.label) + '</b>' + (q.has_img ? '<div><img class="xt-thumb" alt="Question picture" data-xsrc="/api/t/exams/' + esc(X.id) + '/questions/' + esc(q.id) + '/image"></div>' : "") + '</td>' +
        '<td><input type="number" class="xt-in" data-f="marks" min="0" step="0.5" value="' + esc(q.marks) + '"' + ro + '></td>' +
        '<td><select data-f="type"' + ro + '>' + TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (q.type === t[0] ? " selected" : "") + '>' + t[1] + '</option>'; }).join("") + '</select></td>' +
        '<td><input type="number" class="xt-in" data-f="suggested_min" min="0" step="0.5" value="' + esc(q.suggested_min == null ? r2(q.marks * ratio) : q.suggested_min) + '"' + ro + '></td><td class="hint" data-saved></td></tr>';
    }).join("") + '</tbody></table></div>' + (started ? "" : '<div class="xt-acts"><button class="btn primary" type="button" data-savesetup>Save changes</button><span class="hint" id="xt-msg"></span></div>') + '</section>';

  /* log */
  h += '<section class="card xt-card"><h3>Log</h3><ul class="xt-log" id="xt-log"></ul></section>';
  app.innerHTML = h;
  showPics(app); drawRun(); drawLog();
}

function drawRun() {
  var st = X.status, b = $("#xt-btns"); if (!b) return;
  $("#xt-st").innerHTML = chip(st);
  var html = "";
  if (st === "draft") html = '<p class="hint">Make the student link first (below).</p>';
  if (st === "waiting") html = '<button class="btn accent xt-start" type="button" data-start>Start the exam</button><p class="hint">' + (X.lastSeenAt && Date.now() + offset - X.lastSeenAt < 10000 ? "He has the exam open and is waiting." : "He hasn’t opened the link yet.") + '</p>';
  if (st === "running" || st === "timeup") html = (st === "timeup" ? '<p class="xt-up">Time is up. Add time or lock.</p>' : "") +
    '<div class="xt-add"><button class="btn" type="button" data-ext="5">+5 min</button><button class="btn" type="button" data-ext="10">+10 min</button><input type="number" id="xt-custom" min="1" max="600" step="1" placeholder="min" aria-label="Minutes to add"><button class="btn" type="button" data-extc>Add</button></div>' +
    '<button class="btn danger" type="button" data-lock>Lock the exam</button>';
  if (st === "submitted") html = '<p><b>He handed in at ' + esc(t12(X.submittedAt)) + '.</b></p><a class="btn accent" href="#/exams/' + esc(X.id) + '/mark">Mark it</a> <button class="btn" type="button" data-lock>Lock</button> <button class="btn" type="button" data-reopen>Reopen</button>';
  if (st === "locked") html = '<p><b>Locked at ' + esc(t12(X.lockedAt)) + '.</b></p><a class="btn accent" href="#/exams/' + esc(X.id) + '/mark">Mark it</a> <button class="btn" type="button" data-reopen>Reopen</button>';
  if (b.getAttribute("data-k") !== st + html.length) { b.innerHTML = html; b.setAttribute("data-k", st + html.length); }
  var tm = $("#xt-times");
  if (tm) tm.textContent = X.startedAt ? "Started " + t12(X.startedAt) + " · original end " + t12(X.originalEndAt) + (X.endAt !== X.originalEndAt ? " · now ends " + t12(X.endAt) : "") : "";
  var seen = $("#xt-seen");
  if (seen) { var ago = X.lastSeenAt ? Math.round((Date.now() + offset - X.lastSeenAt) / 1000) : null; seen.innerHTML = ago == null ? "Not opened by him yet" : ago < 10 ? '<span class="xt-on"></span>He is connected' : "Last seen " + (ago < 120 ? ago + " s" : Math.round(ago / 60) + " min") + " ago"; }
  tickClock();
}

function tickClock() {
  var el = $("#xt-left"); if (!el || !X || !X.startedAt) return;
  if (X.status === "submitted" || X.status === "locked") { el.textContent = X.status === "locked" ? "Locked" : "Handed in"; el.className = "xt-big num"; return; }
  var left = X.endAt - (Date.now() + offset);
  if (left <= 0) { el.textContent = "Time up"; el.className = "xt-big num up"; if (X.status === "running") { X.status = "timeup"; drawRun(); } return; }
  var s = Math.ceil(left / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  el.textContent = (hh ? hh + ":" + String(mm).padStart(2, "0") : mm) + ":" + String(ss).padStart(2, "0");
  el.className = "xt-big num" + (left < 5 * 60000 ? " soon" : "");
}
setInterval(function () { if (X && (location.hash || "").indexOf("#/exams/" + X.id) === 0 && !/\/mark$/.test(location.hash)) tickClock(); }, 500);

var EVT = { created: "Loaded to the exam server", link: "Student link made", "new-link": "New student link (old one stopped)", start: "Started", extend: "Time added", timeup: "Time up", submit: "He handed in", lock: "Locked", reopen: "Reopened", "remove-picture": "He removed a picture" };
function drawLog() {
  var ul = $("#xt-log"); if (!ul) return;
  ul.innerHTML = (X.events || []).slice().reverse().map(function (e) {
    var what = e.kind === "extend" ? e.detail + " at " + t12(e.at) : (EVT[e.kind] || e.kind) + (e.kind === "start" ? " (" + e.detail + ")" : "");
    return '<li><span class="num">' + esc(t12(e.at)) + '</span> ' + esc(what) + '</li>';
  }).join("") || '<li class="hint">Nothing yet.</li>';
}

function poll() {
  stop();
  if (!X) return;
  call("GET", "/api/t/exams/" + X.id + "/live").then(function (d) {
    offset = d.serverNow - Date.now();
    var changed = d.status !== X.status || d.endAt !== X.endAt;
    ["status", "startedAt", "originalEndAt", "endAt", "submittedAt", "lockedAt", "lastSeenAt", "extensions"].forEach(function (k) { X[k] = d[k]; });
    drawRun();
    $$("tr[data-q]").forEach(function (tr) { var p = d.perQuestion[tr.getAttribute("data-q")], c = $("[data-saved]", tr); if (!c) return;
      c.innerHTML = p ? (p.lastSave ? "Text " + esc(t12(p.lastSave)) + (p.late ? ' <span class="xt-late">late</span>' : "") : "") + (p.pictures ? (p.lastSave ? "<br>" : "") + p.pictures + " picture" + (p.pictures > 1 ? "s" : "") : "") : "–"; });
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
var repoExam = null;

function markView(id) {
  app.innerHTML = '<div class="empty"><h3>Loading</h3></div>';
  call("GET", "/api/t/exams/" + encodeURIComponent(id) + "/review").then(function (r) {
    R = r; repoExam = null;
    // The mark scheme lives in the repo, next to the exam file Claude wrote.
    return T.loadTree().then(function () { return r.sourcePath ? T.fileJSON(r.sourcePath) : null; })
      .then(function (j) { repoExam = j && j.data; }, function () {}).then(drawMark);
  }).catch(function (e) { app.innerHTML = '<div class="empty"><h3>Couldn’t open the marking</h3><p>' + esc(e.message) + '</p><p><a href="#/exams">Back to exams</a></p></div>'; });
}

function lateSplit(q) {
  if (!q.writtenLate) return esc(q.final);
  if (q.atOriginalEnd && q.final.indexOf(q.atOriginalEnd) === 0) return esc(q.atOriginalEnd) + '<mark class="xt-latetext" title="Written after the original end time">' + esc(q.final.slice(q.atOriginalEnd.length)) + '</mark>';
  return '<mark class="xt-latetext" title="Changed after the original end time">' + esc(q.final) + '</mark>';
}

function drawMark() {
  var folder = R.sourcePath ? examFolder(R.sourcePath) : "";
  var rq = {}; ((repoExam && repoExam.questions) || []).forEach(function (q) { rq[q.id] = q; });
  app.setAttribute("data-subject", R.subject || "");
  var h = '<div class="section-h xt-head"><h2>Mark: ' + esc(R.title) + '</h2>' + chip(R.status) + '<span class="xt-grow"></span><a class="btn small" href="#/exams/' + esc(R.id) + '">Exam page</a></div>';
  h += '<div class="card xt-card xt-summary"><div><div class="xt-big num" id="xt-total">' + r2(R.total) + ' / ' + R.max + '</div><div class="hint" id="xt-marked">' + R.marked + ' of ' + R.questions.length + ' marked</div></div>' +
    '<div class="hint">' + (R.startedAt ? "Started " + esc(t12(R.startedAt)) + " · original end " + esc(t12(R.originalEndAt)) : "Not started") +
    ((R.extensions || []).length ? "<br>Time added: " + R.extensions.map(function (e) { return "+" + e.minutes + " min at " + t12(e.at); }).map(esc).join(", ") : "") +
    (R.submittedAt ? "<br>Handed in " + esc(t12(R.submittedAt)) : "") + (R.lockedAt ? "<br>Locked " + esc(t12(R.lockedAt)) : "") + '</div>' +
    '<div class="xt-acts"><button class="btn accent" type="button" data-torepo' + (T.isTry ? " disabled title=\"Try-out mode: nothing is saved\"" : "") + '>Save to tutoring repo</button><span class="hint" id="xt-repomsg"></span></div></div>';
  if (R.status === "running" || R.status === "timeup" || R.status === "waiting") h += '<div class="xt-up">The exam is still open. You can mark now, but answers may still change.</div>';
  h += R.questions.map(function (q, i) {
    var r = rq[q.id] || {}, ms = (r.msImg || []).map(function (p) { return /^(students|books)\//.test(p) ? p : folder + p; });
    return '<section class="card xt-mq" data-mq="' + esc(q.id) + '"><div class="xt-mhead"><h3>Question ' + (i + 1) + (q.label ? ' <span class="hint">(' + esc(q.label) + ')</span>' : "") + '</h3><span class="hint">' + q.marks + ' mark' + (q.marks === 1 ? "" : "s") + (r.source ? " · " + esc(r.source) : "") + '</span></div>' +
      '<div class="xt-3">' +
        '<div class="xt-col"><div class="xt-lab">Question</div><div class="xt-qtext">' + T.clean(q.text_html) + '</div>' + (q.has_img ? '<img class="xt-zoomable" alt="Question picture" data-xsrc="/api/t/exams/' + esc(R.id) + '/questions/' + esc(q.id) + '/image">' : "") + '</div>' +
        '<div class="xt-col"><div class="xt-lab">His answer' + (q.finalAt ? ' <span class="hint">last saved ' + esc(t12(q.finalAt)) + '</span>' : "") + (q.writtenLate ? ' <span class="xt-late">part written late</span>' : "") + '</div>' +
          (q.final ? '<div class="xt-ans">' + lateSplit(q) + '</div>' : '<p class="hint">No typed answer.</p>') +
          (q.writtenLate ? '<details class="xt-det"><summary>What he had at the original end time (' + esc(t12(R.originalEndAt)) + ')</summary><div class="xt-ans">' + (q.atOriginalEnd ? esc(q.atOriginalEnd) : '<span class="hint">Nothing yet</span>') + '</div></details>' : "") +
          (q.revisions.length > 1 ? '<details class="xt-det"><summary>' + q.revisions.length + ' saves</summary><ul class="xt-log">' + q.revisions.map(function (v) { return '<li><span class="num">' + esc(t12(v.at)) + '</span> ' + (v.late ? '<span class="xt-late">late</span> ' : "") + esc(v.text.length > 90 ? v.text.slice(0, 90) + "…" : v.text) + '</li>'; }).join("") + '</ul></details>' : "") +
          (q.uploads.length ? '<div class="xt-pics">' + q.uploads.map(function (u) { return '<figure><img class="xt-zoomable" alt="His picture" data-xsrc="/api/t/files/' + esc(u.id) + '"><figcaption>' + esc(u.source === "phone" ? "Phone" : u.source === "drawing" ? "Drawing" : "Picture") + " " + esc(t12(u.at)) + (u.late ? ' <span class="xt-late">late</span>' : "") + '</figcaption></figure>'; }).join("") + '</div>' : (q.type === "upload_required" ? '<p class="xt-up">No picture, but this question needed one.</p>' : "")) +
        '</div>' +
        '<div class="xt-col"><div class="xt-lab">Mark scheme</div>' + (ms.length ? ms.map(function (p) { return '<img class="xt-zoomable" alt="Mark scheme" data-rsrc="' + esc(p) + '">'; }).join("") : '<p class="hint">' + (repoExam ? "No mark scheme picture for this question." : "The exam file isn’t in the repo, so no mark scheme.") + '</p>') +
          (r.answer ? '<div class="xt-qtext">' + T.clean(r.answer) + '</div>' : "") + '</div>' +
      '</div>' +
      '<div class="xt-markrow"><label>Mark <span class="xt-of"><input type="number" class="xt-score" data-score="' + esc(q.id) + '" min="0" max="' + q.marks + '" step="0.5" value="' + (q.score == null ? "" : q.score) + '"> / ' + q.marks + '</span></label>' +
        '<label class="xt-grow">Comment <textarea data-comment="' + esc(q.id) + '" rows="2">' + esc(q.comment || "") + '</textarea></label><span class="hint" data-mstate="' + esc(q.id) + '"></span></div>' +
    '</section>';
  }).join("");
  app.innerHTML = h;
  showPics(app); showRepoPics(app); $$(".xt-qtext", app).forEach(T.maths);
}

var markTimers = {};
function saveMark(qid) {
  var s = $('[data-score="' + qid + '"]').value, c = $('[data-comment="' + qid + '"]').value, st = $('[data-mstate="' + qid + '"]');
  var q = R.questions.filter(function (x) { return x.id === qid; })[0];
  var score = s === "" ? null : Number(s);
  if (score != null && (score < 0 || score > q.marks)) { st.textContent = "0 to " + q.marks; return; }
  st.textContent = "Saving…";
  call("PUT", "/api/t/exams/" + R.id + "/marks/" + encodeURIComponent(qid), { score: score, comment: c }).then(function () {
    q.score = score; q.comment = c; st.textContent = "Saved";
    R.total = R.questions.reduce(function (a, x) { return a + (x.score || 0); }, 0); R.marked = R.questions.filter(function (x) { return x.score != null; }).length;
    $("#xt-total").textContent = r2(R.total) + " / " + R.max; $("#xt-marked").textContent = R.marked + " of " + R.questions.length + " marked";
  }, function (e) { st.textContent = e.message; });
}

/* Copy everything into students/<s>/exams/<folder>/result.json and work/ so Claude can close the exam. */
function saveToRepo(btn) {
  var msg = $("#xt-repomsg");
  var folder = R.sourcePath ? examFolder(R.sourcePath) : T.studentBase() + "exams/" + new Date(R.startedAt || Date.now()).toISOString().slice(0, 10) + "-" + (R.subject || "exam") + "-" + R.id + "/";
  btn.disabled = true;
  var files = [], i = 0;
  R.questions.forEach(function (q, qi) { q.uploads.forEach(function (u, k) { files.push({ u: u, path: folder + "work/q" + (qi + 1) + "-" + (k + 1) + (u.mime === "image/png" ? ".png" : u.mime === "image/webp" ? ".webp" : ".jpg") }); }); });
  var result = {
    examId: R.id, title: R.title, subject: R.subject, source: R.sourcePath || null, savedAt: new Date().toISOString(),
    startedAt: iso(R.startedAt), originalEndAt: iso(R.originalEndAt), endAt: iso(R.endAt), submittedAt: iso(R.submittedAt), lockedAt: iso(R.lockedAt), status: R.status,
    extensions: (R.extensions || []).map(function (e) { return { minutes: e.minutes, at: iso(e.at) }; }),
    total: r2(R.total), max: R.max, marked: R.marked,
    questions: R.questions.map(function (q) {
      return { id: q.id, label: q.label, marks: q.marks, type: q.type, score: q.score, comment: q.comment, final: q.final, finalAt: iso(q.finalAt), atOriginalEnd: q.atOriginalEnd, writtenLate: q.writtenLate,
        revisions: q.revisions.map(function (v) { return { at: iso(v.at), late: v.late, text: v.text }; }),
        pictures: files.filter(function (f) { return f.u.question === q.id; }).map(function (f) { return { file: f.path.slice(folder.length), source: f.u.source, at: iso(f.u.at), late: f.u.late }; }) };
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
  if (b.hasAttribute("data-load")) return loadToServer(b.getAttribute("data-load"), b);
  if (b.hasAttribute("data-newlink")) { if (X.token && !confirm("Make a new link? The old link will stop working.")) return; return act("/link", undefined, "Link ready"); }
  if (b.hasAttribute("data-copy")) { var l = $("#xt-link"); l.select(); (navigator.clipboard ? navigator.clipboard.writeText(l.value) : Promise.reject()).then(function () { T.toast("Link copied"); }, function () { document.execCommand("copy"); T.toast("Link copied"); }); return; }
  if (b.hasAttribute("data-qr")) { var box = $("#xt-qr"); box.hidden = !box.hidden; if (!box.hidden && window.qrcode) { var q = qrcode(0, "M"); q.addData(link()); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } return; }
  if (b.hasAttribute("data-start")) { if (!confirm("Start the exam now? His timer starts at once.")) return; return act("/start", undefined, "Started"); }
  if (b.hasAttribute("data-ext")) return act("/extend", { minutes: Number(b.getAttribute("data-ext")) }, "+" + b.getAttribute("data-ext") + " min added");
  if (b.hasAttribute("data-extc")) { var n = Number($("#xt-custom").value); if (!(n > 0)) { T.toast("Type the minutes first"); return; } return act("/extend", { minutes: n }, "+" + n + " min added"); }
  if (b.hasAttribute("data-lock")) { if (!confirm("Lock the exam? He can't change anything after this. (You can reopen it.)")) return; return act("/lock", undefined, "Locked"); }
  if (b.hasAttribute("data-reopen")) return act("/reopen", undefined, "Reopened");
  if (b.hasAttribute("data-savesetup")) return saveSetup();
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
});
document.addEventListener("input", function (e) {
  var t = e.target; if (!t.hasAttribute || !t.hasAttribute("data-comment")) return;
  var id = t.getAttribute("data-comment"); clearTimeout(markTimers[id]); markTimers[id] = setTimeout(function () { saveMark(id); }, 1200);
});

/* The tab may have been opened before this file arrived. */
if ((location.hash || "").indexOf("#/exams") === 0) T.render();
})();
