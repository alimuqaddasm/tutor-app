"""11. Screenshots of every screen at 4 sizes x 2 themes, plus measurements: sideways scroll, small tap targets, contrast, small text."""
from common import *
import json
SIZES = [("1366x768", 1366, 768), ("1280x800", 1280, 800), ("800x1280", 800, 1280), ("390x844", 390, 844)]
MEASURE = r"""() => {
  const out = {};
  out.scrollW = document.documentElement.scrollWidth - window.innerWidth;
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const small = [];
  document.querySelectorAll('button, a, input[type=checkbox], summary').forEach(e => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.height < 44 || r.width < 44) small.push([e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0,2).join('.') : ''), Math.round(r.width), Math.round(r.height), (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 28)]); });
  out.small = small;
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bgOf = e => { let n = e; while (n && n !== document.documentElement) { const bg = getComputedStyle(n).backgroundColor; const m = bg.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > 0.9)) return bg; n = n.parentElement; } return getComputedStyle(document.body).backgroundColor; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  out.contrast = {};
  ['.hint', '.label', '.pill', '.save', '.rail button .tm', '.lrow .hint', '.tile .st', '.wd .dots', 'table.t th', '.sub', '.stat .l', '.statline span', '.empty p', '.crumb span', '.brand small', '.subjsw button'].forEach(sel => {
    const es = Array.from(document.querySelectorAll(sel)).filter(vis).slice(0, 12); if (!es.length) return;
    const rs = es.map(e => { const c = getComputedStyle(e).color; return [+ratio(c, bgOf(e)).toFixed(2), c, bgOf(e), parseFloat(getComputedStyle(e).fontSize)]; });
    rs.sort((a, b) => a[0] - b[0]); out.contrast[sel] = rs[0];
  });
  const tiny = {};
  document.querySelectorAll('body *').forEach(e => { if (!vis(e) || !e.childNodes.length) return; const hasText = Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()); if (!hasText) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 14) { const k = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0,2).join('.') : ''); tiny[k] = [fs, (e.innerText || '').trim().slice(0, 30)]; } });
  out.tiny = tiny;
  return out;
}"""
SCREENS = [
    ("home", "#/", ".tile", None),
    ("plan", "#/lesson/" + MATHS, ".rail", None),
    ("plan-m2", "#/lesson/" + MATHS, ".rail", "m2"),
    ("plan-revise", "#/lesson/" + MATHS, ".rail", "_revise"),
    ("plan-extra", "#/lesson/" + MATHS, ".rail", "_extra"),
    ("plan-work", "#/lesson/" + MATHS, ".rail", "_work"),
    ("plan-times", "#/lesson/" + MATHS, ".rail", "_time"),
    ("plan-after", "#/lesson/" + MATHS, ".rail", "_after"),
    ("plan-logged", "#/lesson/" + CH3, ".rail", None),
    ("record", "#/record", ".stats .stat", None),
    ("revise", "#/revise", ".rev", None),
    ("videos", "#/videos", ".vrow", None),
    ("settings", "#/settings", "#setform", None),
    ("new", "#/new", "#newform", None),
]
report = {}
with sync_playwright() as p:
    b = launch(p)
    for theme in ("light", "dark"):
        for sname, w, h in SIZES:
            fake = FakeGH(); c = ctx(b, fake, w=w, h=h, dark=(theme == "dark")); pg = None
            for name, url, sel, phase in SCREENS:
                try:
                    if pg is None: pg = page(c, url, sel, 60000)
                    else: pg.goto(B + url); pg.wait_for_selector(sel, timeout=60000)
                    pg.wait_for_timeout(700 if name in ("home", "plan", "revise", "record") else 300)
                    if phase: pg.locator('.rail button[data-phase="%s"]' % phase).click(); pg.wait_for_timeout(500)
                    if name == "plan-revise": pg.wait_for_selector("#revbox .rev, #revbox .empty", timeout=20000); pg.wait_for_timeout(200)
                    key = "%s-%s-%s" % (name, sname, theme)
                    pg.screenshot(path=os.path.join(HERE, key + ".png"), full_page=(name not in ("videos",)))
                    m = pg.evaluate(MEASURE); report[key] = m
                    check("%s: no sideways scroll" % key, m["scrollW"] <= 0, m["scrollW"])
                except Exception as e:
                    check("%s: screenshot taken" % ("%s-%s-%s" % (name, sname, theme)), False, str(e)[:120])
            # suggest panel + try-out marker, once per size (light only has enough)
            if pg is not None:
                try:
                    pg.goto(B + "#/"); pg.wait_for_selector(".tile"); pg.locator("[data-suggest]").first.click(); pg.wait_for_selector("#sug"); pg.wait_for_timeout(900)
                    key = "suggest-%s-%s" % (sname, theme); pg.screenshot(path=os.path.join(HERE, key + ".png")); m = pg.evaluate(MEASURE); report[key] = m
                    check("%s: no sideways scroll" % key, m["scrollW"] <= 0, m["scrollW"]); pg.keyboard.press("Escape")
                    pg.goto(B + "?try#/"); pg.wait_for_selector(".tile"); pg.wait_for_timeout(500); pg.locator("#trydot").click(); pg.wait_for_timeout(300)
                    key = "tryout-%s-%s" % (sname, theme); pg.screenshot(path=os.path.join(HERE, key + ".png"), full_page=False); report[key] = pg.evaluate(MEASURE)
                    # error screen
                    fake.fail = 500; pg.goto(B + "?try#/record"); pg.wait_for_timeout(2000)
                    key = "error-record-%s-%s" % (sname, theme); pg.screenshot(path=os.path.join(HERE, key + ".png"), full_page=False)
                except Exception as e: print("extra shots failed", sname, theme, str(e)[:120])
            errs = [e for e in c.errs if "localStorage" not in e]
            check("%s %s: no script errors across all screens" % (sname, theme), not errs, errs)
            c.close()
            print("done", sname, theme, flush=True)
    b.close()
