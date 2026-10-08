"""Round 14 (2 Oct): a Try-out button, the plain dot back, make-up minutes up front, and the no-scroll Teach layouts.
Every check prints PASS or FAIL; exit code 1 on any FAIL."""
import os, sys, types, json
HERE_T = os.path.dirname(os.path.abspath(__file__))
R = types.SimpleNamespace(); _f = os.path.join(HERE_T, "test_bugs_round10.py")
_ns = {"__file__": _f}; exec(open(_f, encoding="utf-8").read().split("\ntry:\n")[0], _ns); R.__dict__.update(_ns)
from playwright.sync_api import sync_playwright
MA, check, page, ctx_ = R.MA, R.check, R.page, R.ctx_

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        # 1. Try-out button: in, then out again, without typing ?try
        c = ctx_(b, 1280, 800); p = page(c, "#/lesson/" + MA + "/teach")
        check("Teach top bar has a Try-out button", p.locator(".tmini [data-trytoggle]").inner_text() == "Try-out")
        p.click("[data-tmore]"); p.locator(".tmini [data-trytoggle]").click(); p.wait_for_selector(".teach3"); p.wait_for_timeout(1200)
        check("it switches this tab into try-out on the same screen", "?try" in p.url and "/teach" in p.url and p.locator(".trybar").count() == 1)
        check("the try-out marker is a plain dot again", p.locator("#trydot").inner_text().strip() == "" and p.locator("#trydot").bounding_box()["width"] <= 20)
        p.click("[data-tmore]"); p.locator(".tmini [data-trytoggle]").click(); p.wait_for_selector(".teach3"); p.wait_for_timeout(1200)
        check("'Leave try-out' goes back to the real app", "?try" not in p.url and p.locator(".trybar").count() == 0); c.close()
        # 2. make-up minutes up front
        c = ctx_(b, 1280, 800); p = page(c, "#/", ".home"); p.wait_for_timeout(2500)
        check("home header shows the make-up minutes", p.locator(".mkchip b").inner_text() == p.locator("#mkcard .big").inner_text() and p.locator(".mkchip").is_visible())
        p.evaluate("location.hash = '#/videos'"); p.wait_for_timeout(800)
        check("and the sidebar keeps showing them on other pages", p.locator("#mkside").is_visible())
        c.close()
        # 3. Flip (the one layout since 8 Oct): no scrolling on the tablet (1280 x 800) and the laptop
        for w, h in ((1280, 800), (1440, 900)):
            c = ctx_(b, w, h); p = page(c, "?try#/lesson/" + MA + "/teach")
            bad = []
            for tx in ["Set 5 Q6", "Set 6 Q14", "Set 1 Q4", "exact value of tan 75", "Given that tan A"]:
                p.evaluate("t => Array.from(document.querySelectorAll('.outline .oc')).find(x => x.textContent.indexOf(t) >= 0).click()", tx); p.wait_for_timeout(1800)
                s = p.evaluate("[scrollY, (document.querySelector('.fitq')||{scrollHeight:0,clientHeight:0}).scrollHeight - (document.querySelector('.fitq')||{clientHeight:0}).clientHeight, !!document.querySelector('.chunk.cur.fit')]")
                if s[0] > 0 or s[1] > 2 or not s[2]: bad.append((tx, s))
            check("flip at %dx%d: question screens need no scrolling" % (w, h), not bad, bad)
            c.close()
        b.close()
finally:
    R.srv.kill()
for e in R.errs: print(e)
print("\n%d FAIL" % len(R.fails) if R.fails else "\nall PASS")
sys.exit(1 if R.fails or R.errs else 0)
