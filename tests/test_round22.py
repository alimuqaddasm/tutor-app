"""Round 22 (8 Oct): the assignment rebuilt from the design canvas.
Days open one after another (Day 2 twelve hours after he opens Day 1, or when Ali opens it), one phone QR for the
whole holiday, a stopwatch, "Are you finished?", answers fixed after finishing, practice after that, Ali's notes with
what to study. Same setup as tests/test_exams_tab.py (local exam server on :8787, the app on :8765, pretend GitHub).
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
FOLDER = "students/UK-1/assignments/2026-10-23-holiday-t%d/" % int(time.time())  # a fresh folder each run
exam_json = {
    "id": "2026-10-23-holiday", "title": "Holiday practice (test)", "kind": "assignment", "status": "ready", "gapHours": 12,
    "sections": [
      {"id": "d1-math", "day": 1, "subject": "maths", "title": "Day 1 Maths", "suggestMin": 45, "questions": [
        {"id": "d1m1", "label": "Q1", "marks": 4, "type": "upload_required", "text": "<p>Answer on paper.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"],
         "study": {"videos": [{"id": "abc123", "title": "2.1 The Modulus Function"}], "chapter": "Y2-2"}},
        {"id": "d1m2", "label": "Q2", "marks": 6, "type": "upload_required", "text": "<p>Answer on paper.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q2-ms.png"]}]},
      {"id": "d1-chem", "day": 1, "subject": "chem", "title": "Day 1 Chemistry", "suggestMin": 45, "questions": [
        {"id": "d1c1", "label": "Q1", "marks": 5, "type": "short", "text": "<p>Five MCQs.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"],
         "study": {"book": "CGP AQA A-level Chemistry", "pages": [{"spec": "3.3.5", "topic": "Alcohols", "pages": "pp. 156-161"}]}}]},
      {"id": "d2-math", "day": 2, "subject": "maths", "title": "Day 2 Maths", "suggestMin": 45, "questions": [
        {"id": "d2m1", "label": "Q1", "marks": 3, "type": "short", "text": "<p>Find y.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"]}]}]}
files = {FOLDER + "assignment.json": json.dumps(exam_json).encode(), FOLDER + "assets/q1.png": png(600, 160, (230, 240, 255)),
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
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block", ignore_https_errors=bool(proxy))
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);}catch(e){}" % (json.dumps(API), json.dumps(PW)))
    ctx.route("https://api.github.com/**", github)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    pg.goto(APP + "#/exams")
    check("the pack is under Assignments", wait_for(lambda: "Holiday practice (test)" in pg.inner_text("#app") and "Assignments" in pg.inner_text("#app"), 15) is not None)
    pg.click('[data-load="%sassignment.json"]' % FOLDER)
    check("Load takes it to the exam server", wait_for(lambda: pg.locator("#xt-btns").count() == 1, 30) is not None)
    eid = pg.evaluate("location.hash").split("/")[2]
    check("the Days card shows 12 hours between days", pg.input_value("#xt-gap") == "12")
    pg.click("[data-newlink]")
    wait_for(lambda: "#t=" in pg.input_value("#xt-link"), 8)
    link = pg.input_value("#xt-link")

    sctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block", ignore_https_errors=bool(proxy))
    st = sctx.new_page()
    st.on("pageerror", lambda e: errs.append("student: " + str(e)))
    st.goto(link)
    check("home: Day 1 is open, with its two subjects", wait_for(lambda: "Day 1 is open" in st.inner_text("#ex") and st.locator(".a-card").count() == 2, 15) is not None)
    check("  ...Day 2 waits: opens 12 h after he opens Day 1", "Day 2 · opens 12 h after you open Day 1" in st.inner_text(".a-soon"))
    check("  ...one QR code for the phone", wait_for(lambda: st.locator(".a-qr svg").count() == 1, 8) is not None)
    st.screenshot(path=os.path.join(SHOTS, "r22-1-home.png"))
    st.click('[data-a-sec="d1-math"]')
    check("a day opens: questions down the side, the paper question, his pages", wait_for(lambda: st.locator(".a-qbtn").count() == 2 and st.locator(".a-snap").count() == 1, 8) is not None)
    check("  ...a stopwatch, not a timer, that he starts", st.inner_text(".a-swt") == "00:00" and st.inner_text("[data-a-sw]") == "Start")
    st.click("[data-a-sw]")
    st.wait_for_timeout(2200)
    check("  ...and it runs", st.inner_text(".a-swt") >= "00:01" and st.inner_text("[data-a-sw]") == "Pause", st.inner_text(".a-swt"))
    st.fill("#ans", "f(x) = |x|")
    check("  ...typing marks the question as typed", wait_for(lambda: "typed" in st.inner_text(".a-qbtn >> nth=0"), 5) is not None)

    check("the exam page sees Day 1 opened and Day 2's time", wait_for(lambda: "Opened" in pg.inner_text('[data-secst="d1-math"]') and "Opens" in pg.inner_text('[data-secst="d2-math"]'), 15) is not None, pg.inner_text(".xt-qs"))

    tok = st.evaluate("Object.keys(localStorage).filter(k => k.slice(-6) === '.phone').map(k => localStorage.getItem(k))[0]")
    ph = sctx.new_page()
    ph.set_viewport_size({"width": 390, "height": 844})
    ph.on("pageerror", lambda e: errs.append("phone: " + str(e)))
    ph.goto(link.split("#")[0] + "#p=" + tok + "&api=" + urllib.request.quote(API, safe=""))
    check("phone: follows the laptop to Day 1 Maths Q1", wait_for(lambda: "Day 1 Maths" in ph.inner_text("h1") and "it is on Q1 there too" in ph.inner_text("#ex"), 15) is not None)
    ph.set_input_files("[data-cam]", files=[{"name": "page.png", "mimeType": "image/png", "buffer": png(800, 1000, (250, 250, 240))}])
    check("  ...the photo is sent", wait_for(lambda: ph.locator("#phpics .ex-pic:not(.pending)").count() == 1, 15) is not None)
    ph.screenshot(path=os.path.join(SHOTS, "r22-2-phone.png"))
    check("the laptop shows the page under Q1", wait_for(lambda: st.locator('.a-pages .ex-pic').count() == 1 and "1 photo" in st.inner_text(".a-qbtn >> nth=0"), 12) is not None)
    st.screenshot(path=os.path.join(SHOTS, "r22-3-work.png"))

    st.click("[data-a-finish]")
    check("Finish asks: are you finished? with what is empty", wait_for(lambda: st.locator(".a-finbox").count() == 1, 4) is not None and "Q2 is empty" in st.inner_text(".a-finbox") and "Stopwatch" in st.inner_text(".a-finbox"))
    st.screenshot(path=os.path.join(SHOTS, "r22-4-finish.png"))
    st.click(".a-finbox [data-x]")
    check("  ...Not yet: back to work, stopwatch paused", st.locator(".a-finbox").count() == 0 and st.inner_text("[data-a-sw]") == "Carry on")
    st.click("[data-a-finish]")
    st.click(".a-finbox [data-ok]")
    check("Yes: the review opens, his work beside the mark scheme", wait_for(lambda: st.locator(".a-two").count() == 1 and st.locator(".a-ms img").evaluate("i => i.naturalWidth > 0"), 12) is not None)
    check("  ...his answer can no longer be edited", st.locator("#ans").count() == 0 and "f(x) = |x|" in st.inner_text(".a-typed"))
    st.click("[data-a-again]")
    check("Solve it again opens a practice area", wait_for(lambda: st.locator(".a-practice #ans").count() == 1, 5) is not None)
    st.fill("#ans", "practice: f(x) = |x| again")
    st.wait_for_timeout(2000)

    pg.goto(APP + "#/exams/" + eid + "/mark")
    wait_for(lambda: pg.locator("section.xt-mq").count() >= 1, 10)
    check("Mark: the marked answer is the one from before finishing", "f(x) = |x|" == pg.inner_text('[data-mq="d1m1"] .xt-ans >> nth=0').strip())
    check("  ...his practice is set apart", "solved it again" in pg.inner_text('[data-mq="d1m1"]'))
    check("  ...the note box says what he will be told to study", "Maths Genie" in pg.inner_text('[data-mq="d1m1"] .xt-notebox'))
    pg.fill('[data-note="d1m1"]', "Write the modulus definition first.")
    pg.dispatch_event('[data-note="d1m1"]', "change")
    pg.fill('[data-score="d1m1"]', "2"); pg.dispatch_event('[data-score="d1m1"]', "change")
    wait_for(lambda: pg.inner_text("#xt-total").startswith("2"), 6)
    pg.wait_for_timeout(500)
    check("he sees the note straight away, with the video to watch", wait_for(lambda: st.locator(".a-note").count() == 1 and "Write the modulus definition first." in st.inner_text(".a-note") and "2.1 The Modulus Function" in st.inner_text(".a-note"), 15) is not None)
    st.click('[data-a-mode="all"]')
    check("All together shows every question of the day", wait_for(lambda: st.locator(".a-rq").count() == 2, 5) is not None)
    st.screenshot(path=os.path.join(SHOTS, "r22-5-review.png"), full_page=True)

    pg.goto(APP + "#/exams/" + eid)
    wait_for(lambda: pg.locator('[data-release="d2-math"]').count() == 1, 10)
    pg.click('[data-release="d2-math"]')
    st.click("[data-a-home]")
    check("Open this day now: Day 2 opens for him", wait_for(lambda: "Day 2 is open" in st.inner_text("#ex"), 15) is not None)
    check("  ...Day 1 stays open below, with Ali's note", "earlier days stay open" in st.inner_text("#ex").lower() and "1 note from Ali" in st.inner_text("#ex"))
    st.screenshot(path=os.path.join(SHOTS, "r22-6-day2.png"))
    st.set_viewport_size({"width": 390, "height": 844})
    check("home at phone width: no sideways scrolling", not st.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"))

    pg.goto(APP + "#/exams/" + eid + "/mark")
    wait_for(lambda: pg.locator("section.xt-mq").count() >= 1, 10)
    pg.click("[data-torepo]")
    check("Save to repo", wait_for(lambda: (pg.wait_for_timeout(200), FOLDER + "result.json" in puts)[1], 15) is not None)
    res = json.loads(puts.get(FOLDER + "result.json", b"{}"))
    q = [x for x in res.get("questions", []) if x["id"] == "d1m1"][0]
    check("  ...with his answer, the practice and the note", q.get("final") == "f(x) = |x|" and q.get("practiceText") == "practice: f(x) = |x| again" and q.get("note") == "Write the modulus definition first." and q["pictures"][0].get("source") == "phone", q)

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
