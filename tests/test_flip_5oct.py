"""Flip card of 5 Oct: the answer text sits under the question when it fits; when it doesn't, the front says it is
   on the back. The back (button "Mark scheme", key A) shows the mark scheme pictures first, at full width, then the
   answer text and the hints. Notes stay on the front. Pretend GitHub as in tests/test_batch1_lessons.py.

    python tests/test_flip_5oct.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-04-maths"
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    for w, h in ((1440, 900), (1280, 800)):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.layout','flip');")
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "#/lesson/" + LID + "/teach")
        pg.wait_for_selector(".chunk.cur", timeout=30000)
        pg.wait_for_timeout(1500)

        def go(text):
            pg.evaluate("""(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}""", text)
            pg.wait_for_timeout(1800)

        def scroll(sel):
            return pg.evaluate("(s)=>{const e=document.querySelector(s);return e.scrollHeight-e.clientHeight}", sel)

        tag = "%dx%d" % (w, h)
        go("Set 6 Q18")   # short answer, no answer picture
        on_front = pg.locator(".chunk.cur .fitq .ansfront:not([hidden])").count() == 1
        if w >= 1440:
            check(tag + " short answer shows under the question", on_front and "18.4" in pg.inner_text(".chunk.cur .fitq .ansfront"))
        else:   # a smaller screen may not have the room: then it must be on the back, never cut off
            check(tag + " short answer: under the question, or on the back if no room", on_front or pg.locator(".chunk.cur .fitq .ansmore:not([hidden])").count() == 1)
        check(tag + "   and the front doesn't scroll", scroll(".chunk.cur .fitq") <= 2, scroll(".chunk.cur .fitq"))
        go("Set 6 Q16")   # long answer with a mark scheme picture
        # with the slim top bar (5 Oct) the big screen may have room for it: then it shows whole on the front
        check(tag + " long answer: on the back with a note, or whole on the front", (pg.locator(".chunk.cur .fitq .ansmore:not([hidden])").count() == 1 and pg.locator(".chunk.cur .fitq .ansfront[hidden]").count() == 1)
              or (pg.locator(".chunk.cur .fitq .ansfront:not([hidden])").count() == 1 and scroll(".chunk.cur .fitq") <= 2))
        check(tag + "   and the front doesn't scroll", scroll(".chunk.cur .fitq") <= 2, scroll(".chunk.cur .fitq"))
        check(tag + "   the button says Mark scheme", pg.inner_text("[data-flip]").startswith("Mark scheme"))
        pg.keyboard.press("a")
        pg.wait_for_timeout(1200)
        order = pg.evaluate("[...document.querySelector('.chunk.cur .flipa').children].map(e=>e.className)")
        check(tag + "   back: picture first, then the answer, then hints", order.index("figrow") < order.index("ansback") < order.index("thints") if all(k in order for k in ("figrow", "ansback", "thints")) else False, order)
        wid = pg.evaluate("(()=>{const i=document.querySelector('.chunk.cur .flipa .figrow img'),c=document.querySelector('.chunk.cur .flipa');return [i.getBoundingClientRect().height, c.clientHeight]})()")
        check(tag + "   the mark scheme picture is big (over half the card's height)", wid[0] > wid[1] * 0.5, wid)
        check(tag + "   no sideways scrolling on the back", pg.evaluate("(()=>{const e=document.querySelector('.chunk.cur .flipa');return e.scrollWidth-e.clientWidth})()") <= 0)
        pg.keyboard.press("a")
        c.close()
    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
