from common import *
with sync_playwright() as p:
    b = launch(p)
    for w,h in [(1280,800),(800,1280),(390,844)]:
        c=ctx(b,FakeGH(),w=w,h=h); pg=page(c,"#/lesson/"+MATHS,".rail"); pg.wait_for_timeout(500)
        r = pg.evaluate("""() => { const r=document.querySelector('.rail'); const cs=getComputedStyle(r); const bs=[...r.querySelectorAll('button')]; const vis=bs.filter(b=>{const x=b.getBoundingClientRect(); return x.right<=window.innerWidth && x.left>=0}).map(b=>b.querySelector('.nm').textContent); return {scrollW:r.scrollWidth, clientW:r.clientWidth, overflowX:cs.overflowX, scrollbarW:cs.scrollbarWidth, visible:vis, total:bs.length, pos:cs.position, top:r.getBoundingClientRect().top}; }""")
        print(w,h,r)
        # is 'After the lesson' reachable by scrolling the rail?
        pg.evaluate("document.querySelector('.rail').scrollLeft = 99999"); pg.wait_for_timeout(200)
        last = pg.evaluate("(() => { const b=document.querySelector('.rail button[data-phase=_after]').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), window.innerWidth]; })()")
        print("   after-the-lesson button after scrolling the rail:", last)
        pg.screenshot(path=os.path.join(HERE,"rail-scrolled-%dx%d.png"%(w,h)))
        c.close()
    b.close()
