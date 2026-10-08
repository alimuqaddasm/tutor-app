"""Round 21 (7 Oct): assignment mode for the holiday pack (docs/SPEC-assignment-mode.md in the tutoring repo).
One link, no clock, sections with Done, mark schemes only after Done, changes after Done flagged for marking.
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
FOLDER = "students/UK-1/assignments/2026-10-23-holiday-t%d/" % int(time.time())  # a fresh folder each run
exam_json = {
    "id": "2026-10-23-holiday", "title": "Holiday practice (test)", "kind": "assignment", "status": "ready", "opens": "2026-10-23",
    "why": "Parent request: 8 days away",
    "sections": [
      {"id": "d1-math", "day": 1, "date": "2026-10-23", "subject": "maths", "title": "Day 1 Maths", "suggestMin": 45, "questions": [
        {"id": "d1m1", "label": "Q1", "source": "Edexcel 9MA0/01 June 2019 Q5", "marks": 4, "type": "short", "text": "<p>Find x.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"]},
        {"id": "d1m2", "label": "Q2", "source": "Edexcel 9MA0/02 June 2018 Q1", "marks": 6, "type": "upload_required", "text": "<p>Answer on paper.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q2-ms.png"]}]},
      {"id": "d1-chem", "day": 1, "date": "2026-10-23", "subject": "chem", "title": "Day 1 Chemistry", "suggestMin": 45, "questions": [
        {"id": "d1c1", "label": "Q1", "source": "AQA 7405/2 June 2019 Q13", "marks": 5, "type": "short", "text": "<p>Five MCQs.</p>", "img": ["assets/q1.png"], "msImg": ["assets/q1-ms.png"]}]}]}
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
    check("the assignment is listed under Assignments", wait_for(lambda: "Holiday practice (test)" in pg.inner_text("#app") and "Assignments" in pg.inner_text("#app"), 15) is not None)
    check("  ...marked as an assignment, with its sections", "Assignment" in pg.inner_text("#app") and "2 sections" in pg.inner_text("#app"))
    pg.click('[data-load="%sassignment.json"]' % FOLDER)
    check("Load takes it to the exam server", wait_for(lambda: pg.locator("#xt-btns").count() == 1, 30) is not None)
    eid = pg.evaluate("location.hash").split("/")[2]
    check("no Time card and no Start: it says Not sent", pg.locator("text=Exam time (minutes)").count() == 0 and "Not sent" in pg.inner_text("#xt-left"))
    check("questions are grouped by section", pg.locator(".xt-secrow").count() == 2)
    pg.click("[data-newlink]")
    check("the link opens it at once (Open)", wait_for(lambda: "Open" in pg.inner_text("#xt-left") and "#t=" in pg.input_value("#xt-link"), 8) is not None)
    link = pg.input_value("#xt-link")
    pg.screenshot(path=os.path.join(SHOTS, "r21-1-teacher.png"), full_page=True)

    sctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block", ignore_https_errors=bool(proxy))
    st = sctx.new_page()
    st.on("pageerror", lambda e: errs.append("student: " + str(e)))
    st.goto(link)
    check("he sees the list of days, no clock", wait_for(lambda: st.locator(".ex-sec").count() == 2, 15) is not None and st.locator(".ex-timer").count() == 0)
    check("  ...with what to do", "press Done" in st.inner_text(".ex-intro"))
    st.screenshot(path=os.path.join(SHOTS, "r21-2-home.png"))
    st.click('[data-sec="d1-math"]')
    check("a section shows only its questions", wait_for(lambda: st.locator(".ex-dot").count() == 2 and "Question 1 of 2" in st.inner_text(".ex-q h2"), 8) is not None)
    check("  ...and no mark scheme yet", st.locator(".ex-ms").count() == 0)
    st.fill("#ans", "x = 3")
    st.wait_for_timeout(1500)
    check("the list says Started", (st.click("[data-home]"), wait_for(lambda: "Started" in st.inner_text('[data-sec="d1-math"]'), 6))[1] is not None)
    st.click('[data-sec="d1-math"]')
    wait_for(lambda: st.locator("[data-secdone]").count() == 1, 6)
    st.click("[data-secdone]")
    st.fill("[data-took]", "35")
    st.click(".ex-box [data-ok]")
    check("after Done the mark scheme shows under the question", wait_for(lambda: st.locator(".ex-ms img").count() == 1 and st.locator(".ex-ms img").evaluate("i => i.naturalWidth > 0"), 10) is not None)
    check("  ...with a note that marking uses what he had at Done", "marks what you had" in st.inner_text(".ex-bannerslot"))
    st.screenshot(path=os.path.join(SHOTS, "r21-3-done.png"), full_page=True)
    st.fill("#ans", "x = 4")
    st.wait_for_timeout(1800)
    st.click("[data-home]")
    check("the list says Done", wait_for(lambda: "Done" in st.inner_text('[data-sec="d1-math"]'), 6) is not None)
    st.click('[data-sec="d1-chem"]')
    wait_for(lambda: st.locator("#ans").count() == 1, 6)
    check("the other section's mark scheme stays shut", st.locator(".ex-ms").count() == 0)

    check("the exam page shows the section done and his minutes", wait_for(lambda: "took 35 min" in pg.inner_text('[data-secst="d1-math"]'), 12) is not None, pg.inner_text(".xt-secrow >> nth=0"))
    check("  ...and the log says so", wait_for(lambda: "He pressed Done on Day 1 Maths" in pg.inner_text("#xt-log"), 12) is not None)

    pg.goto(APP + "#/exams/" + eid + "/mark")
    check("Mark shows the done sections only, by default", wait_for(lambda: pg.locator("section.xt-mq").count() == 2 and pg.locator(".xt-sech").count() == 1, 10) is not None)
    q1 = pg.inner_text('[data-mq="d1m1"]')
    check("  ...his answer at Done is the one to mark", "x = 3" in q1)
    check("  ...the later change is set apart", "Changed after Done" in q1)
    pg.select_option("[data-asgf]", "all")
    check("All sections shows the rest", wait_for(lambda: pg.locator("section.xt-mq").count() == 3, 5) is not None)
    pg.screenshot(path=os.path.join(SHOTS, "r21-4-mark.png"), full_page=True)
    pg.fill('[data-score="d1m1"]', "3"); pg.dispatch_event('[data-score="d1m1"]', "change")
    wait_for(lambda: pg.inner_text("#xt-total").startswith("3"), 6)
    pg.click("[data-torepo]")
    check("Save to repo writes result.json", wait_for(lambda: (pg.wait_for_timeout(200), FOLDER + "result.json" in puts)[1], 15) is not None)
    res = json.loads(puts.get(FOLDER + "result.json", b"{}"))
    rq = (res.get("questions") or [{}])[0]
    check("  ...with sections, Done times and the at-Done answer", res.get("kind") == "assignment" and res["sections"][0]["tookMin"] == 35 and rq.get("atDone") == "x = 3" and rq.get("final") == "x = 4" and rq.get("changedAfterDone") is True, rq)

    pg.goto(APP + "#/exams/" + eid)
    wait_for(lambda: pg.locator("[data-lock]").count() == 1, 8)
    pg.click("[data-lock]")
    check("Close it: he sees it is closed", wait_for(lambda: "This assignment is closed" in st.inner_text("#ex"), 15) is not None)

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
