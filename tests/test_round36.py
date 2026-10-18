"""Round 36 (18 Oct, app v64): the teaching canvas, phase 2. Pieces prepared with the script, and solution lines.
 - a script can hold pieces ({"type": "piece"}: heading, equation, structure, text) and a question can hold "solution" lines
 - Teach: Canvas lists the pieces by part; Add puts them on his page (equations and structures centred, headings in Title Case)
 - pieces leave no writing space under them; a question does
 - a question's solution lines: listed under its answer, Drop puts each under that question, in order
 - lines move with their question (drag, Move to top) and go with it; a line that reaches the next question pushes it down
 - Type a piece: heading, equation (LaTeX) or text typed in Teach; what is being typed survives a redraw
 - pieces never become Teach screens and never show in the questions view
 - nothing goes to GitHub
Needs the local exam server on :8787 (password local-test) and the app on :8765 (see tests/README.md).
Run: python tests/runtest.py tests/test_round36.py"""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright
from fakegh import FakeGH, REPO

APP = os.environ.get("APP", "http://localhost:8765/")
API = os.environ.get("EXAM_API", "http://localhost:8787")
PW = os.environ.get("EXAM_PW", "local-test")
LID = "2026-10-12-maths"
SPATH = "students/UK-1/lessons/%s/script.json" % LID
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
def post(actions):
    r = urllib.request.Request(API + "/api/t/canvas/" + LID, data=json.dumps({"actions": actions}).encode(), method="POST",
                               headers={"X-Exam-Password": PW, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r))

# the 12 Oct maths lesson with pieces in its "Addition Formulae" part and solution lines on Set 6 Q16
script = json.load(open(os.path.join(REPO, SPATH), encoding="utf-8"))
part = [p for p in script["phases"] if p["id"] == "s71"][0]
part["blocks"] = [
    {"type": "piece", "id": "pc-h1", "kind": "heading", "text": "addition formulae"},
    {"type": "piece", "id": "pc-e1", "kind": "equation", "tex": "\\sin(A+B)=\\sin A\\cos B+\\cos A\\sin B"},
    {"type": "piece", "id": "pc-s1", "kind": "structure", "img": "assets/h3.png", "alt": "Triangle for the proof", "w": 420},
    {"type": "piece", "id": "pc-t1", "kind": "text", "html": "Use the identity, then collect terms."},
] + part["blocks"]
Q1, Q2 = "s6q16", "s6q17"
def find(bs, i):
    for b in bs:
        if b.get("id") == i: return b
        r = find(b.get("blocks", []), i)
        if r: return r
q16 = find([b for p in script["phases"] for b in p["blocks"]], Q1)
q16["solution"] = [{"tex": "2\\sec^2 x + 4\\tan^2 x = 5\\sec x"}, {"tex": "2\\sec^2 x + 4(\\sec^2 x - 1) = 5\\sec x"}, {"tex": "6\\sec^2 x - 5\\sec x - 4 = 0"}]

STROKE = """([kind, x0, y0, x1, y1, buttons]) => {
  const at = (x, y) => document.elementFromPoint(x, y) || document.body;
  const ev = (type, x, y, b) => at(x, y).dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 7, isPrimary: true,
    clientX: x, clientY: y, buttons: b, button: type === 'pointermove' ? -1 : 0, bubbles: true, cancelable: true, composed: true }));
  ev('pointerdown', x0, y0, buttons); for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, buttons); ev('pointerup', x1, y1, 0); }"""
DRAG = """([sel, kind, dx, dy]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 9, isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
  ev('pointerdown', x, y); for (let i = 1; i <= 6; i++) ev('pointermove', x + dx * i / 6, y + dy * i / 6); ev('pointerup', x + dx, y + dy); }"""

