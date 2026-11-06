"""Start when he opens the link (Ali, 6 Nov): Ali sets it while the exam waits; the clock starts the first time his page asks.

Same setup as tests/test_exam.py (local wrangler dev on :8787 with TEACHER_PASSWORD=local-test, the app on :8765).
The pretend GitHub holds one exam Claude "wrote" (students/UK-1/exams/2026-10-04-maths/exam.json with a question
picture and a mark-scheme picture) and records every save, so the real repo is never touched.

    python tests/test_exams_tab.py
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


errs = []
with sync_playwright() as p:
    launch = {"channel": "msedge"} if BROWSER == "msedge" else {}
    if os.environ.get("CHROMIUM_PATH"):
        launch = {"executable_path": os.environ["CHROMIUM_PATH"]}
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        launch["proxy"] = {"server": proxy, "bypass": "localhost,127.0.0.1"}
    b = p.chromium.launch(**launch)
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, service_workers="block", ignore_https_errors=bool(proxy))
    ctx.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
    ctx.route("https://api.github.com/**", github)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    # 1. the tab lists Claude's exam with its reason
    pg.goto(APP + "#/exams")
    wait_for(lambda: "Notes" in pg.inner_text("#app"), 15)
    pg.click('[data-load="%sexam.json"]' % FOLDER)
    check("loaded", wait_for(lambda: pg.locator("#xt-btns").count() == 1, 15) is not None)
    pg.fill("#xt-dur", "85"); pg.click("[data-savesetup]")
    check("85 min saved", wait_for(lambda: "1 h 25 min" in pg.inner_text("#xt-left"), 8) is not None, pg.inner_text("#xt-left"))
    pg.click("[data-newlink]")
    check("link made", wait_for(lambda: "#t=" in pg.input_value("#xt-link"), 8) is not None)
    token = re.search(r"#t=([A-Za-z0-9_-]+)", pg.input_value("#xt-link")).group(1)
    check("Waiting shows both buttons", pg.locator("[data-start]").count() == 1 and pg.locator("[data-openon]").count() == 1)
    pg.screenshot(path=os.path.join(SHOTS, "soo-1-waiting.png"))
    pg.click("[data-openon]")
    check("set: says it starts when he opens it", wait_for(lambda: "Starts when he opens the link" in pg.inner_text("#xt-btns"), 8) is not None, pg.inner_text("#xt-btns"))
    check("clock has not started", "1 h 25 min" in pg.inner_text("#xt-left") and "Waiting" in pg.inner_text("#xt-st"), pg.inner_text("#xt-left"))
    pg.screenshot(path=os.path.join(SHOTS, "soo-2-armed-1440.png"))
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(SHOTS, "soo-3-armed-390.png"))
    pg.set_viewport_size({"width": 1366, "height": 900})
    # he opens the link: his own exam page
    sp = ctx.new_page(); sp.on("pageerror", lambda e: errs.append(str(e)))
    sp.goto(APP + "exam.html#t=" + token + "&api=" + API)
    check("his page shows the questions at once", wait_for(lambda: sp.locator("text=Time left").count() > 0 or re.search(r"\d+:\d\d", sp.inner_text("body")), 15) is not None, sp.inner_text("body")[:300])
    sp.wait_for_timeout(1500)
    sp.screenshot(path=os.path.join(SHOTS, "soo-4-his-page.png"))
    check("Ali's page: clock running from about 85 min", wait_for(lambda: re.match(r"^(1:2[45]:\d\d|8[45]:\d\d)$", pg.inner_text("#xt-left")), 12) is not None, pg.inner_text("#xt-left"))
    pg.screenshot(path=os.path.join(SHOTS, "soo-5-running.png"))
    check("no script errors", not errs, errs)
    b.close()

print("\n%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
