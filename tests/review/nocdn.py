import os, sys
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import fakegh
from fakegh import FakeGH
from playwright.sync_api import sync_playwright
fake=FakeGH()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    c=b.new_context(viewport={"width":1366,"height":768}, service_workers="block")
    c.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())   # registered later: wins over the shim
    c.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','la57');localStorage.setItem('tutor.layout','flip');")
    c.route("https://api.github.com/**", fake.route)
    pg=c.new_page(); pg.goto("http://localhost:8765/#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000)
    pg.evaluate("(()=>{const bs=[...document.querySelectorAll('.outline .oc')]; bs.find(x=>x.querySelector('.ic').textContent.trim()==='?').click();})()"); pg.wait_for_timeout(500)
    pg.click("[data-flip]"); pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(HERE,"shots","teach-03-answer-side-nocdn.png"))
    print("raw tags visible:", "<p>" in pg.inner_text(".chunk.cur .fita"))
    b.close()
