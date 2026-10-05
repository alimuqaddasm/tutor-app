"""Marking icons down the right edge (Ali, 5 Oct: "bubbles or icons hanging on the side... they stay there and i click",
   style 2 "Solid"). The open question shows only the question and the answer; after a tick the next unasked question
   opens; after a cross or a half it stays. Pretend GitHub as in tests/test_quickflow.py.

    python tests/test_vrail_5oct.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-04-chem"
SHOTS = os.environ.get("SHOTS")
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {"channel": "msedge"} if os.name == "nt" else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()

    def page(w=1440, h=765):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow','quick');")
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
        pg.evaluate("""(t)=>{for(const b of document.querySelectorAll('.outline [data-tjump]')) if(b.textContent.includes(t)){b.click();return}}""", "Oral quiz")
        pg.wait_for_timeout(700)
        return pg

    rows = "[...document.querySelectorAll('.chunk.cur .brow')].map(r=>({k:r.querySelector('.bq').dataset.bopen,v:r.dataset.v,open:r.classList.contains('open')}))"
    pg = page()
    check("with nothing open the icons wait, greyed out", pg.locator(".chunk.cur .vrail.idle").count() == 1 and pg.locator(".vrail.idle .vr-right[disabled]").count() == 1)
    pg.click(".chunk.cur .brow:not([data-v]) .bq, .chunk.cur .brow[data-v=''] .bq")
    pg.wait_for_timeout(300)
    r = pg.evaluate(rows); o = [x for x in r if x["open"]][0]
    check("opening a question records nothing", o["v"] in ("", None))
    check("solid round icons: green, red, orange, blue, grey", pg.evaluate("['right','wrong','partly','mic','more'].map(c=>{const e=document.querySelector('.vrail .vr-'+c+' .vd');return e?getComputedStyle(e).backgroundColor:''})") == ["rgb(22, 128, 60)", "rgb(209, 47, 47)", "rgb(217, 119, 6)", "rgb(37, 99, 235)", "rgb(107, 114, 128)"])
    check("  round, 56px", pg.evaluate("(()=>{const e=document.querySelector('.vrail .vr-right .vd').getBoundingClientRect();return Math.round(e.width)})()") == 56)
    check("  key labels under them", pg.evaluate("[...document.querySelectorAll('.vrail kbd')].map(k=>k.textContent)")[:3] == ["1", "2", "3"])
    check("  no Right/Wrong words on the question", "Right" not in pg.inner_text(".brow.open") and "Wrong" not in pg.inner_text(".brow.open"))
    nxt = pg.inner_text(".brow.open .bnext")
    want = [x for x in r[r.index(o) + 1:] + r[:r.index(o)] if x["v"] in ("", None, "tskip")][0]["k"]
    pg.keyboard.press("1"); pg.wait_for_timeout(700)
    r2 = pg.evaluate(rows); o2 = [x for x in r2 if x["open"]]
    check("a tick marks it and opens the next unasked question", [x for x in r2 if x["k"] == o["k"]][0]["v"] == "right" and o2 and o2[0]["k"] == want, (o2, want))
    check("  the line under the question named that one", str([i for i, x in enumerate(r) if x["k"] == want][0] + 1) + "." in nxt, nxt)
    check("  the rail now marks the new question", pg.evaluate("document.querySelector('.vrail').dataset.item") == want)
    k = want
    pg.keyboard.press("2"); pg.wait_for_timeout(500)
    r3 = pg.evaluate(rows)
    check("a cross stays on the question", [x for x in r3 if x["open"]][0]["k"] == k and [x for x in r3 if x["k"] == k][0]["v"] == "wrong")
    check("  the cross stays lit with a ring, the others fade", pg.evaluate("(()=>{const w=getComputedStyle(document.querySelector('.vrail .vr-wrong .vd')),r=getComputedStyle(document.querySelector('.vrail .vr-right .vd'));return w.opacity==='1'&&w.outlineStyle==='solid'&&+r.opacity<0.5})()"))
    pg.keyboard.press("3"); pg.wait_for_timeout(500)
    check("a half stays too", [x for x in pg.evaluate(rows) if x["open"]][0]["k"] == k)
    pg.click(".vrail [data-vrmore]")
    check("the dots open wording, terminology, didn't answer and a note", pg.locator(".vrail .vrmenu:not([hidden]) [data-v]").count() == 3 and pg.locator(".vrail .vrmenu input[data-note]").count() == 1)
    pg.fill(".vrail .vrmenu input[data-note]", "mixed up ions"); pg.wait_for_timeout(300)
    pg.click(".tcrumb > b")
    check("  tapping elsewhere closes it", pg.locator(".vrail .vrmenu[hidden]").count() == 1)
    pg.keyboard.press("4"); pg.wait_for_timeout(500)
    check("key 4 is Wording (not the mic)", [x for x in pg.evaluate(rows) if x["k"] == k][0]["v"] == "wording")
    check("  the note shows under the open question", "mixed up ions" in pg.inner_text(".brow.open .bnote"))
    # nervous double tap on the tick must not mark the question that opens next
    before = {x["k"]: x["v"] for x in pg.evaluate(rows)}
    pg.evaluate("(()=>{const b=document.querySelector('.vrail .vr-right');b.click();setTimeout(()=>document.querySelector('.vrail .vr-right').click(),380)})()")
    pg.wait_for_timeout(900)
    r4 = pg.evaluate(rows); nk = [x for x in r4 if x["open"]]
    check("a double tap on the tick doesn't mark the next question", [x for x in r4 if x["k"] == k][0]["v"] == "right" and nk and before.get(nk[0]["k"]) == [x for x in r4 if x["open"]][0]["v"], (nk, before.get(nk[0]["k"]) if nk else None))
    check("the icons sit clear of the list", pg.evaluate("(()=>{const r=document.querySelector('.vrail').getBoundingClientRect(),c=document.querySelector('.chunk.cur').getBoundingClientRect();return c.right<=r.left+1})()"))
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "vrail-1440.png"))
    pg.context.close()

    for w, h in ((1024, 768), (390, 844)):
        pg = page(w, h)
        pg.click(".chunk.cur .brow:nth-child(2) .bq"); pg.wait_for_timeout(400)
        check("%d wide: no sideways scroll, icons on screen, clear of the card" % w, pg.evaluate("(()=>{const r=document.querySelector('.vrail').getBoundingClientRect(),c=document.querySelector('.chunk.cur').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0&&c.right<=r.left+1})()"))
        if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "vrail-%d.png" % w))
        pg.context.close()

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
