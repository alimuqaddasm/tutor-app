"""Exams tab in Try-out: practice exams do everything, real exams are look-only, nothing goes to GitHub.

Same setup as tests/test_exams_tab.py (local wrangler dev on :8787 with TEACHER_PASSWORD=local-test, the app on :8765).

    python tests/test_exams_tryout.py
"""
import base64, hashlib, json, os, re, struct, sys, time, urllib.request, zlib
from playwright.sync_api import sync_playwright

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
BROWSER = os.environ.get("BROWSER", "msedge" if os.name == "nt" else "chromium")
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
REPO = "alimuqaddasm/tutoring"
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def png(w=600, h=160, rgb=(240, 240, 255)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


# Note: the pretend GitHub only answers while the test is inside a Playwright call, so waits that
# depend on it must call pg.wait_for_timeout rather than time.sleep.
def wait_for(fn, timeout=8.0, step=0.25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step)
    return None


def sapi(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"X-Exam-Token": token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# ---------- the pretend GitHub ----------
FOLDER = "students/UK-1/exams/2026-10-04-maths-t%d/" % int(time.time())  # a fresh folder each run
exam_json = {
    "id": "2026-10-04-maths", "title": "Radians check (test)", "subject": "maths", "date": "2026-10-04", "status": "ready",
    "why": "Chapter 5 finished; 3 open mistakes on radians",
    "questions": [
        {"id": "q1", "label": "Q1", "source": "Edexcel 9MA0/01 June 2019 Q1", "marks": 3, "type": "short", "text": "<p>Convert \\(150^\\circ\\) to radians.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"]},
        {"id": "q2", "label": "Q2", "source": "Maths Genie 5.2 Q3", "marks": 5, "type": "upload_optional", "text": "<p>Find the arc length.</p>", "img": [], "msImg": ["assets/q2-ms.png"], "answer": "<p>\\(s=r\\theta=7.5\\) cm</p>"}
    ]}
files = {FOLDER + "exam.json": json.dumps(exam_json).encode(), FOLDER + "assets/q1.png": png(600, 160, (230, 240, 255)),
         FOLDER + "assets/q1-ms.png": png(500, 120, (255, 240, 220)), FOLDER + "assets/q2-ms.png": png(500, 120, (220, 255, 220))}
puts = {}


def sha(b): return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


def github(route):
    try:
        return github_(route)
    except Exception as e:
        print("pretend GitHub error:", repr(e))
        raise


def github_(route):
    req, url = route.request, route.request.url
    if req.method == "GET" and "/git/trees/" in url:
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"tree": [{"path": p, "type": "blob", "sha": sha(b)} for p, b in files.items()]}))
    m = re.search(r"/git/blobs/([0-9a-f]+)$", url)
    if req.method == "GET" and m:
        for b in files.values():
            if sha(b) == m.group(1):
                return route.fulfill(status=200, body=b, content_type="application/octet-stream")
        return route.fulfill(status=404, body="{}")
    m = re.search(r"/contents/(.+)$", url)
    if req.method == "PUT" and m:
        path = urllib.request.unquote(m.group(1))
        body = json.loads(req.post_data)
        data = base64.b64decode(body["content"])
        if path in files and body.get("sha") != sha(files[path]):
            return route.fulfill(status=409, body='{"message":"sha mismatch"}')
        files[path] = data
        puts[path] = data
        return route.fulfill(status=201, content_type="application/json", body=json.dumps({"content": {"sha": sha(data), "path": path}}))
    if req.method == "GET" and re.search(r"/repos/[^/]+/[^/]+$", url):
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"permissions": {"push": True}}))
    return route.fulfill(status=404, content_type="application/json", body="{}")




