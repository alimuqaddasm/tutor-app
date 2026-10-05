"""Exam questions part by part (Ali, 5 Oct: "one in full view and rest in sent-back view ... record feedback per part
   and it can auto-marked"), with the text set as a twin of the paper, and the round buttons on every exam question.
   Uses the 5 Oct chemistry lesson with Q5(a) rewritten into parts (as the tutoring chat will write it).
   Pretend GitHub as in tests/test_quickflow.py.

    python tests/test_slider_5oct.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-05-chem"
BASE = "students/UK-1/lessons/%s/" % LID
SHOTS = os.environ.get("SHOTS")
CROPS = os.environ.get("SLCROPS")   # optional folder with r4-ms-i.png, r4-ms-ii.png, r4-ms-iii.png for nicer screenshots
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def wait(pg, fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        pg.wait_for_timeout(200)
    return None


def fake_with_parts():
    fake = FakeGH()
    s = json.loads(fake.blob(fake.sha_of(BASE + "script.json")))
    ms = lambda n: ["assets/r4-ms-%s.png" % n] if CROPS else ["assets/r4-ms.png"]
    for ph in s["phases"]:
        for b in ph.get("blocks", []):
            for q in b.get("blocks", []):
                if q.get("id") == "r4-propanoic-acid":
                    q.pop("img", None); q.pop("answerImg", None)
                    q["num"] = "<b>Q5.</b>(a)"
                    q["stem"] = "Propanoic acid can be made from propan-1-ol by oxidation using acidified potassium dichromate(VI). Propanal is formed as an intermediate during this oxidation."
                    q["parts"] = [
                        {"lab": "(i)", "q": "State the colour of the chromium species after the potassium dichromate(VI) has reacted.", "marks": 1, "mk": "(1)", "answer": "<b>Green</b>", "ms": ms("i")},
                        {"lab": "(ii)", "q": "<p>Describe the experimental conditions and the practical method used to ensure that the acid is obtained in a high yield. Draw a diagram of the assembled apparatus you would use.</p><p class=\"ln\">Conditions <span class=\"dots\"></span></p><p class=\"ln\">Apparatus</p>", "marks": 4, "mk": "(4)", "answer": "<b>Excess</b> acidified potassium dichromate(VI); <b>reflux</b>; vertical condenser; apparatus that would work (not sealed).", "ms": ms("ii")},
                        {"lab": "(iii)", "q": "Describe the different experimental conditions necessary to produce propanal in high yield rather than propanoic acid.", "marks": 2, "mk": "(2)", "answer": "<b>Distillation</b>: distil the propanal off as it forms.", "ms": ms("iii")}]
    fake.extra[BASE + "script.json"] = json.dumps(s).encode()
    if CROPS:
        for n in ("i", "ii", "iii"):
            fake.extra[BASE + "assets/r4-ms-%s.png" % n] = open(os.path.join(CROPS, "r4-ms-%s.png" % n), "rb").read()
    fake.extra[BASE + "session.json"] = json.dumps({"v": 1, "lesson": LID, "student": "UK-1", "subject": "chem", "date": "2026-10-05", "status": "in-progress",
        "time": {"log": [{"t": "2026-10-05T09:00:00.000Z", "e": "start", "p": "c2", "d": "test"}]}, "answers": {}, "extra": [], "work": [], "feedback": {}}).encode()
    return fake


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = fake_with_parts()

    def page(w=1440, h=765, extra=""):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow','quick');" + extra)
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
        return pg

    def go(pg, text):
        pg.evaluate("""(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}""", text)
        pg.wait_for_timeout(900)

    def saved(k):
        s = json.loads(fake.puts[BASE + "session.json"]) if BASE + "session.json" in fake.puts else {}
        return s.get("answers", {}).get(k) or {}

    Q = "r4-propanoic-acid"
    pg = page()
    go(pg, "Propan-1-ol")
    check("a question in parts opens as the slider", pg.locator(".chunk.cur .slider").count() == 1)
    check("  one part in the middle: (i) first", "State the colour" in pg.inner_text(".sl-cur") and pg.locator(".sl-pill.cur").inner_text().startswith("(i)"))
    check("  the next part peeks in below", pg.locator(".sl-peek.next").count() == 1 and "(ii)" in pg.inner_text(".sl-peek.next"))
    check("  set like the paper: Arial, label in its own column, marks bold on the right", pg.evaluate("(()=>{const t=document.querySelector('.sl-cur .tw'),m=document.querySelector('.sl-cur .tw-mk'),l=document.querySelector('.sl-cur .tw-lab').getBoundingClientRect(),q=document.querySelector('.sl-cur .tw-q').getBoundingClientRect();return getComputedStyle(t).fontFamily.startsWith('Arial')&&getComputedStyle(m).fontWeight==='700'&&getComputedStyle(m).textAlign==='right'&&q.left>l.left+20})()"))
    check("  the stem stays on top", "Propanoic acid can be made" in pg.inner_text(".sl-stem"))
    check("  no buttons in the bottom bar, the round buttons on the right", pg.locator(".tfoot .vstrip").count() == 0 and pg.locator(".chunk.cur .vrail[data-item='%s~(i)']" % Q).count() == 1)
    check("  total starts at 0 / 7", pg.inner_text(".sl-tot").strip() == "0 / 7")
    big = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.sl-cur .tw')).fontSize)")
    check("  on a laptop the part is big (21px or more, today about 10)", big >= 21, big)
    pg.keyboard.press("1"); pg.wait_for_timeout(700)
    check("a tick gives (i) its mark and slides (ii) up", "Describe the experimental conditions" in pg.inner_text(".sl-cur") and pg.locator(".sl-peek.prev .sl-badge.v-right").count() == 1)
    check("  total 1 / 7", pg.inner_text(".sl-tot").strip() == "1 / 7")
    check("  saved per part, and the question keeps the total", wait(pg, lambda: saved(Q + "~(i)").get("m") == 1 and saved(Q).get("m") == 1, 8) is not None, (saved(Q + "~(i)"), saved(Q)))
    pg.keyboard.press("3"); pg.wait_for_timeout(500)
    check("a half stays on (ii) and gives half its marks", "Describe the experimental conditions" in pg.inner_text(".sl-cur") and pg.inner_text(".sl-tot").strip() == "3 / 7")
    pg.keyboard.press("a"); pg.wait_for_timeout(500)
    check("A turns (ii) over: its mark scheme only, with a marks box", pg.locator(".sl-cur.back").count() == 1 and "(ii) only" in pg.inner_text(".sl-cur").lower() and "Excess" in pg.inner_text(".sl-cur"))
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "slider-back-1440.png"))
    pg.fill(".sl-cur input[data-mk]", "3"); pg.wait_for_timeout(300)
    check("  typing 3 changes the total to 4 / 7", pg.inner_text(".sl-tot").strip() == "4 / 7")
    pg.keyboard.press("Escape"); pg.click(".sl-hd b"); pg.keyboard.press("a"); pg.wait_for_timeout(400)
    check("  A again: back to the question", pg.locator(".sl-cur.back").count() == 0)
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(400)
    check("down arrow moves to (iii)", "propanal in high yield" in pg.inner_text(".sl-cur"))
    pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(400)
    check("  up arrow back to (ii), still marked", "Describe the experimental" in pg.inner_text(".sl-cur") and pg.locator(".vrail .vr-partly[aria-pressed=true]").count() == 1)
    pg.click(".sl-pill:nth-child(3)"); pg.wait_for_timeout(400)
    pg.keyboard.press("2"); pg.wait_for_timeout(500)
    check("a cross on the last part gives 0 and the question is partly right", pg.inner_text(".sl-tot").strip() == "4 / 7" and wait(pg, lambda: saved(Q).get("v") == "partly", 8) is not None, saved(Q))
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "slider-1440.png"))
    check("the outline shows the question as partly", pg.evaluate("!!document.querySelector('.outline .oc.cur.v-partly')"))
    # the normal (picture) exam question: round buttons too, A on top, nothing in the bottom bar
    go(pg, "Propene, 2-bromopropane")
    check("a picture question has the round buttons and the A button", pg.locator(".chunk.cur .vrail .vr-flip").count() == 1 and pg.locator(".tfoot .vstrip").count() == 0)
    pg.keyboard.press("a"); pg.wait_for_timeout(400)
    check("  A turns it to the mark scheme", pg.locator(".chunk.cur.flipped").count() == 1 and pg.get_attribute(".vrail .vr-flip", "aria-pressed") == "true")
    pg.keyboard.press("a"); pg.wait_for_timeout(300)
    pg.click(".vrail [data-vrmore]")
    check("  its marks box is in the ... menu", pg.locator(".vrail .vrmenu input[data-mk]").count() == 1)
    pg.click(".tcrumb > b")
    pg.keyboard.press("1"); pg.wait_for_timeout(400)
    check("  key 1 marks it right, the tick keeps a ring", pg.get_attribute(".vrail .vr-right", "aria-pressed") == "true" and pg.locator(".vrail.has").count() == 1)
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "flipq-1440.png"))
    # after the lesson: every note is listed
    pg.evaluate("location.hash='#/lesson/%s'" % LID); pg.wait_for_timeout(800)
    pg.context.close()

    # a narrow window (Ali's 718 px): the text keeps its size and wraps sooner
    pg = page(718, 764)
    go(pg, "Propan-1-ol")
    fs = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.sl-cur .tw')).fontSize)")
    check("718 wide: the part text is at least 19px", fs >= 19, fs)
    check("  no sideways scroll, the buttons clear of the card", pg.evaluate("(()=>{const r=document.querySelector('.vrail').getBoundingClientRect(),c=document.querySelector('.chunk.cur').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&c.right<=r.left+1})()"))
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "slider-718.png"))
    pg.context.close()

    # student view shows the twin, and the plan lists it
    pg = page()
    pg.goto(APP + "#/lesson/" + LID + "/student"); pg.wait_for_timeout(1500)
    pg.evaluate("(()=>{const b=[...document.querySelectorAll('.stu-item')].find(x=>x.textContent.includes('Propan')||x.textContent.includes('r4'));if(b)b.click()})()"); pg.wait_for_timeout(500)
    check("student view can show a question in parts", pg.evaluate("[...document.querySelectorAll('.stu-item')].length") >= 1)
    pg.context.close()

    # after the lesson lists every note, right answers too
    fake.extra[BASE + "session.json"] = json.dumps({"v": 1, "lesson": LID, "student": "UK-1", "subject": "chem", "date": "2026-10-05", "status": "in-progress",
        "time": {"log": [{"t": "2026-10-05T09:00:00.000Z", "e": "start", "p": "c2", "d": "test"}]},
        "answers": {Q + "~(i)": {"v": "right", "m": 1, "note": "said green straight away", "q": "Propan-1-ol (i)", "at": "2026-10-05T09:05:00Z"}}, "extra": [], "work": [], "feedback": {}}).encode()
    pg = page()
    pg.evaluate("location.hash='#/lesson/%s'" % LID); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{const b=document.querySelector('.rail button[data-phase=\"_after\"]');if(b)b.click()})()"); pg.wait_for_timeout(800)
    check("After the lesson lists your notes, right answers too", "said green straight away" in (pg.inner_text("#lessonnotes") if pg.locator("#lessonnotes").count() else ""))
    pg.context.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
