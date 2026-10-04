import os, sys, re
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright
fake=FakeGH()
src=open('/home/user/tutor-app/tests/test_round15.py').read()
MA=re.search(r'MA\s*=\s*"([^"]+)"', src) or re.search(r"MA\s*=\s*'([^']+)'", src)
MA=MA.group(1) if MA else "2026-10-01-maths"
print("lesson", MA)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    c=b.new_context(viewport={"width":1280,"height":800}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','la57');localStorage.setItem('tutor.layout','flip');")
    c.route("https://api.github.com/**", fake.route)
    pg=c.new_page(); pg.goto("http://localhost:8765/#/lesson/"+MA+"/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(3000)
    i=pg.evaluate("(()=>{const bs=[...document.querySelectorAll('.outline [data-tjump]')]; const b=bs.find(x=>x.textContent.indexOf('Set 6 Q14')>=0); return b?+b.getAttribute('data-tjump'):-1;})()")
    print("idx", i)
    pg.evaluate("(i)=>document.querySelector('.outline [data-tjump=\"'+i+'\"]').click()", i); pg.wait_for_timeout(1500)
    pg.click("[data-flip]"); pg.wait_for_timeout(1500)
    print("answer side overflow px:", pg.evaluate("(()=>{const q=document.querySelector('.chunk.cur .fita'); return [q.scrollHeight-q.clientHeight, q.clientHeight];})()"))
    pg.screenshot(path=os.path.join(HERE,"shots","q14-answer-tablet.png"))
    b.close()