def tapi(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"X-Exam-Password": PW, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


real = tapi("POST", "/api/t/exams", {"title": "Real exam (test %d)" % int(time.time()), "subject": "maths", "source_path": "students/UK-1/exams/elsewhere/exam.json", "base_minutes": 30,
                                     "questions": [{"id": "q1", "label": "Q1", "text_html": "<p>Real question</p>", "marks": 3, "type": "short"}]})["id"]

errs = []
with sync_playwright() as p:
    launch = {"channel": "msedge"} if BROWSER == "msedge" else {}
    if os.environ.get("CHROMIUM_PATH"):
        launch = {"executable_path": os.environ["CHROMIUM_PATH"]}
    b = p.chromium.launch(**launch)

    def context():
        ctx = b.new_context(viewport={"width": 1366, "height": 900}, service_workers="block")
        ctx.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
        ctx.route("https://api.github.com/**", github)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e) + " @ " + pg.url + " " + (e.stack or "")[:300]))
        pg.on("dialog", lambda d: d.accept())
        return pg

    pg = context()
    pg.goto(APP + "?try#/exams")
    check("Try-out shows the Practice section", wait_for(lambda: "Practice (Try-out)" in pg.inner_text("#app"), 15) is not None, pg.inner_text("#app")[:300])
    check("Claude's real exam has no Load button in Try-out, only a practice copy", pg.locator("[data-load]").count() == 0 and pg.locator("[data-pracload]").count() >= 1)
    check("real exams on the server are listed", "Real exam (test" in pg.inner_text("#app"))

    # practice: the whole flow
    pg.click("[data-practice]")
    check("Make a practice exam opens it", wait_for(lambda: pg.locator("#xt-btns").count() == 1, 15) is not None)
    pid = pg.evaluate("location.hash").split("/")[2]
    check("it is marked as practice, with 4 questions", "Practice exam: nothing here goes" in pg.inner_text("#app") and pg.locator("tr[data-q]").count() == 4)
    check("past papers can't be added or removed in Try-out", pg.locator("[data-addpaper], [data-delpaper]").count() == 0)
    pg.fill("#xt-dur", "12")
    pg.click("[data-savesetup]")
    check("its time can be changed", wait_for(lambda: "12 min" in pg.inner_text("#xt-left"), 8) is not None)
    pg.click("[data-newlink]")
    check("student link is made", wait_for(lambda: "#t=" in pg.input_value("#xt-link"), 8) is not None)
    token = re.search(r"#t=([A-Za-z0-9_-]+)", pg.input_value("#xt-link")).group(1)
    st = pg.context.new_page()
    st.goto(APP + "exam.html#t=" + token + "&api=" + urllib.request.quote(API, safe=""))
    pg.click("[data-start]")
    check("Start runs the clock", wait_for(lambda: re.match(r"^1[12]:\d\d$", pg.inner_text("#xt-left")), 8) is not None, pg.inner_text("#xt-left"))
    check("the student page shows a Practice tag", wait_for(lambda: "Practice" in st.inner_text(".ex-title"), 15) is not None)
    st.close()
    sapi("PUT", "/api/s/answers/q1", token, {"text": "3pi/4", "seq": 1})
    pg.click('[data-ext="5"]')
    check("+5 min works", wait_for(lambda: re.match(r"^1[67]:\d\d$", pg.inner_text("#xt-left")), 8) is not None, pg.inner_text("#xt-left"))
    pg.click("[data-lock]")
    check("Lock works", wait_for(lambda: "Locked" in pg.inner_text("#xt-st"), 8) is not None)
    pg.click('a[href$="/mark"] >> nth=0')
    check("marking opens with the sample mark scheme", wait_for(lambda: pg.locator("section.xt-mq").count() == 4 and "3π/4" in pg.inner_text('[data-mq="q1"]'), 10) is not None)
    pg.fill('[data-score="q1"]', "2")
    pg.dispatch_event('[data-score="q1"]', "change")
    check("marks save", wait_for(lambda: pg.inner_text("#xt-total") == "2 / 11", 6) is not None, pg.inner_text("#xt-total"))
    check("no Save to tutoring repo on a practice exam", pg.locator("[data-torepo]").count() == 0)

    # real exam: look only
    pg.goto(APP + "?try#/exams/" + real)
    check("real exam opens with the look-only note", wait_for(lambda: "you can look but not change" in pg.inner_text("#app"), 10) is not None)
    check("  no Start, + minutes or Lock", pg.locator("[data-start], [data-ext], [data-lock], [data-savesetup]").count() == 0)
    check("  Make student link is off", pg.locator("[data-newlink]").is_disabled())
    check("  question fields are off", pg.locator('tr[data-q] [data-f="marks"]').is_disabled())
    check("  the server still has no link for it", tapi("GET", "/api/t/exams/" + real)["token"] is None)
    pg.goto(APP + "?try#/exams/" + real + "/mark")
    check("  marking is look-only", wait_for(lambda: pg.locator('[data-score="q1"]').count() == 1, 10) is not None and pg.locator('[data-score="q1"]').is_disabled())

    # delete the practice exam
    pg.goto(APP + "?try#/exams")
    wait_for(lambda: pg.locator('[data-delprac="%s"]' % pid).count() == 1, 10)
    pg.click('[data-delprac="%s"]' % pid)
    check("Delete removes the practice exam", wait_for(lambda: all(e["id"] != pid for e in tapi("GET", "/api/t/exams")), 8) is not None)
    check("nothing was written to GitHub in Try-out", not puts, list(puts))

    # normal mode never shows practice exams
    other = tapi("POST", "/api/t/exams", {"title": "Hidden practice", "subject": "maths", "practice": True, "questions": [{"id": "q1", "marks": 1}]})["id"]
    pg2 = context()
    pg2.goto(APP + "#/exams")
    check("normal mode: practice exams are hidden", wait_for(lambda: "from Claude" in pg2.inner_text("#app"), 15) is not None and "Hidden practice" not in pg2.inner_text("#app") and "Practice (Try-out)" not in pg2.inner_text("#app"))
    check("normal mode: Load button is back", pg2.locator("[data-load]").count() >= 1)
    tapi("DELETE", "/api/t/exams/" + other)
    tapi("DELETE", "/api/t/exams/" + real)
    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
