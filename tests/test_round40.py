"""Round 40 (21 Oct, app v72): Ali's other open suggestions and two follow-ups.
 - his screens never show "Hard:" (or Easy, Challenge, warm-up) at the start of a question; Teach still does
 - zoom on Student view: - 100% + in the top bar, kept on the device; the canvas page grows and scrolls sideways
 - Teach: End lesson opens After the lesson as a card under the top bar; the bar then has After the lesson to open it again
 - His work page: the question list has every question, video questions too, with their part
Run: python tests/runtest.py tests/test_round40.py   (19 Oct chemistry and 12 Oct maths; writes go to the pretend GitHub)"""
import os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    def ctx(w, h, extra=""):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');" + extra)
        c.route("https://api.github.com/**", fake.route); return c
    # 1. no "Hard:" on his screen
    c = ctx(1440, 900, "localStorage.setItem('tutor.stumode','questions');localStorage.setItem('tutor.stun','1')")
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/2026-10-19-chem/student"); pg.wait_for_selector(".stu-view", timeout=30000); pg.wait_for_timeout(800)
    hard = pg.evaluate("__t('STU.items.filter(function(q){return q.kind===\"quick\"&&/^\\\\s*(<[^>]+>\\\\s*)*hard/i.test(q.text)}).length')")
    total = pg.evaluate("__t('STU.items.filter(function(q){return q.kind===\"quick\"}).length')")
    check("Student view: no quick question starts with 'Hard'", hard == 0 and total > 5, (hard, total))
    k = pg.evaluate("__t('STU.items.findIndex(function(q){return q.id===\"q4\"})')")
    pg.evaluate("k=>__t('STU.i='+k+';STU.tab=\"quick\";drawStudent()')", k); pg.wait_for_timeout(400)
    txt = pg.inner_text(".stu-view")
    check("  ...q4 reads 'In acid hydrolysis, why...' with a capital", "Hard" not in txt and "In acid hydrolysis" in txt, txt[:120])
    # 2. zoom, Questions view
    before = pg.evaluate("document.querySelector('.stu-q').getBoundingClientRect().height")
    pg.click('[data-stuz="1"]'); pg.wait_for_timeout(200); pg.click('[data-stuz="1"]'); pg.wait_for_timeout(300)
    after = pg.evaluate("document.querySelector('.stu-q').getBoundingClientRect().height")
    check("Zoom in twice: the question is bigger, the bar says 150%", after > before * 1.2 and "150%" in pg.inner_text(".stu-zoom"), (before, after, pg.inner_text(".stu-zoom")))
    check("  ...kept on this device", pg.evaluate("localStorage.getItem('tutor.stuzoom')") == "1.5")
    pg.screenshot(path=os.path.join(SHOTS, "r40-zoom-1440.png"))
    pg.click('[data-stuz="0"]'); pg.wait_for_timeout(200)
    check("  ...the middle button goes back to 100%", "100%" in pg.inner_text(".stu-zoom"))
    for _ in range(3): pg.click('[data-stuz="-1"]'); pg.wait_for_timeout(100)
    check("  ...zoom out works too (50%), and stops there", "50%" in pg.inner_text(".stu-zoom") and pg.locator('[data-stuz="-1"]').is_disabled())
    pg.click('[data-stuz="0"]')
    # zoom, canvas
    c.close(); c = ctx(1440, 900, "localStorage.setItem('tutor.stumode','canvas')"); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/2026-10-19-chem/student"); pg.wait_for_selector(".stu.cv", timeout=30000); pg.wait_for_timeout(800)
    w0 = pg.evaluate("document.querySelector('.cv-page').clientWidth")
    pg.click('[data-stuz="1"]'); pg.wait_for_timeout(300)
    w1 = pg.evaluate("document.querySelector('.cv-page').clientWidth")
    check("Canvas: zoom in makes the page wider (it scrolls sideways)", w1 > w0 * 1.2, (w0, w1))
    pg.click('[data-stuz="0"]'); c.close()
    # 3. End lesson opens After the lesson in Teach
    c = ctx(1440, 900); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/2026-10-12-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(600)
    if pg.locator(".tbar #clkend").count() == 0:
        pg.evaluate("__t('L.session.time.log=[];drawLesson()')"); pg.wait_for_timeout(300)
        pg.click("#clkgo"); pg.wait_for_timeout(300)
        a = pg.locator("#ckask [data-ck]")
        if a.count(): a.first.click(); pg.wait_for_timeout(300)
    url0, pos0 = pg.url, pg.evaluate("__t('TCH.pos')")
    pg.click(".tbar #clkend"); pg.wait_for_timeout(600)
    pop = pg.locator("#afterpop")
    check("End lesson opens After the lesson as a card, still in Teach", pop.count() == 1 and pg.url == url0 and pg.locator("#afterpop #fbform").count() == 1, pg.url)
    bb, ab = pop.bounding_box(), pg.locator("#afterbtn").bounding_box()
    check("  ...under the After the lesson button in the top bar", ab and bb and bb["y"] >= ab["y"] + ab["height"] and bb["y"] - ab["y"] - ab["height"] < 24, (ab, bb))
    check("  ...fits the screen", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= 1440 and bb["y"] + bb["height"] <= 901, bb)
    check("  ...the covered box is filled in", len(pg.input_value("#afterpop #fb-cov")) > 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("  ...Escape closes it, Teach on the same step", pop.count() == 0 and pg.evaluate("__t('TCH.pos')") == pos0)
    pg.click("#afterbtn"); pg.wait_for_timeout(300)
    check("  ...the button opens it again", pop.count() == 1)
    pg.fill("#afterpop #fb-change", "Test change line"); pg.wait_for_timeout(100)
    check("  ...typing saves into the lesson", pg.evaluate("__t('L.session.feedback.change')") == "Test change line")
    pg.screenshot(path=os.path.join(SHOTS, "r40-after-1440.png"))
    pg.click("#afterpop [data-afterx]"); pg.wait_for_timeout(200)
    check("  ...the × closes it", pop.count() == 0)
    # 4. His work page lists video questions too
    pg.evaluate("__t(\"MODE='plan';L.phase='_work';location.hash='#/lesson/2026-10-12-maths'\")"); pg.wait_for_timeout(1200)
    if pg.locator("#wk-item").count() == 0: pg.evaluate("__t(\"L.phase='_work';drawLesson()\")"); pg.wait_for_timeout(600)
    opts = pg.evaluate("Array.from(document.querySelectorAll('#wk-item option')).map(o=>[o.value,o.textContent])")
    check("His work: drill (video) questions are in the list", any(v.startswith("d:") for v, t in opts), opts[:4])
    check("  ...each with its part name first", all(" · " in t for v, t in opts[1:] if not v.startswith("x:")), [t for v, t in opts[1:4]])
    c.close()
    # phone
    c = ctx(390, 844); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/2026-10-12-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(600)
    if pg.locator("#afterbtn").count():
        pg.click("#afterbtn"); pg.wait_for_timeout(400); bb = pg.locator("#afterpop").bounding_box()
        check("390 px: the After the lesson card fits", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= 390 and pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), bb)
        pg.screenshot(path=os.path.join(SHOTS, "r40-after-390.png"))
    pg.goto(APP + "#/lesson/2026-10-19-chem/student"); pg.wait_for_selector(".stu", timeout=30000); pg.wait_for_timeout(800)
    check("390 px: zoom buttons on his screen, no sideways scroll", pg.locator(".stu-zoom").count() == 1 and pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.screenshot(path=os.path.join(SHOTS, "r40-stu-390.png")); c.close()
    check("no script errors", not errs, errs)
    b.close()
print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
