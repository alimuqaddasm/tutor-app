"""Round 23 (8 Oct): Try-out practice copy of a real assignment: everything works on the copy, the real one never changes.
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
    # the real one, loaded normally
    pg.goto(APP + "#/exams")
    wait_for(lambda: pg.locator('[data-load="%sassignment.json"]' % FOLDER).count() == 1, 15)
    pg.click('[data-load="%sassignment.json"]' % FOLDER)
    wait_for(lambda: pg.locator("#xt-btns").count() == 1, 30)
    real = pg.evaluate("location.hash").split("/")[2]

    tp = ctx.new_page()
    tp.on("pageerror", lambda e: errs.append("try: " + str(e)))
    tp.on("dialog", lambda d: d.accept())
    tp.goto(APP + "?try#/exams")
    check("Try-out: the real pack offers a Practice copy", wait_for(lambda: tp.locator('[data-praccopy="%s"]' % real).count() == 1, 15) is not None, tp.inner_text("#app")[:400])
    tp.click('[data-praccopy="%s"]' % real)
    check("  ...the copy opens at once, as a practice assignment", wait_for(lambda: tp.locator("#xt-btns").count() == 1 and "Practice:" in tp.inner_text("h2"), 15) is not None)
    prac = tp.evaluate("location.hash").split("/")[2]
    check("  ...and it can be changed (not look-only)", tp.locator("[data-newlink]").count() == 1 and not tp.locator("[data-newlink]").is_disabled())
    tp.click("[data-newlink]")
    wait_for(lambda: "#t=" in tp.input_value("#xt-link"), 8)
    link = tp.input_value("#xt-link")
    sctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block", ignore_https_errors=bool(proxy))
    st = sctx.new_page()
    st.on("pageerror", lambda e: errs.append("student: " + str(e)))
    st.goto(link)
    check("its student link shows the real interface, with pictures", wait_for(lambda: "Day 1 is open" in st.inner_text("#ex"), 15) is not None)
    st.click('[data-a-sec="d1-chem"]')
    wait_for(lambda: st.locator("#ans").count() == 1, 8)
    st.fill("#ans", "1 B, 2 C")
    check("  ...the question picture loads", wait_for(lambda: st.locator(".a-qimg img").evaluate("i => i.naturalWidth > 0"), 10) is not None)
    st.wait_for_timeout(1500)
    st.click("[data-a-finish]"); st.click(".a-finbox [data-ok]")
    check("  ...finishing opens the mark scheme", wait_for(lambda: st.locator(".a-ms img").count() == 1 and st.locator(".a-ms img").evaluate("i => i.naturalWidth > 0"), 12) is not None)
    tp.goto(APP + "?try#/exams/" + prac + "/mark")
    check("Mark on the copy uses the real mark-scheme files", wait_for(lambda: tp.locator('[data-mq="d1c1"] img[data-rsrc]').count() >= 1 and "1 B, 2 C" in tp.inner_text('[data-mq="d1c1"]'), 15) is not None)
    check("  ...and has no Save to repo", tp.locator("[data-torepo]").count() == 0)
    tp.fill('[data-note="d1c1"]', "try-out note"); tp.dispatch_event('[data-note="d1c1"]', "change")
    check("  ...a note shows on the practice student page", wait_for(lambda: "try-out note" in st.inner_text("#ex"), 15) is not None)
    r = json.loads(urllib.request.urlopen(urllib.request.Request(API + "/api/t/exams/" + real + "/review", headers={"X-Exam-Password": PW})).read())
    check("the real assignment is untouched: no link, no answers, no notes", r.get("status") == "draft" and all(not q["final"] and not q.get("note") for q in r["questions"]), [r.get("status")] + [q["final"] for q in r["questions"]])
    check("nothing was written to the tutoring repo", not puts, list(puts))
    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
