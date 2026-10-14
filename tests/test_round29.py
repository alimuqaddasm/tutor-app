"""Round 29 (12 Oct): a board that grows click by click is ONE screen for Ali (the full board), and a
"Next line" button adds the next line on his screen (Ali, 12 Oct: "I see one board only, not five times
the same board; he sees a new line every click").  Run: python tests/runtest.py tests/test_round29.py
Uses the 12 Oct maths lesson: 7.1 board (6 lines) and 7.2 board (10 lines)."""
import json, os, sys, time
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))

errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    for flow in ("quick", "steps"):
        c = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow',%s);localStorage.setItem('tutor.test','1')" % json.dumps(flow))
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
        # how many screens carry a board picture
        n = pg.evaluate("__t(\"TCH.seq.filter(function(c){return c.t==='question'&&/^Board: (the addition|deriving the double)/.test(c.b.label||'')}).length\")")
        check(flow + ": the 7.1 and 7.2 boards are one screen each", n == 2, n)
        lines = pg.evaluate("__t(\"TCH.seq.filter(function(c){return c.lines}).map(function(c){return c.lines.length})\")")
        check(flow + ": every growing board is one screen (7.1: 6, 2, 3, 4 lines; 7.2: 10)", lines == [6, 2, 3, 4, 10], lines)
        if flow != "quick": c.close(); continue
        stu = c.new_page(); stu.on("pageerror", lambda e: errs.append(str(e)))
        stu.goto(APP + "#/lesson/" + LID + "/student"); stu.wait_for_timeout(2500)
        pos = pg.evaluate("__t(\"TCH.seq.findIndex(function(c){return c.lines&&c.lines.length===6})\")")
        pg.evaluate("p=>__t('TCH.pos='+p+';drawTeach()')", pos); pg.wait_for_timeout(1000)
        tags = pg.inner_text(".chunk.cur .growtag")
        check("Ali sees 'Question only' (since round 30 his board builds too)", "Question only" in tags, tags)
        btn = pg.locator(".tfoot [data-line]")
        check("button reads 'Show him the question'", btn.inner_text().strip() == "Show him the question", btn.inner_text())
        pg.wait_for_function("()=>__t(\"studentSeen['%s']\")" % LID, timeout=10000)
        seen = []
        pg.locator(".tfoot [data-line]").click(); pg.wait_for_timeout(500)
        for k in range(1, 7):
            pg.locator(".tfoot [data-line]").click(); pg.wait_for_timeout(500)
            seen.append(stu.evaluate("__t('STU.items[STU.i].id')"))
        check("each click puts the next line on his screen", seen == ["s71-g%d" % k for k in range(1, 7)], seen)
        check("after the last line the button offers to start again", "Start again" in pg.locator(".tfoot [data-line]").inner_text())
        check("his screen shows the board", stu.locator(".stu-fit canvas.bcv").count() == 1)
        pg.screenshot(path=os.path.join(SHOTS, "r29-teach-1440.png")); stu.screenshot(path=os.path.join(SHOTS, "r29-student.png"))
        pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(SHOTS, "r29-teach-390.png"))
        # the next screen is not another copy of the same board
        pg.set_viewport_size({"width": 1440, "height": 900}); pg.evaluate("p=>__t('TCH.pos='+(p+1)+';drawTeach()')", pos); pg.wait_for_timeout(500)
        nxt = pg.evaluate("__t(\"(function(){var c=TCH.seq[TCH.pos];return c.t+':'+(c.b&&c.b.label||'')})()\")")
        check("the next screen is not the same board again", "the addition formulae" not in nxt, nxt)
        c.close()
    b.close()
check("no page errors", not errs, errs[:3])
print("%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
