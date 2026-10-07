"""Round 18 (7 Oct): Ali's three exam-page suggestions.
  smuygo8lh  Compare: his answer or picture beside the mark scheme, one button, full screen
  smuygsew3  Student view: the exam page as he sees it, read-only, from the exam page and the marking page
  smuygt9jf  time on each question, counting each return as a new visit
Same setup as tests/test_exams_tab.py (local exam server on :8787, the app on :8765, pretend GitHub).

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
    ctx = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block", ignore_https_errors=bool(proxy))
    # try: a new tab starts on about:blank, where localStorage is off limits
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);}catch(e){}" % (json.dumps(API), json.dumps(PW)))
    ctx.route("https://api.github.com/**", github)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    pg.goto(APP + "#/exams")
    wait_for(lambda: "From Claude" in pg.inner_text("#app"), 15)
    pg.click('[data-load="%sexam.json"]' % FOLDER)
    wait_for(lambda: pg.locator("#xt-btns").count() == 1, 15)
    eid = pg.evaluate("location.hash").split("/")[2]
    pg.fill("#xt-dur", "20"); pg.click("[data-savesetup]")
    wait_for(lambda: "20 min" in pg.inner_text("#xt-left"), 8)
    pg.click("[data-newlink]")
    wait_for(lambda: "#t=" in pg.input_value("#xt-link"), 8)
    link = pg.input_value("#xt-link")

    # Student view before Start: Ali can check the pages
    sv = pg.locator("a:text('Student view')")
    check("exam page has a Student view button", sv.count() == 1)
    with ctx.expect_page() as newp:
        sv.click()
    pv = newp.value
    pv.on("pageerror", lambda e: errs.append("preview: " + str(e)))
    check("Student view shows the questions before Start", wait_for(lambda: pv.locator(".ex-q h2").count() == 1 and "Question 1 of 2" in pv.inner_text(".ex-q h2"), 10) is not None, pv.inner_text("body")[:300])
    check("  ...says what he sees now (the waiting screen)", "waiting screen" in pv.inner_text(".ex-preview"), pv.inner_text(".ex-preview") if pv.locator(".ex-preview").count() else "")
    check("  ...is read-only: no Hand in, answer box locked", pv.locator("[data-handin]").count() == 0 and pv.locator("#ans").is_disabled())
    check("  ...did not count as him opening the link", "hasn’t opened" in pv.inner_text(".ex-preview"))
    pv.screenshot(path=os.path.join(SHOTS, "r18-1-studentview-before.png"))

    pg.click("[data-start]")
    wait_for(lambda: "Running" in pg.inner_text("#xt-st"), 8)

    # the student, in his own browser
    sctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block", ignore_https_errors=bool(proxy))
    st = sctx.new_page()
    st.on("pageerror", lambda e: errs.append("student: " + str(e)))
    st.goto(link)
    wait_for(lambda: st.locator("#ans").count() == 1, 15)
    st.fill("#ans", "5pi/6")
    st.wait_for_timeout(7000)                       # about 7 s on Q1
    st.click("[data-next]")
    check("the exam page shows he is on question 2", wait_for(lambda: "on question 2" in pg.inner_text("#xt-seen"), 10) is not None, pg.inner_text("#xt-seen"))
    check("  ...and marks that row", wait_for(lambda: "He is on it now" in pg.inner_text('tr[data-q="q2"] [data-saved]'), 10) is not None)
    check("  ...with the time on Q1 so far", wait_for(lambda: re.search(r"\b([5-9]|1\d) s\b", pg.inner_text('tr[data-q="q1"] [data-saved]')), 10) is not None, pg.inner_text('tr[data-q="q1"] [data-saved]'))
    pg.screenshot(path=os.path.join(SHOTS, "r18-2-live.png"), full_page=True)

    check("Student view follows him to question 2 and shows his Q1 answer as done", wait_for(lambda: "Question 2 of 2" in pv.inner_text(".ex-q h2") and "done" in (pv.locator('.ex-dot[data-go="0"]').get_attribute("class") or ""), 12) is not None)
    check("  ...says he is connected, on question 2", "on question 2" in pv.inner_text(".ex-preview"), pv.inner_text(".ex-preview"))
    pv.click('.ex-dot[data-go="0"]')
    check("  ...going to Q1 there shows his answer and stops following", pv.input_value("#ans") == "5pi/6" and not pv.is_checked("[data-follow]"))
    pv.screenshot(path=os.path.join(SHOTS, "r18-3-studentview-live.png"))
    st.wait_for_timeout(4000)
    st.click("[data-prev]")                         # back to Q1: a second visit
    st.wait_for_timeout(4000)
    st.click("[data-next]")
    st.wait_for_timeout(1000)
    sapi("POST", "/api/s/submit", re.search(r"#t=([A-Za-z0-9_-]+)", link).group(1))
    pv.close()

    # marking: time per question and Compare
    pg.goto(APP + "#/exams/" + eid + "/mark")
    check("marking page opens", wait_for(lambda: pg.locator("section.xt-mq").count() == 2, 10) is not None)
    check("marking page has Student view too", pg.locator("a:text('Student view')").count() == 1)
    t1 = pg.inner_text('[data-mq="q1"] .xt-tline')
    check("Q1 shows its time over 2 visits", re.search(r"Time on it: (1\d|[89]) s over 2 visits|Time on it: \d+ s over 2 visits", t1), t1)
    check("Q2 shows its time", "Time on it:" in pg.inner_text('[data-mq="q2"] .xt-tline'))
    pg.click('[data-compare="0"]')
    check("Compare opens full screen", wait_for(lambda: pg.locator(".xt-cmp").count() == 1, 4) is not None)
    check("  ...his answer and the mark scheme side by side", "5pi/6" in pg.inner_text(".xt-cmp2 .xt-col >> nth=0") and wait_for(lambda: pg.locator(".xt-cmp2 .xt-col >> nth=1").locator("img").evaluate("i => i.naturalWidth > 0"), 10) is not None)
    boxes = pg.evaluate("[...document.querySelectorAll('.xt-cmp2 .xt-col')].map(e => {var r = e.getBoundingClientRect(); return [r.left, r.top, r.width]})")
    check("  ...the two columns sit next to each other at 1440 px", len(boxes) == 2 and abs(boxes[0][1] - boxes[1][1]) < 2 and boxes[1][0] > boxes[0][0] + boxes[0][2] - 2, boxes)
    pg.screenshot(path=os.path.join(SHOTS, "r18-4-compare.png"))
    pg.fill('[data-cscore="q1"]', "2")
    pg.dispatch_event('[data-cscore="q1"]', "change")
    check("  ...a mark typed there saves and the total updates", wait_for(lambda: pg.inner_text("#xt-total") == "2 / 8", 6) is not None, pg.inner_text("#xt-total"))
    pg.keyboard.press("Escape")
    check("  ...Esc closes it and the page shows the same mark", wait_for(lambda: pg.locator(".xt-cmp").count() == 0, 3) is not None and pg.input_value('[data-score="q1"]') == "2")
    pg.click('[data-compare="0"]')
    pg.click("[data-cmpgo='1']")
    check("  ...Next moves to question 2 with its mark scheme answer", wait_for(lambda: "Question 2 of 2" in pg.inner_text(".xt-cmphead") and "7.5" in pg.inner_text(".xt-cmp"), 6) is not None)
    pg.click(".xt-cmp2 img.xt-zoomable >> nth=0")
    check("  ...a picture zooms above it", wait_for(lambda: pg.locator("#zoom").is_visible(), 3) is not None)
    pg.click("#zoomx")
    pg.click("[data-cmpx]")
    pg.set_viewport_size({"width": 390, "height": 820})
    pg.click('[data-compare="0"]')
    check("Compare at 390 px: no sideways scrolling", not pg.evaluate("document.querySelector('.xt-cmp').scrollWidth > window.innerWidth + 1"))
    pg.click("[data-cmpx]")
    pg.set_viewport_size({"width": 1440, "height": 765})

    pg.click("[data-torepo]")
    check("Save to repo writes result.json", wait_for(lambda: (pg.wait_for_timeout(200), FOLDER + "result.json" in puts)[1], 15) is not None)
    res = json.loads(puts.get(FOLDER + "result.json", b"{}"))
    q1 = (res.get("questions") or [{}])[0]
    check("  ...with time on each question and each visit", q1.get("seconds", 0) >= 8 and len(q1.get("visits", [])) == 2 and all("from" in v and "seconds" in v for v in q1["visits"]), q1.get("visits"))

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
