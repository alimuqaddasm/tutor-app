/* Tutor Desk offline shell. The app's own files: network first (so updates show at once), cache when offline.
   Fonts and libraries: cache first. GitHub API calls are never cached here (the app keeps its own device cache). */
var SHELL = "tutor-shell-v13";
var FILES = ["./", "index.html", "app.css?v=13", "app.js?v=13", "manifest.webmanifest", "icon-192.png", "icon-512.png", "logo.svg"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== SHELL && k.indexOf("tutor-shell-") === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname === "api.github.com") return;
  var cdn = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(u.hostname);
  if (cdn) { e.respondWith(caches.open("tutor-cdn").then(function (c) { return c.match(e.request).then(function (hit) { return hit || fetch(e.request).then(function (r) { c.put(e.request, r.clone()); return r; }); }); })); return; }
  if (u.origin === location.origin) e.respondWith(fetch(e.request).then(function (r) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(e.request, cp); }); return r; }).catch(function () { return caches.match(e.request, { ignoreSearch: false }).then(function (hit) { return hit || caches.match("index.html"); }); }));
});
