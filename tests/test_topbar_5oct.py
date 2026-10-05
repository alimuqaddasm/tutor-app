"""5 Oct: Teach's top bar in one slim row (Warm-up, Suggest and Try-out behind ⋯; Preview / Clock stopped as a small
   label by the clock) and quick flow as the default. Pretend GitHub as in tests/test_batch1_lessons.py.

    python tests/test_topbar_5oct.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    fake.files.pop("students/UK-1/lessons/2026-10-04-maths/session.json", None)   # untaught: Teach opens in preview
    c = b.new_context(viewport={"width": 1440, "height": 765}, service_workers="block")
    # no tutor.flow of our own: the app's default must be quick flow (fakegh's step-by-step default is removed first)
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.removeItem('tutor.flow');")
    c.route("https://api.github.com/**", fake.route)
    pg = c.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(1500)

    check("quick flow is the default", pg.evaluate("localStorage.getItem('tutor.flow')") is None and pg.locator(".chunk.cur.t-phase, .chunk.cur.t-mod").count() == 0
          and int(pg.inner_text(".tmini .hint.num").split("/")[1]) < 25, pg.inner_text(".tmini .hint.num"))
    h = pg.evaluate("Math.round(document.querySelector('.tbar').getBoundingClientRect().height)")
    check("the top bar is one slim row", h < 90, h)
    check("the screen starts higher than before (was 207 px)", pg.evaluate("Math.round(document.querySelector('.chunk.cur').getBoundingClientRect().top)") < 140)
    check("Warm-up, Suggest and Try-out are hidden behind the menu", not pg.locator(".tmini [data-suggest]").is_visible() and pg.locator("[data-tmore]").is_visible())
    pg.click("[data-tmore]")
    check("  the menu opens with all three", all(pg.locator(".tmenu " + s).is_visible() for s in ("[data-warmup]", "[data-suggest]", "[data-trytoggle]")))
    pg.click(".tcrumb > b"); pg.wait_for_timeout(200)
    check("  and closes when tapping elsewhere", not pg.locator(".tmenu").is_visible())
    check("Preview is a small label by the clock", pg.locator(".tmini .preview").inner_text().strip().lower() == "preview" and pg.locator(".tbar > .preview").count() == 0)
    pg.click(".tmini .preview", timeout=4000)
    check("  tapping it explains it", "Start lesson" in pg.inner_text("#toast"))
    pg.goto(APP + "#/settings"); pg.wait_for_selector("[data-flow]", timeout=15000)
    check("Settings shows Quick flow chosen", pg.get_attribute('[data-flow="quick"]', "aria-pressed") == "true")
    pg.click('[data-flow="steps"]')
    check("  and Step by step can still be chosen", pg.evaluate("localStorage.getItem('tutor.flow')") == "steps")
    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
