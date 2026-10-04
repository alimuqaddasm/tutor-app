"""Scenario 2 continued: close with unsaved text (beforeunload), slow server, 500, 429."""
import time
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
with sync_playwright() as p:
    b = launch(p)
    eid, tok = make_exam(minutes=30, title="Saving test 2", start=True)

    # ---- 2f. close the tab with unsent text (offline) ----
    ctx = context(b)
    pg3 = ctx.new_page(); el.attach(pg3, "2f ")
    dialogs = []
    pg3.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
    pg3.goto(link(tok))
    wait_for(lambda: pg3.locator("#ans").count() > 0, 10)
    pg3.click('[data-go="3"]')
    pg3.click("#ans")  # real user gesture so Chromium allows the leave prompt
    ctx.set_offline(True)
    pg3.keyboard.type("closing while offline")
    time.sleep(1.5)
    try:
        pg3.close(run_before_unload=True)
    except Exception as e:
        note("2f close raised %r" % e)
    time.sleep(1)
    check("2f closing a tab with unsent text shows the browser's leave warning", "beforeunload" in dialogs, dialogs)
    try:
        ctx.set_offline(False)
    except Exception as e:
        note("2f set_offline after close raised %r; using a new context" % e)
        ctx = context(b)
    pg4 = ctx.new_page(); el.attach(pg4, "2f-reopen ")
    pg4.goto(link(tok))
    wait_for(lambda: pg4.locator("#ans").count() > 0, 10)
    pg4.click('[data-go="3"]')
    check("2f reopening the link after closing offline: text is back in the box", pg4.input_value("#ans") == "closing while offline", pg4.input_value("#ans"))
    ok = wait_for(lambda: review(eid)["questions"][3]["final"] == "closing while offline", 8)
    check("2f ...and reaches the server", ok is not None)

    # ---- 2f2. close the tab with unsent text while ONLINE (inside the debounce): does the save get out? ----
    pg5 = ctx.new_page(); el.attach(pg5, "2f2 ")
    d2 = []
    pg5.on("dialog", lambda d: (d2.append(d.type), d.accept()))
    pg5.goto(link(tok))
    wait_for(lambda: pg5.locator("#ans").count() > 0, 10)
    pg5.click('[data-go="2"]')
    pg5.click("#ans")
    pg5.keyboard.type("closed at once")
    pg5.close(run_before_unload=True)
    time.sleep(2)
    check("2f2 close right after typing (online): leave warning shown", "beforeunload" in d2, d2)
    srv = review(eid)["questions"][2]["final"]
    check("2f2 close right after typing (online): the text reached the server anyway", srv == "closed at once", srv)

    # ---- 2g. slow server (2 s per request), fast typing ----
    pg4.bring_to_front()
    def slow(route):
        time.sleep(2.0); route.continue_()
    ctx.route(API + "/api/s/answers/**", slow)
    pg4.click('[data-go="0"]')
    for i in range(1, 6):
        pg4.fill("#ans", "slow %d" % i)
        time.sleep(0.4)
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "slow 5", 25)
    revs = [r["text"] for r in review(eid)["questions"][0]["revisions"] if r["text"].startswith("slow")]
    check("2g slow server: the last typed text is what the server keeps", ok is not None, revs)
    check("2g slow server: label settles on Saved", wait_for(lambda: pg4.inner_text(".ex-save").startswith("Saved"), 10) is not None, pg4.inner_text(".ex-save"))
    ctx.unroute(API + "/api/s/answers/**")

    # ---- 2h. 500 twice then ok ----
    calls = {"n": 0}
    def five(route):
        calls["n"] += 1
        if calls["n"] <= 2:
            route.fulfill(status=500, content_type="application/json", body='{"error":"boom"}')
        else:
            route.continue_()
    ctx.route(API + "/api/s/answers/**", five)
    pg4.fill("#ans", "after a 500")
    time.sleep(1.5)
    note("2h label during 500s: %r" % pg4.inner_text(".ex-save"))
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "after a 500", 25)
    check("2h a 500 from the server is retried and the text arrives", ok is not None, calls["n"])
    ctx.unroute(API + "/api/s/answers/**")

    # ---- 2i. 429 once ----
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

    # ---- 2j. a 400-class error other than 413 (e.g. question deleted -> 404): what happens to the text ----
    def nf(route):
        route.fulfill(status=404, content_type="application/json", body='{"error":"No such question."}')
    ctx.route(API + "/api/s/answers/**", nf)
    pg4.fill("#ans", "lost to a 404?")
    time.sleep(2.5)
    note("2j label after a 404 on save: %r (toast hidden=%s)" % (pg4.inner_text(".ex-save"), pg4.evaluate("document.querySelector('#toast').hidden")))
    ctx.unroute(API + "/api/s/answers/**")
    time.sleep(6)
    srv = review(eid)["questions"][0]["final"]
    check("2j after a one-off 4xx the text is still retried later", srv == "lost to a 404?", "server has %r" % srv)

    b.close()

check("2b no script errors", not el.errors, el.errors)
finish("s2b_saving")
