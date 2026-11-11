"""Try-out mode saves nothing; a suggestion is the only write; normal mode still saves.
Rewritten 11 Nov 2026 for the redesigned Teach page: PASS/FAIL checks, the pretend GitHub (fakegh) instead of a real
key, the note box inside the "..." menu on the verdict rail, Suggest a change inside the More menu.

    python tests/runtest.py tests/test_tryout.py      (the app on :8765; nothing reaches GitHub)
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
L = os.environ.get("LESSON", "2026-10-01-chem")
SESSION = "students/UK-1/lessons/%s/session.json" % L
results = []; errs = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info != "" and not ok else ""))


with sync_playwright() as pw:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = pw.chromium.launch(**launch)
    fake = FakeGH()
    c = b.new_context(viewport={"width": 1400, "height": 900}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token','t'); localStorage.setItem('tutor.device','test');")
    c.route("https://api.github.com/**", fake.route)
    c.route("**/*workers.dev/**", lambda r: r.abort())
    p = c.new_page(); p.on("pageerror", lambda e: errs.append(str(e)))
    writes = lambda: [(m, pth.split("/contents/")[-1]) for m, pth in fake.log if m != "GET"]
    question = "Array.from(document.querySelectorAll('.outline .oc')).find(b => b.querySelector('.ic') && b.querySelector('.ic').textContent == '?').click()"

    def note(text):
        # the note box lives in the "..." menu at the end of the verdict rail
        if not p.locator(".vrail .vrmenu").first.is_visible(): p.click(".vrail [data-vrmore]")
        p.fill(".vrail .vrmenu input[data-note]", text); p.keyboard.press("Tab")

    # 1. try-out: the clock, Taught, a verdict and a note save nothing
    p.goto(APP + "?try#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3", timeout=60000); p.wait_for_timeout(600)
    check("Try-out shows its dot", p.locator(".trybar #trydot").count() == 1)
    p.click("#clkgo"); p.wait_for_timeout(400)
    if p.locator("#ckask [data-ck]").count(): p.locator("#ckask [data-ck]").first.click(); p.wait_for_timeout(300)
    for i in range(8):
        p.click(".tfoot .btn.next"); p.wait_for_timeout(150)
    p.evaluate(question); p.wait_for_timeout(500)
    p.locator('.chunk.cur [data-v="wrong"]').click(); p.wait_for_timeout(200)
    check("  the verdict shows as pressed", p.locator('.chunk.cur [data-v="wrong"][aria-pressed="true"]').count() == 1)
    note("test note"); p.wait_for_timeout(6000)          # a real lesson would save after 4 seconds
    check("  the clock, 8 Taught, a verdict and a note: nothing is sent to GitHub", not writes(), writes()[:4])
    keys = p.evaluate("Object.keys(localStorage).filter(k => /^tutor\\.(s|review)\\./.test(k))")
    check("  no lesson or review copy is kept on the device", not keys, keys)

    # 2. try-out: a warm-up answer saves nothing
    p.goto(APP + "?try#/revise"); p.wait_for_timeout(2500)
    if p.locator('[data-rev="open"]').count(): p.locator('[data-rev="open"]').first.click(); p.wait_for_timeout(300)
    if p.locator('[data-rev="ok"]').count():
        p.locator('[data-rev="ok"]').first.click(); p.wait_for_timeout(3500)
        check("a warm-up answer in Try-out: nothing is sent", not writes(), writes()[:4])
    else:
        print("SKIP warm-up answer (nothing due today)")

    # 3. a suggestion is the only write, and pointing at something does not press it
    p.goto(APP + "?try#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(500)
    p.click("[data-tmore]"); p.locator(".tmenu [data-suggest]").click(); p.wait_for_selector("#sug-text", timeout=8000)
    check("Suggest a change says which page it is about", "teach" in p.inner_text("#sug-w").lower(), p.inner_text("#sug-w"))
    step = p.inner_text(".tmini .num")
    p.click("#sug-point"); p.wait_for_timeout(300); p.locator(".tfoot .btn.next").click(); p.wait_for_timeout(500)
    check("  pointing at a button names it", p.locator(".sug-t").count() == 1 and len(p.inner_text(".sug-t")) > 0)
    check("  ...and does not press it: Teach stays on the same step", p.inner_text(".tmini .num") == step, (step, p.inner_text(".tmini .num")))
    p.locator('[data-sugtag="Layout"]').click(); p.fill("#sug-text", "TEST ONLY: ignore"); p.click("#sug-save"); p.wait_for_timeout(2500)
    w = writes()
    check("  Save suggestion is the only thing written: one file, the suggestions list", list(fake.puts) == ["docs/ui-feedback.jsonl"], (list(fake.puts), w[:4]))
    check("  the suggestion text reaches the repo", b"TEST ONLY: ignore" in fake.puts.get("docs/ui-feedback.jsonl", b""))

    # 4. leaving try-out
    p.keyboard.press("Escape"); p.wait_for_timeout(300)
    p.click("#trydot"); p.wait_for_timeout(200); p.locator("#tryleave").click(); p.wait_for_timeout(1500)
    check("Leave try-out: the dot is gone", p.locator(".trybar").count() == 0, p.url)

    # 5. normal mode still saves
    fake.log.clear(); fake.puts.clear()
    p.goto(APP + "#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(500)
    p.evaluate(question); p.wait_for_timeout(500)
    p.locator('.chunk.cur [data-v="right"]').click(); p.wait_for_timeout(6000)
    check("Normal mode: a verdict is saved to the lesson", SESSION in fake.puts, writes()[:4])
    check("no script errors", not errs, errs[:3])
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
