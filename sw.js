/* Tutor Desk offline shell. The pages: network first (so updates show at once), cache when offline or slow.
   Versioned files and libraries: cache first.
   Fonts and libraries: cache first. GitHub API calls are never cached here (the app keeps its own device cache). */
var SHELL = "tutor-shell-v100";
var FILES = ["./", "index.html", "design.css?v=8", "app.css?v=62", "board.js?v=3", "app.js?v=76", "paper.js?v=4", "exams.js?v=33", "exam-config.js?v=2", "title.js?v=1", "exam.html", "exam.js?v=19", "exam.css?v=14", "manifest.webmanifest", "icon-192.png", "icon-512.png", "logo.svg", "vendor/purify.min.js", "vendor/fonts/arimo-latin-400-normal.woff2", "vendor/fonts/arimo-latin-700-normal.woff2", "vendor/fonts/tinos-latin-400-normal.woff2", "vendor/fonts/tinos-latin-400-italic.woff2", "vendor/fonts/tinos-latin-700-normal.woff2", "vendor/fonts/tinos-greek-400-normal.woff2", "vendor/fonts/tinos-greek-400-italic.woff2", "vendor/qrcode.js", "vendor/katex/katex.min.js", "vendor/katex/katex.min.css", "vendor/katex/contrib/auto-render.min.js"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES.map(function (f) { return new Request(f, { cache: "reload" }); }));   /* "reload": straight from the server, never a 10 minute old copy */ }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== SHELL && k.indexOf("tutor-shell-") === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname === "api.github.com") return;
  var cdn = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(u.hostname);
  if (cdn) { e.respondWith(caches.open("tutor-cdn").then(function (c) { return c.match(e.request).then(function (hit) { return hit || fetch(e.request).then(function (r) { c.put(e.request, r.clone()); return r; }); }); })); return; }
  if (u.origin !== location.origin) return;
  // Speed. Files with a version number (app.js?v=76) and the libraries in vendor/ never change under the same address,
  // so the saved copy is used at once and the network is not asked. A new version has a new address, so updates still show at once.
  var fixed = /(^|[?&])v=\d+/.test(u.search) || u.pathname.indexOf("/vendor/") >= 0;
  var keep = function (r) { if (r && r.status === 200) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(e.request, cp); }); } return r; };
  // "no-cache": always ask the server for the newest copy (GitHub Pages would otherwise let the browser reuse one for 10 minutes)
  var net = function () { return fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })).then(keep); };
  var saved = function () { return caches.match(e.request, { ignoreSearch: false }); };
  if (fixed) { e.respondWith(saved().then(function (hit) { return hit || net(); })); return; }
  // The pages themselves (index.html, exam.html): newest copy first. On a weak connection, do not wait on it for more than 3 seconds
  // when a saved copy is here (or the server answers with a fault): show the saved one, and let the newest finish in the background for next time.
  e.respondWith(saved().then(function (hit) {
    var n = net();
    if (!hit) return n.catch(function () { return caches.match("index.html"); });
    return new Promise(function (res) { var done = false, t = setTimeout(function () { if (!done) { done = true; res(hit); } }, 3000);
      n.then(function (r) { if (!done) { done = true; clearTimeout(t); res(r.status >= 500 ? hit : r); } }, function () { if (!done) { done = true; clearTimeout(t); res(hit); } }); });
  }));
});