post([{"t": "reset"}])
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH(); fake.extra[SPATH] = json.dumps(script).encode()
    def ctx(w, h, touch=False):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce", has_touch=touch)
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.layout','flip');localStorage.removeItem('tutor.stumode');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
        c.route("https://api.github.com/**", fake.route); return c
    lap = ctx(1440, 900).new_page(); lap.on("pageerror", lambda e: errs.append("laptop: " + str(e)))
    tab = ctx(1280, 800, touch=True).new_page(); tab.on("pageerror", lambda e: errs.append("tablet: " + str(e)))
    puts0 = len(fake.puts)
    tab.goto(APP + "#/lesson/" + LID + "/student"); tab.wait_for_selector(".cv-page", timeout=30000); tab.wait_for_timeout(1200)
    lap.goto(APP + "#/lesson/" + LID + "/teach"); lap.wait_for_selector(".tbar", timeout=30000); lap.wait_for_timeout(800)
    st = lambda pg: json.loads(pg.evaluate("__t('JSON.stringify(cvState())')"))
    items = lambda pg: (lambda s: s["pages"][s["cur"]]["items"])(st(pg))
    by = lambda pg, f: [x for x in items(pg) if f(x)]
    H = lambda u: tab.evaluate("(u) => document.querySelector('.cv-item[data-u=\"' + u + '\"]').offsetHeight / (document.querySelector('.cv-page').clientWidth / 1000)", u)
    settle = lambda n: tab.wait_for_function("document.querySelectorAll('.cv-item').length === %d && !document.querySelector('.cv-item.unplaced')" % n, timeout=12000)

    check("pieces are not Teach screens", not lap.evaluate("__t('teachSeq().some(function (c) { return c.b && c.b.type === \"piece\"; })')"))
    check("  ...and not in the questions view", not tab.evaluate("__t('studentItems().some(function (q) { return /^pc-/.test(q.id); })')"))
    lap.click(".tmini > [data-cvp]"); lap.wait_for_selector("#cvp"); lap.wait_for_timeout(600)
    txt = lap.locator("#cvp").inner_text()
    check("Teach: Canvas lists the script's pieces under Add pieces, by part", "Add pieces" in txt and lap.locator('#cvp [data-cvadd^="pc-"]').count() == 4, txt[:300])
    check("  ...with their kind as a tag", all(k in txt for k in ("Heading", "Equation", "Structure", "Text")))
    check("  ...the equation shown typeset", lap.locator('#cvp [data-cvadd="pc-e1"]').locator("xpath=../..").locator(".katex").count() == 1)

    for r in ("pc-h1", "pc-e1"): lap.click('#cvp [data-cvadd="%s"]' % r); lap.wait_for_timeout(300)
    settle(2); tab.wait_for_timeout(800)
    h1 = by(tab, lambda x: x["ref"] == "pc-h1")[0]; e1 = by(tab, lambda x: x["ref"] == "pc-e1")[0]
    check("a heading lands top left, in Title Case", h1["x"] == 40 and tab.locator(".cv-pc.h").inner_text().strip() == "Addition Formulae", (h1, tab.locator(".cv-pc.h").inner_text()))
    check("an equation is typeset and centred", tab.locator(".k-piece .katex").count() >= 1 and e1["x"] == 200 and e1["w"] == 600, e1)
    check("  ...right under the heading: no writing space after a piece", 0 < e1["y"] - (h1["y"] + H(h1["u"])) <= 40, (h1["y"], H(h1["u"]), e1["y"]))

    lap.click('#cvp [data-cvadd="%s"]' % Q1); settle(3); tab.wait_for_timeout(800)
    q1 = by(tab, lambda x: x["ref"] == Q1)[0]
    lap.wait_for_timeout(1600)
    lap.click('#cvp [data-cvans="%s"]' % q1["u"]); lap.wait_for_timeout(500)
    check("Teach: the question's answer lists its 3 solution lines to drop", lap.locator("#cvp .cvans [data-cvline]").count() == 3)
    lap.click('#cvp [data-cvline="%s#1"]' % Q1); lap.wait_for_timeout(400); lap.click('#cvp [data-cvline="%s#2"]' % Q1)
    settle(5); tab.wait_for_timeout(1000)
    l1 = by(tab, lambda x: x["ref"] == Q1 + "#1")[0]; l2 = by(tab, lambda x: x["ref"] == Q1 + "#2")[0]; q1 = by(tab, lambda x: x["ref"] == Q1)[0]
    qb = q1["y"] + H(q1["u"])
    check("Drop puts a line just under its question, indented", qb < l1["y"] < qb + 60 and l1["x"] == q1["x"] + 40 and l1["of"] == q1["u"], (qb, l1))
    check("  ...the next line under the first", l2["y"] > l1["y"] + H(l1["u"]) - 1, (l1["y"], l2["y"]))
    check("  ...typeset", tab.locator(".k-line .katex").count() == 2)
    tab.evaluate("document.querySelector('.cv-view').scrollTop = 0"); tab.wait_for_timeout(300); tab.screenshot(path=os.path.join(SHOTS, "r36-tablet-lines-1280.png"))
    lap.wait_for_timeout(1600)
    check("Teach marks the dropped lines as on his canvas", lap.locator("#cvp .cvans [data-cvline]").count() == 1 and "On his canvas" in lap.locator("#cvp .cvans").inner_text())

    # a second question; drag it right up under the lines, then drop line 3: it pushes the question down
    lap.click('#cvp [data-cvadd="%s"]' % Q2); settle(6); tab.wait_for_timeout(800)
    q2 = by(tab, lambda x: x["ref"] == Q2)[0]
    check("a question after the lines keeps the writing space of the one above", q2["y"] >= q1["y"] + H(q1["u"]) + 300, (q1["y"], q2["y"]))
    tab.evaluate("(y) => document.querySelector('.cv-view').scrollTop = y", 0); tab.wait_for_timeout(200)
    sel2 = '.cv-item[data-u="%s"]' % q2["u"]
    tab.locator(sel2).tap(); tab.wait_for_timeout(300)
    s = tab.evaluate("document.querySelector('.cv-page').clientWidth / 1000")
    gap_units = q2["y"] - (l2["y"] + H(l2["u"])) - 30
    tab.evaluate(DRAG, [sel2 + " [data-cvgrip]", "mouse", 0, -gap_units * s]); tab.wait_for_timeout(1500)
    q2a = by(tab, lambda x: x["u"] == q2["u"])[0]
    lap.wait_for_timeout(1600); lap.click('#cvp [data-cvline="%s#3"]' % Q1); settle(7); tab.wait_for_timeout(1500)
    l3 = by(tab, lambda x: x["ref"] == Q1 + "#3")[0]; q2b = by(tab, lambda x: x["u"] == q2["u"])[0]
    check("a line that reaches the next question pushes it down", q2b["y"] >= l3["y"] + H(l3["u"]) + 20 and q2b["y"] > q2a["y"], (q2a["y"], l3["y"], q2b["y"]))

    # lines go where their question goes
    tab.locator('.cv-item[data-u="%s"]' % q1["u"]).tap(); tab.wait_for_timeout(300)
    before = {x["u"]: x for x in items(tab)}
    tab.evaluate(DRAG, ['.cv-item[data-u="%s"] [data-cvgrip]' % q1["u"], "mouse", 60 * s, 30 * s]); tab.wait_for_timeout(1500)
    after = {x["u"]: x for x in items(tab)}
    dq = (after[q1["u"]]["x"] - before[q1["u"]]["x"], after[q1["u"]]["y"] - before[q1["u"]]["y"])
    dl = [(after[x]["x"] - before[x]["x"], after[x]["y"] - before[x]["y"]) for x in after if after[x].get("of") == q1["u"]]
    check("dragging a question takes its lines with it", dq[0] > 30 and len(dl) == 3 and all(abs(d[0] - dq[0]) <= 1 and abs(d[1] - dq[1]) <= 1 for d in dl), (dq, dl))
    lap.wait_for_timeout(1600)
    lap.click('#cvp [data-cvtop="%s"]' % q2["u"]); tab.wait_for_timeout(2500)
    it = items(tab); tops = [x for x in it if not x.get("of")]
    q1c = [x for x in it if x["u"] == q1["u"]][0]; lines = [x for x in it if x.get("of") == q1["u"]]
    check("Move to top: the lines stay with their question", tops[0]["u"] == q2["u"] and all(q1c["y"] < x["y"] < q1c["y"] + H(q1["u"]) + 300 for x in lines), ([x["ref"] for x in tops], q1c["y"], [x["y"] for x in lines]))
    lap.wait_for_timeout(1600)
    lap.click('#cvp [data-cvrm="%s"]' % q1["u"]); tab.wait_for_timeout(2000)
    check("removing a question takes its lines too", not by(tab, lambda x: x["ref"].startswith(Q1)) and tab.locator(".k-line").count() == 0)

    # type a piece in Teach
    lap.wait_for_timeout(1200)
    lap.click('#cvp [data-cvtk="equation"]'); lap.fill("#cvtype", "\\cos 2A = 1 - 2\\sin^2 A"); lap.press("#cvtype", "Enter"); tab.wait_for_timeout(2500)
    typed = by(tab, lambda x: x.get("pc"))
    check("Type a piece: an equation typed in Teach lands typeset", len(typed) == 1 and typed[0]["pc"]["tex"].startswith("\\cos") and tab.locator('.cv-item[data-u="%s"] .katex' % typed[0]["u"]).count() == 1, typed)
    lap.click('#cvp [data-cvtk="heading"]'); lap.fill("#cvtype", "double angle formulae"); lap.press("#cvtype", "Enter"); tab.wait_for_timeout(2500)
    check("  ...a typed heading in Title Case", "Double Angle Formulae" in tab.locator(".k-piece .cv-pc.h").all_inner_texts())
    lap.fill("#cvtype", "half typed"); lap.evaluate("__t('cvPanel()')")
    check("  ...what is being typed survives a redraw of the panel", lap.input_value("#cvtype") == "half typed")
    lap.fill("#cvtype", "")
    lap.click('#cvp [data-cvadd="pc-s1"]'); tab.wait_for_timeout(3000)
    s1 = by(tab, lambda x: x["ref"] == "pc-s1")
    check("a structure is its picture, at the width the script gives, centred", s1 and s1[0]["w"] == 420 and s1[0]["x"] == 290 and tab.evaluate("(u) => document.querySelector('.cv-item[data-u=\"' + u + '\"] img').naturalWidth > 0", s1[0]["u"]), s1)

    tab.evaluate("document.querySelector('.cv-view').scrollTop = 0"); tab.wait_for_timeout(300)
    tab.screenshot(path=os.path.join(SHOTS, "r36-tablet-pieces-1280.png"))
    lap.wait_for_timeout(1500); lap.screenshot(path=os.path.join(SHOTS, "r36-teach-pieces-1440.png"))
    tab.set_viewport_size({"width": 390, "height": 844}); tab.wait_for_timeout(800); tab.screenshot(path=os.path.join(SHOTS, "r36-tablet-pieces-390.png"))
    check("390 px: the page fits, no sideways scroll", tab.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    lp = ctx(390, 844).new_page(); lp.on("pageerror", lambda e: errs.append("phone: " + str(e)))
    lp.goto(APP + "#/lesson/" + LID + "/teach"); lp.wait_for_selector(".tbar", timeout=30000); lp.click("[data-tmore]"); lp.click(".tmenu [data-cvp]"); lp.wait_for_selector("#cvp"); lp.wait_for_timeout(1500)
    lp.screenshot(path=os.path.join(SHOTS, "r36-teach-pieces-390.png"))
    check("390 px: Teach's Canvas fits", lp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), lp.evaluate("[document.documentElement.scrollWidth, innerWidth]"))

    check("nothing is sent to GitHub", len(fake.puts) == puts0, list(fake.puts)[puts0:])
    check("no script errors", not errs, errs[:3])
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
