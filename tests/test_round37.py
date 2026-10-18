"""Round 37 (18 Oct, app v66): the eraser and the pen, closer to Samsung Notes (Ali: "erasing is very robotic and laggy";
"I use stroke eraser mostly"; no writing in the air).
 - Eraser: Whole line (the default: one touch takes a whole line) or Area (only what is under it goes; a line it cuts becomes two,
   keeping its colour, size and the piece it belongs to). Thin, Medium, Thick. The choice is kept on the device.
 - The S Pen side button erases the same way. A circle shows where the eraser is while it is down.
 - Writing draws only the new piece of the line on each move, not every line again.
Run: python tests/runtest.py tests/test_round37.py   (uses the 12 Oct maths lesson; writes go to the pretend GitHub)"""
import json, os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))

# a stroke of pointer events; a pen that touches presses (pressure 0.5)
STROKE = """([kind, x0, y0, x1, y1, buttons, steps]) => {
  const at = (x, y) => document.elementFromPoint(x, y) || document.body, n = steps || 8;
  const ev = (type, x, y, b) => at(x, y).dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 7, isPrimary: true, clientX: x, clientY: y,
    buttons: b, button: type === 'pointermove' ? -1 : 0, pressure: b ? .5 : 0, bubbles: true, cancelable: true, composed: true }));
  ev('pointerdown', x0, y0, buttons);
  for (let i = 1; i <= n; i++) ev('pointermove', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, buttons);
  ev('pointerup', x1, y1, 0); }"""
ALPHA = """([x, y]) => { const cv = document.querySelector('.stu-ink'), d = devicePixelRatio || 1; return cv.getContext('2d').getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data[3]; }"""

errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    def ctx(w, h):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce", has_touch=True)
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.stun','1')")
        c.route("https://api.github.com/**", fake.route); return c
    c = ctx(1440, 900)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/" + LID + "/student"); pg.wait_for_selector(".stu-view", timeout=30000); pg.wait_for_timeout(1500)
    page = lambda: json.loads(pg.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')"))
    n = lambda: len(page())
    alpha = lambda x, y: pg.evaluate(ALPHA, [x, y])
    stroke = lambda *a: (pg.evaluate(STROKE, list(a) + [None] * (7 - len(a))), pg.wait_for_timeout(150))
    put = lambda s: pg.evaluate("(s) => __t('INK.pages[INK.key].push(' + s + ');inkDraw()')", s)
    pg.click("#stupen"); pg.wait_for_timeout(150)

    # writing draws only the new piece of the line
    pg.evaluate("() => { window.__paints = 0; const cr = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function () { if (this.canvas.classList.contains('stu-ink')) window.__paints++; return cr.apply(this, arguments); }; }")
    pg.evaluate("""async () => { const el = document.querySelector('.stu-view'), f = () => new Promise(requestAnimationFrame);   // one move per screen frame, as a real pen sends them
      const ev = (t, x, y, b) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 7, clientX: x, clientY: y, buttons: b, pressure: b ? .5 : 0, bubbles: true, cancelable: true }));
      ev('pointerdown', 300, 600, 1); await f(); for (let i = 1; i <= 30; i++) { ev('pointermove', 300 + 20 * i, 600 + 40 * i / 30, 1); await f(); } ev('pointerup', 900, 640, 0); await f(); await f(); }"""); pg.wait_for_timeout(100)
    paints = pg.evaluate("window.__paints")
    check("a 30-move pen stroke repaints the whole ink layer at most 3 times (start, end), not on every move", paints <= 3, paints)
    check("  ...and the line is all there, in the middle too", alpha(600, 620) > 0 and n() == 1, (alpha(600, 620), n()))

    # the eraser tool: Whole line by default, Area, sizes
    pg.click('[data-ink="t-rub"]'); pg.wait_for_timeout(100)
    tools = pg.inner_text(".stu-tools")
    check("Eraser shows Whole line and Area, and Thin, Medium, Thick", all(w in tools for w in ["Eraser", "Whole line", "Area", "Thin", "Medium", "Thick"]), tools)
    check("  ...Whole line is the default (as Ali uses in Samsung Notes)", pg.locator('[data-ink="e-line"][aria-pressed="true"]').count() == 1)
    pg.screenshot(path=os.path.join(SHOTS, "r37-eraser-1440.png"))
    stroke("pen", 600, 580, 600, 660, 1)
    check("Whole line: one touch takes the whole line", n() == 0 and alpha(320, 601) == 0, (n(), alpha(320, 601)))

    # area
    pg.click('[data-ink="e-area"]'); pg.wait_for_timeout(100)
    check("the eraser choice is kept on the device", pg.evaluate("localStorage.getItem('tutor.inkem')") == "area")
    put('{t:"pen",c:5,w:2,o:"q7",p:[[0.2,0.7],[0.3,0.7],[0.4,0.7],[0.5,0.7],[0.6,0.7],[0.7,0.7]]}'); pg.wait_for_timeout(100)
    stroke("pen", 720, 590, 720, 670, 1)
    ink = page()
    check("Area: a line it crosses becomes two", len(ink) == 2, len(ink))
    check("  ...the middle is gone and both ends stay", alpha(720, 630) == 0 and alpha(320, 630) > 0 and alpha(950, 630) > 0, (alpha(720, 630), alpha(320, 630), alpha(950, 630)))
    check("  ...both pieces keep colour, size and the piece they belong to", all(s.get("c") == 5 and s.get("w") == 2 and s.get("o") == "q7" for s in ink), ink)
    pg.click('[data-ink="undo"]'); pg.wait_for_timeout(100)
    check("Undo brings the whole line back", n() == 1 and alpha(720, 630) > 0, (n(), alpha(720, 630)))
    pg.click('[data-ink="redo"]'); pg.wait_for_timeout(100)
    check("Redo cuts it again", n() == 2 and alpha(720, 630) == 0, (n(), alpha(720, 630)))
    undo_n = pg.evaluate("__t('INK.undo[INK.key].length')")
    stroke("pen", 300, 820, 400, 820, 1)
    check("erasing empty space adds nothing to Undo", pg.evaluate("__t('INK.undo[INK.key].length')") == undo_n)

    # a straight line (two points) is cut too
    pg.evaluate("__t('INK.pages[INK.key]=[];inkDraw()')"); put('{t:"pen",c:0,w:1,p:[[0.2,0.5],[0.8,0.5]]}'); pg.wait_for_timeout(100)
    stroke("pen", 720, 420, 720, 480, 1)
    check("Area cuts a straight line (only two points) too", n() == 2 and alpha(720, 450) == 0 and alpha(400, 450) > 0, (n(), alpha(720, 450), alpha(400, 450)))

    # sizes
    def gap(size):
        pg.evaluate("__t('INK.pages[INK.key]=[];inkDraw()')"); put('{t:"pen",c:0,w:0,p:[[0.2,0.5],[0.8,0.5]]}'); pg.wait_for_timeout(80)
        pg.click('[data-ink="%s"]' % size); stroke("pen", 720, 430, 720, 470, 1)
        xs = [x for x in range(640, 801) if alpha(x, 450) == 0]; return len(xs)
    thin, thick = gap("w0"), gap("w2")
    check("a Thick eraser wipes a wider gap than a Thin one", thick > thin > 0, (thin, thick))
    pg.click('[data-ink="w1"]')

    # the circle while erasing
    pg.evaluate("__t('INK.pages[INK.key]=[];inkDraw()')")
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'); el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', pointerId: 9, clientX: 700, clientY: 500, buttons: 1, pressure: .5, bubbles: true, cancelable: true })); }""")
    pg.wait_for_timeout(120)
    ring = max(alpha(700 + dx, 500) for dx in (13, 14, 15))
    check("a circle shows where the eraser is while it is down", ring > 0, ring)
    pg.evaluate("""() => document.querySelector('.stu-view').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 9, clientX: 700, clientY: 500, buttons: 0, bubbles: true }))"""); pg.wait_for_timeout(120)
    check("  ...and goes when it lifts", max(alpha(700 + dx, 500) for dx in (13, 14, 15)) == 0)

    # the side button erases the chosen way
    pg.click('[data-ink="t-pen"]'); put('{t:"pen",c:0,w:1,p:[[0.2,0.6],[0.4,0.6],[0.6,0.6],[0.8,0.6]]}'); pg.wait_for_timeout(80)
    stroke("pen", 720, 500, 720, 580, 3)
    check("the S Pen button with Area chosen cuts the line, it doesn't take it all", n() == 2 and alpha(720, 540) == 0 and alpha(400, 540) > 0, (n(), alpha(720, 540)))
    pg.evaluate("localStorage.setItem('tutor.inkem','line')"); pg.reload(); pg.wait_for_selector(".stu-view"); pg.wait_for_timeout(1200)
    check("after a reload the eraser is still the one chosen last (Whole line)", pg.evaluate("__t('INK.em')") == "line")
    pg.click("#stupen"); pg.click('[data-ink="t-rub"]'); pg.click('[data-ink="w2"]'); pg.reload(); pg.wait_for_selector(".stu-view"); pg.wait_for_timeout(1200)
    check("  ...and so is its size (Thick)", pg.evaluate("__t('INK.rs')") == 2)
    check("ink is never sent to GitHub", not fake.puts, list(fake.puts))
    check("no script errors", not errs, errs)

    c2 = ctx(390, 844); p2 = c2.new_page(); p2.on("pageerror", lambda e: errs.append(str(e)))
    p2.goto(APP + "#/lesson/" + LID + "/student"); p2.wait_for_selector(".stu-view", timeout=30000); p2.wait_for_timeout(1200)
    p2.click("#stupen"); p2.click('[data-ink="t-rub"]'); p2.wait_for_timeout(150)
    bb = p2.locator(".stu-tools").bounding_box()
    check("390 px: the eraser tools fit, no sideways scroll", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= 390 and p2.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), bb)
    p2.screenshot(path=os.path.join(SHOTS, "r37-eraser-390.png")); c2.close()
    check("no script errors on the phone", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
