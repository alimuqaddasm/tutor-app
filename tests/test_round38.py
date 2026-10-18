"""Round 38 (18 Oct, app v69): Record pen. The S Pen button on Ali's Tab S7 FE never showed up in the pen button check, whatever
we listened for, so More now has Record pen: for 8 seconds every pen, touch, mouse and key event is written down, and Copy puts
it on the clipboard for Ali to paste to us. Drawing still works while it records.
Run: python tests/runtest.py tests/test_round38.py   (uses the 12 Oct maths lesson; writes go to the pretend GitHub)"""
import json, os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))

errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    def ctx(w, h):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce", has_touch=True, permissions=["clipboard-read", "clipboard-write"])
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.stun','1')")
        c.route("https://api.github.com/**", fake.route); return c
    c = ctx(1440, 900)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/" + LID + "/student"); pg.wait_for_selector(".stu-view", timeout=30000); pg.wait_for_timeout(1500)
    pg.click("#stupen"); pg.click('[data-ink="more"]'); pg.wait_for_timeout(150)
    check("More has Record pen", pg.locator('[data-ink="rec"]').inner_text() == "Record pen")
    pg.evaluate("__t('RECMS=1500')")
    pg.click('[data-ink="rec"]'); pg.wait_for_timeout(100)
    check("  ...it says it is recording", "Recording" in pg.locator('[data-ink="rec"]').inner_text(), pg.locator('[data-ink="rec"]').inner_text())
    n0 = pg.evaluate("__t('(INK.pages[INK.key]||[]).length')")
    pg.evaluate("""() => { const el = document.querySelector('.stu-view'), ev = (t, x, y, b, pr) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'pen', pointerId: 7, clientX: x, clientY: y, buttons: b, pressure: pr, tiltX: 10, tiltY: -5, bubbles: true, cancelable: true }));
      ev('pointermove', 300, 600, 0, 0); ev('pointermove', 310, 600, 0, 0); ev('pointerdown', 320, 600, 1, .3);
      for (let i = 1; i <= 10; i++) el.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 7, clientX: 320 + 20 * i, clientY: 600, buttons: 1, pressure: .2 + i / 50, tiltX: 10 + i, tiltY: -5, bubbles: true, cancelable: true }));
      ev('pointerup', 520, 600, 0, 0); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'F13', code: 'F13', bubbles: true }));
      const pw = document.createElement('input'); pw.type = 'password'; document.body.appendChild(pw); pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true })); pw.remove(); }""")
    check("  ...and the pen still writes while it records", pg.evaluate("__t('(INK.pages[INK.key]||[]).length')") == n0 + 1)
    pg.wait_for_timeout(2300)
    out = pg.evaluate("__t('REC.out')")
    check("after the time is up the record shows, with the app version and the browser", out.startswith("Tutor Desk v") and "Mozilla" in out, out[:120])
    check("  ...each kind of event with its buttons and pressure", "pointerdown pen buttons 1 button 0 p+" in out and "pressure 0.3" in out and "keydown F13 F13" in out, out)
    check("  ...repeated moves are folded into one line with a count and the pressure range", "pointermove pen buttons 1 button 0 p+" in out and " x10" in out and "pressure 0.22-0.4" in out, out)
    check("  ...hovering shows as pressure 0, with the tilt", "pointermove pen buttons 0 button 0 p0" in out and "tilt 10,-5" in out, out)
    check("  ...folded moves keep the tilt range", "tilt 11-20,-5" in out, out)
    check("  ...typing in a box (a password) is never written down", "KeyQ" not in out, out)
    check("  ...the record box and Copy are shown", pg.locator(".stu-reclog").count() == 1 and pg.locator('[data-ink="copy"]').count() == 1)
    check("  ...events stop being recorded when it ends", (pg.evaluate("() => { document.querySelector('.stu-view').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'pen', bubbles: true })); return __t('REC.rows.length'); }") == pg.evaluate("__t('REC.rows.length')")) and not pg.evaluate("__t('REC.on')"))
    pg.click('[data-ink="copy"]'); pg.wait_for_timeout(200)
    check("Copy puts the record on the clipboard", pg.evaluate("navigator.clipboard.readText()") == out)
    check("  ...and says so", pg.locator('[data-ink="copy"]').inner_text() == "Copied", pg.locator('[data-ink="copy"]').inner_text())
    check("no word 'Claude' on his screen", "Claude" not in pg.inner_text(".stu-tools"))
    pg.screenshot(path=os.path.join(SHOTS, "r38-record-1440.png"))
    check("nothing is sent to GitHub", not fake.puts, list(fake.puts))
    check("no script errors", not errs, errs)

    c2 = ctx(390, 844); p2 = c2.new_page(); p2.on("pageerror", lambda e: errs.append(str(e)))
    p2.goto(APP + "#/lesson/" + LID + "/student"); p2.wait_for_selector(".stu-view", timeout=30000); p2.wait_for_timeout(1200)
    p2.click("#stupen"); p2.click('[data-ink="more"]'); p2.evaluate("__t('RECMS=300')"); p2.click('[data-ink="rec"]'); p2.wait_for_timeout(1500)
    bb = p2.locator(".stu-tools").bounding_box()
    check("390 px: the record fits, no sideways scroll", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= 390 and p2.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), bb)
    p2.screenshot(path=os.path.join(SHOTS, "r38-record-390.png")); c2.close()
    check("no script errors on the phone", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
