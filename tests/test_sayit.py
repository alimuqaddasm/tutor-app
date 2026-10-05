"""Say it (5 Oct): a mic button beside the verdicts (and the M key) turns what Ali says into that question's note.
   The browser's speech-to-text is replaced here by a pretend one that "hears" a fixed sentence, so the test needs
   no microphone. Pretend GitHub as in tests/test_batch1_lessons.py.

    python tests/test_sayit.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-04-chem"
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
    fake = FakeGH()
    path = "students/UK-1/lessons/%s/session.json" % LID

    def page(flow):
        c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
        c.add_init_script(FAKE_SR + "localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow',%s);" % json.dumps(flow))
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        return pg

    def go(pg, t):
        pg.evaluate("(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}", t)
        pg.wait_for_timeout(900)

    def note(k):
        s = json.loads(fake.puts[path]) if path in fake.puts else {}
        return (s.get("answers", {}).get(k) or {}).get("note")

    # quick flow board: tap the mic on an open question
    pg = page("quick")
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    go(pg, "Oral quiz")
    pg.click(".chunk.cur .brow:nth-child(2) .bq"); pg.wait_for_timeout(400)
    check("the mic button sits beside the verdicts", pg.locator(".brow.open [data-mic]").count() == 1)
    k = pg.evaluate("document.querySelector('.brow.open .ctl.big').dataset.item")
    pg.click(".brow.open [data-mic]")
    check("what was said becomes the note and is saved", wait(pg, lambda: note(k) == "said electrophile not nucleophile", 8) is not None, note(k))
    check("  the note shows under the verdicts", pg.input_value(".brow.open input[data-note]") == "said electrophile not nucleophile")
    pg.evaluate("window.__heard = 'then corrected himself'")
    pg.keyboard.down("m"); pg.wait_for_timeout(400); pg.keyboard.up("m")
    check("the M key does the same, adding to the note", wait(pg, lambda: note(k) == "said electrophile not nucleophile; then corrected himself", 8) is not None, note(k))
    pg.context.close()

    # step by step, Flip: the mic is in the verdict strip
    pg = page("steps")
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    go(pg, "Propene, 2-bromopropane")
    check("Flip: the mic is in the verdict strip", pg.locator(".tfoot .vstrip [data-mic]").count() == 1)
    pg.context.close()

    # preview: nothing is recorded before Start lesson
    fake2 = FakeGH(); fake2.files.pop("students/UK-1/lessons/2026-10-04-maths/session.json", None)
    c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
    c.add_init_script(FAKE_SR + "localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.flow','quick');")
    c.route("https://api.github.com/**", fake2.route); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    go(pg, "Maths Genie 7.1"); pg.click(".chunk.cur .brow:nth-child(1) .bq"); pg.wait_for_timeout(300)
    pg.click(".brow.open [data-mic]"); pg.wait_for_timeout(800)
    check("preview: the mic does nothing and says to press Start lesson", pg.evaluate("window.__srStarted || 0") == 0 and "Start lesson" in pg.inner_text("#toast"))
    c.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
