"""Batch 1 (5 Oct) exam fixes, against a local exam server (same setup as tests/test_exam.py).
   refused save keeps the text and says Not saved; a hung request doesn't stop saving; two tabs stay in step;
   a lock with unsent text says so; the page works with cdnjs blocked.

    python tests/test_batch1_exam.py
"""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def wait_for(fn, timeout=10.0, step=0.25):
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


def tapi(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"X-Exam-Password": PW, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def exam(title):
    eid = tapi("POST", "/api/t/exams", {"title": title, "subject": "maths", "practice": True, "base_minutes": 30,
                                        "questions": [{"id": "q1", "label": "Q1", "text_html": "<p><b>Bold</b> question</p>", "marks": 2, "type": "long"},
                                                      {"id": "q2", "label": "Q2", "text_html": "<p>Two</p>", "marks": 2, "type": "short"}]})["id"]
    tok = tapi("POST", "/api/t/exams/%s/link" % eid)["token"]
    tapi("POST", "/api/t/exams/%s/start" % eid)
    return eid, tok


def answers(eid):
    return {q["id"]: q["final"] for q in tapi("GET", "/api/t/exams/%s/review" % eid)["questions"]}


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)

    def page(ctx=None):
        ctx = ctx or b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
        ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())   # the app must not need cdnjs
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        return pg

    def open_exam(pg, tok):
        pg.goto(APP + "exam.html#t=" + tok + "&api=" + urllib.request.quote(API, safe=""))
        wait_for(lambda: pg.locator("#ans").count() == 1, 15)

    # 1. libraries come from the app itself
    eid, tok = exam("Batch 1 refused")
    pg = page()
    open_exam(pg, tok)
    check("with cdnjs blocked the question shows formatted, not raw tags", pg.locator(".ex-qtext b").count() == 1 and "<b>" not in pg.inner_text(".ex-qtext"), pg.inner_text(".ex-qtext"))

    # 2. a refused save keeps the text and says Not saved
    big = "x" * 55000
    pg.fill("#ans", big)
    check("character count warns when too long", wait_for(lambda: "Too long" in pg.inner_text(".ex-count"), 3) is not None)
    check("label says Not saved (and stays)", wait_for(lambda: "Not saved" in pg.inner_text(".ex-save"), 8) is not None and (time.sleep(4) or "Not saved" in pg.inner_text(".ex-save")), pg.inner_text(".ex-save"))
    pg.reload()
    wait_for(lambda: pg.locator("#ans").count() == 1, 10)
    check("after a reload the long text is still in the box", len(pg.input_value("#ans")) == 55000, len(pg.input_value("#ans")))
    pg.fill("#ans", "short answer")
    check("shortening it saves it", wait_for(lambda: answers(eid)["q1"] == "short answer" and "Saved" in pg.inner_text(".ex-save"), 10) is not None, pg.inner_text(".ex-save"))
    pg.context.close()

    # 3. one hung request doesn't stop saving
    eid, tok = exam("Batch 1 hung")
    pg = page()
    held = []
    def hold(route):
        if route.request.method == "PUT" and not held:
            held.append(route)       # never answered
            return
        route.continue_()
    pg.context.route(API + "/api/s/answers/**", hold)
    open_exam(pg, tok)
    # (route handlers only run while Playwright is working, so these waits go through pg.wait_for_timeout)
    pg.fill("#ans", "first")
    wait_for(lambda: pg.wait_for_timeout(200) or held, 6)
    pg.fill("#ans", "first and second")
    check("after the hung save is given up, the newest text reaches the server", wait_for(lambda: pg.wait_for_timeout(200) or answers(eid)["q1"] == "first and second", 40) is not None, answers(eid))
    check("  and the label is not stuck on Saving", wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 10) is not None, pg.inner_text(".ex-save"))
    pg.context.close()

    # 4. two tabs of the same link stay in step
    eid, tok = exam("Batch 1 two tabs")
    ctx = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
    t1, t2 = page(ctx), page(ctx)
    open_exam(t1, tok)
    open_exam(t2, tok)
    t2.fill("#ans", "typed in tab two")
    wait_for(lambda: answers(eid)["q1"] == "typed in tab two", 10)
    check("tab one's box follows the newer text", wait_for(lambda: t1.input_value("#ans") == "typed in tab two", 15) is not None, t1.input_value("#ans"))
    t1.click("#ans")
    t1.keyboard.press("End")
    t1.keyboard.type("!")
    check("  so one more key in tab one keeps tab two's answer", wait_for(lambda: answers(eid)["q1"] == "typed in tab two!", 10) is not None, answers(eid))
    ctx.close()

    # 5. locked while text was unsent: the page says so
    eid, tok = exam("Batch 1 locked")
    pg = page()
    open_exam(pg, tok)
    pg.context.set_offline(True)
    pg.fill("#ans", "written offline")
    time.sleep(1.5)
    tapi("POST", "/api/t/exams/%s/lock" % eid)
    pg.context.set_offline(False)
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    check("locked screen says the last work did not reach the teacher", wait_for(lambda: "did not reach your teacher" in pg.inner_text("#ex"), 20) is not None, pg.inner_text("#ex")[:200])
    pg.context.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
