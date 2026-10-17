"""Round 32 (17 Oct, app v58): clear-cut auto-checker marks are accepted on their own when the Mark page opens.
Multiple choice, or flagged "auto", with nothing unsure. Judgement marks and unsure ones still wait for Accept.
The message counts only the marks that saved, and a mark Ali types while the saves run is never overwritten.
Same setup as tests/test_round20.py (local exam server on :8787, the app on :8765, pretend GitHub).
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
FOLDER = "students/UK-1/exams/2026-10-17-chem-t%d/" % int(time.time())  # a fresh folder each run
Q = lambda i, t, m: {"id": "q%d" % i, "label": "Q%d" % i, "marks": m, "type": t, "text": "<p>Question %d</p>" % i, "img": []}
exam_json = {"id": "2026-10-17-chem", "title": "Auto-accept check (test)", "subject": "chemistry", "date": "2026-10-17", "status": "ready",
    "questions": [Q(1, "mcq", 1), Q(2, "short", 2), Q(3, "short", 3), Q(4, "mcq", 1), Q(5, "short", 2), Q(6, "mcq", 1)]}
files = {FOLDER + "exam.json": json.dumps(exam_json).encode()}
files[FOLDER + "claude-marks.json"] = json.dumps({"markedAt": "2026-10-17T09:00:00Z", "questions": {
    "q1": {"score": 1, "comment": "B"},                                  # multiple choice: accepted on its own
    "q2": {"score": 2, "comment": "exact", "auto": True},               # flagged auto: accepted on its own
    "q3": {"score": 1, "comment": "method only"},                       # judgement: waits for Accept
    "q4": {"score": 1, "comment": "C", "unsure": "two letters circled"},  # unsure: waits
    "q5": {"score": 2, "comment": "exact", "auto": True},               # its save fails: not counted
    "q6": {"score": 1, "comment": "A"}}}).encode()                      # Ali types his own mark first: left alone
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
    wait_for(lambda: "Notes" in pg.inner_text("#app"), 15)
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
    for i in range(1, 7):
        sapi("PUT", "/api/s/answers/q%d" % i, token, {"text": "answer %d" % i, "seq": 1})
    sapi("POST", "/api/s/submit", token)

    # q5's save fails on the server; q1's save is held until Ali has typed into q6
    held, toasts = [], []
    ctx.route("**/api/t/exams/*/marks/q5", lambda r: r.fulfill(status=500, content_type="application/json", body='{"error":"test failure"}') if r.request.method == "PUT" else r.continue_())
    ctx.route("**/api/t/exams/*/marks/q1", lambda r: held.append(r) if r.request.method == "PUT" else r.continue_())
    pg.goto(APP + "#/exams/" + eid + "/mark")
    wait_for(lambda: (pg.wait_for_timeout(100), held)[1], 10)
    check("auto-accept starts on its own when the Mark page opens", held)
    pg.click('[data-mqgo="5"]')
    pg.fill('[data-score="q6"]', "0")      # Ali is typing a mark of his own, not saved yet
    for r in held: r.continue_()

    def toast():
        pg.wait_for_timeout(100)
        t = pg.inner_text("#toast") if pg.locator("#toast").is_visible() else ""
        if "accepted for you" in t: toasts.append(t)
        return toasts
    wait_for(toast, 10, 0.05)
    check("the message counts only the marks that saved (q1, q2; not the failed q5)", toasts and toasts[0].startswith("2 clear-cut marks accepted"), toasts)
    check("multiple-choice q1 and auto q2 are filled in and saved", pg.input_value('[data-score="q1"]') == "1" and pg.input_value('[data-score="q2"]') == "2" and pg.inner_text("#xt-total") == "3 / 10", pg.inner_text("#xt-total"))
    check("  ...and their lines say Accepted", "Accepted" in pg.inner_text('[data-cline="q1"]') and "Accepted" in pg.inner_text('[data-cline="q2"]'))
    check("the judgement mark q3 still waits for Accept", pg.input_value('[data-score="q3"]') == "" and pg.locator('[data-accept="q3"]').count() == 1)
    check("the unsure mark q4 still waits for Accept", pg.input_value('[data-score="q4"]') == "" and pg.locator('[data-accept="q4"]').count() == 1)
    check("the failed save q5 says why and is not marked Accepted", "test failure" in pg.inner_text('[data-mstate="q5"]') and "Accepted" not in pg.inner_text('[data-cline="q5"]'), pg.inner_text('[data-mstate="q5"]'))
    check("the mark Ali was typing in q6 is left alone", pg.input_value('[data-score="q6"]') == "0" and pg.inner_text('[data-mstate="q6"]') == "")
    pg.screenshot(path=os.path.join(SHOTS, "r32-1-autoaccept.png"), full_page=True)
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.screenshot(path=os.path.join(SHOTS, "r32-2-autoaccept-phone.png"), full_page=True)
    pg.set_viewport_size({"width": 1440, "height": 765})

    ctx.unroute("**/api/t/exams/*/marks/q5"); ctx.unroute("**/api/t/exams/*/marks/q1")
    pg.reload()
    wait_for(lambda: pg.locator("section.xt-mq").count() == 6, 10)
    wait_for(lambda: (pg.wait_for_timeout(200), pg.inner_text("#xt-total") == "6 / 10")[1], 10)
    check("after a reload the saved marks stay; q5 (failed) and q6 (Ali's typing never saved) are accepted now", pg.inner_text("#xt-total") == "6 / 10" and pg.input_value('[data-score="q5"]') == "2" and pg.input_value('[data-score="q6"]') == "1", pg.inner_text("#xt-total"))
    check("  ...q3 and q4 still wait", pg.input_value('[data-score="q3"]') == "" and pg.input_value('[data-score="q4"]') == "")

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
