"""Scenario 2 continued, via the fault proxy: slow server, 500, 429, 404, a hung request; beforeunload capability check."""
import time
from playwright.sync_api import sync_playwright
from common import *
import faultproxy

faultproxy.start()
PAPI = "http://localhost:8788"


def plink2(token):
    return APP + "exam.html#t=" + token + "&api=" + PAPI


el = ErrLog()
with sync_playwright() as p:
    b = launch(p)
    eid, tok = make_exam(minutes=30, title="Saving test 3", start=True)
    ctx = context(b)

    # ---- can headless Chromium show a beforeunload prompt at all? ----
    t = ctx.new_page()
    dl = []
    t.on("dialog", lambda d: (dl.append(d.type), d.accept()))
    t.set_content("<button id=b>x</button><script>window.addEventListener('beforeunload',function(e){e.preventDefault();e.returnValue='';});</script>")
    t.click("#b")
    t.close(run_before_unload=True)
    time.sleep(1)
    can_prompt = "beforeunload" in dl
    note("capability: headless Chromium shows beforeunload dialogs: %s" % can_prompt)

    pg = ctx.new_page(); el.attach(pg, "2c ")
    pg.on("dialog", lambda d: d.accept())
    pg.goto(plink2(tok))
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    # beforeunload handler check by dispatching the event: is it defaultPrevented when dirty?
    ctx.set_offline(True)
    pg.fill("#ans", "dirty text")
    time.sleep(1.2)
    prevented = pg.evaluate("(function(){var e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()")
    check("2f beforeunload handler asks to stay when text is unsent", prevented, prevented)
    ctx.set_offline(False)
    wait_for(lambda: review(eid)["questions"][0]["final"] == "dirty text", 10)
    prevented = pg.evaluate("(function(){var e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()")
    check("2f beforeunload handler lets you leave when all is saved", not prevented, prevented)

    # ---- 2g. slow server: 2 s per save ----
    faultproxy.ctl(reset=1); faultproxy.ctl(delay=2, match="/api/s/answers")
    for i in range(1, 6):
        pg.fill("#ans", "slow %d" % i)
        time.sleep(0.4)
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "slow 5", 25)
    revs = [r["text"] for r in review(eid)["questions"][0]["revisions"] if r["text"].startswith("slow")]
    check("2g slow server (2 s): the last typed text is what the server keeps", ok is not None, revs)
    check("2g slow server: label settles on Saved", wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 10) is not None, pg.inner_text(".ex-save"))
    faultproxy.ctl(reset=1)

    # ---- 2h. 500 twice then fine ----
    faultproxy.ctl(fail=500, failn=2, match="/api/s/answers")
    pg.fill("#ans", "after a 500")
    time.sleep(1.5)
    note("2h label right after a 500: %r" % pg.inner_text(".ex-save"))
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "after a 500", 25)
    check("2h a 500 from the server is retried and the text arrives", ok is not None, faultproxy.ctl())
    faultproxy.ctl(reset=1)

    # ---- 2i. 429 once ----
    faultproxy.ctl(fail=429, failn=1, match="/api/s/answers")
    pg.fill("#ans", "after a 429")
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "after a 429", 25)
    check("2i a 429 is retried", ok is not None, faultproxy.ctl())
    faultproxy.ctl(reset=1)

    # ---- 2j. a one-off 404 on save: does the text ever get there? ----
    faultproxy.ctl(fail=404, failn=1, match="/api/s/answers")
    pg.fill("#ans", "after a 404")
    time.sleep(2.5)
    note("2j label after a 404 on save: %r toast=%r" % (pg.inner_text(".ex-save"), pg.inner_text("#toast")))
    faultproxy.ctl(reset=1)
    time.sleep(7)
    srv = review(eid)["questions"][0]["final"]
    check("2j after a one-off 4xx the text is still sent later", srv == "after a 404", "server has %r; label %r" % (srv, pg.inner_text(".ex-save")))
    shot(pg, "s2-after-404")
    pg.fill("#ans", "after a 404, typed more")
    wait_for(lambda: review(eid)["questions"][0]["final"] == "after a 404, typed more", 8)

    # ---- 2k. one save request hangs for ever (mobile network black hole) ----
    faultproxy.ctl(hang=1, match="/api/s/answers")
    pg.fill("#ans", "hung request")
    time.sleep(2)
    faultproxy.ctl(hang=0)  # from now on the server answers; the one in flight stays hung
    st = faultproxy.ctl()
    note("2k requests hung: %d" % st["hung"])
    pg.fill("#ans", "hung request, then typed more")
    t0 = time.time()
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "hung request, then typed more", 45)
    check("2k after one hung save request, later typing still gets saved within 45 s", ok is not None, "label %r after %.0fs" % (pg.inner_text(".ex-save"), time.time() - t0))
    shot(pg, "s2-hung")
    # a poll hanging: does the timer/status still refresh?
    faultproxy.ctl(reset=1); faultproxy.ctl(hang=1, match="/api/s/state")
    time.sleep(4); faultproxy.ctl(hang=0)
    api("POST", "/api/t/exams/%s/extend" % eid, {"minutes": 5})
    ok = wait_for(lambda: "added 5" in pg.inner_text(".ex-bannerslot"), 45)
    check("2k after one hung state poll, polling resumes (the +5 arrives within 45 s)", ok is not None, pg.inner_text(".ex-save"))
    faultproxy.ctl(reset=1)

    b.close()

check("2c no script errors", not el.errors, el.errors)
finish("s2c_saving")
