"""Round 42 (21 Oct): Ali's warm-up card review in the Exams tab. Lists cards.json from the tutoring repo; filters; edit,
approve, reject; Save to tutoring repo (one commit); Send to his deck puts the approved cards on the exam server; his tries
show on each card. Needs the local exam server on :8787 and the app on :8765; GitHub is the pretend one (fakegh)."""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
def tapi(method, path, body=None, token=None):
    h = {"Content-Type": "application/json"}; h.update({"X-Exam-Token": token} if token else {"X-Exam-Password": PW})
    return json.loads(urllib.request.urlopen(urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)).read() or b"{}")

ex = tapi("POST", "/api/t/exams", {"title": "Holiday practice, 23 to 30 Oct", "kind": "assignment", "source_path": "students/UK-1/assignments/2026-10-23-holiday/assignment.json",
    "sections": [{"id": "d1-chem", "title": "Day 1 Chemistry", "subject": "chem", "day": 1}], "questions": [{"id": "d1c1", "marks": 4, "type": "short", "section_id": "d1-chem"}]})
eid = ex["id"]; tok = tapi("POST", "/api/t/exams/%s/link" % eid)["token"]
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(**({"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}))
    fake = FakeGH()
    def ctx(w, h):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s)" % (json.dumps(API), json.dumps(PW)))
        c.route("https://api.github.com/**", fake.route); return c
    c = ctx(1440, 900); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/exams"); pg.wait_for_selector('a[href="#/exams/warmup"]', timeout=30000)
    check("Exams has a Warm-up cards button", pg.locator('a[href="#/exams/warmup"]').count() == 1)
    pg.click('a[href="#/exams/warmup"]'); pg.wait_for_selector(".wc-card", timeout=30000); pg.wait_for_timeout(800)
    n = pg.locator(".wc-card").count()
    check("the waiting cards from cards.json show, each with its right answer first", n > 50 and pg.locator(".wc-card").first.locator(".wc-opt.right").count() == 1, n)
    check("the deck picker has the holiday pack", eid in pg.eval_on_selector("[data-wcex]", "s => Array.from(s.options).map(o => o.value).join()"))
    pg.screenshot(path=os.path.join(SHOTS, "r42-review-1440.png"))
    pg.click('[data-wcf="kind:mistake"]'); pg.wait_for_timeout(200)
    check("filter: his mistakes only", all("His mistake" in t for t in pg.locator(".wc-card").all_inner_texts()[:5]))
    first = pg.locator(".wc-card").first; cid = first.get_attribute("data-wci")
    first.locator("[data-wcq]").fill("Which metals does a catalytic converter use?")
    pg.locator('.wc-card[data-wci="%s"] [data-wcst="approved"]' % cid).click(); pg.wait_for_timeout(200)
    check("Approve marks the card approved, with the edit kept", pg.locator('.wc-card[data-wci="%s"]' % cid).get_attribute("data-st") == "approved" and pg.locator('.wc-card[data-wci="%s"] [data-wcq]' % cid).input_value().startswith("Which metals does"))
    for k in range(1, 4): pg.locator(".wc-card[data-st=draft] [data-wcst=approved]").first.click(); pg.wait_for_timeout(80)
    pg.locator(".wc-card[data-st=draft] [data-wcst=rejected]").first.click(); pg.wait_for_timeout(100)
    check("the counts update: 4 approved", "4 approved" in pg.inner_text(".wc .head .tags"), pg.inner_text(".wc .head .tags"))
    check("Save is ready", not pg.locator("[data-wcsave]").is_disabled())
    before = dict(fake.puts)
    pg.click("[data-wcsave]"); pg.wait_for_function("()=>/Saved/.test(document.querySelector('[data-wcsave]').textContent)", timeout=15000)
    saved = fake.puts.get("students/UK-1/warmup/cards.json")
    data = json.loads(saved) if saved else {}
    check("Save writes cards.json to the repo with the statuses and the edit", saved and sum(1 for c in data["cards"] if c["status"] == "approved") == 4 and sum(1 for c in data["cards"] if c["status"] == "rejected") == 1 and any(c["q"].startswith("Which metals does") for c in data["cards"]))
    pg.click("[data-wcsend]"); pg.wait_for_timeout(1500)
    sv = tapi("GET", "/api/t/exams/%s/cards" % eid)
    check("Send to his deck puts only the 4 approved cards on the exam server, live", len(sv["cards"]) == 4 and all(x["live"] for x in sv["cards"]), len(sv["cards"]))
    check("  ...and says how many are live", "4 live on his deck" in pg.inner_text(".wc .head .tags"))
    d = tapi("GET", "/api/s/deck", token=tok)
    tapi("POST", "/api/s/deck", {"run": d["run"], "tries": [{"card": x["id"], "picked": x["options"][x["answer"]] if i else "nope"} for i, x in enumerate(d["cards"])]}, token=tok)
    pg.reload(); pg.wait_for_selector(".wc-card", timeout=30000); pg.click('[data-wcf="st:approved"]'); pg.wait_for_timeout(1500)
    check("his tries show on the cards", pg.locator(".wc-card", has_text="right on his deck").count() == 4, pg.locator(".wc-card").count())
    pg.screenshot(path=os.path.join(SHOTS, "r42-approved-1440.png"))
    c.close()
    c = ctx(390, 844); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/exams/warmup"); pg.wait_for_selector(".wc-card", timeout=30000); pg.wait_for_timeout(500)
    check("390 px: no sideways scroll", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.screenshot(path=os.path.join(SHOTS, "r42-review-390.png")); c.close()
    check("no script errors", not errs, errs)
    b.close()
print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