json.dump(report, open(os.path.join(HERE, "measure.json"), "w"), indent=1)
# summaries
print("\n== small tap targets (< 44 px) on tablet sizes, light ==")
seen = {}
for k, m in report.items():
    if ("1280x800" in k or "800x1280" in k) and k.endswith("light"):
        for s in m["small"]:
            kk = (s[0], s[3]); seen.setdefault(kk, []).append((k.split("-")[0], s[1], s[2]))
for kk, v in sorted(seen.items(), key=lambda x: -len(x[1]))[:40]: print("  %-40s %-30s %dx%d  on %s" % (kk[0][:40], kk[1][:30], v[0][1], v[0][2], sorted(set(x[0] for x in v))[:6]))
print("\n== lowest contrast per selector (light / dark) ==")
for sel in ['.hint', '.label', '.pill', '.save', '.rail button .tm', '.tile .st', '.wd .dots', 'table.t th', '.stat .l', '.brand small', '.subjsw button', '.empty p']:
    for th in ("light", "dark"):
        vals = [(m["contrast"][sel], k) for k, m in report.items() if k.endswith(th) and sel in m["contrast"]]
        if vals: v = min(vals); print("  %-20s %-5s %.2f:1  %s on %s  %spx  (%s)" % (sel, th, v[0][0], v[0][1], v[0][2], v[0][3], v[1]))
print("\n== text under 14px (light, 1280x800) ==")
agg = {}
for k, m in report.items():
    if "1280x800-light" in k:
        for kk, v in m["tiny"].items(): agg.setdefault(kk, (v, k.split("-")[0]))
for kk, (v, scr) in sorted(agg.items(), key=lambda x: x[1][0][0]): print("  %-28s %.1fpx  '%s'  (%s)" % (kk[:28], v[0], v[1], scr))
summary()
