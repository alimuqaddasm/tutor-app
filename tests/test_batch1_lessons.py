"""Batch 1 (5 Oct) lesson fixes, against the pretend GitHub (tests/fakegh.py reads a clone of the tutoring repo,
   next to this repo or at TUTORING_CLONE, and keeps every write in memory). The app must be served on :8765.
   Notes stay on the question side in Flip; preview does not record verdicts; a mistyped lesson address makes no
   lesson; "Log without a script" on a taken date asks first; a lesson with no clock asks for its minutes.

    python tests/test_batch1_lessons.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
LID = os.environ.get("LESSON", "2026-10-04-maths")   # has a "Note for you" just before a question
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
        pg.wait_for_timeout(200)   # keeps the pretend GitHub answering
    return None


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    fake.files.pop("students/UK-1/lessons/%s/session.json" % LID, None)   # as if not taught yet, so Teach opens in preview

    def page(dialog=True):
        c = b.new_context(viewport={"width": 1366, "height": 800}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.layout','flip');")
        c.route("https://api.github.com/**", fake.route)
        c.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())   # the app must not need cdnjs
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept() if dialog else d.dismiss())
        return pg

    # 1. Flip: the note before a question shows on the question side
    pg = page()
    pg.goto(APP + "#/lesson/" + LID + "/teach")
    pg.wait_for_selector(".chunk.cur", timeout=30000)
    n = pg.evaluate("document.querySelectorAll('.outline [data-tjump]').length")
    found = False
    for i in range(n):
        pg.evaluate("(i)=>document.querySelector('.outline [data-tjump=\"'+i+'\"]').click()", i)
        pg.wait_for_timeout(120)
        if pg.locator(".chunk.cur.flip .tnote").count():
            found = True
            break
    check("found a Flip question with a note", found)
    if found:
        check("the note is on the question side, not the back", pg.locator(".chunk.cur .fitq .tnote").count() >= 1 and pg.locator(".chunk.cur .fita .tnote").count() == 0)
        check("  folded to one line, with its first words showing", pg.evaluate("document.querySelector('.chunk.cur .fitq .tnote').open") is False and len(pg.inner_text(".chunk.cur .fitq .tnote summary .hint").strip()) > 5)

    # 2. preview: a verdict tap is not recorded
    check("preview label says verdicts are not recorded", "verdicts included" in pg.get_attribute(".preview", "title"))
    pg.click(".vstrip .vb-right")
    pg.wait_for_timeout(4500)
    path = "students/UK-1/lessons/%s/session.json" % LID
    check("a verdict tap in preview saves nothing", path not in fake.puts)
    check("  and the button doesn't light up", pg.get_attribute(".vstrip .vb-right", "aria-pressed") == "false")
    check("  and a message says to press Start lesson", "Start lesson" in pg.inner_text("#toast"))
    pg.click("#clkgo")   # Start lesson
    pg.wait_for_timeout(300)
    pg.click(".vstrip .vb-right")
    check("after Start lesson the verdict is recorded", wait(pg, lambda: path in fake.puts and any(a.get("v") == "right" for a in json.loads(fake.puts[path])["answers"].values()), 10) is not None)
    pg.context.close()

    # 3. a mistyped lesson address makes no lesson
    pg = page()
    before = set(fake.puts)
    pg.goto(APP + "#/lesson/does-not-exist")
    check("a mistyped address says there is no such lesson", wait(pg, lambda: "No lesson called" in pg.inner_text("#app"), 15) is not None, pg.inner_text("#app")[:200])
    pg.wait_for_timeout(1500)
    check("  and nothing is saved", set(fake.puts) == before)
    pg.context.close()

    # 4. Log without a script on a date that has a lesson: OK opens it, Cancel logs a separate one
    def log_new(pg, date, title):
        pg.goto(APP + "#/new")
        pg.wait_for_selector("#newform", timeout=15000)
        pg.fill("#n-date", date)
        pg.select_option("#n-subj", "maths")
        pg.fill("#n-title", title)
        pg.click("#newform button[type=submit]")
        pg.wait_for_timeout(800)
        return pg.evaluate("location.hash")
    pg = page(dialog=True)
    pg.goto(APP); pg.wait_for_timeout(2000)    # home page loads the file list
    check("taken date, OK: opens the lesson that is there", log_new(pg, LID[:10], "typed title") == "#/lesson/" + LID)
    pg.context.close()
    pg = page(dialog=False)
    pg.goto(APP); pg.wait_for_timeout(2000)
    h = log_new(pg, LID[:10], "a second maths lesson")
    check("taken date, Cancel: logs a separate lesson", h == "#/lesson/" + LID + "-2", h)

    # 5. a lesson with no clock asks for its minutes before it counts as taught
    pg.wait_for_selector(".rail", timeout=15000)
    pg.click('.rail button[data-phase="_after"]')
    check("After the lesson asks for the minutes", wait(pg, lambda: pg.locator("#fb-min").count() == 1, 5) is not None)
    pg.fill("#fb-min", "40")
    pg.click("#fbform button[type=submit]")
    p2 = "students/UK-1/lessons/%s-2/session.json" % LID
    ok = wait(pg, lambda: p2 in fake.puts and json.loads(fake.puts[p2])["status"] == "finished", 10)
    s = json.loads(fake.puts[p2]) if p2 in fake.puts else {}
    check("  Finish saves it with 40 minutes", ok is not None and s.get("time", {}).get("minutes") == 40, s.get("time"))
    check("  and the scripted lesson was not touched by it", "a second maths lesson" not in fake.puts.get(path, b"").decode())
    pg.context.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
