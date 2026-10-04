import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright
APP = "http://localhost:8765/"; SH = os.path.join(HERE, "shots"); fake = FakeGH()
def shot(pg, n): pg.screenshot(path=os.path.join(SH, n + ".png"))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    c = b.new_context(viewport={"width": 1366, "height": 768}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','la57');localStorage.setItem('tutor.layout','flip');")
    c.route("https://api.github.com/**", fake.route)
    pg = c.new_page()
    # which element overflows at phone width?
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.goto(APP + "#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000)
    pg.evaluate("(()=>{const bs=[...document.querySelectorAll('.outline .oc')]; const b=bs.find(x=>x.querySelector('.ic').textContent.trim()==='?'); b.click();})()"); pg.wait_for_timeout(500)
    print("phone overflow:", pg.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>e.tagName+'.'+(e.className||'').toString().split(' ').slice(0,2).join('.')+' right='+Math.round(e.getBoundingClientRect().right)).slice(0,8)"))
    # chemistry lesson screens
    pg.set_viewport_size({"width": 1366, "height": 768})
    pg.goto(APP + "#/lesson/2026-10-04-chem/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(1500)
    seq = pg.evaluate("[...document.querySelectorAll('.outline [data-tjump]')].map(b=>[+b.getAttribute('data-tjump'), b.querySelector('.ic')?b.querySelector('.ic').textContent.trim():'M', b.textContent.trim().slice(0,40)])")
    print(json.dumps(seq[:40]))
    def jump(i): pg.evaluate("(i)=>document.querySelector('.outline [data-tjump=\"'+i+'\"]').click()", i); pg.wait_for_timeout(900)
    jump(0); shot(pg, "chem-01-phase")
    kinds = {}
    for i, ic, tx in seq:
        if ic not in kinds: kinds[ic] = i
    for ic, i in kinds.items():
        jump(i); shot(pg, "chem-kind-%s" % {"?": "q", "★": "quizpick", "S": "say", "D": "draw", "▧": "fig", "▶": "video", "Q": "exam", "→": "do", "¶": "text", "M": "mod", "▸": "start", "✓": "check", "▣": "show"}.get(ic, "x"))
    # quiz question: open answer, then 'more' verdicts
    if "?" in kinds:
        jump(kinds["?"])
        if pg.locator("[data-flip]").count(): pg.click("[data-flip]"); pg.wait_for_timeout(500); shot(pg, "chem-02-quiz-answer"); pg.click("[data-flip]")
        pg.click("[data-vmore]"); pg.wait_for_timeout(300); shot(pg, "chem-03-vmore")
    # Show him overlay from an exam question
    if "Q" in kinds:
        jump(kinds["Q"]);
        if pg.locator(".tfoot [data-show]").count(): pg.click(".tfoot [data-show]"); pg.wait_for_timeout(1500); shot(pg, "chem-04-showhim"); pg.keyboard.press("Escape")
    # outline on tablet portrait
    pg.set_viewport_size({"width": 800, "height": 1280}); pg.wait_for_timeout(500); pg.click("#toc"); pg.wait_for_timeout(400); shot(pg, "chem-05-outline-portrait"); pg.click("#tocx")
    # the maths figure chunk (board) at laptop
    pg.set_viewport_size({"width": 1366, "height": 768})
    pg.goto(APP + "#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    seq = pg.evaluate("[...document.querySelectorAll('.outline [data-tjump]')].map(b=>[+b.getAttribute('data-tjump'), b.querySelector('.ic')?b.querySelector('.ic').textContent.trim():'M'])")
    for i, ic in seq:
        if ic == "▧": jump(i); pg.wait_for_timeout(1500); shot(pg, "maths-fig"); break
    for i, ic in seq:
        if ic == "Q": jump(i); pg.wait_for_timeout(1500); shot(pg, "maths-examq"); pg.click("[data-flip]"); pg.wait_for_timeout(800); shot(pg, "maths-examq-answer"); break
    for i, ic in seq:
        if ic == "▶": jump(i); pg.wait_for_timeout(800); shot(pg, "maths-video"); break
    b.close()
