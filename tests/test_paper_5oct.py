"""5 Oct: question text set like the real papers (parts on their own lines with hanging labels, marks on the right,
   AQA's bold words), arrow keys between zoomed book pages, and After the lesson filled in from the ticks and notes.
   Pretend GitHub as in tests/test_batch1_lessons.py; the exam-page check needs the local exam server (tests/README.md).

    python tests/test_paper_5oct.py
"""
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
API = os.environ.get("EXAM_API", "http://localhost:8787")
PW = os.environ.get("EXAM_PW", "local-test")
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    # a taught lesson whose After form was never filled: two misses, one with a note
    sp = "students/UK-1/lessons/2026-10-04-chem/session.json"
    sess = json.loads(fake.blob(fake.sha_of(sp)))
    sess["feedback"] = {}
    sess["status"] = "in-progress"
    k = next(k for k, a in sess["answers"].items() if a.get("v") == "wrong")
    sess["answers"][k]["note"] = "said electrophile"
    fake.extra[sp] = json.dumps(sess).encode()

    c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.flow','quick');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
    c.route("https://api.github.com/**", fake.route)
    pg = c.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))

    def go(t):
        pg.evaluate("(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}", t)
        pg.wait_for_timeout(1200)

    # maths: the parts of a video question on their own lines
    pg.goto(APP + "?try#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    go("Maths Genie 7.1")
    pg.click(".chunk.cur .brow:nth-child(3) .bq"); pg.wait_for_timeout(1500)
    labs = pg.evaluate("[...document.querySelectorAll('.brow.open .paper .plab')].map(e=>e.textContent)")
    check("maths: parts (a), (b), (c) each on their own line", labs == ["(a)", "(b)", "(c)"], labs)
    check("  set in the Edexcel style (Times, plain labels)", "Times" in pg.evaluate("getComputedStyle(document.querySelector('.brow.open .paper')).fontFamily") and pg.evaluate("getComputedStyle(document.querySelector('.brow.open .plab')).fontWeight") == "400")
    check("  the label hangs in the margin", pg.evaluate("(()=>{const p=document.querySelectorAll('.brow.open .ppart');return p[0].querySelector('.ptxt').getBoundingClientRect().left===p[1].querySelector('.ptxt').getBoundingClientRect().left&&p[0].querySelector('.plab').getBoundingClientRect().left<p[0].querySelector('.ptxt').getBoundingClientRect().left})()"))

    # chemistry: AQA's bold words
    pg.goto(APP + "?try#/lesson/2026-10-04-chem/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    go("Oral quiz")
    i = pg.evaluate("[...document.querySelectorAll('.chunk.cur .brow .bt')].findIndex(e=>/Name the three/.test(e.textContent))")
    pg.click(".chunk.cur .brow:nth-child(%d) .bq" % (i + 1)); pg.wait_for_timeout(800)
    check("chemistry: 'Name the three' sets three in bold, as AQA does", pg.evaluate("[...document.querySelectorAll('.brow.open .paper b')].map(e=>e.textContent)") == ["three"])

    # book pages: arrow keys move between zoomed pages
    go("CGP pages for checking")
    pg.wait_for_timeout(1500)
    pg.click(".chunk.cur .tfig img >> nth=0"); pg.wait_for_timeout(400)
    s0 = pg.get_attribute("#zimg", "src")
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(400)
    check("book pages: the arrow key moves to the next page", not pg.locator("#zoom").is_hidden() and pg.get_attribute("#zimg", "src") != s0 and pg.inner_text("#zoomn").startswith("2 /"), pg.inner_text("#zoomn") if pg.locator("#zoomn").count() else "")
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(300)
    check("  and back", pg.get_attribute("#zimg", "src") == s0)
    pg.keyboard.press("Escape")

    # After the lesson: filled in from the ticks and the notes
    pg.goto(APP + "?try#/lesson/2026-10-04-chem"); pg.wait_for_selector(".rail", timeout=30000)
    pg.click('.rail button[data-phase="_after"]'); pg.wait_for_timeout(800)
    check("After the lesson: 'covered' is filled in from the ticks", len(pg.input_value("#fb-cov")) > 20, pg.input_value("#fb-cov")[:80])
    check("  'where he got stuck' lists the misses with your notes", "said electrophile" in pg.input_value("#fb-stuck"), pg.input_value("#fb-stuck")[:120])
    check("  and says to check it", pg.locator(".prefill").count() == 1)

    # exam page: the same setting
    try:
        def tapi(m, path, body=None):
            r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=m, headers={"X-Exam-Password": PW, "Content-Type": "application/json"})
            return json.loads(urllib.request.urlopen(r).read())
        eid = tapi("POST", "/api/t/exams", {"title": "Paper test", "subject": "chem", "practice": True, "base_minutes": 10,
                                           "questions": [{"id": "q1", "text_html": "Compound X reacts with water.<br>(a) Give two reasons it does not dissolve.<br>(b) Name X.", "marks": 3, "type": "long"}]})["id"]
        tok = tapi("POST", "/api/t/exams/%s/link" % eid)["token"]; tapi("POST", "/api/t/exams/%s/start" % eid)
        pg.goto(APP + "exam.html#t=" + tok + "&api=" + urllib.request.quote(API, safe="")); pg.wait_for_selector(".ex-qtext .paper", timeout=15000)
        check("exam page: parts and AQA bold words", pg.locator(".ex-qtext .ppart").count() == 2 and pg.evaluate("[...document.querySelectorAll('.ex-qtext b')].map(e=>e.textContent)") == ["X", "two", "not"], pg.evaluate("[...document.querySelectorAll('.ex-qtext b')].map(e=>e.textContent)"))
        tapi("POST", "/api/t/exams/%s/lock" % eid); tapi("DELETE", "/api/t/exams/%s" % eid)
    except urllib.error.URLError:
        check("exam page: parts and AQA bold words", False, "local exam server not running")

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
