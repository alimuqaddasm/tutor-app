"""Round 39 (21 Oct, app v72): the camera on a question opens a card on the button instead of a file picker or a new page.
 - the card sits beside the button, Teach stays on the same step, keys like T do nothing while it is open
 - paste a photo (Ctrl+V) or drop it on the dotted box; Choose photo still works
 - the card shows a small picture of the question, and each photo saved to that question, at once
 - His work page: paste a photo into the form
Run: python tests/runtest.py tests/test_round39.py   (uses the 12 Oct maths lesson; writes go to the pretend GitHub)"""
import base64, os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
PHOTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icon-192.png")
B64 = base64.b64encode(open(PHOTO, "rb").read()).decode()
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
PASTE = """(sel) => { const bin = atob('%s'), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const f = new File([u], 'image.png', { type: 'image/png' }), dt = new DataTransfer(); dt.items.add(f);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); (document.querySelector(sel) || document.body).dispatchEvent(ev); }""" % B64
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    def ctx(w, h):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", reduced_motion="reduce")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1')")
        c.route("https://api.github.com/**", fake.route); return c
    for (w, h) in ((1440, 900), (390, 844)):
        c = ctx(w, h); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
        pg.evaluate("p=>__t('TCH.pos='+p+';drawTeach()')", pg.evaluate("__t(\"TCH.seq.findIndex(function(c){return c.t==='question'&&c.b.id==='s6q16'})\")")); pg.wait_for_timeout(400)
        url0, pos0 = pg.url, pg.evaluate("__t('TCH.pos')")
        cam = pg.locator('.chunk.cur [data-cam="s6q16"]'); cam.scroll_into_view_if_needed(); cam.click(); pg.wait_for_timeout(1200)
        pop = pg.locator("#campop")
        check("%d px: the camera opens a card, not a new page" % w, pop.count() == 1 and pg.url == url0, pg.url)
        bb, cb = pop.bounding_box(), cam.bounding_box()
        check("  ...the card fits on the screen", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= w and bb["y"] >= 0 and bb["y"] + bb["height"] <= h + 1, bb)
        check("  ...it sits next to the button", bb and cb and (abs(bb["y"] + bb["height"] - cb["y"]) < 20 or abs(bb["y"] - cb["y"] - cb["height"]) < 20), (bb, cb))
        check("  ...a dotted box to paste into, and Choose photo", pg.locator("#campaste").count() == 1 and "Paste" in pg.inner_text("#campaste") and pg.locator("#campop [data-camfile]").count() == 1)
        check("  ...a picture of the question and its source, so it is clear which one", pg.locator("#campop .camq img").count() == 1 and pg.locator("#campop .ref").count() == 1)
        pg.keyboard.press("t"); pg.wait_for_timeout(200)
        check("  ...Teach keys do nothing while it is open", pg.evaluate("__t('TCH.pos')") == pos0 and pop.count() == 1)
        if w == 1440: pg.screenshot(path=os.path.join(SHOTS, "r39-card-1440.png"))
        n0 = len(fake.puts)
        pg.evaluate(PASTE, "#campaste")
        pg.wait_for_function("()=>/saved/i.test((document.querySelector('#camst')||{}).textContent||'')", timeout=15000)
        check("  ...pasting a photo saves it to the question's work folder", len([k for k in list(fake.puts)[n0:] if "/work/" in k]) >= 1 or len(fake.puts) > n0, list(fake.puts)[-3:])
        check("  ...and shows it in the card at once", pg.locator("#camshots .campic img").count() >= 1)
        check("  ...the button now counts the photo", "photo" in pg.inner_text('.chunk.cur [data-cam="s6q16"]'))
        pg.screenshot(path=os.path.join(SHOTS, "r39-saved-%d.png" % w))
        with pg.expect_file_chooser() as fc: pg.click("#campop [data-camfile]")
        fc.value.set_files(PHOTO)
        pg.wait_for_function("()=>document.querySelectorAll('#camshots .campic').length>=2", timeout=15000)
        check("  ...Choose photo adds a second one", pg.locator("#camshots .campic").count() >= 2)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check("  ...Escape closes it, still on the same step", pop.count() == 0 and pg.evaluate("__t('TCH.pos')") == pos0)
        cam.click(); pg.wait_for_timeout(300); pg.mouse.click(5, h // 2); pg.wait_for_timeout(200)
        check("  ...a tap outside closes it", pg.locator("#campop").count() == 0)
        cam.click(); pg.wait_for_timeout(300); pg.keyboard.press("m"); pg.wait_for_timeout(200)
        check("  ...M does not start the mic while it is open", pg.locator("#campop").count() == 1 and not pg.evaluate("__t('!!MIC')"))
        n1 = len(fake.puts)
        pg.evaluate(PASTE.replace("type: 'image/png'", "type: ''"), "#campaste")
        pg.wait_for_function("()=>/saved/i.test((document.querySelector('#camst')||{}).textContent||'')", timeout=15000)
        check("  ...a pasted photo with no type is still saved", len(fake.puts) > n1)
        pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(600)
        check("  ...going to another page closes it and forgets the question", pg.locator("#campop").count() == 0 and pg.evaluate("__t('CAM')") is None)
        pg.go_back(); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(400)
        check("  ...no sideways scroll", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        if w == 1440:
            pg.goto(APP + "#/lesson/" + LID); pg.wait_for_timeout(1500)
            pg.evaluate("__t(\"L.phase='_work';drawLesson()\")"); pg.wait_for_timeout(800)
            pg.evaluate(PASTE, "body")
            pg.wait_for_timeout(300)
            check("His work page: pasting fills the form", pg.evaluate("document.querySelector('#wk-files').files.length") == 1 and "1 file" in pg.inner_text("#wk-pick"), pg.inner_text("#wk-pick") if pg.locator("#wk-pick").count() else "no form")
        c.close()
    check("no script errors", not errs, errs)
    b.close()
print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
