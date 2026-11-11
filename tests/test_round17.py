"""Round 17 (6 Oct): fix what the mic heard, and whose doing a short lesson was.
   smux20uuf: the notes in After the lesson are boxes Ali can correct; after the mic, a "Heard" box lets him fix it there and then.
   smux25cmd: a normal lesson under 45 min asks on Finish who cut it short; Ali's minutes go on the make-up time, the student's add nothing.
   Pretend GitHub as in tests/test_batch1_lessons.py.

    python tests/runtest.py tests/test_round17.py      (the app on :8765)
   11 Nov: brought up to date with the redesign. The side pages open from the More menu in Teach, a finished lesson opens
   on After the lesson, and the home card is read as a number before and after.
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
results = []
FAKE_SR = """
Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, writable: true, value: function () { var r = this; window.__sr = r;
  r.start = function () { window.__srStarted = (window.__srStarted || 0) + 1; setTimeout(function () {
    var res = [[{ transcript: window.__heard || "said electrophile not nucleophile" }]]; res[0].isFinal = true;
    r.onresult && r.onresult({ results: res }); r.onend && r.onend(); }, 150); };
  r.stop = function () {}; } });
Object.defineProperty(window, "SpeechRecognition", { configurable: true, writable: true, value: window.webkitSpeechRecognition });
"""


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def wait(pg, fn, timeout=8.0):
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

    def page(fake, flow="quick"):
        c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
        c.add_init_script(FAKE_SR + "localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow',%s);" % json.dumps(flow))
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        return pg

    def saved(fake, path):
        return json.loads(fake.puts[path]) if path in fake.puts else {}

    def side(pg, id, sel):
        # the lesson's side pages (Times, After the lesson) open from the "More" menu in Teach; from a side page, the
        # lesson title in the crumb goes back to Teach first (the redesign took the old parts rail away)
        if pg.locator(sel).count() and pg.locator(sel).first.is_visible(): return
        if pg.locator("[data-tmore]").count() == 0:
            pg.click(".crumb button[data-phase]"); pg.wait_for_selector("[data-tmore]", timeout=8000); pg.wait_for_timeout(200)
        pg.click("[data-tmore]"); pg.click(".tmenu [data-phase='%s']" % id); pg.wait_for_selector(sel, timeout=8000); pg.wait_for_timeout(300)

    def after(pg, lid):
        pg.goto(APP + "#/lesson/" + lid); pg.wait_for_selector("[data-tmore], #fbform", timeout=30000); pg.wait_for_timeout(600)   # a finished lesson opens on After the lesson
        side(pg, "_after", "#fbform")

    def set_minutes(pg, n, lid):
        side(pg, "_time", "[data-tm='minutes']")
        pg.fill("[data-tm='minutes']", str(n)); pg.wait_for_timeout(300)
        side(pg, "_after", "#fbform")

    # 1. After the lesson: the notes are boxes, and a correction is saved
    fake = FakeGH(); LID = "2026-10-05-chem"; path = "students/UK-1/lessons/%s/session.json" % LID
    pg = page(fake); after(pg, LID)
    boxes = pg.locator("#lessonnotes textarea[data-note]")
    check("After the lesson: each note is a box you can type in", boxes.count() >= 3, boxes.count())
    k = pg.evaluate("document.querySelector('#lessonnotes li[data-item]').dataset.item")
    boxes.first.fill("South Africa and Pakistan: he could read 'define' versus 'describe'")
    check("  the corrected note is saved to the lesson",
          wait(pg, lambda: (saved(fake, path).get("answers", {}).get(k) or {}).get("note", "").startswith("South Africa and Pakistan:")) is not None,
          (saved(fake, path).get("answers", {}).get(k) or {}).get("note"))
    pg.context.close()

    # 2. Teach: after the mic, a Heard box to fix it there and then
    fake = FakeGH(); LID = "2026-10-04-chem"; path = "students/UK-1/lessons/%s/session.json" % LID
    pg = page(fake)
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    pg.evaluate("(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}", "Oral quiz"); pg.wait_for_timeout(900)
    pg.click(".chunk.cur .brow:nth-child(2) .bq"); pg.wait_for_timeout(400)
    k = pg.evaluate("document.querySelector('.vrail').dataset.item")
    pg.evaluate("window.__heard = 'said electro file'")
    pg.click(".vrail [data-mic]")
    check("Teach: after the mic, a Heard box shows what it heard", wait(pg, lambda: pg.locator("#micfix input").count() == 1 and "electro file" in pg.input_value("#micfix input")) is not None)
    check("  it does not grab the keyboard by itself", pg.evaluate("!document.getElementById('micfix').contains(document.activeElement)"))
    pg.fill("#micfix input", "said electrophile")
    pg.keyboard.press("Enter")
    check("  Enter closes it", wait(pg, lambda: pg.locator("#micfix").count() == 0) is not None)
    check("  the fixed note is the question's note", wait(pg, lambda: (saved(fake, path).get("answers", {}).get(k) or {}).get("note") == "said electrophile", 10) is not None, (saved(fake, path).get("answers", {}).get(k) or {}).get("note"))
    check("  and the note box in the ... menu shows it", pg.input_value(".vrail input[data-note]") == "said electrophile")
    pg.evaluate("window.__heard = 'second note'"); pg.click(".vrail [data-mic]")
    wait(pg, lambda: pg.locator("#micfix").count() == 1)
    pg.wait_for_timeout(8600)
    check("  left alone, it goes after about 8 seconds", pg.locator("#micfix").count() == 0)
    pg.context.close()

    # 3. Short lesson: Finish asks whose doing it was
    def cut(card):
        m = re.search(r"Cut short by you\s*\+?\s*(\d+)", card)
        return int(m.group(1)) if m else 0

    def short_case(by):
        fake = FakeGH(); LID = "2026-10-05-chem"; path = "students/UK-1/lessons/%s/session.json" % LID
        pg = page(fake)
        # the home card counts lessons already cut short in the real data, so read its number first
        pg.goto(APP + "#/"); pg.wait_for_selector("#mkcard", timeout=30000); before = cut(pg.inner_text("#mkcard"))
        after(pg, LID)
        set_minutes(pg, 38, LID)
        pg.click("#fbform button[type=submit]"); pg.wait_for_timeout(400)
        check("[%s] under 45 min: Finish asks who cut it short" % by, pg.locator(".shortask").count() == 1 and "7 short of 45" in pg.inner_text(".shortask"), pg.inner_text("#fbform")[:200])
        pg.click("[data-short='%s']" % by)
        s = wait(pg, lambda: saved(fake, path).get("short"))
        check("  the answer is saved with the lesson", s and s.get("by") == by, saved(fake, path).get("short"))
        want = "7 min went on make-up owed" if by == "ali" else "nothing was added"   # "make-up owed" is the glossary's word since the redesign
        check("  After the lesson says what happened", wait(pg, lambda: want in pg.inner_text("#fbform")) is not None, pg.inner_text("#fbform")[-300:])
        pg.goto(APP + "#/"); pg.wait_for_selector("#mkcard", timeout=30000); card = pg.inner_text("#mkcard")
        check("  home: the make-up card " + ("adds the 7 min" if by == "ali" else "adds nothing"), cut(card) - before == (7 if by == "ali" else 0), (before, cut(card)))
        pg.context.close()
    short_case("ali")
    short_case("student")

    # 4. 45 min or more, or a make-up lesson: no question
    fake = FakeGH(); pg = page(fake); after(pg, "2026-10-05-chem")
    set_minutes(pg, 30, "2026-10-05-chem"); pg.check("#fb-makeup"); pg.wait_for_timeout(300); pg.click("#fbform button[type=submit]"); pg.wait_for_timeout(500)
    check("a make-up lesson under 45 is not asked about", pg.locator(".shortask").count() == 0)
    pg.context.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
