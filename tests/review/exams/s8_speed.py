"""Scenario 8: speed. #/exams list (cold and warm), student page first paint and time to the question, teacher poll rate while waiting."""
import time, json
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
MARK = """(function(){window.__marks={};var mo=new MutationObserver(function(){var a=document.querySelector('#app'),e=document.querySelector('#ex');
 if(a&&!window.__marks.list&&a.textContent.indexOf('On the exam server')>=0)window.__marks.list=performance.now();
 if(e&&!window.__marks.q&&document.querySelector('.ex-q'))window.__marks.q=performance.now();
 if(e&&!window.__marks.wait&&e.textContent.indexOf('will start')>=0)window.__marks.wait=performance.now();});
 mo.observe(document,{childList:true,subtree:true,characterData:true});})()"""
with sync_playwright() as p:
    b = launch(p)
    reqs = []
    # teacher list, cold
    fake = FakeGH()
    ctx = context(b, fake=fake, teacher=True)
    ctx.add_init_script(MARK)
    pg = ctx.new_page(); el.attach(pg, "8 ")
    pg.on("request", lambda r: reqs.append((time.time(), r.method, r.url)))
    pg.goto(APP + "#/exams")
    wait_for(lambda: pg.evaluate("window.__marks.list"), 40)
    m = pg.evaluate("window.__marks"); nav = pg.evaluate("performance.getEntriesByType('navigation')[0].toJSON()")
    gh_calls = len([r for r in reqs if "api.github.com" in r[2]]); ex_calls = len([r for r in reqs if API in r[2]])
    note("8 #/exams cold: list visible at %.0f ms after navigation start (DOMContentLoaded %.0f ms); %d GitHub calls, %d exam-server calls" % (m.get("list", -1), nav["domContentLoadedEventEnd"], gh_calls, ex_calls))
    # warm (tree in localStorage, blobs in IndexedDB)
    reqs.clear()
    pg.goto(APP + "#/videos"); time.sleep(1); pg.evaluate("window.__marks={}")
    t0 = time.time(); pg.evaluate("location.hash='#/exams'")
    wait_for(lambda: pg.evaluate("window.__marks.list"), 40)
    note("8 #/exams warm (same tab, hash change): list visible %.0f ms after click; %d GitHub calls" % ((time.time() - t0) * 1000, len([r for r in reqs if "api.github.com" in r[2]])))
    reqs.clear(); pg.reload(); wait_for(lambda: pg.evaluate("window.__marks.list"), 40)
    m = pg.evaluate("window.__marks")
    note("8 #/exams reload with device cache: list visible at %.0f ms; %d GitHub calls, %d exam-server calls" % (m.get("list", -1), len([r for r in reqs if "api.github.com" in r[2]]), len([r for r in reqs if API in r[2]])))
    # poll rate while waiting / locked
    eid, tok = make_exam(minutes=30, title="Speed")
    pg.goto(APP + "#/exams/" + eid); wait_for(lambda: pg.locator("#xt-btns").count() == 1, 10)
    reqs.clear(); pg.wait_for_timeout(30000)
    note("8 teacher page, exam waiting: %d exam-server calls in 30 s" % len([r for r in reqs if API in r[2]]))
    ctx.close()

    # student page
    for label, run in (("waiting", False), ("running", True)):
        eid, tok = make_exam(minutes=30, title="Speed " + label, start=run)
        sctx = context(b, viewport={"width": 1280, "height": 800})
        sctx.add_init_script(MARK)
        sp = sctx.new_page(); el.attach(sp, "8s ")
        sp.goto(link(tok))
        key = "q" if run else "wait"
        wait_for(lambda: sp.evaluate("window.__marks." + key), 20)
        paint = sp.evaluate("performance.getEntriesByType('paint').map(function(e){return [e.name, Math.round(e.startTime)]})")
        m = sp.evaluate("window.__marks"); nav = sp.evaluate("performance.getEntriesByType('navigation')[0].toJSON()")
        res = sp.evaluate("performance.getEntriesByType('resource').map(function(r){return [r.name.replace(location.origin,''), Math.round(r.duration), r.transferSize]})")
        note("8 student page (%s): paint %s; %s screen at %.0f ms; DOMContentLoaded %.0f ms; resources: %s" % (label, paint, label, m.get(key, -1), nav["domContentLoadedEventEnd"], res))
        sctx.close()
    # Google Fonts unreachable: how long is the page blank?
    for mode in ("abort", "hang"):
        eid, tok = make_exam(minutes=30, title="Speed fonts", start=True)
        sctx = context(b, viewport={"width": 1280, "height": 800}); sctx.add_init_script(MARK)
        if mode == "abort": sctx.route("https://fonts.googleapis.com/**", lambda r: r.abort())
        else: sctx.route("https://fonts.googleapis.com/**", lambda r: None)
        sp = sctx.new_page(); sp.goto(link(tok), wait_until="commit")
        wait_for(lambda: sp.evaluate("window.__marks && window.__marks.q"), 40)
        paint = sp.evaluate("performance.getEntriesByType('paint').map(function(e){return [e.name, Math.round(e.startTime)]})")
        note("8 student page with Google Fonts %sed: first paint %s, question screen at %s ms" % (mode, paint, sp.evaluate("window.__marks.q")))
        sctx.close()
    b.close()
check("8 no script errors", not el.errors, el.errors)
finish("s8_speed")
