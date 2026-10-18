"""Round 34 (17 Oct): the pen on Student view, more like Samsung Notes, and the S Pen button.
 - 8 pen colours and a highlighter with 4 (see-through, drawn under the pen ink); Thin, Medium, Thick
 - Undo and Redo, per screen
 - a stroke held still at its end snaps to a straight line; moving on drags the line's end
 - the S Pen side button rubs out however the tablet reports it: buttons 2 or 32 at the touch, pressed halfway
   through a stroke, as a right-click, or as a mouse right button; the tools card shows what the pen reported
Run: python tests/runtest.py tests/test_round34.py   (uses the 12 Oct maths lesson; writes go to the pretend GitHub)"""
import os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))

# pointer events of one kind along a line; buttons can change partway (mid = the step where they change to buttons2)
STROKE = """([kind, x0, y0, x1, y1, buttons, buttons2, mid, button]) => {
  const at = (x, y) => document.elementFromPoint(x, y) || document.body;
  const ev = (type, x, y, b, btn) => at(x, y).dispatchEvent(new PointerEvent(type, { pointerType: kind, pointerId: 7, isPrimary: true,
    clientX: x, clientY: y, buttons: b, button: btn, bubbles: true, cancelable: true, composed: true }));
  ev('pointerdown', x0, y0, buttons, button || 0);
  for (let i = 1; i <= 8; i++) ev('pointermove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, i >= (mid || 99) ? buttons2 : buttons, -1);
  ev('pointerup', x1, y1, 0, button || 0); }"""

