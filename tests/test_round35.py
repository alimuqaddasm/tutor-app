"""Round 35 (17 Oct, app v62): the teaching canvas, phase 1. Student view on the tablet is a page he writes on; Teach on the
laptop puts questions onto it through the exam server (two devices, so no BroadcastChannel).
 - Student view opens as the canvas: the page and the pen only, no question list, no chips, no menu
 - Teach: Canvas lists every question of the lesson; Add puts it on his page; any number at once
 - the tablet places them one under the other, with writing space under each question
 - Move to top, Remove, the answer of a question on his page (for Ali, in Teach)
 - ink belongs to the question above it: it moves with it, goes with it, and writing that reaches the next question pushes it down
 - on the tablet: tap a piece with a finger, drag it, resize it, remove it; a finger scrolls, the S Pen writes
 - pages: New page, flip back, each page keeps its own ink; Clear canvas starts again
 - nothing goes to GitHub
Needs the local exam server on :8787 (password local-test) and the app on :8765 (see tests/README.md).
Run: python tests/runtest.py tests/test_round35.py"""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
API = os.environ.get("EXAM_API", "http://localhost:8787")
PW = os.environ.get("EXAM_PW", "local-test")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))

def post(actions):
    r = urllib.request.Request(API + "/api/t/canvas/" + LID, data=json.dumps({"actions": actions}).encode(), method="POST",
                               headers={"X-Exam-Password": PW, "Content-Type": "application/json", "Origin": "http://localhost:8765"})
    return json.load(urllib.request.urlopen(r))
def log():
    r = urllib.request.Request(API + "/api/t/canvas/" + LID + "?after=0", headers={"X-Exam-Password": PW})
    return [x["a"] for x in json.load(urllib.request.urlopen(r))["actions"]]

STROKE = """([kind, x0, y0, x1, y1, buttons]) => {
  const at = (x, y) => document.elementFromPoint(x, y) || document.body;
  const ev = (type, x, y, b) => at(x, y).dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 7, isPrimary: true,
    clientX: x, clientY: y, buttons: b, button: type === 'pointermove' ? -1 : 0, bubbles: true, cancelable: true, composed: true }));
  ev('pointerdown', x0, y0, buttons);
  for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, buttons);
  ev('pointerup', x1, y1, 0); }"""
# a drag on an element (a piece's handle) as pointer events of one kind
DRAG = """([sel, kind, dx, dy]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 9, isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
  ev('pointerdown', x, y); for (let i = 1; i <= 6; i++) ev('pointermove', x + dx * i / 6, y + dy * i / 6); ev('pointerup', x + dx, y + dy); }"""

