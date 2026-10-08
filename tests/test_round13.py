"""Round 13 (2 Oct): Ali's notes from trying v19. Every check prints PASS or FAIL; exit code 1 on any FAIL.
1. Pictures: Teach preloads the lesson's pictures (it only did from Plan), including pictures inside answers, next screens first.
2. Maths questions are set like an exam paper (Times-style text, KaTeX maths).
3. Try-out: a labelled button and a soft orange glow round the window edges that never blocks a tap."""
import os, sys, types, json
HERE_T = os.path.dirname(os.path.abspath(__file__))
R = types.SimpleNamespace(); _f = os.path.join(HERE_T, "test_bugs_round10.py")
_ns = {"__file__": _f}; exec(open(_f, encoding="utf-8").read().split("\ntry:\n")[0], _ns); R.__dict__.update(_ns)
from playwright.sync_api import sync_playwright
MA, check, page = R.MA, R.check, R.page

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.layout', 'classic'); localStorage.setItem('tutor.token', %s);" % json.dumps(R.TOK))
        blobs = []
        def route(r):
            if r.request.method != "GET": return r.abort()
            if "/git/blobs/" in r.request.url: blobs.append(r.request.url.split("/git/blobs/")[1].split("?")[0])
            r.continue_()
        c.route("https://api.github.com/**", route)
        p = page(c, "?try#/lesson/" + MA + "/teach"); p.wait_for_timeout(9000)
        shas = p.evaluate("""() => { const t = JSON.parse(localStorage.getItem('tutor.tree.alimuqaddasm/tutoring')); const m = {}; t.forEach(x => m[x.path] = x.sha); return m; }""")
        base = "students/UK-1/lessons/%s/assets/" % MA
        want = {k: shas.get(base + k) for k in ["r5.png", "r5-ans.png", "c3t-q10-ans.png", "mg-addition-board13.jpg"]}
        got = {k: v in blobs for k, v in want.items()}
        check("Teach opened directly preloads the lesson's pictures, answers included", all(got.values()), got)
        # 2. exam-paper look
        p.evaluate("Array.from(document.querySelectorAll('.outline .oc')).find(x => x.textContent.indexOf('sin 15') >= 0).click()"); p.wait_for_timeout(1500)
        ff = p.evaluate("getComputedStyle(document.querySelector('.chunk.cur .qtext')).fontFamily")
        check("maths question text uses a Times-style font", "Times" in ff or "Tinos" in ff, ff)
        check("maths is typeset (KaTeX) and the question says 'Without using a calculator'", p.locator(".chunk.cur .qtext .katex").count() >= 1 and "Without using a calculator" in p.locator(".chunk.cur .qtext").inner_text())
        p.screenshot(path=os.path.join(R.OUT, "r13-maths-font.png"))
        # 3. try-out look
        glow = p.evaluate("getComputedStyle(document.body, '::after').boxShadow")
        check("try-out: a soft orange glow round the window", "178, 98, 0" in glow, glow[:80])
        check("try-out: the marker dot is there (v21: plain dot; the Try-out button is in the top bar)", p.locator("#trydot").count() == 1 and p.locator(".tmini [data-trytoggle]").inner_text() == "Leave try-out")
        nb = p.locator(".tfoot .btn.next"); bb = nb.bounding_box(); a = R.pos(p)
        p.mouse.click(bb["x"] + bb["width"] - 4, bb["y"] + bb["height"] / 2); p.wait_for_timeout(400)
        check("the glow never blocks a tap (Next at the screen edge still works)", R.pos(p) != a)
        c.close(); b.close()
finally:
    R.srv.kill()
for e in R.errs: print(e)
print("\n%d FAIL" % len(R.fails) if R.fails else "\nall PASS")
sys.exit(1 if R.fails or R.errs else 0)
