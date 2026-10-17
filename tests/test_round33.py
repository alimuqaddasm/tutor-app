"""Round 33 (17 Oct): the pen on Student view. Ali writes on his screen with the S Pen while he shares it.
 - the S Pen writes; a finger still swipes and taps; a pen tap on a button still presses it
 - the side button (or Rub out) removes whole strokes; Clear ink empties the screen
 - when you move on: Keep ink (back when you return) or Clear ink, chosen in the pen tools
 - "Pen and finger" lets a finger or mouse write too
 - ink is never saved to GitHub
Run: python tests/runtest.py tests/test_round33.py   (uses the 12 Oct maths lesson; writes go to the pretend GitHub)"""
import os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))

# a stroke from (x0, y0) to (x1, y1), sent as pointer events of one kind ("pen", "touch" or "mouse")
STROKE = """([kind, x0, y0, x1, y1, buttons]) => {
  const at = (x, y) => document.elementFromPoint(x, y) || document.body;
  const ev = (type, x, y, b) => at(x, y).dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 7, isPrimary: true,
    clientX: x, clientY: y, buttons: b, button: type === 'pointermove' ? -1 : 0, bubbles: true, cancelable: true, composed: true }));
  ev('pointerdown', x0, y0, buttons);
  for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, buttons);
  ev('pointerup', x1, y1, 0); }"""
