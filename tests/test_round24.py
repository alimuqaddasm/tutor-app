"""Round 24 (11 Oct): Ali's suggestions of 10 and 11 Oct.
- Teach: moving through the script with the clock stopped shows a bar (Start lesson / Resume) until the clock runs.
- Exam page (Exams tab): every question shows on the page, tap to open it large; Suggest a change is there.
- His exam page: a question with a picture shows only the picture, not its text as well.
- Multiple choice: he taps a letter (saved as his answer, tap again to clear), and can still send pictures of his working.
Needs the local exam server on :8787 and the app on :8765 (see tests/README.md). Run: python tests/runtest.py tests/test_round24.py
"""
import json, os, struct, sys, time, urllib.request, zlib
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def png(w=600, h=160, rgb=(240, 240, 255)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def wait_for(pg, fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        pg.wait_for_timeout(250)
    return None


def sapi(path, token):
    with urllib.request.urlopen(urllib.request.Request(API + path, headers={"X-Exam-Token": token})) as r:
        return json.loads(r.read())


fake = FakeGH()
# an exam with a picture MCQ (with a working line), a picture long question and a text-only question
FOLDER = "students/UK-1/exams/2099-01-01-chem-t%d/" % int(time.time())
exam = {"id": "2099-01-01-chem", "title": "Isomers (test)", "subject": "chem", "status": "ready", "minutes": 20, "questions": [
    {"id": "q1", "label": "Q1", "marks": 1, "type": "mcq", "text": "<p>How many structural isomers have the formula C4H9Br?</p>", "img": ["assets/q1.png"],
     "work": "Draw all 4 isomers and send a picture."},
    {"id": "q2", "label": "Q2", "marks": 3, "type": "long", "text": "<p>WORDS THAT ARE ALSO IN THE PICTURE</p>", "img": ["assets/q2.png"]},
    {"id": "q3", "label": "Q3", "marks": 2, "type": "short", "text": "<p>Name the functional group in ethanol.</p>"}]}
fake.extra[FOLDER + "exam.json"] = json.dumps(exam).encode()
fake.extra[FOLDER + "assets/q1.png"] = png(600, 160, (230, 240, 255))
fake.extra[FOLDER + "assets/q2.png"] = png(600, 200, (255, 240, 220))
# a lesson nobody has started, for the clock bar
src = json.load(open(os.path.join(fake.clone, "students/UK-1/lessons/2026-10-10-maths/script.json")))
src.update({"id": "2099-01-02-maths", "date": "2099-01-02", "status": "ready"})
fake.extra["students/UK-1/lessons/2099-01-02-maths/script.json"] = json.dumps(src).encode()

errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium"))
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.layout','flip');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);}catch(e){}" % (json.dumps(API), json.dumps(PW)))
    ctx.route("https://api.github.com/**", fake.route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    # ---------- Teach: the clock bar ----------
    pg.goto(APP + "#/lesson/2099-01-02-maths/teach")
    wait_for(pg, lambda: pg.locator(".tfoot").count() == 1, 20)
    check("Teach: no clock bar before Ali moves", pg.locator(".clocknag").count() == 0)
    pg.click('.tfoot [data-tgo="+1"]')
    check("  ...moving with the clock never started shows the bar", wait_for(pg, lambda: "has not started" in pg.inner_text(".clocknag")) is not None)
    check("  ...the clock button pulses", pg.locator("#clkgo.nag").count() == 1)
    pg.screenshot(path=os.path.join(SHOTS, "r24-clocknag-1440.png"))
    pg.click(".clocknag [data-clkgo]")
    check("  ...Start lesson in the bar starts the clock and the bar goes", wait_for(pg, lambda: pg.locator(".clocknag").count() == 0 and pg.locator(".clockpill.live").count() == 1) is not None)
    pg.click("#clkgo")  # pause
    pg.click('.tfoot [data-tgo="+1"]')
    check("  ...paused: the break bar offers Resume (round 27)", wait_for(pg, lambda: "On a break" in pg.inner_text(".clocknag") and pg.inner_text(".clocknag [data-clkgo]") == "Resume") is not None)
    nb, vr = pg.locator(".clocknag").bounding_box(), pg.locator(".chunk.cur .vrail").bounding_box() if pg.locator(".chunk.cur .vrail").count() else None
    check("  ...the bar is clear of the verdict buttons", not vr or nb["x"] + nb["width"] <= vr["x"], [nb, vr])
    pg.click(".clocknag [data-clkgo]")
    check("  ...Resume in the bar runs the clock again", wait_for(pg, lambda: pg.locator(".clocknag").count() == 0 and pg.locator(".clockpill.live").count() == 1) is not None)
    pg.click("#clkgo")
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.reload()
    wait_for(pg, lambda: pg.locator(".tfoot").count() == 1, 20)
    check("  ...after a reload the break bar is still there (phone)", wait_for(pg, lambda: pg.locator(".clocknag").count() == 1) is not None)
    pg.screenshot(path=os.path.join(SHOTS, "r24-clocknag-390.png"))
    check("  ...fits the phone width", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.set_viewport_size({"width": 1440, "height": 900})

    # ---------- Exams tab: questions on the exam page ----------
    pg.goto(APP + "#/exams")
    wait_for(pg, lambda: pg.locator('[data-load="%sexam.json"]' % FOLDER).count() == 1, 20)
    pg.click('[data-load="%sexam.json"]' % FOLDER)
    wait_for(pg, lambda: pg.locator("#xt-btns").count() == 1, 30)
    xid = pg.evaluate("location.hash").split("/")[2]
    check("exam page: Suggest a change is there", pg.locator(".xt-head [data-suggest]").count() == 1)
    pg.click(".xt-head [data-suggest]")
    check("  ...and opens with the exam named", wait_for(pg, lambda: xid in pg.inner_text("#sug-w")) is not None)
    pg.click("#sug-x")
    check("  ...the type list offers Multiple choice", "Multiple choice" in pg.inner_text('tr[data-q="q1"] select'))
    pg.click("[data-newlink]")
    wait_for(pg, lambda: "#t=" in pg.input_value("#xt-link"), 10)
    link = pg.input_value("#xt-link")
    token = link.split("#t=")[1].split("&")[0]
    pg.click("[data-start]")
    wait_for(pg, lambda: pg.locator(".xq-look").count() == 3, 15)
    check("  ...once started, every question shows on the page", pg.locator(".xq-look").count() == 3)
    check("  ...pictures load", wait_for(pg, lambda: pg.locator(".xq-look img").nth(0).evaluate("i => i.naturalWidth > 0")) is not None)
    check("  ...a text-only question shows its text", "functional group" in pg.inner_text('[data-q="q3"] .xq-look'))
    pg.locator(".xq-look img").nth(0).click()
    check("  ...tapping a picture opens it large", wait_for(pg, lambda: pg.locator("#zoom").is_visible()) is not None)
    pg.keyboard.press("Escape")
    pg.evaluate("document.getElementById('zoom').hidden = true")
    pg.screenshot(path=os.path.join(SHOTS, "r24-exampage-1440.png"), full_page=True)
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(SHOTS, "r24-exampage-390.png"), full_page=True)
    check("  ...the exam page fits the phone width", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.set_viewport_size({"width": 1440, "height": 900})

    # ---------- his page ----------
    sctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
    st = sctx.new_page()
    st.on("pageerror", lambda e: errs.append("student: " + str(e)))
    st.goto(link)
    check("his page: the MCQ shows letters A to D", wait_for(st, lambda: st.locator(".ex-pick").count() == 4, 15) is not None)
    check("  ...a picture question shows no text beside the picture", st.locator(".ex-qtext").is_hidden() and "How many" not in st.inner_text("#ex"))
    check("  ...the working line from exam.json is shown, with the photo buttons", "Draw all 4 isomers" in st.inner_text(".ex-work") and st.locator(".ex-work [data-draw]").count() == 1)
    st.click('[data-pick="B"]')
    check("  ...tapping B saves B", wait_for(st, lambda: sapi("/api/s/state", token)["answers"].get("q1", {}).get("text") == "B", 10) is not None)
    st.screenshot(path=os.path.join(SHOTS, "r24-mcq-1280.png"), full_page=True)
    st.click('[data-pick="C"]')
    check("  ...tapping C changes it to C", wait_for(st, lambda: sapi("/api/s/state", token)["answers"]["q1"]["text"] == "C", 10) is not None and st.locator('[data-pick="C"][aria-pressed="true"]').count() == 1)
    st.click('[data-pick="C"]')
    check("  ...tapping C again clears it", wait_for(st, lambda: sapi("/api/s/state", token)["answers"]["q1"]["text"] == "", 10) is not None)
    st.click('[data-pick="D"]')
    wait_for(st, lambda: sapi("/api/s/state", token)["answers"]["q1"]["text"] == "D", 10)
    st.click("[data-next]")
    check("  ...the long picture question hides its text too", wait_for(st, lambda: st.locator(".ex-qimg").count() == 1 and "WORDS THAT ARE ALSO" not in st.inner_text("#ex")) is not None)
    st.click("[data-next]")
    check("  ...a text-only question still shows its text", wait_for(st, lambda: "functional group" in st.inner_text("#ex")) is not None)
    st.set_viewport_size({"width": 390, "height": 844})
    st.click("[data-prev]"); st.click("[data-prev]")
    wait_for(st, lambda: st.locator(".ex-pick").count() == 4)
    st.screenshot(path=os.path.join(SHOTS, "r24-mcq-390.png"), full_page=True)
    check("  ...fits the phone width", st.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))

    # Student view (read-only) shows the same: picture only, his letter pressed
    pg.goto(APP + "exam.html#v=" + xid)
    check("Student view: picture only, his letter D pressed, letters locked", wait_for(pg, lambda: pg.locator('[data-pick="D"][aria-pressed="true"]').count() == 1 and pg.locator('[data-pick="A"]').is_disabled() and "How many" not in pg.inner_text("#ex"), 15) is not None)
    check("nothing written to the tutoring repo but the test lesson's clock (pretend GitHub)", all(k.startswith("students/UK-1/lessons/2099-01-02-maths/") for k in fake.puts), list(fake.puts))
    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
