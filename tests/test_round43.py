"""Round 43 (23 Oct): the warm-up in step with the holiday pack. A multiple choice he gets wrong becomes a warm-up card
the moment he finishes that section; the card shows the question's own picture and the letters A to D. The right letter
never reaches his page before that. Needs the local exam server on :8787 and the app on :8765. Nothing touches GitHub."""
import base64, json, os, urllib.request
from playwright.sync_api import sync_playwright

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
def tapi(method, path, body=None, raw=None, ctype="application/json"):
    req = urllib.request.Request(API + path, data=raw if raw is not None else (json.dumps(body).encode() if body is not None else None), method=method, headers={"X-Exam-Password": PW, "Content-Type": ctype})
    return json.loads(urllib.request.urlopen(req).read() or b"{}")
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    ex = tapi("POST", "/api/t/exams", {"title": "Holiday practice, 23 to 30 Oct", "kind": "assignment",
        "sections": [{"id": "d1-chem", "title": "Day 1 Chemistry", "subject": "chem", "day": 1}],
        "questions": [{"id": "d1c1", "label": "Q1", "marks": 1, "type": "mcq", "choices": "ABCD", "answer": "C", "section_id": "d1-chem", "study": {"pages": [{"spec": "3.3.4", "pages": "pp. 151-155"}]}}]})
    eid = ex["id"]; tok = tapi("POST", "/api/t/exams/%s/link" % eid)["token"]
    tapi("PUT", "/api/t/exams/%s/questions/d1c1/image" % eid, raw=PNG, ctype="image/png")
    errs = []
    c = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block", reduced_motion="reduce"); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    bodies = []
    pg.on("response", lambda r: bodies.append(r.text()) if "/api/s/state" in r.url and r.status == 200 else None)
    pg.goto(APP + "exam.html#t=" + tok + "&api=" + API); pg.wait_for_selector(".a-root", timeout=20000); pg.wait_for_timeout(800)
    check("the right letter is not in what his page gets", bodies and all('"answer"' not in x for x in bodies), len(bodies))
    check("no warm-up before any cards", pg.locator("[data-a-warm]").count() == 0)
    # he answers B and finishes the day (through the server, as his page does)
    urllib.request.urlopen(urllib.request.Request(API + "/api/s/answers/d1c1", data=json.dumps({"text": "B", "seq": 1}).encode(), method="PUT", headers={"X-Exam-Token": tok, "Content-Type": "application/json"}))
    urllib.request.urlopen(urllib.request.Request(API + "/api/s/sections/d1-chem/done", data=b"{}", method="POST", headers={"X-Exam-Token": tok, "Content-Type": "application/json"}))
    cards = tapi("GET", "/api/t/exams/%s/cards" % eid)["cards"]
    check("finishing the day made a warm-up card from the wrong tap", [x["id"] for x in cards] == ["q-d1c1"] and cards[0]["live"], cards)
    for (w, h) in ((390, 844), (1440, 900)):   # answered only on the last: a card he gets right waits a day
        c2 = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce"); pg = c2.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "exam.html#t=" + tok + "&api=" + API); pg.wait_for_selector("[data-a-warm]", timeout=20000)
        pg.click("[data-a-warm]"); pg.wait_for_selector(".a-wucard", timeout=10000); pg.wait_for_timeout(800)
        img = pg.locator(".a-wucard .a-wuimg img")
        check("%d px: the card shows the question's picture" % w, img.count() == 1 and pg.evaluate("document.querySelector('.a-wuimg img').src.startsWith('blob:')"))
        opts = [pg.locator(".a-wuopt").nth(i).inner_text().strip() for i in range(pg.locator(".a-wuopt").count())]
        check("  ...the letters A to D in order, nothing else", opts == ["A", "B", "C", "D"], opts)
        check("  ...says which day and what he chose", "Day 1 Chemistry Q1" in pg.inner_text(".a-wuq") and "you chose B" in pg.inner_text(".a-wuq"), pg.inner_text(".a-wuq"))
        pg.screenshot(path=os.path.join(SHOTS, "r43-card-%d.png" % w))
        if w == 390: c2.close(); continue
        pg.click('[data-a-wpick="2"]'); pg.wait_for_selector(".a-wudone", timeout=10000); pg.wait_for_timeout(500)
        check("  ...after: right, with the mark scheme letter and the picture", "1/1 right" in pg.inner_text(".a-wuscore") and "Mark scheme: C" in pg.inner_text(".a-wures") and pg.locator(".a-wures .a-wuimg img").count() == 1)
        pg.screenshot(path=os.path.join(SHOTS, "r43-done-%d.png" % w), full_page=True)
        check("  ...no sideways scroll", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        c2.close()
    check("no script errors", not errs, errs)
    b.close()
print("%d/%d passed" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
