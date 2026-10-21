"""Round 31 (16 Oct): Ali's open suggestions of 11 and 12 Oct.
 - a camera button on past-paper and problem-set questions in Teach saves his WhatsApp photo to that question
 - Student view arranges 2 to 4 questions by their shape (wide maths questions stack, not side by side), up to 4
 - the chips at the bottom of Student view stay on one line and never cover the question
 - Teach has End lesson next to Pause; once ended, the clock reminder stops
Run: python tests/runtest.py tests/test_round31.py   (uses the 12 Oct maths lesson; writes go to the pretend GitHub)"""
import os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
PHOTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icon-192.png")
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    def ctx(w, h):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1')")
        c.route("https://api.github.com/**", fake.route); return c
    c = ctx(1440, 900)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    go = lambda cond: pg.evaluate("p=>__t('TCH.pos='+p+';drawTeach()')", pg.evaluate("__t(\"TCH.seq.findIndex(function(c){return %s})\")" % cond))
    # camera: on a problem-set question, not on a video board
    go("c.t==='question'&&c.b.id==='s6q17'"); pg.wait_for_timeout(400)
    cam = pg.locator('.chunk.cur [data-cam="s6q17"]')
    check("Teach: camera button on Set 6 Q17", cam.count() == 1)
    check("camera reads 'His work' before any photo", cam.count() and "His work" in cam.inner_text(), cam.count() and cam.inner_text())
    pg.screenshot(path=os.path.join(SHOTS, "r31-teach-cam-1440.png"))
    go("c.t==='question'&&/video/i.test(c.b.source||'')"); pg.wait_for_timeout(300)
    check("Teach: no camera on a board from a video", pg.locator(".chunk.cur [data-cam]").count() == 0)
    go("c.t==='question'&&c.b.id==='s6q17'"); pg.wait_for_timeout(300)
    before = len(fake.puts)
    pg.click('.chunk.cur [data-cam="s6q17"]'); pg.wait_for_selector("#campop")
    with pg.expect_file_chooser() as fc: pg.click("#campop [data-camfile]")
    fc.value.set_files(PHOTO)
    pg.wait_for_function("()=>{var b=document.querySelector('.chunk.cur [data-cam=\"s6q17\"]');return b&&/1 photo/.test(b.textContent)}", timeout=15000)
    work = [k for k in fake.puts if "/work/" in k]
    check("the photo went to the lesson's work folder", work and len(fake.puts) > before, list(fake.puts)[-3:])
    w = pg.evaluate("__t('L.session.work.filter(function(w){return w.item===\"s6q17\"}).length')")
    check("session.work logs it against Q17", w == 1, w)
    check("camera now reads '1 photo'", "1 photo" in pg.inner_text('.chunk.cur [data-cam="s6q17"]'))
    # Prepare records nothing, so it has no camera
    pg.goto(APP + "#/lesson/" + LID); pg.wait_for_timeout(1500)
    check("Prepare: no camera (nothing is recorded there)", pg.locator("[data-cam]").count() == 0)
    # End lesson in Teach
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(500)
    if pg.locator(".tbar #clkend").count() == 0:
        pg.click("#clkgo"); pg.wait_for_timeout(400)
        a = pg.locator("#ckask [data-ck]")
        if a.count(): a.first.click(); pg.wait_for_timeout(300)
    check("Teach: End lesson beside the clock once it has started", pg.locator(".tbar #clkend").count() == 1)
    pg.screenshot(path=os.path.join(SHOTS, "r31-teach-end-1440.png"))
    pg.click(".tbar #clkend"); pg.wait_for_timeout(500)
    last = pg.evaluate("__t('L.session.time.log[L.session.time.log.length-1].e')")
    check("End lesson logs 'end'", last == "end", last)
    pg.click('[data-tgo="+1"]'); pg.wait_for_timeout(300); pg.click('[data-tgo="+1"]'); pg.wait_for_timeout(300)
    check("after End, no 'clock is paused' reminder", pg.locator(".clocknag:not(.brk)").count() == 0)
    check("after End, the End button is gone", pg.locator(".tbar #clkend").count() == 0)
    c.close()
    # Student view arrangement
    for W, H in ((1440, 900), (1440, 709), (390, 844)):
        c = ctx(W, H); s = c.new_page(); s.on("pageerror", lambda e: errs.append(str(e)))
        s.goto(APP + "#/lesson/" + LID + "/student"); s.wait_for_timeout(2500)
        k = s.evaluate("__t('STU.items.findIndex(function(q){return q.id===\"s6q17\"})')")
        check("Student view %dx%d: a 4 button" % (W, H), s.locator('[data-stun="4"]').count() == 1)
        s.click('[data-stun="2"]'); s.evaluate("k=>__t('STU.i='+k+';drawStudent()')", k); s.wait_for_timeout(2500)
        cols = s.evaluate("document.querySelector('.stu-many').getAttribute('data-c')")
        check("%dx%d: Q17 and Q18 stack one above the other" % (W, H), cols == "1", cols)
        if W > 760:
            ch = s.evaluate("(()=>{var c=document.querySelector('.stu-chips');var r=c.getBoundingClientRect();var v=[...document.querySelectorAll('.stu-cell')].map(e=>e.getBoundingClientRect().bottom);return [r.top,r.height,Math.max(...v)]})()")
            check("%dx%d: chips on one line, below the questions" % (W, H), ch[1] < 50 and ch[2] <= ch[0], ch)
        s.screenshot(path=os.path.join(SHOTS, "r31-stu2-%d.png" % W))
        s.click('[data-stun="4"]'); s.wait_for_timeout(2000)
        n = s.locator(".stu-cell").count()
        check("%dx%d: 4 questions together" % (W, H), n == 4, n)
        s.click('[data-stun="1"]'); c.close()
    # narrow window: 7 chips must not wrap over the question
    c = ctx(800, 600); s = c.new_page(); s.goto(APP + "#/lesson/" + LID + "/student"); s.wait_for_timeout(2500)
    ch = s.evaluate("(()=>{var c=document.querySelector('.stu-chips').getBoundingClientRect(),v=document.querySelector('.stu-view'),cs=getComputedStyle(v);return [c.height,c.top,innerHeight-parseFloat(cs.paddingBottom)]})()")
    check("800x600: chips one line, question area ends above them", ch[0] < 50 and ch[2] <= ch[1], ch)
    s.screenshot(path=os.path.join(SHOTS, "r31-stu-800.png")); c.close()
    check("no page errors", not errs, errs[:3])
    b.close()
print("\n%d of %d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