# a one-finger swipe, as touch events; touchType "stylus" makes it the S Pen
SWIPE = """([dx, type]) => { const el = document.querySelector('.stu-view'); const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 400, touchType: type });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(900)], changedTouches: [mk(900)], bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(900 + dx)], bubbles: true })); }"""

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
    n = lambda: pg.evaluate("__t('(INK.pages[INK.key]||[]).length')")
    at = lambda: pg.evaluate("__t('STU.i')")
    inked = lambda: pg.evaluate("""() => { const cv = document.querySelector('.stu-ink'); if (!cv) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) k++; return k; }""")
    puts0 = len(fake.puts)

    check("Student view has the pen button and an ink layer", pg.locator("#stupen").count() == 1 and pg.locator(".stu-ink").count() == 1)
    check("  ...the pen tools stay closed until asked", pg.locator(".stu-tools").is_hidden())
    pg.evaluate(STROKE, ["pen", 500, 300, 900, 420, 1]); pg.wait_for_timeout(150)
    check("the S Pen writes a stroke", n() == 1 and inked() > 200, (n(), inked()))
    check("  ...and the pen button shows there is ink", pg.locator("#stupen[data-has]").count() == 1)
    pg.evaluate(STROKE, ["touch", 500, 500, 900, 520, 1]); pg.wait_for_timeout(150)
    check("a finger does not write", n() == 1, n())
    pg.evaluate(STROKE, ["mouse", 500, 560, 900, 580, 1]); pg.wait_for_timeout(150)
    check("a mouse does not write", n() == 1, n())
    # Chrome sends a pen stroke as pointer events first, then touch events too (it cannot tell them from a finger)
    i0 = at(); pg.evaluate("""() => { const el = document.querySelector('.stu-view'), t = (x) => new Touch({ identifier: 2, target: el, clientX: x, clientY: 400 });
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', pointerId: 8, clientX: 900, clientY: 400, buttons: 1, bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(900)], changedTouches: [t(900)], bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 8, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(600)], bubbles: true })); }"""); pg.wait_for_timeout(300)
    pg.evaluate("__t('INK.pages[INK.key].pop()')")   # that test stroke itself
    check("a stroke with the S Pen is not a swipe", at() == i0, (i0, at()))
    pg.evaluate(STROKE, ["pen", 520, 330, 560, 330, 32]); pg.wait_for_timeout(150)
    check("the side button rubs the stroke out", n() == 0 and inked() == 0, (n(), inked()))

    # keep ink (the default) across moving on and coming back
    pg.evaluate(STROKE, ["pen", 500, 300, 900, 420, 1]); pg.wait_for_timeout(150)
    i0 = at(); pg.evaluate(SWIPE, [-300, "direct"]); pg.wait_for_timeout(400)
    check("a finger swipe still moves to the next question", at() != i0, (i0, at()))
    check("  ...the next question has no ink", n() == 0 and inked() == 0, (n(), inked()))
    pg.evaluate(SWIPE, [300, "direct"]); pg.wait_for_timeout(400)
    check("Keep ink: back on the question, the ink is still there", at() == i0 and n() == 1 and inked() > 200, (at(), n(), inked()))
    pg.screenshot(path=os.path.join(SHOTS, "r33-pen-1440.png"))

    # the tools
    pg.click("#stupen"); pg.wait_for_timeout(200)
    check("the pen button opens the tools", pg.locator(".stu-tools").is_visible())
    tools = pg.inner_text(".stu-tools")
    check("  ...colours, Rub out, Clear ink, Keep or Clear when you move on, S Pen or Pen and finger",
          pg.locator(".stu-dot").count() == 3 and all(w in tools for w in ["Rub out", "Clear ink", "When you move on", "Keep ink", "Writes with", "S Pen", "Pen and finger"]), tools)
    pg.screenshot(path=os.path.join(SHOTS, "r33-tools-1440.png"))
    pg.click('[data-ink="c1"]'); pg.evaluate(STROKE, ["pen", 500, 600, 700, 640, 1]); pg.wait_for_timeout(150)
    red = pg.evaluate("__t('INK.pages[INK.key][INK.pages[INK.key].length-1].c')")
    check("red ink after picking red", red == 1, red)
    pg.click('.stu-tools [data-ink="clear"]'); pg.wait_for_timeout(150)
    check("Clear ink empties this screen", n() == 0 and inked() == 0, (n(), inked()))
    pg.click('[data-ink="rub"]'); pg.evaluate(STROKE, ["pen", 500, 300, 900, 420, 1]); pg.wait_for_timeout(150)
    check("with Rub out on, the pen writes nothing", n() == 0, n())
    pg.click('[data-ink="c0"]')

    # clear ink when you move on
    pg.click('[data-ink="drop"]'); pg.wait_for_timeout(100)
    check("the choice is kept on this device", pg.evaluate("localStorage.getItem('tutor.inkkeep')") == "clear")
    pg.evaluate(STROKE, ["pen", 500, 300, 900, 420, 1]); pg.wait_for_timeout(150)
    i0 = at(); pg.click('.stu-edge.next'); pg.wait_for_timeout(400); pg.click('.stu-edge.prev'); pg.wait_for_timeout(400)
    check("Clear ink: back on the question, the ink is gone", at() == i0 and n() == 0 and inked() == 0, (at(), n(), inked()))
    pg.click('[data-ink="keep"]')

    # a pen tap on a button presses it, and does not write
    i0 = at(); box = pg.locator(".stu-edge.next").bounding_box()
    pg.evaluate("""([x, y]) => { const el = document.elementFromPoint(x, y).closest('button'); el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', pointerId: 9, clientX: x, clientY: y, buttons: 1, bubbles: true, cancelable: true })); el.click(); }""",
                [box["x"] + box["width"] / 2, box["y"] + box["height"] / 2]); pg.wait_for_timeout(400)
    check("a pen tap on the arrow moves on and writes nothing", at() != i0 and n() == 0, (i0, at(), n()))

    # pen and finger
    pg.click('[data-ink="finger"]'); pg.wait_for_timeout(100)
    pg.evaluate(STROKE, ["touch", 500, 500, 900, 520, 1]); pg.evaluate(STROKE, ["mouse", 500, 600, 900, 620, 1]); pg.wait_for_timeout(150)
    check("Pen and finger: a finger and a mouse write too", n() == 2, n())
    i0 = at(); pg.evaluate(SWIPE, [-300, "direct"]); pg.wait_for_timeout(400)
    check("  ...and a finger stroke is not taken as a swipe", at() == i0, (i0, at()))
    pg.click('[data-ink="pen"]')
    check("ink is never sent to GitHub", len(fake.puts) == puts0, list(fake.puts)[puts0:])
    pg.click("#stupen"); pg.wait_for_timeout(100)
    check("no script errors", not errs, errs)

    # phone and tablet portrait sizes: the tools fit
    for w, h in [(390, 844), (800, 1280)]:
        c2 = ctx(w, h); p2 = c2.new_page(); p2.on("pageerror", lambda e: errs.append(str(e)))
        p2.goto(APP + "#/lesson/" + LID + "/student"); p2.wait_for_selector(".stu-view", timeout=30000); p2.wait_for_timeout(1200)
        p2.evaluate(STROKE, ["pen", 60, 300, 300, 360, 1]); p2.click("#stupen"); p2.wait_for_timeout(200)
        bb = p2.locator(".stu-tools").bounding_box()
        check("%d px: the tools fit on the screen, no sideways scroll" % w, bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= w and p2.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), bb)
        p2.screenshot(path=os.path.join(SHOTS, "r33-tools-%d.png" % w)); c2.close()
    check("no script errors at the other sizes", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
