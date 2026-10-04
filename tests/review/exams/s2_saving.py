"""Scenario 2: saving. Long answers, 413, offline mid-save, two tabs, refresh and close with unsaved text, slow server."""
import time
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
with sync_playwright() as p:
    b = launch(p)
    eid, tok = make_exam(minutes=30, title="Saving test", start=True)
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "2 ")
    pg.goto(link(tok))
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    pg.click('[data-go="2"]')  # q3 long answer

    # ---- 2a. 20,000 chars ----
    big = ("Lorem ipsum arc length r theta. " * 700)[:20000]
    t0 = time.time()
    pg.fill("#ans", big)
    ok = wait_for(lambda: review(eid)["questions"][2]["final"] == big, 15)
    check("2a 20,000 chars reach the server exactly", ok is not None, "took %.1fs" % (time.time() - t0))
    check("2a save label says Saved", wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 5) is not None, pg.inner_text(".ex-save"))

    # ---- 2b. > 50,000 chars: server answers 413 ----
    huge = ("x" * 50) * 1100  # 55,000
    pg.fill("#ans", huge)
    time.sleep(3)
    srv = review(eid)["questions"][2]["final"]
    label = pg.inner_text(".ex-save")
    check("2b 55,000 chars: server kept the previous (20k) text", srv == big, "server has %d chars" % len(srv))
    check("2b 55,000 chars: the save label warns that this text is NOT saved", "Saved" not in label and "saved" not in label.lower().replace("not saved", ""), "label reads %r (should not claim saved)" % label)
    shot(pg, "s2-413-label")
    # is the draft still on this device after a refresh?
    pg.on("dialog", lambda d: d.accept())
    pg.reload()
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    pg.click('[data-go="2"]')
    v = pg.input_value("#ans")
    check("2b after refresh the 55,000-char text is still in the box (work not lost)", len(v) == 55000, "box has %d chars" % len(v))
    # typing a bit more: does it ever get saved?
    pg.fill("#ans", huge[:49000])
    ok = wait_for(lambda: review(eid)["questions"][2]["final"] == huge[:49000], 10)
    check("2b shortening the answer below 50k saves again", ok is not None)

    # ---- 2c. offline mid-save, keep typing, come back ----
    pg.click('[data-go="0"]')
    pg.fill("#ans", "step one")
    wait_for(lambda: review(eid)["questions"][0]["final"] == "step one", 6)
    n_before = len(review(eid)["questions"][0]["revisions"])
    pg.fill("#ans", "step two")
    ctx.set_offline(True)  # within the 900 ms debounce
    time.sleep(1.5)
    pg.fill("#ans", "step two then three")
    time.sleep(1)
    pg.fill("#ans", "step two then three then four")
    time.sleep(2)
    check("2c offline: label says kept on this computer", "Offline" in pg.inner_text(".ex-save"), pg.inner_text(".ex-save"))
    ctx.set_offline(False)
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "step two then three then four", 25)
    revs = review(eid)["questions"][0]["revisions"]
    finals = [r for r in revs if r["text"] == "step two then three then four"]
    check("2c back online: final text reaches the server", ok is not None, revs[-1]["text"] if revs else None)
    check("2c final text stored exactly once", len(finals) == 1, "%d copies, %d new revisions: %s" % (len(finals), len(revs) - n_before, [r["text"] for r in revs[n_before:]]))
    check("2c label returns to Saved", wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 6) is not None, pg.inner_text(".ex-save"))

    # ---- 2d. two tabs of the same link ----
    pg2 = ctx.new_page(); el.attach(pg2, "2d-tab2 ")
    pg2.goto(link(tok))
    wait_for(lambda: pg2.locator("#ans").count() > 0, 10)
    check("2d tab 2 shows the text tab 1 saved", pg2.input_value("#ans") == "step two then three then four", pg2.input_value("#ans"))
    pg2.fill("#ans", "TAB TWO wrote this")
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "TAB TWO wrote this", 8)
    check("2d tab 2's text saved", ok is not None)
    time.sleep(4)  # tab 1 polls every 3 s
    v1 = pg.input_value("#ans")
    check("2d tab 1's box updates to tab 2's text (or warns)", v1 == "TAB TWO wrote this", "tab 1 box still reads %r" % v1)
    shot(pg, "s2-twotabs-tab1")
    # now the student types one character in tab 1
    pg.type("#ans", "!")
    time.sleep(2.5)
    srv = review(eid)["questions"][0]["final"]
    check("2d typing one char in tab 1 does not wipe tab 2's text on the server", srv.startswith("TAB TWO"), "server now has %r" % srv)
    # and what tab 2 shows after that
    time.sleep(4)
    note("2d after tab 1 typed '!': tab2 box=%r tab1 box=%r server=%r" % (pg2.input_value("#ans"), pg.input_value("#ans"), review(eid)["questions"][0]["final"]))
    check("2d no error toast in either tab", not pg.evaluate("!document.querySelector('#toast').hidden") and not pg2.evaluate("!document.querySelector('#toast').hidden"))
    pg2.close()

    # ---- 2e. refresh with unsaved text (inside the 900 ms debounce) ----
    pg.click('[data-go="1"]')
    pg.fill("#ans", "unsaved then refresh")
    pg.reload()  # dialog handler accepts beforeunload
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    pg.click('[data-go="1"]')
    check("2e refresh with unsaved text: text still in the box", pg.input_value("#ans") == "unsaved then refresh", pg.input_value("#ans"))
    ok = wait_for(lambda: review(eid)["questions"][1]["final"] == "unsaved then refresh", 8)
    check("2e ...and it reaches the server after the reload", ok is not None, review(eid)["questions"][1]["final"])

    # ---- 2f. close the tab with unsaved text while offline (beforeunload warning) ----
    pg3 = ctx.new_page(); el.attach(pg3, "2f ")
    dialogs = []
    pg3.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
    pg3.goto(link(tok))
    wait_for(lambda: pg3.locator("#ans").count() > 0, 10)
    pg3.click('[data-go="3"]')
    ctx.set_offline(True)
    pg3.fill("#ans", "closing while offline")
    time.sleep(1.5)
    pg3.close(run_before_unload=True)
    time.sleep(1)
    check("2f closing a tab with unsent text shows the browser's leave warning", "beforeunload" in dialogs, dialogs)
    ctx.set_offline(False)
    # the draft lives in localStorage: reopen the link and it should be sent
    pg4 = ctx.new_page(); el.attach(pg4, "2f-reopen ")
    pg4.goto(link(tok))
    wait_for(lambda: pg4.locator("#ans").count() > 0, 10)
    pg4.click('[data-go="3"]')
    check("2f reopening the link after closing offline: text is back in the box", pg4.input_value("#ans") == "closing while offline", pg4.input_value("#ans"))
    ok = wait_for(lambda: review(eid)["questions"][3]["final"] == "closing while offline", 8)
    check("2f ...and reaches the server", ok is not None)

    # ---- 2g. slow server (2 s per request), fast typing: last text wins, no out-of-order ----
    def slow(route):
        time.sleep(2.0); route.continue_()
    ctx.route(API + "/api/s/answers/**", slow)
    pg4.click('[data-go="0"]')
    for i in range(1, 6):
        pg4.fill("#ans", "slow %d" % i)
        time.sleep(0.4)
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "slow 5", 20)
    revs = [r["text"] for r in review(eid)["questions"][0]["revisions"] if r["text"].startswith("slow")]
    check("2g slow server: the last typed text is what the server keeps", ok is not None, revs)
    check("2g slow server: label settles on Saved", wait_for(lambda: pg4.inner_text(".ex-save").startswith("Saved"), 8) is not None, pg4.inner_text(".ex-save"))
    ctx.unroute(API + "/api/s/answers/**")

    # ---- 2h. the server rejects a save with 500: is the work kept and retried? ----
    calls = {"n": 0}
    def five(route):
        calls["n"] += 1
        if calls["n"] <= 2:
            route.fulfill(status=500, content_type="application/json", body='{"error":"boom"}')
        else:
            route.continue_()
    ctx.route(API + "/api/s/answers/**", five)
    pg4.fill("#ans", "after a 500")
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "after a 500", 25)
    check("2h a 500 from the server is retried and the text arrives", ok is not None, calls["n"])
    ctx.unroute(API + "/api/s/answers/**")

    # ---- 2i. 429 from the server ----
    calls["n"] = 0
    def tmr(route):
        calls["n"] += 1
        if calls["n"] <= 1:
            route.fulfill(status=429, content_type="application/json", body='{"error":"slow down"}')
        else:
            route.continue_()
    ctx.route(API + "/api/s/answers/**", tmr)
    pg4.fill("#ans", "after a 429")
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "after a 429", 25)
    check("2i a 429 is retried", ok is not None, calls["n"])
    ctx.unroute(API + "/api/s/answers/**")

    b.close()

check("2 no script errors", not el.errors, el.errors)
finish("s2_saving")
