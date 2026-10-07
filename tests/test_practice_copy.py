"""Practice copy (7 Oct): in Try-out, any exam from Claude can be loaded as a practice exam, so Ali can look at it without starting the real one.

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
    check("Try-out: the repo exam shows a Practice copy button", wait_for(lambda: pg.locator("[data-loadprac]").count() > 0 and pg.locator("[data-loadprac]").first.get_attribute("data-loadprac").startswith(FOLDER), 15, ) is not None)
    btn = pg.locator('[data-loadprac="%sexam.json"]' % FOLDER)
    btn.click()
    pg.wait_for_function("location.hash.indexOf('#/exams/') === 0 && location.hash.length > 9", timeout=20000)
    pid = pg.evaluate("location.hash").split("/")[2]
    ex = tapi("GET", "/api/t/exams/" + pid)
    check("it is a practice exam", ex.get("practice") is True, ex.get("practice"))
    check("its title says Practice copy", ex.get("title") == "Practice copy: Radians check (test)", ex.get("title"))
    check("it is not tied to the repo file", not ex.get("sourcePath"), ex.get("sourcePath"))
    check("same questions and marks", [(q["id"], q["marks"]) for q in ex["questions"]] == [("q1", 3), ("q2", 5)], ex["questions"])
    check("the question picture is copied", ex["questions"][0]["has_img"] is True and ex["questions"][1]["has_img"] is False)
    check("not started", ex.get("startedAt") in (None, 0), ex.get("startedAt"))
    pg.wait_for_timeout(1500)
    check("the practice exam opens with no read-only note", "you can look but not change" not in pg.inner_text("#app"))
    pg.goto(APP + "?try#/exams")
    check("it is listed under Practice", wait_for(lambda: "Practice copy: Radians check (test)" in pg.inner_text("#app"), 15) is not None)
    check("the real exam can still be loaded (not marked as loaded)", "Ready. Leave Try-out to load it." in pg.inner_text("#app"))
    pg2 = context()
    pg2.goto(APP + "#/exams")
    check("normal mode: no Practice copy button", wait_for(lambda: "From Claude" in pg2.inner_text("#app") and "Checking the exam server" not in pg2.inner_text("#app"), 15) is not None and pg2.locator("[data-loadprac]").count() == 0)
    check("nothing was written to GitHub", not puts, list(puts))
    tapi("DELETE", "/api/t/exams/" + pid)
    tapi("DELETE", "/api/t/exams/" + real)
    b.close()

check("no page errors", not errs, errs[:3])
print("%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
