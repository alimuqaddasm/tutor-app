/* A board that builds line by line (Ali, 14 Oct: "replace sharing my tablet and writing with the S pen").
   The board's pictures are cumulative: picture k is the board after line k. From them this works out, for each step,
   the area that is new (the line just written), then draws the board on a canvas:
   - step 0 is the question alone: picture 1 without its last line;
   - step k is picture k, its new line written in from left to right and held in a soft highlight;
   - for Ali (ghost) the next line shows faintly, so he knows what comes next. */
var Board = (function () {
  var CACHE = {}, SCALE = 480; // analyse at about 480 px wide: quick, and plenty for finding lines
  function load(url) { return new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = url; }); }
  function pix(im, w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; }
  function lum(d, i) { return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; }
  /* the box (in analysis pixels) where b differs from a; a null means "the plain background" */
  function diff(a, b, w, h, bg) { var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var i = (y * w + x) * 4, d = a ? Math.abs(lum(a, i) - lum(b, i)) : Math.abs(bg - lum(b, i));
      if (d > 48) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 }; }
  /* rows of ink in a box, split where there is a clear gap: the lines of writing */
  function bands(d, w, box, bg) { var rows = [], out = [], gap = 0, cur = null;
    for (var y = box.y0; y < box.y1; y++) { var ink = false; for (var x = box.x0; x < box.x1 && !ink; x++) if (Math.abs(bg - lum(d, (y * w + x) * 4)) > 48) ink = true; rows.push(ink); }
    rows.forEach(function (ink, k) { var y = box.y0 + k; if (ink) { if (!cur) cur = { y0: y, y1: y + 1 }; else cur.y1 = y + 1; gap = 0; } else if (cur && ++gap > 4) { out.push(cur); cur = null; } });
    if (cur) out.push(cur); return out; }
  function pad(r, s, W, H) { if (!r) return null; var p = 6 / s; return { x: Math.max(0, r.x0 / s - p), y: Math.max(0, r.y0 / s - p), w: Math.min(W, r.x1 / s + p) - Math.max(0, r.x0 / s - p), h: Math.min(H, r.y1 / s + p) - Math.max(0, r.y0 / s - p) }; }
  function analyse(key, urls) {
    if (CACHE[key]) return CACHE[key];
    return (CACHE[key] = Promise.all(urls.map(load)).then(function (ims) {
      var W = ims[0].naturalWidth, H = ims[0].naturalHeight, s = Math.min(1, SCALE / W), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      var px = ims.map(function (im) { return pix(im, w, h); }), bg = lum(px[0], 0), news = [];
      /* step 0: picture 1 without its last line (or an empty board if it has one line only) */
      var all1 = diff(null, px[0], w, h, bg), ls = all1 ? bands(px[0], w, all1, bg) : [], last = ls[ls.length - 1];
      var cut = last && ls.length > 1 ? { x0: all1.x0, y0: last.y0, x1: all1.x1, y1: last.y1 } : all1;
      news.push(pad(cut, s, W, H));
      for (var k = 1; k < ims.length; k++) news.push(pad(diff(px[k - 1], px[k], w, h, bg) || null, s, W, H));
      var c0 = px[0], bgc = "rgb(" + c0[0] + "," + c0[1] + "," + c0[2] + ")";
      return { ims: ims, W: W, H: H, news: news, bg: bgc, cutTo: cut ? cut.y0 / s - 6 / s : 0 };
    }));
  }
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* the board as it is after `step` lines (0 = the question alone) */
  function paint(x, b, step) {
    if (step <= 0) { x.drawImage(b.ims[0], 0, 0); var r = b.news[0]; if (r) { x.fillStyle = b.bg; x.fillRect(0, r.y, b.W, b.H - r.y); } }
    else x.drawImage(b.ims[step - 1], 0, 0); }
  function part(x, im, r, t) { if (!r || t <= 0) return; var w = r.w * Math.min(1, t); x.drawImage(im, r.x, r.y, w, r.h, r.x, r.y, w, r.h); }
  function mark(x, r, hl) { if (!r || !hl) return; x.save(); x.globalCompositeOperation = "multiply"; x.fillStyle = hl; x.fillRect(r.x, r.y, r.w, r.h); x.restore(); }
  /* opts: ghost (Ali sees the next line faintly), animate (write the newest line in), hl (highlight colour) */
  function draw(cv, b, step, opts) { opts = opts || {}; var n = b.ims.length; step = Math.max(0, Math.min(n, step));
    cv.width = b.W; cv.height = b.H; var x = cv.getContext("2d"), r = step > 0 ? b.news[step - 1] : null, nr = step < n ? b.news[step] : null;
    if (cv.__raf) cancelAnimationFrame(cv.__raf);
    function frame(t) { x.globalAlpha = 1;
      if (r && t < 1) { paint(x, b, step - 1); part(x, b.ims[step - 1], r, t); } else paint(x, b, step);
      if (opts.ghost && nr) { x.globalAlpha = 0.22; part(x, b.ims[step], nr, 1); x.globalAlpha = 1; }
      mark(x, r, t >= 1 ? opts.hl : null); }
    if (!opts.animate || !r || RM) { frame(1); return; }
    var t0 = performance.now(), dur = Math.max(450, Math.min(1100, r.w / b.W * 1300));
    (function tick(now) { var t = Math.min(1, (now - t0) / dur); frame(t); if (t < 1) cv.__raf = requestAnimationFrame(tick); else cv.__raf = 0; })(t0);
  }
  return { analyse: analyse, draw: draw };
})();
