"""Round 25 (11 Oct): typed questions with cropped figures, and swipe between zoomed questions on the exam page.
Uses the real 12 Oct chem and 11 Oct maths exams from the tutoring clone. Needs the local exam server on :8787 and
the app on :8765. Run: python tests/runtest.py tests/test_round25.py"""
import json, os, time, urllib.request
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def wait_for(pg, fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        pg.wait_for_timeout(250)
    return None


def tapi(method, path):
    req = urllib.request.Request(API + path, method=method, headers={"X-Exam-Password": PW})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# a fresh start: take any earlier copy of these two exams off the local server
for x in tapi("GET", "/api/t/exams"):
    if x.get("sourcePath", "").endswith(("2026-10-12-chem-2/exam.json", "2026-10-11-maths/exam.json")):
        if x.get("status") in ("running", "timeup"):
            tapi("POST", "/api/t/exams/%s/lock" % x["id"])
        tapi("DELETE", "/api/t/exams/" + x["id"])

fake = FakeGH()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.route("https://api.github.com/**", fake.route)
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);}catch(e){}" % (json.dumps(API), json.dumps(PW)))
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.accept())
    for name, folder, qs in [("chem", "students/UK-1/exams/2026-10-12-chem-2/", 11), ("maths", "students/UK-1/exams/2026-10-11-maths/", 5)]:
        pg.goto(APP + "#/exams")
        wait_for(pg, lambda: pg.locator('[data-load="%sexam.json"]' % folder).count() == 1, 30)
        pg.click('[data-load="%sexam.json"]' % folder)
        wait_for(pg, lambda: pg.locator("#xt-btns").count() == 1, 60)
        pg.click("[data-newlink]")
        wait_for(pg, lambda: "#t=" in pg.input_value("#xt-link"), 10)
        link = pg.input_value("#xt-link")
        pg.click("[data-start]")
        wait_for(pg, lambda: pg.locator(".xq-look").count() == qs, 15)
        check(name + ": every question shows on the exam page", pg.locator(".xq-look").count() == qs)
        figs = pg.locator(".xq-look img")
        wait_for(pg, lambda: figs.count() >= 2)
        # the figures are loading="lazy": one further down loads only near the screen, so scroll to it first
        check(name + ": typed questions show text and figure", wait_for(pg, lambda: figs.count() >= 2 and figs.nth(1).evaluate("i => { i.scrollIntoView({block: 'center'}); return i.naturalWidth > 0; }")) is not None, pg.evaluate("Array.from(document.querySelectorAll('.xq-look img')).map(function(i){return (i.getAttribute('data-xsrc')||'').split('/').slice(-2).join('/')+'='+i.naturalWidth}).join(', ')"))
        figs.nth(0).click()
        wait_for(pg, lambda: pg.locator("#zoom").is_visible())
        first = pg.get_attribute("#zimg", "src")
        pg.keyboard.press("ArrowRight")
        check(name + ": zoomed, the arrow key goes to the next question", wait_for(pg, lambda: pg.get_attribute("#zimg", "src") != first) is not None)
        pg.screenshot(path=os.path.join(SHOTS, "r25-%s-zoom-1440.png" % name))
        pg.keyboard.press("Escape")
        pg.screenshot(path=os.path.join(SHOTS, "r25-%s-exampage-1440.png" % name), full_page=True)
        pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SHOTS, "r25-%s-exampage-390.png" % name), full_page=True)
        check(name + ": exam page fits the phone", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.set_viewport_size({"width": 1440, "height": 900})

        sctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
        st = sctx.new_page()
        st.goto(link)
        wait_for(st, lambda: st.locator(".ex-qtext").count() == 1, 20)
        qn = 2 if name == "chem" else 3
        for _ in range(qn - 1):
            st.click("[data-next]"); st.wait_for_timeout(300)
        wait_for(st, lambda: st.locator(".ex-qimg img").evaluate("i => i.naturalWidth > 0"), 15)
        check(name + ": his page shows typed text and the figure", st.locator(".ex-qtext").is_visible() and len(st.inner_text(".ex-qtext")) > 40 and st.locator(".ex-qimg").count() == 1)
        st.screenshot(path=os.path.join(SHOTS, "r25-%s-his-1440.png" % name), full_page=True)
        st.set_viewport_size({"width": 390, "height": 844}); st.wait_for_timeout(300)
        st.screenshot(path=os.path.join(SHOTS, "r25-%s-his-390.png" % name), full_page=True)
        check(name + ": his page fits the phone", st.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        sctx.close()
    b.close()
print("%d of %d passed" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