post([{"t": "reset"}])   # a clean canvas for this lesson on the local server
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    def ctx(w, h, pw=True, touch=False):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce", has_touch=touch)
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.layout','flip');localStorage.removeItem('tutor.stumode');localStorage.setItem('tutor.examApi',%s);%s" % (json.dumps(API), "localStorage.setItem('tutor.examPw',%s);" % json.dumps(PW) if pw else ""))
        c.route("https://api.github.com/**", fake.route); return c
    lap = ctx(1440, 900).new_page(); lap.on("pageerror", lambda e: errs.append("laptop: " + str(e)))
    tab = ctx(1280, 800, touch=True).new_page(); tab.on("pageerror", lambda e: errs.append("tablet: " + str(e)))
    puts0 = len(fake.puts)
    tab.goto(APP + "#/lesson/" + LID + "/student"); tab.wait_for_selector(".cv-page", timeout=30000); tab.wait_for_timeout(1200)
    lap.goto(APP + "#/lesson/" + LID + "/teach"); lap.wait_for_selector(".tbar", timeout=30000); lap.wait_for_timeout(800)
    st = lambda pg: pg.evaluate("__t('JSON.stringify(cvState())')")
    items = lambda pg: json.loads(st(pg))["pages"][json.loads(st(pg))["cur"]]["items"]

    check("Student view opens as the canvas: a blank page", tab.locator(".stu.cv .cv-page").count() == 1 and tab.locator(".cv-item").count() == 0)
    check("  ...his screen has no question list, no chips, no menu", tab.locator(".stu-drawer, .stu-chips, #stumenu, .stu-n").count() == 0)
    check("  ...the pen is there", tab.locator("#stupen").count() == 1 and tab.locator(".stu-ink").count() == 1)

    lap.click(".tmini > [data-cvp]"); lap.wait_for_selector("#cvp", timeout=5000); lap.wait_for_timeout(600)
    n_add = lap.locator("#cvp [data-cvadd]").count()
    check("Teach: Canvas lists the lesson's questions to add", n_add >= 10, n_add)
    check("  ...and says his page is empty", "Empty" in lap.locator("#cvp").inner_text())
    lap.screenshot(path=os.path.join(SHOTS, "r35-teach-canvas-1440.png"))
    ids = lap.evaluate("() => [...document.querySelectorAll('#cvp [data-cvadd]')].slice(0, 3).map(b => b.getAttribute('data-cvadd'))")
    for i in ids: lap.click('#cvp [data-cvadd="%s"]' % i); lap.wait_for_timeout(250)
    tab.wait_for_function("document.querySelectorAll('.cv-item:not(.unplaced)').length === 3", timeout=12000)
    tab.wait_for_timeout(1500)
    it = items(tab)
    check("three questions added from Teach show on the tablet, in the order added", [x["ref"] for x in it] == ids, [x["ref"] for x in it])
    hs = tab.evaluate("() => [...document.querySelectorAll('.cv-item')].map(e => [e.getAttribute('data-u'), e.offsetHeight / (document.querySelector('.cv-page').clientWidth / 1000)])")
    hmap = dict(hs)
    gaps = [it[k + 1]["y"] - (it[k]["y"] + hmap[it[k]["u"]]) for k in range(2)]
    check("  ...one under the other, with writing space under each question", all(g >= 300 for g in gaps), gaps)
    check("  ...their places reach the laptop (its list is in the same order)", lap.evaluate("() => document.querySelectorAll('#cvp .cvrow [data-cvtop]').length") == 3)
    check("  ...those questions no longer offer Add on this page", all(lap.locator('#cvp [data-cvadd="%s"]' % i).count() == 0 for i in ids))
    tab.screenshot(path=os.path.join(SHOTS, "r35-tablet-canvas-1280.png"))

    # the answer for Ali, in Teach
    lap.click("#cvp [data-cvans]"); lap.wait_for_timeout(400)
    check("Teach: the answer of a question on his page opens under it", lap.locator("#cvp .cvans").count() == 1)
    check("  ...and never on his screen", tab.locator(".cvans, .ans").count() == 0)

    # ink under the first question belongs to it; reaching the second pushes it down
    tab.evaluate("document.querySelector('.cv-view').scrollTop = 0"); tab.wait_for_timeout(200)
    it = items(tab); first, second = it[0], it[1]
    m = tab.evaluate("__t('inkMap(), JSON.stringify(INK.map)')"); m = json.loads(m)
    px = lambda x, y: (m["l"] + x * m["s"], m["t"] + y * m["s"])
    y_under = first["y"] + hmap[first["u"]] + 60
    x0, y0 = px(200, y_under); x1, y1 = px(600, y_under)
    tab.evaluate(STROKE, ["pen", x0, y0, x1, y1, 1]); tab.wait_for_timeout(300)
    ink = json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key])')"))
    check("the S Pen writes on the canvas", len(ink) == 1, len(ink))
    check("  ...the stroke belongs to the question above it", ink and ink[0].get("o") == first["u"], ink and ink[0].get("o"))
    # the S Pen button rubs out on the page too (page units, not screen fractions)
    xr, yr = px(400, y_under + 120)
    tab.evaluate(STROKE, ["pen", xr, yr, xr + 200, yr, 1]); tab.wait_for_timeout(200)
    tab.evaluate(STROKE, ["pen", xr + 100, yr - 20, xr + 100, yr + 20, 32]); tab.wait_for_timeout(300)
    n_after = len(json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key])')")))
    check("the S Pen button rubs a stroke out on the canvas, and only that one", n_after == 1, n_after)
    sy = second["y"]
    xa, ya = px(700, y_under + 20); xb, yb = px(700, sy + 40)
    if yb > 760:   # keep the stroke on the screen
        tab.evaluate("(d) => document.querySelector('.cv-view').scrollTop += d", yb - 600); tab.wait_for_timeout(200)
        m = json.loads(tab.evaluate("__t('inkMap(), JSON.stringify(INK.map)')")); xa, ya = px(700, y_under + 20); xb, yb = px(700, sy + 40)
    tab.evaluate(STROKE, ["pen", xa, ya, xb, yb, 1]); tab.wait_for_timeout(1500)
    it2 = items(tab); s2 = [x for x in it2 if x["u"] == second["u"]][0]
    check("writing that reaches the next question pushes it down", s2["y"] > sy + 40, (sy, s2["y"]))

    # move to top: the third question first, its ink comes with it
    third = it2[2]
    lap.wait_for_timeout(1800)
    lap.click('#cvp [data-cvtop="%s"]' % third["u"]); tab.wait_for_timeout(2500)
    it3 = items(tab)
    check("Move to top from Teach puts that question first on his page", it3[0]["u"] == third["u"], [x["u"] for x in it3])
    ink3 = json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key])')"))
    f3 = [x for x in it3 if x["u"] == first["u"]][0]
    check("  ...the first question's ink moved down with it", ink3 and abs(min(p[1] for p in ink3[0]["p"]) - (f3["y"] + hmap[first["u"]] + 60)) < 3, (ink3 and ink3[0]["p"][0], f3["y"]))
    lap.wait_for_timeout(1800)
    check("  ...and the laptop's list follows", lap.evaluate("() => document.querySelector('#cvp .cvrow [data-cvtop]').getAttribute('data-cvtop')") == third["u"])

    # remove from Teach: the question and its working go
    lap.click('#cvp [data-cvrm="%s"]' % first["u"]); tab.wait_for_timeout(1500)
    check("Remove from Teach takes it off his page", tab.locator('.cv-item[data-u="%s"]' % first["u"]).count() == 0)
    ink4 = json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key])')"))
    check("  ...and its writing goes with it", not any(s.get("o") == first["u"] for s in ink4), ink4)

    # the tablet: tap with a finger to pick, drag, resize, remove
    tab.evaluate("document.querySelector('.cv-view').scrollTop = 0"); tab.wait_for_timeout(200)
    u = items(tab)[0]["u"]; sel = '.cv-item[data-u="%s"]' % u
    tab.locator(sel).tap(); tab.wait_for_timeout(300)
    check("a finger tap picks a piece: move, resize and remove show", tab.locator(sel + ".sel .cv-ctl").count() == 3 and tab.locator(sel + " .cv-ctl.x").is_visible())
    tab.screenshot(path=os.path.join(SHOTS, "r35-tablet-picked-1280.png"))
    b0 = items(tab)[0]
    tab.evaluate(DRAG, [sel + " [data-cvgrip]", "touch", 120, 60]); tab.wait_for_timeout(1500)
    b1 = [x for x in items(tab) if x["u"] == u][0]
    check("dragging the cross moves the piece", b1["x"] > b0["x"] + 50 and b1["y"] > b0["y"] + 20, (b0, b1))
    check("  ...and the place reaches the server", any(a["t"] == "pos" and a.get("u") == u and a["x"] == b1["x"] for a in log()))
    tab.evaluate(DRAG, [sel + " [data-cvsize]", "touch", -200, 0]); tab.wait_for_timeout(1500)
    b2 = [x for x in items(tab) if x["u"] == u][0]
    check("dragging the corner makes it smaller", b2["w"] < b1["w"] - 100, (b1["w"], b2["w"]))
    tab.locator(sel + " [data-cvrm]").tap(); tab.wait_for_timeout(2000)
    check("× on the tablet removes it", tab.locator(sel).count() == 0 and len(items(tab)) == 1)
    lap.wait_for_timeout(1800)
    check("  ...and the laptop's list follows", lap.locator("#cvp .cvrow [data-cvtop]").count() == 1)

    # a finger scrolls the page, it does not write
    n0 = len(json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')")))
    tab.evaluate(STROKE, ["touch", 640, 600, 640, 300, 1]); tab.wait_for_timeout(300)
    check("a finger drag scrolls the page and writes nothing", tab.evaluate("document.querySelector('.cv-view').scrollTop") > 100 and len(json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')"))) == n0)

    # pages: first some free writing at the top of page 1 (above every piece, so it belongs to none)
    tab.evaluate("document.querySelector('.cv-view').scrollTop = 0"); tab.wait_for_timeout(200)
    m = json.loads(tab.evaluate("__t('inkMap(), JSON.stringify(INK.map)')")); xa, ya = px(300, 12); xb, yb = px(700, 14)
    tab.evaluate(STROKE, ["pen", xa, ya, xb, yb, 1]); tab.wait_for_timeout(300)
    tab.click("[data-cvnew]"); tab.wait_for_timeout(1500)
    check("New page on the tablet: a blank page 2", "Page 2 of 2" in tab.locator(".cv-pages").inner_text() and tab.locator(".cv-item").count() == 0)
    lap.wait_for_timeout(1800)
    check("  ...Teach shows page 2 too", "Page 2 of 2" in lap.locator("#cvp").inner_text())
    lap.click('#cvp [data-cvadd="%s"]' % ids[0]); tab.wait_for_function("document.querySelectorAll('.cv-item:not(.unplaced)').length === 1", timeout=8000)
    check("  ...a question already on page 1 can go on page 2 as well", tab.locator(".cv-item").count() == 1)
    tab.click('[data-cvgo="-1"]'); tab.wait_for_timeout(1500)
    ink5 = json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')"))
    check("flip back to page 1: its pieces and its ink are still there", tab.locator(".cv-item").count() == 1 and len(ink5) >= 1, (tab.locator(".cv-item").count(), len(ink5)))

    # reload: the page comes back from the server, the ink from the device
    tab.reload(); tab.wait_for_selector(".cv-page", timeout=30000); tab.wait_for_timeout(2500)
    ink6 = json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')"))
    check("after a reload the tablet has the same page, pieces and ink", "Page 1 of 2" in tab.locator(".cv-pages").inner_text() and tab.locator(".cv-item").count() == 1 and len(ink6) == len(ink5), (tab.locator(".cv-item").count(), len(ink6)))

    # questions view and back
    tab.click('[data-cvmode="questions"]'); tab.wait_for_timeout(800)
    check("Questions switches to the one-by-one view", tab.locator(".stu-view").count() == 1 and tab.locator(".cv-page").count() == 0)
    tab.click('[data-cvmode="canvas"]'); tab.wait_for_selector(".cv-page", timeout=5000); tab.wait_for_timeout(1200)
    check("  ...and Canvas comes back to the page", tab.locator(".cv-item").count() == 1)

    # clear canvas
    lap.once("dialog", lambda d: d.accept())
    lap.click("#cvp [data-cvreset]"); tab.wait_for_timeout(2000)
    check("Clear canvas: one blank page, no ink", "Page 1 of 1" in tab.locator(".cv-pages").inner_text() and tab.locator(".cv-item").count() == 0 and len(json.loads(tab.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')"))) == 0)

    # a tablet without the exam password asks for it once
    t2 = ctx(1280, 800, pw=False, touch=True).new_page(); t2.on("pageerror", lambda e: errs.append("tablet 2: " + str(e)))
    t2.goto(APP + "#/lesson/" + LID + "/student"); t2.wait_for_selector(".cv-page", timeout=30000); t2.wait_for_timeout(800)
    check("a tablet without the exam password asks for it", t2.locator("#cvpw").count() == 1)
    t2.fill("#cvpw", PW); t2.click("#cvpwgo"); t2.wait_for_timeout(1500)
    check("  ...and then shows the canvas", t2.locator("#cvpw").count() == 0 and "Page 1 of 1" in t2.locator(".cv-pages").inner_text())

    # screenshots at 1440 and 390
    lap.click('#cvp [data-cvadd="%s"]' % ids[1]); lap.click('#cvp [data-cvadd="%s"]' % ids[2]); tab.wait_for_timeout(3000)
    lap.wait_for_timeout(1500); lap.screenshot(path=os.path.join(SHOTS, "r35-teach-canvas-on-1440.png"))
    tab.set_viewport_size({"width": 1440, "height": 900}); tab.wait_for_timeout(800); tab.screenshot(path=os.path.join(SHOTS, "r35-tablet-canvas-1440.png"))
    tab.set_viewport_size({"width": 390, "height": 844}); tab.wait_for_timeout(800); tab.screenshot(path=os.path.join(SHOTS, "r35-tablet-canvas-390.png"))
    check("390 px: the canvas fits, no sideways scroll", tab.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    lp = ctx(390, 844).new_page(); lp.on("pageerror", lambda e: errs.append("phone: " + str(e)))
    lp.goto(APP + "#/lesson/" + LID + "/teach"); lp.wait_for_selector(".tbar", timeout=30000); lp.click("[data-tmore]"); lp.click(".tmenu [data-cvp]"); lp.wait_for_selector("#cvp"); lp.wait_for_timeout(1500)
    lp.screenshot(path=os.path.join(SHOTS, "r35-teach-canvas-390.png"))
    check("390 px: Teach's Canvas fits, no sideways scroll", lp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#cvp').getBoundingClientRect().right <= innerWidth"), lp.evaluate("[document.documentElement.scrollWidth, innerWidth]"))

    check("nothing is sent to GitHub", len(fake.puts) == puts0, list(fake.puts)[puts0:])
    check("no script errors", not errs, errs[:3])
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
