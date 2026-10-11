"""Round 26 (11 Oct): typed questions set out like the paper (paper.js): AQA number boxes, marks on the right,
multiple choice answer boxes, Edexcel numbers and parts, the figure in its place; shown on the Exams page before the start too.
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
        check(name + ": before the start, every question shows in the paper layout", wait_for(pg, lambda: pg.locator(".xt-qs .pp").count() == qs, 15) is not None, pg.locator(".xt-qs .pp").count())
        if name == "chem":
            check("chem: AQA number boxes (0 5 . 1)", pg.locator('.xt-qs tr[data-q="q1"] .pp-box').count() >= 5)
            check("chem: option boxes on multiple choice", pg.locator('.xt-qs tr[data-q="q6"] .pp-ob').count() == 4)
        pg.screenshot(path=os.path.join(SHOTS, "r26-%s-setup-1440.png" % name), full_page=True)
        pg.click("[data-newlink]")
        wait_for(pg, lambda: "#t=" in pg.input_value("#xt-link"), 10)
        link = pg.input_value("#xt-link")
        pg.click("[data-start]")
        wait_for(pg, lambda: pg.locator(".xq-look").count() == qs, 15)
        check(name + ": once started, every question shows in the paper layout", pg.locator(".xq-look .pp").count() == qs)
        pg.wait_for_timeout(800)
        pg.screenshot(path=os.path.join(SHOTS, "r26-%s-exampage-1440.png" % name), full_page=True)

        sctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
        st = sctx.new_page()
        st.goto(link)
        wait_for(st, lambda: st.locator(".ex-qtext").count() == 1, 20)
        for qn in ([1, 2, 3, 4, 5, 6, 8] if name == "chem" else [1, 2, 3, 4, 5]):
            st.set_viewport_size({"width": 1440, "height": 900})
            st.click('[data-go="%d"]' % (qn - 1))
            st.wait_for_timeout(500)
            if st.locator(".ex-qimg img").count():
                wait_for(st, lambda: st.locator(".ex-qimg img").evaluate("i => i.naturalWidth > 0"), 15)
            fig = st.locator(".pp-fig").count() > 0
            ok = st.locator(".ex-qtext .pp").count() == 1 and (not fig or st.locator(".pp-fig .ex-qimg").count() == 1)
            check("%s Q%d: his page shows the paper layout%s" % (name, qn, ", picture in its place" if fig else ""), ok)
            st.screenshot(path=os.path.join(SHOTS, "r26-%s-q%d-1440.png" % (name, qn)), full_page=True)
            st.set_viewport_size({"width": 390, "height": 844}); st.wait_for_timeout(300)
            st.screenshot(path=os.path.join(SHOTS, "r26-%s-q%d-390.png" % (name, qn)), full_page=True)
            check("%s Q%d: fits the phone" % (name, qn), st.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        if name == "chem":
            st.set_viewport_size({"width": 1440, "height": 900})
            st.click('[data-go="5"]'); st.wait_for_timeout(400)
            st.locator('.pp-opt[data-opt="D"]').click()
            check("chem Q6: tapping option D's line picks D and fills its oval", wait_for(st, lambda: st.locator('.ex-pick[data-pick="D"][aria-pressed="true"]').count() == 1 and st.locator('.pp-opt.on[data-opt="D"]').count() == 1) is not None)
        sctx.close()
        xid = pg.evaluate("location.hash").split("/")[2]
        tapi("POST", "/api/t/exams/%s/lock" % xid)
        pg.goto(APP + "#/exams/%s/mark" % xid)
        check(name + ": Mark page shows every question in the paper layout", wait_for(pg, lambda: pg.locator(".pp").count() >= qs, 20) is not None, pg.locator(".pp").count())
        pg.screenshot(path=os.path.join(SHOTS, "r26-%s-mark-1440.png" % name), full_page=True)
        if pg.locator("[data-compare]").count():
            pg.locator("[data-compare]").first.click()
            pg.wait_for_timeout(800)
            pg.evaluate("document.querySelectorAll('details.xt-cmpq').forEach(d => d.open = true)")
            check(name + ": Compare shows the question in the paper layout", pg.locator(".xt-cmpq .pp").count() == 1)
            pg.screenshot(path=os.path.join(SHOTS, "r26-%s-compare-1440.png" % name), full_page=True)

    b.close()
print("%d of %d passed" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
