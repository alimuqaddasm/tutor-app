/* A board that builds piece by piece (Ali, 14 Oct: "replace sharing my tablet and writing with the S pen";
   "it should be broken down in more parts rather than the full line coming up all at once").
   Two kinds of board:
   - grow: the pictures are cumulative (picture k is the board after click k). Step 0 is the question alone
     (picture 1 without its last line); then each click's new line comes in pieces (split where the writing has a
     clear gap, so "cos(A - B)", "= cos A cos B", "+ sin A sin B"), each piece written in from left to right.
   - lines: one finished picture (a worked answer) is given line by line, top to bottom (his-turn hints).
   draw() shows the board after a step; the newest line sits in a soft highlight; for Ali (ghost) the next piece
   shows faintly. */
var Board = (function () {
  var CACHE = {}, DONE = {}, SCALE = 480; // analyse at about 480 px wide: quick, and plenty for finding lines
  function load(url) { return new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = url; }); }
  function pix(im, w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; }
  function lum(d, i) { return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; }
  /* new ink: written in b where a was still blank (a line turning from blue to black is not new) */
  function mask(a, b, w, h, bg) { var m = new Uint8Array(w * h);
    for (var i = 0, n = w * h; i < n; i++) { var j = i * 4; if (Math.abs(bg - lum(b, j)) > 48 && (!a || Math.abs(bg - lum(a, j)) <= 48)) m[i] = 1; } return m; }
  function box(m, w, h, r) { r = r || { x0: 0, y0: 0, x1: w, y1: h }; var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = r.y0; y < r.y1; y++) for (var x = r.x0; x < r.x1; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 }; }
  /* lines of writing inside a box: rows of ink, split at a clear gap (a fraction bar keeps its two halves together) */
  function bands(m, w, r) { var out = [], cur = null, gap = 0, g = 4;
    for (var y = r.y0; y < r.y1; y++) { var ink = false; for (var x = r.x0; x < r.x1 && !ink; x++) if (m[y * w + x]) ink = true;
      if (ink) { if (!cur) cur = { x0: r.x0, y0: y, x1: r.x1, y1: y + 1 }; else cur.y1 = y + 1; gap = 0; } else if (cur && ++gap > g) { out.push(cur); cur = null; } }
    if (cur) out.push(cur);
    return out.map(function (b) { return box(m, w, 1e9, b) || b; }); }
  /* pieces of one line, split at its widest gaps between writing; a small piece (an "=" or "+") joins the next */
  function pieces(m, w, r) { var cols = [], gaps = [], run = 0, start = -1, minGap = Math.max(3, w * 0.012);
    for (var x = r.x0; x < r.x1; x++) { var ink = false; for (var y = r.y0; y < r.y1 && !ink; y++) if (m[y * w + x]) ink = true; cols.push(ink); }
    for (var k = 0; k < cols.length; k++) { if (!cols[k]) { if (start < 0) start = k; run++; } else { if (start > 0 && run >= minGap) gaps.push({ a: start, b: k, n: run }); start = -1; run = 0; } }
    if (!gaps.length) return [r];
    var top = gaps.map(function (g) { return g.n; }).sort(function (a, b) { return b - a; })[0];
    gaps = gaps.filter(function (g) { return g.n >= Math.max(minGap, top * 0.45); });
    var ps = [], x0 = 0; gaps.forEach(function (g) { ps.push([x0, g.a]); x0 = g.b; }); ps.push([x0, cols.length]);
    var small = Math.max(6, w * 0.05), out = [];
    ps.forEach(function (p, i) { var last = out[out.length - 1];
      if (last && last.carry) { last.p[1] = p[1]; last.carry = p[1] - last.p[0] < small && i < ps.length - 1; return; }
      out.push({ p: [p[0], p[1]], carry: p[1] - p[0] < small && i < ps.length - 1 }); });
    while (out.length > 4) { var best = 1, bw = 1e9; for (var i = 1; i < out.length; i++) { var gw = out[i].p[0] - out[i - 1].p[1]; if (gw < bw) { bw = gw; best = i; } } out[best - 1].p[1] = out[best].p[1]; out.splice(best, 1); }
    return out.map(function (o) { return { x0: r.x0 + o.p[0], y0: r.y0, x1: r.x0 + o.p[1], y1: r.y1 }; }); }
  function count(m, w, r) { var n = 0; for (var y = r.y0; y < r.y1; y++) for (var x = r.x0; x < r.x1; x++) n += m[y * w + x]; return n; }
  /* lines of b, each cut into columns at wide gaps, kept where a had (almost) no writing in the same place */
  function newSegs(ma, mb, w, h) { var out = [];
    bands(mb, w, { x0: 0, y0: 0, x1: w, y1: h }).forEach(function (b) { cols(mb, w, b, Math.max(8, w * 0.06)).forEach(function (sg) {
      var nb = count(mb, w, sg), na = count(ma, w, sg); if (nb > 6 && na < nb * 0.25) out.push(sg); }); });
    return out; }
  function cols(m, w, r, gap) { var out = [], cur = null, run = 0;
    for (var x = r.x0; x < r.x1; x++) { var ink = false; for (var y = r.y0; y < r.y1 && !ink; y++) if (m[y * w + x]) ink = true;
      if (ink) { if (!cur) cur = { x0: x, y0: r.y0, x1: x + 1, y1: r.y1 }; else cur.x1 = x + 1; run = 0; } else if (cur && ++run > gap) { out.push(cur); cur = null; } }
    if (cur) out.push(cur); return out.map(function (c) { return box(m, w, 1e9, c) || c; }); }
  function scaleR(r, s, W, H) { if (!r) return null; var p = 5 / s, x0 = Math.max(0, r.x0 / s - p), y0 = Math.max(0, r.y0 / s - p);
    return { x: x0, y: y0, w: Math.min(W, r.x1 / s + p) - x0, h: Math.min(H, r.y1 / s + p) - y0 }; }
  function union(rs) { if (!rs.length) return null; var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; rs.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  /* the steps: steps[s] = {base: picture drawn underneath (-1 the question state, -2 a blank board, k a picture),
     from: picture the new pieces come from, rects: pieces shown so far in this line, group: click or line number} */
  /* box [x0, y0, x1, y1] as fractions: only that part of the picture (one answer on a board that holds several) */
  function crop(im, bx) { if (!bx) return im; var W = im.naturalWidth, H = im.naturalHeight, x = Math.round(bx[0] * W), y = Math.round(bx[1] * H), w = Math.round((bx[2] - bx[0]) * W), h = Math.round((bx[3] - bx[1]) * H);
    var c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(im, x, y, w, h, 0, 0, w, h); return c; }
  function analyse(key, urls, mode, bx) {
    if (CACHE[key]) return CACHE[key];
    return (CACHE[key] = Promise.all(urls.map(load)).then(function (ims) {
      ims = ims.map(function (im) { return crop(im, bx); });
      var W = ims[0].naturalWidth || ims[0].width, H = ims[0].naturalHeight || ims[0].height, s = Math.min(1, SCALE / W), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      var px = ims.map(function (im) { return pix(im, w, h); }), bg = lum(px[0], 0), c0 = px[0], steps = [], groups = [], cut = null;
      var S = function (r) { return scaleR(r, s, W, H); };
      if (mode === "lines") {
        var m = mask(null, px[0], w, h, bg); steps.push({ base: -2, rects: [], group: -1 });
        bands(m, w, { x0: 0, y0: 0, x1: w, y1: h }).forEach(function (b, k) { var r = S(b); groups.push(r); steps.push({ base: -2, from: 0, rects: [r], keep: k, group: k }); });
        steps.forEach(function (st) { if (st.keep != null) st.prev = groups.slice(0, st.keep); });
      } else {
        var m1 = mask(null, px[0], w, h, bg), all1 = box(m1, w, h), ls = all1 ? bands(m1, w, all1) : [], last = ls[ls.length - 1];
        var first = last && ls.length > 1 ? last : all1; cut = first ? S(first) : null;
        steps.push({ base: -1, rects: [], group: -1 });
        var ink = px.map(function (p) { return mask(null, p, w, h, bg); });
        for (var k = 0; k < ims.length; k++) {
          /* the new lines of click k: its lines (split into columns at wide gaps) where click k-1 had no writing yet.
             A line restyled or nudged (blue turning black) still has writing under it, so it is not new. */
          var segs = k ? newSegs(ink[k - 1], ink[k], w, h) : (first ? [first] : []), mk = ink[k];
          if (!segs.length) { steps.push({ base: k, from: k, rects: [], group: k }); groups.push(null); continue; }
          var ps = []; segs.forEach(function (sg) { bands(mk, w, sg).forEach(function (b) { ps = ps.concat(pieces(mk, w, b)); }); });
          var r = { x0: Math.min.apply(null, segs.map(function (g) { return g.x0; })), y0: Math.min.apply(null, segs.map(function (g) { return g.y0; })), x1: Math.max.apply(null, segs.map(function (g) { return g.x1; })), y1: Math.max.apply(null, segs.map(function (g) { return g.y1; })) };
          var R = ps.map(S); groups.push(S(r));
          R.forEach(function (_, j) { steps.push({ base: k ? k - 1 : -1, from: k, rects: R.slice(0, j + 1), group: k, full: j === R.length - 1 }); }); }
      }
      return { ims: ims, W: W, H: H, steps: steps, groups: groups, cut: cut, mode: mode || "grow", bg: "rgb(" + c0[0] + "," + c0[1] + "," + c0[2] + ")" };
    }).then(function (b) { DONE[key] = b; return b; }));
  }
  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function paintBase(x, b, base) { x.globalAlpha = 1;
    if (base === -2) { x.fillStyle = b.bg; x.fillRect(0, 0, b.W, b.H); return; }
    if (base === -1) { x.drawImage(b.ims[0], 0, 0); if (b.cut) { x.fillStyle = b.bg; x.fillRect(0, b.cut.y, b.W, b.H - b.cut.y); } return; }
    x.drawImage(b.ims[base], 0, 0); }
  function part(x, im, r, t) { if (!r || t <= 0) return; var w = r.w * Math.min(1, t); x.drawImage(im, r.x, r.y, w, r.h, r.x, r.y, w, r.h); }
  function mark(x, r, hl) { if (!r || !hl) return; x.save(); x.globalCompositeOperation = "multiply"; x.fillStyle = hl; x.fillRect(r.x, r.y, r.w, r.h); x.restore(); }
  function state(x, b, st, t) { if (st.full && t >= 1) { paintBase(x, b, st.from); return; } paintBase(x, b, st.base); var im = b.ims[st.from || 0];
    (st.prev || []).forEach(function (r) { part(x, im, r, 1); });
    st.rects.forEach(function (r, i) { part(x, im, r, i === st.rects.length - 1 ? t : 1); }); }
  /* opts: ghost (Ali sees the next piece faintly), animate (write the newest piece in), hl (highlight colour) */
  function draw(cv, b, step, opts) { opts = opts || {}; var n = b.steps.length - 1; step = Math.max(0, Math.min(n, step));
    cv.width = b.W; cv.height = b.H; var x = cv.getContext("2d"), st = b.steps[step], nx = b.steps[step + 1], r = st.rects[st.rects.length - 1];
    var line = b.mode === "lines" ? r : union(st.rects);
    if (cv.__raf) cancelAnimationFrame(cv.__raf);
    function frame(t) { state(x, b, st, t);
      if (opts.ghost && nx) { var nr = nx.rects[nx.rects.length - 1]; x.globalAlpha = 0.22; part(x, b.ims[nx.from || 0], nr, 1); x.globalAlpha = 1; }
      if (t >= 1) mark(x, line, opts.hl); }
    if (!opts.animate || !r || RM) { frame(1); return; }
    var t0 = performance.now(), dur = Math.max(350, Math.min(1000, r.w / b.W * 1600));
    (function tick(now) { var t = Math.min(1, (now - t0) / dur); frame(t); if (t < 1) cv.__raf = requestAnimationFrame(tick); else cv.__raf = 0; })(t0);
  }
  /* what is known without waiting: the number of steps and which click or line a step belongs to */
  function info(key) { return DONE[key] || null; }
  return { analyse: analyse, draw: draw, info: info };
})();
