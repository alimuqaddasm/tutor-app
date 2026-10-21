"""Round 41 (21 Oct): the warm-up deck on his assignment link. A Warm-up button above the days; 15 multiple-choice cards one
at a time; right or wrong only after the last card, with the answer and the book's words; his tries reach the exam server.
Needs the local exam server on :8787 (see tests/README.md) and the app on :8765. Nothing touches GitHub."""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
def tapi(method, path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers={"X-Exam-Password": PW, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read() or b"{}")

CARDS = [
 ("Which catalyst is used to make an ester from a carboxylic acid and an alcohol?", ["Concentrated sulfuric acid", "Dilute hydrochloric acid", "Phosphoric acid on silica", "Nickel"], "Concentrated sulfuric acid is usually used as the acid catalyst.", "CGP p.174", "3.3.9"),
 ("What do you add to make the ester in acid hydrolysis split more fully?", ["Lots of water", "More acid", "Sodium hydroxide", "A drying agent"], "As it's a reversible reaction, you add lots of water to push the equilibrium to the right.", "CGP p.176", "3.3.9"),
 ("What does the aldehyde do to the Ag⁺ ions in Tollens' reagent?", ["Reduces them to silver atoms", "Oxidises them to silver atoms", "Precipitates them as silver oxide", "Nothing"], "The aldehyde reduces the Ag⁺ ions to silver atoms.", "CGP p.163", "3.3.6"),
 ("What colour change shows an alkene with bromine water?", ["Orange to colourless", "Colourless to orange", "Orange to green", "Purple to colourless"], "An alkene decolourises bromine water (orange to colourless).", "CGP p.163", "3.3.4"),
]
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    ex = tapi("POST", "/api/t/exams", {"title": "Holiday practice, 23 to 30 Oct", "kind": "assignment",
        "sections": [{"id": "d1-chem", "title": "Day 1 Chemistry", "subject": "chem", "day": 1}],
        "questions": [{"id": "d1c1", "marks": 4, "type": "short", "section_id": "d1-chem", "text_html": "<p>a</p>"}]})
    eid = ex["id"]; tok = tapi("POST", "/api/t/exams/%s/link" % eid)["token"]
    cards = [{"id": "c%d" % i, "q": q, "options": o, "why": w, "page": pg, "topic": t, "kind": "mistake" if i < 2 else "general"}
             for i, (q, o, w, pg, t) in enumerate(CARDS * 5)]
    for i, c in enumerate(cards): c["q"] = c["q"] if i < 4 else c["q"] + " (" + str(i) + ")"
    put = tapi("PUT", "/api/t/exams/%s/cards" % eid, {"cards": cards})
    check("cards load onto the exam server", put.get("cards") == 20 and put.get("live") == 20, put)
    errs = []
    for (w, h) in ((1440, 900), (390, 844)):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce"); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "exam.html#t=" + tok + "&api=" + API); pg.wait_for_selector(".a-root", timeout=20000); pg.wait_for_timeout(600)
        wb = pg.locator("[data-a-warm]")
        check("%d px: a Warm-up button above the days, with the card count" % w, wb.count() == 1 and "15 quick cards" in wb.inner_text(), wb.inner_text() if wb.count() else "")
        if w == 1440: pg.screenshot(path=os.path.join(SHOTS, "r41-home-1440.png"))
        with pg.expect_response(lambda r: "/api/s/deck" in r.url and r.request.method == "GET") as rr: wb.click()
        deck = rr.value.json(); pg.wait_for_selector(".a-wucard", timeout=10000)
        check("  ...the first card: question, 4 answers, 1 of 15", pg.locator(".a-wuopt").count() == 4 and "1 of 15" in pg.inner_text(".a-top"))
        check("  ...no right or wrong shown yet", pg.locator(".a-wures, .tag.ok, .tag.bad").count() == 0)
        pg.screenshot(path=os.path.join(SHOTS, "r41-card-%d.png" % w))
        answers = [c["answer"] for c in deck["cards"]]
        for i in range(15):
            n = answers[i] if i % 3 else (answers[i] + 1) % 4     # every third one wrong
            if i == 1:
                pg.click("[data-a-wback]"); pg.wait_for_timeout(100)
                check("  ...Back goes to the card before", "1 of 15" in pg.inner_text(".a-top"))
                pg.click('[data-a-wpick="%d"]' % ((answers[0] + 1) % 4)); pg.wait_for_timeout(100)
            pg.click('[data-a-wpick="%d"]' % n); pg.wait_for_timeout(60)
        pg.wait_for_selector(".a-wudone", timeout=10000); pg.wait_for_timeout(800)
        check("  ...after the last card: the score and every card marked", "10/15 right" in pg.inner_text(".a-wuscore") and pg.locator(".a-wures").count() == 15, pg.inner_text(".a-wuscore"))
        check("  ...a wrong card shows his choice, the answer and the book's words", pg.locator(".a-wures.bad .a-wumine").count() == 5 and pg.locator(".a-wures.bad .hint").count() == 5)
        pg.screenshot(path=os.path.join(SHOTS, "r41-done-%d.png" % w), full_page=True)
        check("  ...no sideways scroll", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        if w == 1440:   # the connection drops while saving: his tries stay and he can save again, counted once
            pg.click(".a-wudone [data-a-warm]"); pg.wait_for_selector(".a-wucard", timeout=10000)
            fail = {"n": 1}
            def drop(route):
                if route.request.method == "POST" and fail["n"]: fail["n"] -= 1; route.abort()
                else: route.continue_()
            pg.route("**/api/s/deck", drop)
            for i in range(15): pg.click('[data-a-wpick="0"]'); pg.wait_for_timeout(40)
            pg.wait_for_selector("[data-a-wsave]", timeout=10000)
            check("  ...no connection: 'Try saving again', results still there", pg.locator(".a-wures").count() == 15)
            pg.click("[data-a-wsave]"); pg.wait_for_timeout(1200)
            check("  ...saving again works", pg.locator("[data-a-wsave]").count() == 0 and "Not saved" not in pg.inner_text(".a-wudone"))
            pg.unroute("**/api/s/deck")
        pg.click(".a-wudone [data-a-home]"); pg.wait_for_timeout(300)
        check("  ...Back to all days", pg.locator(".a-home2").count() == 1)
        c.close()
    tr = tapi("GET", "/api/t/exams/%s/cards" % eid)["tries"]
    check("his 45 tries reached the exam server once each", len(tr) == 45, len(tr))
    check("no script errors", not errs, errs)
    b.close()
print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
