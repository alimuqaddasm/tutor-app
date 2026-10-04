import os, sys, time, json
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright
APP="http://localhost:8765/"
def run(delay, label):
    fake=FakeGH()
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        c=b.new_context(viewport={"width":1366,"height":768}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','la57');const of=window.fetch;window.fetch=function(u,o){var s=String(u&&u.url||u);return s.indexOf('https://api.github.com')===0?new Promise(function(r){setTimeout(r,%d)}).then(function(){return of(u,o)}):of(u,o)};" % int(delay*1000))
        c.route("https://api.github.com/**", fake.route)
        pg=c.new_page()
        t=time.time(); pg.goto(APP+"#/"); pg.wait_for_selector(".tile", timeout=120000); th=time.time()-t; nh=len(fake.log)
        bytes_home=sum(len(fake.blob(fake.sha_of(p))) for m,p in []) 
        t=time.time(); pg.goto(APP+"#/lesson/2026-10-04-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=120000); tt=time.time()-t; n1=len(fake.log)
        # wait for prefetch to finish: all blobs of the lesson
        t=time.time()
        while time.time()-t<120:
            pg.wait_for_timeout(500)
            n=len(fake.log)
            if n==n1: break
            n1=n
        tp=time.time()-t
        nb=len([l for l in fake.log if "/git/blobs/" in l[1]])
        t=time.time(); pg.goto(APP+"#/exams"); pg.wait_for_timeout(100); 
        try: pg.wait_for_selector(".xt-h3, .empty h3", timeout=60000)
        except Exception: pass
        tx=time.time()-t
        print("%s: home %.1fs (%d requests) | teach first screen %.1fs | all lesson pictures cached after another %.1fs | %d blob requests total | exams tab %.1fs" % (label, th, nh, tt, tp, nb, tx))
        # warm: reload teach
        t=time.time(); pg.goto(APP+"#/lesson/2026-10-04-maths/teach"); pg.reload(); pg.wait_for_selector(".chunk.cur", timeout=60000); print("   warm teach reload %.1fs" % (time.time()-t))
        b.close()
run(0, "no latency")
run(0.35, "350 ms per GitHub call (typical)")
