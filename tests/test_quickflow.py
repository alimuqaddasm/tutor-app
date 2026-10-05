"""Quick flow (5 Oct, Ali: "too many ums and pauses"): no title screens, a section's steps on one screen, the quiz
   as one board you tap, notes behind an i, book pages behind one button. Also the 5 Oct small fixes: a double tap
   keeps the mark, Taught/Skip after the clock stops, the make-up log, pictures preloaded from the home page.
   Pretend GitHub as in tests/test_batch1_lessons.py.

    python tests/test_quickflow.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-04-chem"
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def wait(pg, fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        pg.wait_for_timeout(200)
    return None


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()

    def page(flow="quick", extra=""):
        c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow',%s);%s" % (json.dumps(flow), extra))
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        return pg

    def go(pg, text):
        pg.evaluate("""(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}""", text)
        pg.wait_for_timeout(700)

    # step by step vs quick: far fewer screens
    pg = page("steps")
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000)
    steps_n = int(pg.inner_text(".tmini .hint.num").split("/")[1])
    pg.context.close()
    pg = page()
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(1000)
    quick_n = int(pg.inner_text(".tmini .hint.num").split("/")[1])
    check("quick flow has far fewer screens (under half)", quick_n * 2 < steps_n, (quick_n, steps_n))
    kinds = pg.evaluate("TCH_SEQ_KINDS = null") if False else None
    check("no title screens: the first screen is something to act on", pg.locator(".chunk.cur.t-phase, .chunk.cur.t-mod").count() == 0)

    # the quiz board
    go(pg, "Oral quiz")
    check("the quiz is one board", pg.locator(".chunk.cur.t-board .brow").count() >= 20, pg.locator(".chunk.cur .brow").count())
    stars = pg.evaluate("[...document.querySelectorAll('.chunk.cur .brow')].map(r=>r.classList.contains('star'))")
    check("  starred questions first", stars == sorted(stars, reverse=True))
    check("  the list fits above the buttons (scrolls inside)", pg.evaluate("(()=>{const b=document.querySelector('.chunk.cur .board'),f=document.querySelector('.tfoot');return b.getBoundingClientRect().bottom<=f.getBoundingClientRect().top+2})()"))
    check("  book pages sit behind one button", pg.locator(".chunk.cur [data-qpages]").count() == 1 and pg.locator(".chunk.cur .qs-pages[hidden]").count() == 1)
    pg.click(".chunk.cur [data-qpages]")
    check("    which opens the page numbers", pg.locator(".chunk.cur .qs-pages:not([hidden]) .qs-pg").count() >= 5)
    pg.click(".chunk.cur .brow:nth-child(3) .bq")
    check("  tapping a question opens it with the verdicts above the answer", pg.evaluate("(()=>{const o=document.querySelector('.brow.open');if(!o)return false;const v=o.querySelector('.ctl.big'),a=o.querySelector('.bans');return v&&a&&v.getBoundingClientRect().top<a.getBoundingClientRect().top})()"))
    path = "students/UK-1/lessons/%s/session.json" % LID
    pg.keyboard.press("2")   # Wrong (the lesson is finished, so verdicts count)
    check("  a miss pulls up questions from the same page", wait(pg, lambda: pg.locator(".chunk.cur .brow.rel").count() >= 1, 3) is not None or pg.evaluate("(()=>{const o=document.querySelector('.brow.open .bpg');return !o})()"))
    check("  the verdict is saved", wait(pg, lambda: path in fake.puts, 8) is not None)
    pg.click(".chunk.cur .brow:not(.open):not([data-v=right]):not([data-v=wrong]) .bq")   # another question, marked with a nervous double tap
    k = pg.evaluate("document.querySelector('.brow.open .ctl.big').dataset.item")
    pg.evaluate("(()=>{const b=document.querySelector('.brow.open .vb-right');b.click();b.click()})()")
    pg.wait_for_timeout(600)
    check("a quick double tap keeps the mark", pg.evaluate("(k)=>{const c=document.querySelector('.ctl.big[data-item=\"'+k+'\"]');return c?c.querySelector('.vb-right').getAttribute('aria-pressed'):document.querySelector('.brow[data-v=right]')!==null}", k) in ("true", True))

    # notes behind an i, opening over the screen
    go(pg, "Propene, 2-bromopropane")
    if pg.locator(".chunk.cur [data-qnote]").count():
        y0 = pg.evaluate("document.querySelector('.chunk.cur .tlabel, .chunk.cur .qcard, .chunk.cur .fitq').getBoundingClientRect().top")
        pg.click(".chunk.cur [data-qnote]")
        y1 = pg.evaluate("document.querySelector('.chunk.cur .tlabel, .chunk.cur .qcard, .chunk.cur .fitq').getBoundingClientRect().top")
        check("notes open over the question without moving it", pg.locator(".chunk.cur .qs-notes:not([hidden])").count() == 1 and abs(y1 - y0) < 2, (y0, y1))
    else:
        check("notes open over the question without moving it", False, "no note on this screen")

    # Taught and Skip after the clock has stopped
    check("Taught and Skip show after the clock stops", pg.locator(".tfoot .btn.skip").count() + pg.locator('[data-tiskip]').count() >= 1)
    go(pg, "3a")
    check("  a section screen has Taught", pg.locator('.tfoot [data-tgo="+1"]').inner_text().strip().startswith("✓"))
    pg.context.close()

    # home: the make-up log and the next lessons' pictures fetched in the background
    pg = page()
    n0 = len([l for l in fake.log if "/git/blobs/" in l[1]])
    pg.goto(APP)
    check("home: make-up card has the log of every change", wait(pg, lambda: pg.locator("#mkcard .mklog li").count() >= 1, 15) is not None)
    pg.wait_for_timeout(5000)
    n1 = len([l for l in fake.log if "/git/blobs/" in l[1]])
    check("home: pictures of the next lessons are fetched in the background", n1 - n0 >= 10, n1 - n0)
    pg.context.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