# a real S Pen reports pressure above 0 while it touches; a made-up test event says 0 unless told, so a pen event with its tip or eraser down gets 0.5
PRESS = "(()=>{const P=window.PointerEvent;window.PointerEvent=class extends P{constructor(t,o){o=Object.assign({},o||{});if(o.pointerType==='pen'&&o.pressure===undefined&&(o.buttons&33))o.pressure=.5;super(t,o)}}})()"
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    c = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block", reduced_motion="reduce", has_touch=True)
    c.add_init_script(PRESS)
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.stun','1')")
    c.route("https://api.github.com/**", fake.route)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/" + LID + "/student"); pg.wait_for_selector(".stu-view", timeout=30000); pg.wait_for_timeout(1500)
    page = lambda: pg.evaluate("__t('JSON.stringify(INK.pages[INK.key]||[])')")
    n = lambda: len(__import__("json").loads(page()))
    last = lambda: __import__("json").loads(page())[-1]
    stroke = lambda *a: (pg.evaluate(STROKE, list(a) + [None] * (9 - len(a))), pg.wait_for_timeout(150))
    pg.click("#stupen"); pg.wait_for_timeout(200)

    # colours, highlighter, sizes
    check("the pen has 8 colours", pg.locator(".stu-dot").count() == 8)
    pg.click('[data-ink="c5"]'); pg.click('[data-ink="w2"]'); stroke("pen", 400, 300, 800, 300, 1)
    s = last(); check("a thick blue pen stroke", s["t"] == "pen" and s["c"] == 5 and s["w"] == 2, s)
    pg.click('[data-ink="t-hl"]'); pg.wait_for_timeout(100)
    check("the highlighter has 4 colours", pg.locator(".stu-dot.hl").count() == 4)
    pg.click('[data-ink="c0"]'); stroke("pen", 400, 320, 800, 320, 1)
    s = last(); check("a yellow highlighter stroke", s["t"] == "hl" and s["c"] == 0, s)
    alpha = pg.evaluate("""() => { const cv = document.querySelector('.stu-ink'), g = cv.getContext('2d'), d = devicePixelRatio || 1; return g.getImageData(600 * d, 327 * d, 1, 1).data[3]; }""")
    check("the highlighter is see-through", 0 < alpha < 160, alpha)
    pen_px = pg.evaluate("""() => { const cv = document.querySelector('.stu-ink'), g = cv.getContext('2d'), d = devicePixelRatio || 1; return Array.from(g.getImageData(600 * d, 300 * d, 1, 1).data); }""")
    check("  ...and drawn under the pen ink (the blue line stays solid where they cross)", pen_px[3] == 255 and pen_px[2] > pen_px[0], pen_px)
    pg.click('[data-ink="t-pen"]'); pg.wait_for_timeout(100)
    check("back on the pen, its own colour and size are kept", pg.locator('[data-ink="c5"][aria-pressed="true"]').count() == 1 and pg.locator('[data-ink="w2"][aria-pressed="true"]').count() == 1)

    # undo and redo
    k = n(); pg.click('[data-ink="undo"]'); pg.wait_for_timeout(100)
    check("Undo takes back the last stroke", n() == k - 1, n())
    pg.click('[data-ink="redo"]'); pg.wait_for_timeout(100)
    check("Redo puts it back", n() == k, n())
    pg.click('[data-ink="t-rub"]'); stroke("pen", 600, 290, 600, 330, 1); pg.wait_for_timeout(100)
    check("Rub out (the tool) removes both strokes it crosses", n() == k - 2, n())
    pg.click('[data-ink="undo"]'); pg.wait_for_timeout(100)
    check("Undo brings back what Rub out removed", n() == k, n())
    pg.click('[data-ink="clear"]'); pg.click('[data-ink="undo"]'); pg.wait_for_timeout(100)
    check("Undo brings back a Clear ink", n() == k, n())
    pg.click('[data-ink="t-pen"]'); pg.click('[data-ink="c0"]'); pg.click('[data-ink="w1"]')
    stroke("pen", 300, 700, 300, 700.5, 32)   # a side-button touch that rubs out nothing
    pg.click('[data-ink="undo"]'); pg.wait_for_timeout(100)
    check("a rub that removed nothing adds nothing to Undo", n() == k - 1, n())
    stroke("pen", 300, 700, 300, 700.5, 32); pg.wait_for_timeout(100)
    check("  ...and leaves Redo as it was", pg.locator('[data-ink="redo"]:not([disabled])').count() == 1)
    pg.click('[data-ink="redo"]')

    # straight lines
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 5, clientX: x, clientY: y, buttons: b, bubbles: true, cancelable: true }));
      ev('pointerdown', 300, 500, 1); [[350, 530], [420, 480], [500, 560], [600, 505]].forEach(([x, y]) => ev('pointermove', x, y, 1)); window.__ev = ev; }""")
    pg.wait_for_timeout(900)
    s = last(); check("held still at the end, a wobbly stroke snaps to a straight line", s.get("line") and len(s["p"]) == 2, s)
    pg.evaluate("() => { __ev('pointermove', 700, 600, 1); __ev('pointerup', 700, 600, 0); }"); pg.wait_for_timeout(150)
    s = last(); check("  ...and moving on drags its end", len(s["p"]) == 2 and abs(s["p"][1][0] * 1440 - 700) < 2, s)
    stroke("pen", 300, 620, 600, 640, 1); pg.wait_for_timeout(800)
    check("a stroke that ends moving stays a free stroke", not last().get("line"), last())

    # the S Pen side button, every way a tablet may report it
    pg.click('[data-ink="more"]'); pg.wait_for_timeout(100)   # the pen button check sits under More
    def side(name, *a):
        pg.evaluate("__t('INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.6],[0.6,0.6]]});inkDraw()')"); k = n()
        stroke(*a); check("the side button rubs out: " + name, n() == k - 1, (k, n(), pg.inner_text("#inkdiag")))
    side("held as the tip touches (buttons 3)", "pen", 640, 520, 640, 560, 3)
    side("eraser end (buttons 32)", "pen", 640, 520, 640, 560, 32)
    side("pressed halfway through the stroke", "pen", 640, 480, 640, 560, 1, 3, 4)
    k0 = n(); stroke("pen", 300, 760, 400, 760, 1, 3, 4)
    check("  ...and the part written before the press is not left behind", n() == k0, (k0, n()))
    side("sent as a mouse right button", "mouse", 640, 520, 640, 560, 2, 2, None, 2)
    pg.evaluate("__t('INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.6],[0.6,0.6]]});inkDraw()')"); k = n()
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 6, clientX: x, clientY: y, buttons: 1, bubbles: true, cancelable: true }));
      ev('pointerdown', 640, 440); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 640, clientY: 460 }));
      ev('pointermove', 640, 530); ev('pointermove', 640, 560); ev('pointerup', 640, 560); }"""); pg.wait_for_timeout(150)
    check("the side button rubs out: sent as a right-click", n() == k - 1, (k, n()))
    check("More shows the two settings and the pen button check", all(w in pg.inner_text(".stu-tools") for w in ["When you move on", "Writes with", "Pen button check"]))
    check("the tools card says what the pen reported", "Pen button check: button seen" in pg.inner_text("#inkdiag"), pg.inner_text("#inkdiag"))
    stroke("pen", 300, 820, 400, 820, 1)
    check("  ...and a plain touch reads 'no button'", "no button" in pg.inner_text("#inkdiag"), pg.inner_text("#inkdiag"))
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 13, clientX: x, clientY: y, buttons: 1, bubbles: true, cancelable: true }));
      ev('pointerdown', 300, 700); ev('pointercancel', 300, 700); }"""); pg.wait_for_timeout(100)
    check("a stroke the browser takes over is named in the check line", "took over" in pg.inner_text("#inkdiag"), pg.inner_text("#inkdiag"))
    # Ali's Tab S7 FE (Chrome app): the button held while drawing became Chrome's text selection
    check("nothing on his screen can be selected (so Chrome has no text to select)", pg.evaluate("getComputedStyle(document.querySelector('.stu')).userSelect") == "none")
    pg.evaluate("__t('INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.6],[0.6,0.6]]});inkDraw()')"); k = n()
    blocked = pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 11, clientX: x, clientY: y, buttons: 1, bubbles: true, cancelable: true }));
      ev('pointerdown', 640, 470); const s = new Event('selectstart', { bubbles: true, cancelable: true }); el.dispatchEvent(s);
      ev('pointermove', 640, 530); ev('pointermove', 640, 560); ev('pointerup', 640, 560); return s.defaultPrevented; }"""); pg.wait_for_timeout(150)
    check("a text selection Chrome starts is stopped, and the stroke rubs out instead", blocked and n() == k - 1, (blocked, k, n(), pg.inner_text("#inkdiag")))
    # Ali, 18 Oct: no writing or erasing in the air. Some tablets report the button held above the screen as the tip being down
    # (buttons 1 or 2, pressure 0); only a pen that presses (pressure above 0) writes or erases
    k = n()
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 14, clientX: x, clientY: y, buttons: b, pressure: 0, bubbles: true, cancelable: true }));
      ev('pointerdown', 300, 640, 1); ev('pointermove', 400, 640, 1); ev('pointermove', 500, 650, 2); ev('pointerup', 500, 650, 0); }"""); pg.wait_for_timeout(150)
    check("a hovering pen (pressure 0) never writes, even if the tablet says the tip is down", n() == k and pg.evaluate("__t('INK.cur')") is None, (k, n()))
    pg.evaluate("__t('INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.6],[0.6,0.6]]});INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.7],[0.6,0.7]]});inkDraw()')"); k = n()
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 15, clientX: x, clientY: y, buttons: b, pressure: pr, bubbles: true, cancelable: true }));
      ev('pointerdown', 640, 500, 2, 0); ev('pointermove', 640, 520, 3, .5); ev('pointermove', 640, 560, 3, .5); ev('pointermove', 640, 600, 2, 0); ev('pointermove', 640, 680, 2, 0); ev('pointerup', 640, 680, 0, 0); }"""); pg.wait_for_timeout(150)
    ys = [round(st["p"][0][1], 2) for st in __import__("json").loads(page())]
    check("button held, then pressing down: erases; lifting (pressure 0) stops it, so the line crossed in the air stays", n() == k - 1 and 0.6 not in ys and 0.7 in ys and pg.evaluate("__t('INK.cur')") is None, (k, n(), ys))
    stroke("pen", 300, 760, 400, 760, 1)
    check("  ...and only that touch: the next one writes again", not last().get("rub") and last()["p"][0][1] > 0.8, last())
    # Ali, 18 Oct (after v66): on his tablet the button is only reported while the pen hovers; the touch itself says just "tip".
    # Button pressed above the screen, then touching: erases, as in Samsung Notes; nothing happens in the air
    pg.evaluate("__t('INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.6],[0.6,0.6]]});inkDraw()')"); k = n()
    pg.evaluate("""async () => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 16, clientX: x, clientY: y, buttons: b, pressure: pr, bubbles: true, cancelable: true }));
      ev('pointermove', 640, 480, 0, 0); ev('pointerdown', 640, 490, 2, 0); ev('pointermove', 640, 500, 2, 0); await new Promise(r => setTimeout(r, 150));   // a person presses the button, then touches
      ev('pointermove', 640, 520, 1, .5); ev('pointermove', 640, 560, 1, .5); ev('pointermove', 640, 600, 2, 0); }"""); pg.wait_for_timeout(150)
    check("button pressed while hovering, then touching (the touch reports no button): erases", n() == k - 1 and pg.evaluate("__t('INK.cur')") is None, (k, n(), pg.inner_text("#inkdiag")))
    check("  ...the check line says the button was seen while hovering", "while hovering" in pg.inner_text("#inkdiag"), pg.inner_text("#inkdiag"))
    pg.evaluate("""() => document.querySelector('.stu-view').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 16, clientX: 640, clientY: 600, buttons: 0, bubbles: true }))""")
    stroke("pen", 300, 760, 400, 760, 1)
    check("  ...button let go: the next touch writes again", n() == k and not last().get("rub"), (k, n()))
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 17, clientX: x, clientY: y, buttons: b, pressure: pr, bubbles: true, cancelable: true }));
      ev('pointermove', 300, 700, 2, 0); ev('pointermove', 300, 710, 0, 0); }""")
    stroke("pen", 300, 790, 400, 790, 1)
    check("  ...and a button pressed then let go in the air (no pointerup) does not turn the next touch into erasing", n() == k + 1 and not last().get("rub"), (k, n()))
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'); el.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 18, clientX: 300, clientY: 700, buttons: 2, pressure: 0, bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerout', { pointerType: 'pen', pointerId: 18, clientX: 300, clientY: 700, buttons: 2, relatedTarget: null, bubbles: true })); }""")
    stroke("pen", 300, 820, 400, 820, 1)
    check("  ...nor does the pen taken out of range with the button held", n() == k + 2 and not last().get("rub"), (k, n()))
    # Ali, 18 Oct (v67 check line: "no button · pen · buttons 1 · button -1"): his Tab S7 FE never reports the button itself. Held while
    # hovering, it comes as the tip being down (buttons 1) with no pressure; the touch that follows says only "tip"
    put = lambda: pg.evaluate("__t('INK.pages[INK.key].push({t:\"pen\",c:0,w:1,p:[[0.3,0.6],[0.6,0.6]]});inkDraw()')")
    put(); k = n()
    pg.evaluate("""async () => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 19, clientX: x, clientY: y, buttons: b, pressure: pr, bubbles: true, cancelable: true }));
      ev('pointermove', 640, 470, 0, 0); ev('pointerdown', 640, 480, 1, 0); ev('pointermove', 640, 490, 1, 0); await new Promise(r => setTimeout(r, 150));
      ev('pointermove', 640, 520, 1, .4); ev('pointermove', 640, 560, 1, .4); ev('pointermove', 640, 600, 1, 0); }"""); pg.wait_for_timeout(150)
    check("S7 FE: button held above the screen (tip down, no pressure), then touching: erases", n() == k - 1 and pg.evaluate("__t('INK.cur')") is None, (k, n(), pg.inner_text("#inkdiag")))
    check("  ...the check line says so, with the pressure", "while hovering" in pg.inner_text("#inkdiag") and "pressure" in pg.inner_text("#inkdiag"), pg.inner_text("#inkdiag"))
    put(); k = n()
    pg.evaluate("""async () => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 19, clientX: x, clientY: y, buttons: b, pressure: pr, bubbles: true, cancelable: true }));
      ev('pointermove', 640, 610, 1, .4); ev('pointermove', 640, 520, 1, .4); ev('pointermove', 640, 480, 1, .4); ev('pointermove', 640, 470, 1, 0); }"""); pg.wait_for_timeout(150)
    check("  ...lifted and touched again with the button still held: erases again", n() < k, (k, n()))
    pg.evaluate("""() => document.querySelector('.stu-view').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 19, clientX: 640, clientY: 470, buttons: 0, bubbles: true }))""")
    put(); k = n()
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 20, clientX: x, clientY: y, buttons: b, pressure: pr, bubbles: true, cancelable: true }));
      ev('pointermove', 640, 470, 0, 0); ev('pointerdown', 640, 480, 1, 0); ev('pointermove', 640, 520, 1, .4); ev('pointermove', 640, 560, 1, .4); ev('pointermove', 640, 600, 1, .4); ev('pointerup', 640, 600, 0, 0); }"""); pg.wait_for_timeout(150)
    check("  ...but a pen just landing (no pressure for a moment, then pressing) writes", n() == k + 1 and not last().get("rub"), (k, n(), pg.inner_text("#inkdiag")))
    pg.screenshot(path=os.path.join(SHOTS, "r34-tools-1440.png"))
    pg.click('[data-ink="t-hl"]'); pg.wait_for_timeout(100); pg.screenshot(path=os.path.join(SHOTS, "r34-highlighter-1440.png"))

    # a right-click with no pen down still opens nothing odd, and the menu stays possible elsewhere
    check("no script errors", not errs, errs)
    for w, h in [(390, 844), (800, 1280)]:
        c2 = b.new_context(viewport={"width": w, "height": h}, service_workers="block", has_touch=True)
        c2.add_init_script(PRESS)
        c2.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.test','1')"); c2.route("https://api.github.com/**", fake.route)
        p2 = c2.new_page(); p2.on("pageerror", lambda e: errs.append(str(e)))
        p2.goto(APP + "#/lesson/" + LID + "/student"); p2.wait_for_selector(".stu-view", timeout=30000); p2.wait_for_timeout(1200)
        p2.click("#stupen"); p2.wait_for_timeout(200)
        bb = p2.locator(".stu-tools").bounding_box()
        fits = bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= w and bb["y"] + bb["height"] <= h and p2.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        check("%d px: the tools card fits on the screen (it scrolls inside if it must)" % w, fits, bb)
        p2.screenshot(path=os.path.join(SHOTS, "r34-tools-%d.png" % w)); c2.close()
    check("ink is never sent to GitHub", not fake.puts, list(fake.puts))
    check("no script errors at the other sizes", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
