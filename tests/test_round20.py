"""Round 20 (7 Oct): Claude's marks (claude-marks.json) show on the Mark page with Accept and Accept all.
Same setup as tests/test_exams_tab.py (local exam server on :8787, the app on :8765, pretend GitHub).
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
        {"id": "q1", "label": "Q1", "source": "Edexcel 9MA0/01 June 2019 Q1", "marks": 3, "type": "short", "text": "<p>Convert \\(150^\\circ\\) to radians.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"],
         "scheme": [{"part": "(a)", "code": "M1", "text": "Multiplies by pi/180"}, {"part": "(a)", "code": "A2", "text": "5pi/6, exact"}]},
        {"id": "q2", "label": "Q2", "source": "Maths Genie 5.2 Q3", "marks": 5, "type": "upload_optional", "text": "<p>Find the arc length.</p>", "img": [], "msImg": ["assets/q2-ms.png"], "answer": "<p>\\(s=r\\theta=7.5\\) cm</p>"}
    ]}
files = {FOLDER + "exam.json": json.dumps(exam_json).encode(), FOLDER + "assets/q1.png": png(600, 160, (230, 240, 255)),
         FOLDER + "assets/q1-ms.png": png(500, 120, (255, 240, 220)), FOLDER + "assets/q2-ms.png": png(500, 120, (220, 255, 220))}
files[FOLDER + "claude-marks.json"] = json.dumps({"markedAt": "2026-10-07T21:00:00Z", "summary": "Q1 right; Q2 no working shown.",
    "questions": {"q1": {"score": 2, "ticks": [1, 1], "comment": "A2: only one of two marks, not exact", "unsure": ""},
                  "q2": {"score": 1, "ticks": [1, 0, 0, 0, 0], "comment": "Method only", "unsure": "the last line is hard to read"}}}).encode()
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
    ctx = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block", ignore_https_errors=bool(proxy))
    # try: a new tab starts on about:blank, where localStorage is off limits
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);}catch(e){}" % (json.dumps(API), json.dumps(PW)))
    ctx.route("https://api.github.com/**", github)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    pg.goto(APP + "#/exams")
    wait_for(lambda: "from Claude" in pg.inner_text("#app"), 15)
    pg.click('[data-load="%sexam.json"]' % FOLDER)
    wait_for(lambda: pg.locator("#xt-btns").count() == 1, 15)
    eid = pg.evaluate("location.hash").split("/")[2]
    pg.fill("#xt-dur", "20"); pg.click("[data-savesetup]")
    wait_for(lambda: "20 min" in pg.inner_text("#xt-left"), 8)
    pg.click("[data-newlink]")
    wait_for(lambda: "#t=" in pg.input_value("#xt-link"), 8)
    link = pg.input_value("#xt-link")

    pg.click("[data-start]")
    wait_for(lambda: "Running" in pg.inner_text("#xt-st"), 8)
    token = re.search(r"#t=([A-Za-z0-9_-]+)", link).group(1)
    sapi("PUT", "/api/s/answers/q1", token, {"text": "5pi/6", "seq": 1})
    sapi("POST", "/api/s/submit", token)

    pg.goto(APP + "#/exams/" + eid + "/mark")
    wait_for(lambda: pg.locator("section.xt-mq").count() == 2, 10)
    check("the Mark page says Claude has marked it, with his total", wait_for(lambda: "Claude has marked this exam: 3 / 8" in pg.inner_text("#app"), 6) is not None, pg.inner_text("#app")[:300])
    check("each question shows Claude's mark, ticks and comment", "Claude: 2 / 3" in pg.inner_text('[data-mq="q1"]') and "M1, A2 (1 of 2)" in pg.inner_text('[data-mq="q1"]') and "not exact" in pg.inner_text('[data-mq="q1"]'))
    check("  ...and what he was unsure about", "Not sure: the last line is hard to read" in pg.inner_text('[data-mq="q2"]'))
    pg.screenshot(path=os.path.join(SHOTS, "r20-1-claude.png"), full_page=True)
    pg.click('[data-accept="q1"]')
    check("Accept puts Claude's mark in and saves it", wait_for(lambda: pg.inner_text("#xt-total") == "2 / 8" and pg.input_value('[data-score="q1"]') == "2", 6) is not None, pg.inner_text("#xt-total"))
    check("  ...with the comment and ticks", pg.input_value('[data-comment="q1"]') == "A2: only one of two marks, not exact" and "Ticked: M1, A2 (1 of 2)" in pg.inner_text('[data-mq="q1"]'))
    check("  ...and the line now says Accepted", "Accepted" in pg.inner_text('[data-cline="q1"]'))
    pg.fill('[data-score="q2"]', "3"); pg.dispatch_event('[data-score="q2"]', "change")
    wait_for(lambda: pg.inner_text("#xt-total") == "5 / 8", 6)
    pg.click('[data-compare="1"]')
    check("Compare shows Claude's mark too", wait_for(lambda: "Claude: 1 / 5" in pg.inner_text(".xt-cmp"), 4) is not None)
    pg.click("[data-cmpx]")
    pg.click("[data-acceptall]")      # asks first, because Q2 has Ali's own 3; the test accepts
    check("Accept all replaces with Claude's marks after asking", wait_for(lambda: pg.inner_text("#xt-total") == "3 / 8", 8) is not None, pg.inner_text("#xt-total"))
    pg.reload()
    wait_for(lambda: pg.locator("section.xt-mq").count() == 2, 10)
    check("accepted marks are kept after a reload", wait_for(lambda: pg.inner_text("#xt-total") == "3 / 8" and pg.locator("text=Accepted").count() == 2, 8) is not None)
    pg.click("[data-torepo]")
    check("Save to repo writes result.json", wait_for(lambda: (pg.wait_for_timeout(200), FOLDER + "result.json" in puts)[1], 15) is not None)
    res = json.loads(puts.get(FOLDER + "result.json", b"{}"))
    check("  ...noting Claude's marks", res.get("claudeMarks", {}).get("total") == 3 and res["questions"][1]["score"] == 1, res.get("claudeMarks"))

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
