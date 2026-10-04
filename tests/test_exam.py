"""Exam section: the student page, the phone page and the live link to the exam server, end to end.

Runs against a local exam server and a local copy of the app (nothing touches GitHub or the real server):

    cd worker && npx wrangler d1 migrations apply tutor-exams --local
    echo TEACHER_PASSWORD=local-test > worker/.dev.vars
    (cd worker && npx wrangler dev --port 8787 --local) &
    python -m http.server 8765 &
    python tests/test_exam.py

Settings come from the environment: EXAM_API (http://localhost:8787), APP (http://localhost:8765/),
EXAM_PW (local-test), BROWSER (msedge on Windows, else chromium), CHROMIUM_PATH (a browser to use instead). Prints PASS/FAIL per check; exit 1 on a FAIL.
"""
import json, os, struct, sys, time, urllib.request, zlib
from playwright.sync_api import sync_playwright

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
BROWSER = os.environ.get("BROWSER", "msedge" if os.name == "nt" else "chromium")
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"X-Exam-Password": PW, "Content-Type": "application/json", "Origin": "http://localhost:8765"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def png(w=300, h=200, rgb=(30, 90, 200)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def make_exam(minutes=30, title="Radians test"):
    e = api("POST", "/api/t/exams", {"title": title, "subject": "maths", "base_minutes": minutes, "questions": [
        {"id": "q1", "label": "1(a)", "text_html": "<p>Convert \\(30^\\circ\\) to radians.</p>", "marks": 2, "type": "short"},
        {"id": "q2", "label": "1(b)", "text_html": "<p>Sketch \\(y=\\sin x\\) for \\(0\\le x\\le 2\\pi\\).</p>", "marks": 4, "type": "upload_optional"},
        {"id": "q3", "label": "2", "text_html": "<p>Explain why the arc length is \\(r\\theta\\).</p>", "marks": 3, "type": "long"}]})
    tok = api("POST", "/api/t/exams/%s/link" % e["id"])["token"]
    return e["id"], tok


def link(token):
    return APP + "exam.html#t=" + token + "&api=" + API


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


def review(eid):
    return api("GET", "/api/t/exams/%s/review" % eid)


errs = []
with sync_playwright() as p:
    launch = {"channel": "msedge"} if BROWSER == "msedge" else {}
    if os.environ.get("CHROMIUM_PATH"):
        launch = {"executable_path": os.environ["CHROMIUM_PATH"]}
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:  # sandboxed machines reach cdnjs (KaTeX, QR library) only through their proxy
        launch["proxy"] = {"server": proxy, "bypass": "localhost,127.0.0.1"}
    b = p.chromium.launch(**launch)
    ctx = b.new_context(viewport={"width": 1280, "height": 860}, ignore_https_errors=bool(proxy))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))

    # 1. waiting, then Start appears without a refresh
    eid, tok = make_exam()
    pg.goto(link(tok))
    check("waiting screen shows before Start", wait_for(lambda: "will start the exam" in pg.inner_text("#ex")) is not None)
    pg.screenshot(path=os.path.join(SHOTS, "exam-1-waiting.png"))
    api("POST", "/api/t/exams/%s/start" % eid)
    t0 = time.time()
    ok = wait_for(lambda: pg.locator(".ex-q").count() > 0, 6)
    check("exam opens on its own after Start (no refresh)", ok is not None, "took %.1fs" % (time.time() - t0))
    check("  ...within 4 seconds", time.time() - t0 < 4.5, "%.1fs" % (time.time() - t0))
    check("maths is typeset", wait_for(lambda: pg.locator(".ex-qtext .katex").count() > 0, 20) is not None)
    timer1 = pg.inner_text(".ex-timer")
    check("timer counts down from about 30:00", timer1.startswith("29:") or timer1.startswith("30:"), timer1)

    # 2. autosave
    pg.fill("#ans", "pi/6")
    check("typing shows Saved", wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 6) is not None, pg.inner_text(".ex-save"))
    check("the answer is on the server", wait_for(lambda: review(eid)["questions"][0]["final"] == "pi/6") is not None)
    pg.reload()
    check("after a reload the answer is still there", wait_for(lambda: pg.input_value("#ans") == "pi/6") is not None)
    check("after a reload the timer did not reset", wait_for(lambda: pg.inner_text(".ex-timer").startswith("29:")) is not None, pg.inner_text(".ex-timer"))

    # 3. +5 min reaches the student live
    api("POST", "/api/t/exams/%s/extend" % eid, {"minutes": 5})
    check("+5 min shows on the student's timer without a refresh", wait_for(lambda: pg.inner_text(".ex-timer").startswith("34:"), 6) is not None, pg.inner_text(".ex-timer"))
    check("  ...with a note that time was added", "added 5 min" in pg.inner_text(".ex-bannerslot"))

    # 4. offline: kept on the device, sent when back
    ctx.set_offline(True)
    pg.fill("#ans", "pi/6 radians")
    check("offline: the page says the work is kept", wait_for(lambda: "Offline" in pg.inner_text(".ex-save"), 12) is not None, pg.inner_text(".ex-save"))
    pg.screenshot(path=os.path.join(SHOTS, "exam-2-offline.png"))
    ctx.set_offline(False)
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    check("back online: the waiting answer is sent", wait_for(lambda: review(eid)["questions"][0]["final"] == "pi/6 radians", 20) is not None)

    # 5. a picture from the file picker
    pg.click('[data-go="1"]')
    pg.set_input_files("[data-file]", files=[{"name": "graph.png", "mimeType": "image/png", "buffer": png()}])
    check("a chosen picture appears under the question", wait_for(lambda: pg.locator(".ex-pic:not(.pending)").count() == 1, 10) is not None)
    check("  ...and is on the server", wait_for(lambda: len(review(eid)["questions"][1]["uploads"]) == 1) is not None)

    # 6. drawing
    pg.click("[data-draw]")
    cv = pg.locator(".ex-draw canvas").bounding_box()
    pg.mouse.move(cv["x"] + 50, cv["y"] + 60); pg.mouse.down()
    for i in range(30):
        pg.mouse.move(cv["x"] + 50 + i * 10, cv["y"] + 60 + (i % 7) * 12)
    pg.mouse.up()
    pg.click("[data-grid]")
    pg.screenshot(path=os.path.join(SHOTS, "exam-3-draw.png"))
    pg.click("[data-save]")
    check("a drawing is saved as a picture", wait_for(lambda: any(u["source"] == "drawing" for u in review(eid)["questions"][1]["uploads"]), 10) is not None)

    # 7. phone: QR link opens the phone page; its photo appears on the computer
    pg.click("[data-phone]")
    check("QR code shows", wait_for(lambda: pg.locator(".ex-qr svg").count() == 1, 6) is not None)
    plink = pg.inner_text(".ex-link")
    pg.screenshot(path=os.path.join(SHOTS, "exam-4-qr.png"))
    phone_ctx = b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True, ignore_https_errors=bool(proxy))
    ph = phone_ctx.new_page()
    ph.on("pageerror", lambda e: errs.append("phone: " + str(e)))
    ph.goto(plink)
    check("phone page names the question", wait_for(lambda: "Question 2" in ph.inner_text("#ex")) is not None)
    before = pg.locator(".ex-pic").count()
    ph.set_input_files("[data-cam]", files=[{"name": "photo.png", "mimeType": "image/png", "buffer": png(400, 300, (200, 60, 40))}])
    check("phone says the photo was sent", wait_for(lambda: "Sent" in ph.inner_text("#phpics"), 10) is not None)
    ph.screenshot(path=os.path.join(SHOTS, "exam-5-phone.png"))
    check("the phone photo appears on the computer without a refresh", wait_for(lambda: pg.locator(".ex-pic").count() > before, 8) is not None)
    pg.keyboard.press("Escape")
    phone_wide = ph.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check("phone page: no sideways scrolling", not phone_wide)

    # 8. nothing about marks reaches the student
    api("PUT", "/api/t/exams/%s/marks/q1" % eid, {"score": 1.5, "comment": "SECRET-COMMENT units"})
    time.sleep(3.5)
    html = pg.content()
    check("no score or comment on the student page", "SECRET-COMMENT" not in html and "1.5" not in pg.inner_text("#ex"))

    # 9. 390 px wide: no sideways scroll
    pg.set_viewport_size({"width": 390, "height": 800})
    time.sleep(0.4)
    check("student page at 390 px: no sideways scrolling", not pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"))
    pg.screenshot(path=os.path.join(SHOTS, "exam-6-phone-width.png"), full_page=True)
    pg.set_viewport_size({"width": 1280, "height": 860})

    # 10. hand in
    pg.click("[data-handin]")
    pg.click(".ex-box [data-ok]")
    check("hand in makes the answers read-only", wait_for(lambda: pg.locator("#ans").is_disabled(), 8) is not None)
    check("  ...and the server shows submitted", api("GET", "/api/t/exams/%s/live" % eid)["status"] == "submitted")

    # 11. time up: no lock, writing goes on and is marked late
    eid2, tok2 = make_exam(minutes=0.06, title="Short test")
    pg.goto(link(tok2))
    wait_for(lambda: "will start" in pg.inner_text("#ex"))
    api("POST", "/api/t/exams/%s/start" % eid2)
    wait_for(lambda: pg.locator(".ex-q").count() > 0, 6)
    pg.fill("#ans", "in time")
    wait_for(lambda: review(eid2)["questions"][0]["final"] == "in time", 6)
    check("at zero the student sees Time is up", wait_for(lambda: "Time is up" in pg.inner_text(".ex-timer"), 10) is not None)
    check("  ...and the exam is not locked", not pg.locator("#ans").is_disabled())
    pg.fill("#ans", "in time, plus more after")
    r = wait_for(lambda: (lambda q: q if q["final"].endswith("after") else None)(review(eid2)["questions"][0]), 8)
    check("writing after zero is saved and marked late", r is not None and r["writtenLate"] and r["atOriginalEnd"] == "in time", r)
    pg.screenshot(path=os.path.join(SHOTS, "exam-7-timeup.png"))
    api("POST", "/api/t/exams/%s/lock" % eid2)
    check("Lock from the teacher ends it on the student's screen", wait_for(lambda: "exam has ended" in pg.inner_text("#ex"), 15) is not None)

    # 12. a broken link
    pg.goto(APP + "exam.html#t=" + "x" * 43 + "&api=" + API)
    check("a wrong link says so", wait_for(lambda: "not valid" in pg.inner_text("#ex"), 8) is not None)

    # 13. the existing app still opens
    app = ctx.new_page()
    app.on("pageerror", lambda e: errs.append("app: " + str(e)))
    app.goto(APP + "#/settings")
    check("Tutor Desk Settings still opens", wait_for(lambda: app.locator("#s-token").count() == 1, 10) is not None)

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
