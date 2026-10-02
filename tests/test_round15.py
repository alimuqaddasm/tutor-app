"""Round 15 (2 Oct): the third Teach layout, "Flip". The question has the whole screen; the verdict buttons sit in a strip
in the bottom bar; Show answer (key A) turns the screen to the answer at full size. Exit code 1 on any FAIL."""
import os, sys, types
HERE_T = os.path.dirname(os.path.abspath(__file__))
R = types.SimpleNamespace(); _f = os.path.join(HERE_T, "test_bugs_round10.py")
_ns = {"__file__": _f}; exec(open(_f, encoding="utf-8").read().split("\ntry:\n")[0], _ns); R.__dict__.update(_ns)
from playwright.sync_api import sync_playwright
MA, check, page, ctx_ = R.MA, R.check, R.page, R.ctx_
GO = "t => Array.from(document.querySelectorAll('.outline .oc')).find(x => x.textContent.indexOf(t) >= 0).click()"
SC = "s => { const q = document.querySelector(s); return [scrollY, q ? q.scrollHeight - q.clientHeight : -1]; }"

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        for w, h in ((1280, 800), (1440, 900)):
            c = ctx_(b, w, h); c.add_init_script("localStorage.setItem('tutor.layout', 'flip')"); p = page(c, "?try#/lesson/" + MA + "/teach"); p.wait_for_timeout(4000)
            bad = []
            for tx in ["Set 5 Q6", "Set 6 Q14", "Set 1 Q4", "exact value of tan 75", "Given that tan A"]:
                p.evaluate(GO, tx); p.wait_for_timeout(1500)
                q = p.evaluate(SC, ".chunk.cur .fitq"); p.keyboard.press("a"); p.wait_for_timeout(1200); a = p.evaluate(SC, ".chunk.cur.flipped .fita")
                if q[0] or q[1] > 2 or a[0] or a[1] > 2: bad.append((tx, q, a))
                p.keyboard.press("a"); p.wait_for_timeout(300)
            check("flip at %dx%d: question and answer screens need no scrolling" % (w, h), not bad, bad)
            if w == 1280:
                p.evaluate(GO, "Set 5 Q6"); p.wait_for_timeout(1200)
                check("question screen: nothing covers it, verdicts are in the bottom bar", p.locator(".tfoot .vstrip .vb").count() == 3 and p.locator(".chunk.cur .fita").is_hidden())
                p.locator(".vstrip [data-flip]").click(); p.wait_for_timeout(500)
                check("Show answer turns the screen to the mark scheme", p.locator(".chunk.cur.flipped .fita .fig img").first.is_visible() and p.locator(".chunk.cur .fitq").is_hidden())
                p.locator('.vstrip .vb[data-v="partly"]').click(); p.wait_for_timeout(300)
                check("a verdict records from the strip", p.locator('.vstrip .vb[data-v="partly"]').get_attribute("aria-pressed") == "true")
                p.locator(".vstrip [data-vmore]").click(); p.wait_for_timeout(300); p.fill(".vstrip input[data-mk]", "5"); p.wait_for_timeout(300)
                check("the ⋯ button opens marks, wording, terminology", p.locator(".vstrip .vs[data-v='wording']").is_visible() and p.locator(".vstrip input[data-mk]").input_value() == "5")
                p.screenshot(path=os.path.join(R.OUT, "r15-flip.png"))
                p.locator(".tfoot .btn.next").click(); p.wait_for_timeout(500)
                check("the next screen starts on the question again", p.locator(".chunk.cur.flipped").count() == 0)
                p.click("#trydot"); p.wait_for_timeout(200)
                check("the try-out dot offers all four layouts", p.locator(".trypanel button[data-layout]").count() == 4 and p.locator('.trypanel button[data-layout="flip"]').get_attribute("aria-pressed") == "true")
            c.close()
        b.close()
finally:
    R.srv.kill()
for e in R.errs: print(e)
print("\n%d FAIL" % len(R.fails) if R.fails else "\nall PASS")
sys.exit(1 if R.fails or R.errs else 0)
