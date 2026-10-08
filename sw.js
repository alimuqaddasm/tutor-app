/* Tutor Desk offline shell. The app's own files: network first (so updates show at once), cache when offline.
   Fonts and libraries: cache first. GitHub API calls are never cached here (the app keeps its own device cache). */
var SHELL = "tutor-shell-v50";
var FILES = ["./", "index.html", "design.css?v=1", "app.css?v=45", "app.js?v=45", "exams.js?v=13", "exam-config.js?v=2", "exam.html", "exam.js?v=9", "exam.css?v=8", "manifest.webmanifest", "icon-192.png", "icon-512.png", "logo.svg", "vendor/purify.min.js", "vendor/qrcode.js", "vendor/katex/katex.min.js", "vendor/katex/katex.min.css", "vendor/katex/contrib/auto-render.min.js"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== SHELL && k.indexOf("tutor-shell-") === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname === "api.github.com") return;
  var cdn = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(u.hostname);
  if (cdn) { e.respondWith(caches.open("tutor-cdn").then(function (c) { return c.match(e.request).then(function (hit) { return hit || fetch(e.request).then(function (r) { c.put(e.request, r.clone()); return r; }); }); })); return; }
  // "no-cache": always ask the server for the newest copy (GitHub Pages would otherwise let the browser reuse one for 10 minutes)
  if (u.origin === location.origin) e.respondWith(fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })).then(function (r) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(e.request, cp); }); return r; }).catch(function () { return caches.match(e.request, { ignoreSearch: false }).then(function (hit) { return hit || caches.match("index.html"); }); }));
});
