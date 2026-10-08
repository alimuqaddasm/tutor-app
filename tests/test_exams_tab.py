"""Exams tab (teacher side), end to end, with a pretend GitHub inside the test and a local exam server.

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
    check("Exams is in the menu and opens", wait_for(lambda: "from Claude" in pg.inner_text("#app"), 15) is not None, pg.inner_text("#app")[:200])
    check("Claude's exam shows with why it is due", "Chapter 5 finished" in pg.inner_text("#app"))
    pg.screenshot(path=os.path.join(SHOTS, "exams-1-list.png"))

    # 2. load it to the exam server
    pg.click('[data-load="%sexam.json"]' % FOLDER)
    check("Load to exam server opens the exam page", wait_for(lambda: pg.locator("#xt-btns").count() == 1, 15) is not None)
    eid = pg.evaluate("location.hash").split("/")[2]
    check("the question picture came across from the repo", wait_for(lambda: pg.locator("img.xt-thumb").evaluate("i => i.naturalWidth > 0"), 10) is not None)

    # 3. time suggestion from past papers: (120+120)/(100+105) = 1.17 min per mark; 8 marks -> 10 min
    sugg = pg.inner_text(".xt-sugg")
    check("suggestion uses the past papers' minutes per mark", "1.17 min per mark" in sugg and "10 min" in sugg, sugg)
    pg.click("[data-rmode=number]")
    pg.fill("#xt-ratio", "2")
    pg.dispatch_event("#xt-ratio", "change")
    # 8 marks x 2 = 16, rounded up to the next 5 minutes
    check("my own number changes the suggestion", wait_for(lambda: "20 min suggested" in pg.inner_text(".xt-sugg")) is not None, pg.inner_text(".xt-sugg"))
    pg.click("[data-usesugg]")
    check("Use suggestion fills the time and the per-question minutes", pg.input_value("#xt-dur") == "20" and pg.input_value('tr[data-q="q1"] [data-f="suggested_min"]') == "6", (pg.input_value("#xt-dur"), pg.input_value('tr[data-q="q1"] [data-f="suggested_min"]')))
    pg.fill("#xt-dur", "20")
    pg.click("[data-savesetup]")
    check("the edited time is saved", wait_for(lambda: pg.input_value("#xt-dur") == "20" and "20 min" in pg.inner_text("#xt-left"), 8) is not None)
    pg.screenshot(path=os.path.join(SHOTS, "exams-2-setup.png"), full_page=True)

    # 4. link, then Start
    pg.click("[data-newlink]")
    check("student link is made", wait_for(lambda: "#t=" in pg.input_value("#xt-link"), 8) is not None)
    token = re.search(r"#t=([A-Za-z0-9_-]+)", pg.input_value("#xt-link")).group(1)
    check("status is Waiting", "Waiting" in pg.inner_text("#xt-st"))
    sapi("GET", "/api/s/state", token)  # he opens the link
    check("it shows he is waiting", wait_for(lambda: "waiting" in pg.inner_text("#xt-btns").lower(), 8) is not None)
    pg.click("[data-start]")
    check("Start runs the clock", wait_for(lambda: re.match(r"^1[89]:\d\d$|^20:00$", pg.inner_text("#xt-left")), 8) is not None, pg.inner_text("#xt-left"))
    sapi("PUT", "/api/s/answers/q1", token, {"text": "5pi/6", "seq": 1})
    check("live: his save shows against the question", wait_for(lambda: "Text" in pg.inner_text('tr[data-q="q1"] [data-saved]'), 8) is not None)

    # 5. + minutes, logged with the time
    pg.click('[data-ext="5"]')
    check("+5 min moves the clock", wait_for(lambda: re.match(r"^2[34]:\d\d$|^25:00$", pg.inner_text("#xt-left")), 8) is not None, pg.inner_text("#xt-left"))
    pg.fill("#xt-custom", "3")
    pg.click("[data-extc]")
    check("custom +3 min moves the clock", wait_for(lambda: pg.inner_text("#xt-left").startswith("2") and int(pg.inner_text("#xt-left").split(":")[0]) >= 26, 8) is not None, pg.inner_text("#xt-left"))
    log = pg.inner_text("#xt-log")
    check("the log shows each extension with its time", re.search(r"\+5 min at \d{1,2}:\d\d [ap]m", log) and re.search(r"\+3 min at", log), log)
    pg.screenshot(path=os.path.join(SHOTS, "exams-3-live.png"), full_page=True)

    # 6. lock, then mark
    pg.click("[data-lock]")
    check("Lock", wait_for(lambda: "Locked" in pg.inner_text("#xt-st"), 8) is not None)
    pg.click('a[href$="/mark"] >> nth=0')
    check("marking page opens", wait_for(lambda: pg.locator("section.xt-mq").count() == 2, 10) is not None)
    check("his answer is beside the question", "5pi/6" in pg.inner_text('[data-mq="q1"]'))
    check("maths is typeset on the marking page", wait_for(lambda: pg.locator('[data-mq="q1"] .katex').count() > 0, 20) is not None,
          pg.evaluate("[typeof window.katex, typeof window.renderMathInElement, document.querySelectorAll('script[src*=katex]').length]"))
    check("the mark scheme picture loads from the repo", wait_for(lambda: pg.locator('[data-mq="q1"] img[data-rsrc]').evaluate("i => i.naturalWidth > 0"), 10) is not None)
    check("a typed mark-scheme answer shows too", "7.5" in pg.inner_text('[data-mq="q2"]'))
    pg.fill('[data-score="q1"]', "2.5")
    pg.dispatch_event('[data-score="q1"]', "change")
    pg.fill('[data-comment="q1"]', "Needs exact form")
    check("partial marks save and the total updates", wait_for(lambda: pg.inner_text("#xt-total") == "2.5 / 8", 6) is not None, pg.inner_text("#xt-total"))
    pg.fill('[data-score="q2"]', "9")
    pg.dispatch_event('[data-score="q2"]', "change")
    check("a mark above the maximum is refused", wait_for(lambda: "0 to 5" in pg.inner_text('[data-mstate="q2"]'), 4) is not None)
    time.sleep(1.6)
    pg.screenshot(path=os.path.join(SHOTS, "exams-4-mark.png"), full_page=True)

    # 7. save to the tutoring repo
    pg.click("[data-torepo]")
    check("Save to tutoring repo writes result.json", wait_for(lambda: (pg.wait_for_timeout(200), FOLDER + "result.json" in puts)[1], 15) is not None, pg.inner_text("#xt-repomsg"))
    res = json.loads(puts.get(FOLDER + "result.json", b"{}"))
    q1 = (res.get("questions") or [{}])[0]
    check("  ...with marks, comment, answer and extensions", q1.get("score") == 2.5 and q1.get("comment") == "Needs exact form" and q1.get("final") == "5pi/6" and [e["minutes"] for e in res.get("extensions", [])] == [5, 3], res)

    # 8. phone width
    pg.set_viewport_size({"width": 390, "height": 820})
    pg.goto(APP + "#/exams/" + eid)
    wait_for(lambda: pg.locator("#xt-btns").count() == 1, 10)
    check("exam page at 390 px: no sideways scrolling", not pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"))
    pg.screenshot(path=os.path.join(SHOTS, "exams-5-phone.png"), full_page=True)

    # 9. the old pages still work
    for r in ["#/", "#/settings", "#/videos", "#/record"]:
        pg.goto(APP + r)
        time.sleep(1.2)
        check("old page %s still renders" % r, pg.locator("#app").inner_text().strip() != "" and not pg.locator("#app .empty h3:text('Couldn')").count())
    check("Settings has the exam fields", pg.goto(APP + "#/settings") or wait_for(lambda: pg.locator("#s-xapi").count() == 1 and pg.input_value("#s-xapi") == API, 6) is not None)

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
