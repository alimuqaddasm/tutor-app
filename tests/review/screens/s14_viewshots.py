from common import *
with sync_playwright() as p:
    b = launch(p)
    for w,h,nm in [(390,844,"390x844"),(800,1280,"800x1280")]:
        for th in ("light","dark"):
            fake=FakeGH(); c=ctx(b,fake,w=w,h=h,dark=(th=="dark"))
            pg=page(c,"#/record",".stats .stat"); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(HERE,"record-view-%s-%s.png"%(nm,th)))
            pg.evaluate("window.scrollTo(0, document.querySelector('table.t').getBoundingClientRect().top + window.scrollY - 60)"); pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(HERE,"record-table-%s-%s.png"%(nm,th)))
            tw = pg.evaluate("(() => { const t=document.querySelector('.tablewrap'); return [t.scrollWidth, t.clientWidth]; })()"); print(nm, th, "record time-log table scrollWidth/clientWidth", tw)
            pg.goto(B+"#/lesson/"+MATHS); pg.wait_for_selector(".rail"); pg.wait_for_timeout(500); pg.locator('.rail button[data-phase="m2"]').click(); pg.wait_for_timeout(1200)
            pg.evaluate("document.querySelector('[data-item=s6q15]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(HERE,"plan-m2-view-%s-%s.png"%(nm,th)))
            pg.goto(B+"#/"); pg.wait_for_selector(".tile"); pg.wait_for_timeout(800); pg.screenshot(path=os.path.join(HERE,"home-view-%s-%s.png"%(nm,th)))
            c.close()
    # week strip close-up, dark 1366
    c=ctx(b,FakeGH(),dark=True); pg=page(c,"#/",".tile"); pg.wait_for_timeout(500); pg.locator(".week").screenshot(path=os.path.join(HERE,"week-strip-dark.png"))
    pg.locator(".clock, .side-foot").first.screenshot(path=os.path.join(HERE,"side-foot-dark.png")); c.close(); b.close()
