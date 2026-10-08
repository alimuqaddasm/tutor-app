"""Round 12 (2 Oct): Ali's notes from trying v18. Every check prints PASS or FAIL; exit code 1 on any FAIL.
1. Next / Start this part never leaves the page scrolled down (the outline used to drag the page with it).
2. The Teach top bar keeps one height whatever the part's name.
3. Try-out looks like the real app: no strip, one small dot that opens the tools.
4. Maths: the hints after a question fold into it (closed); chemistry keeps its steps. Settings switches it.
5. "Suggest a change" closes at once; the note is sent in the background."""
import os, sys, types, json
HERE_T = os.path.dirname(os.path.abspath(__file__))
R = types.SimpleNamespace(); _f = os.path.join(HERE_T, "test_bugs_round10.py")
_ns = {"__file__": _f}; exec(open(_f, encoding="utf-8").read().split("\ntry:\n")[0], _ns); R.__dict__.update(_ns)
from playwright.sync_api import sync_playwright
CH, MA, check, ctx_, page, pos = R.CH, R.MA, R.check, R.ctx_, R.page, R.pos

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        # 1-2. scroll and bar height over 60 Nexts of the maths lesson
        c = ctx_(b, 1440, 765); p = page(c, "?try#/lesson/" + MA + "/teach"); ys, hs = [], set()
        for i in range(60):
            nb = p.locator(".tfoot .btn.next")
            if not nb.count(): break
            nb.click(); p.wait_for_timeout(200); ys.append(p.evaluate("scrollY")); hs.add(p.evaluate("Math.round(document.querySelector('.tbar').getBoundingClientRect().height)") - (34 if p.locator(".tbar .preview").count() else 0))
        check("page stays at the top after every Next (%d steps)" % len(ys), max(ys) == 0, max(ys))
        check("Teach top bar keeps one height", len(set(hs)) <= 2, sorted(hs))
        for w in (1400, 1024, 390):
            p.set_viewport_size({"width": w, "height": 800}); p.wait_for_timeout(300)
            check("no sideways scroll in Teach at %d px" % w, R.wide(p) <= 0, R.wide(p))
        p.set_viewport_size({"width": 1440, "height": 765}); p.wait_for_timeout(200)
        # 3. try-out: a dot, no strip
        check("try-out: no strip, one small button (v20: labelled 'Try-out')", p.locator(".trydot").count() == 1 and p.locator(".trypanel").is_hidden() and p.locator(".trydot").bounding_box()["height"] <= 32 and p.locator(".trydot").bounding_box()["width"] <= 120)
        p.click("#trydot"); p.wait_for_timeout(200)
        check("the dot opens Suggest / Leave try-out", p.locator(".trypanel [data-suggest]").is_visible() and p.locator("#tryleave").is_visible())
        p.screenshot(path=os.path.join(R.OUT, "r12-try-dot.png")); p.click("#tryx"); p.wait_for_timeout(200)
        # 4. hints fold under the maths question
        p.evaluate("Array.from(document.querySelectorAll('.outline .oc')).find(x => x.textContent.indexOf('Set 6 Q12') >= 0).click()"); p.wait_for_timeout(500)
        check("maths: Set 6 Q12 carries its hints, on the back of the Flip card (A)", p.locator(".chunk.cur .thints").count() == 1 and p.locator(".chunk.cur .fita .thints").count() == 1 and not p.locator(".chunk.cur .thints").is_visible())
        p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
        check("maths: the next screen is the next question, not a hint", p.locator(".chunk.cur.t-question").count() == 1, p.locator(".chunk.cur").get_attribute("class"))
        p.screenshot(path=os.path.join(R.OUT, "r12-hints.png")); c.close()
        c = ctx_(b); p = page(c, "?try#/lesson/" + CH + "/teach")
        check("chemistry keeps its steps as screens", p.locator(".outline .oc").filter(has_text="Open with the app").count() >= 1)
        p.evaluate("location.hash = '#/settings'"); p.wait_for_selector("#setform"); p.locator('[data-fold="maths"]').uncheck(); p.wait_for_timeout(200)
        p.evaluate("location.hash = '#/lesson/%s/teach'" % MA); p.wait_for_selector(".teach3"); p.wait_for_timeout(800)
        check("Settings: maths hints back as their own steps", p.locator(".outline .oc").filter(has_text="Q12 (3 min)").count() == 1); c.close()
        # 5. suggestion closes at once; sent in the background (to the pretend GitHub)
        F = R.FakeGH(); c = ctx_(b, fake=F); p = page(c, "?try#/lesson/" + CH + "/teach")
        p.click("[data-tmore]"); p.locator(".tmini [data-suggest]").click(); p.wait_for_timeout(300); p.fill("#sug-text", "TEST ONLY: ignore"); p.click("#sug-save"); p.wait_for_timeout(150)
        check("suggestion box closes at once", p.locator("#sug").count() == 0)
        p.wait_for_timeout(4000); body = F.files.get("docs/ui-feedback.jsonl", (None, b""))[1].decode("utf-8")
        check("the note reaches GitHub in the background", "TEST ONLY: ignore" in body and p.evaluate("localStorage.getItem('tutor.sugq')") == "[]"); c.close()
        b.close()
finally:
    R.srv.kill()
for e in R.errs: print(e)
print("\n%d FAIL" % len(R.fails) if R.fails else "\nall PASS")
sys.exit(1 if R.fails or R.errs else 0)
