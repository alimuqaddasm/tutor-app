"""Scenario 4: hand in. With pending pictures, offline, reopen after hand in, lock then reopen, accidental-hit geometry."""
import time
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
toast_js = "(function(){var t=document.querySelector('#toast');return t.hidden?null:t.textContent})()"
with sync_playwright() as p:
    b = launch(p)
    eid, tok = make_exam(minutes=30, title="Hand in test", start=True)
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "4 ")
    pg.goto(link(tok))
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    pg.fill("#ans", "pi/6")
    wait_for(lambda: review(eid)["questions"][0]["final"] == "pi/6", 6)

    # ---- empty-question warning ----
    pg.click("[data-handin]")
    txt = pg.inner_text(".ex-box")
    check("4 hand-in dialog warns about unanswered questions", "3 questions have no answer" in txt, txt)
    shot(pg, "s4-handin-dialog")
    pg.click(".ex-box [data-x]")
    check("4 Keep working closes the dialog", pg.locator(".ex-box").count() == 0)

    # ---- hand in with a pending picture (offline) ----
    pg.click('[data-go="1"]')
    ctx.set_offline(True)
    pg.set_input_files("[data-file]", files=[{"name": "a.png", "mimeType": "image/png", "buffer": png(200, 200)}])
    wait_for(lambda: pg.locator(".ex-pic.pending").count() == 1, 6)
    pg.click("[data-handin]")
    txt = pg.inner_text(".ex-box")
    check("4 hand in with a picture still sending: warned and button disabled", "still sending" in txt and pg.locator(".ex-box [data-ok]").is_disabled(), txt)
    shot(pg, "s4-handin-pending")
    pg.click(".ex-box [data-x]")
    ctx.set_offline(False)
    wait_for(lambda: len(review(eid)["questions"][1]["uploads"]) == 1, 15)

    # ---- hand in while offline with unsent text ----
    pg.click('[data-go="2"]')
    ctx.set_offline(True)
    pg.fill("#ans", "offline text")
    time.sleep(0.3)
    pg.click("[data-handin]")
    t0 = time.time()
    pg.click(".ex-box [data-ok]")
    msg = wait_for(lambda: pg.evaluate(toast_js), 30, 0.2)
    dt = time.time() - t0
    check("4 hand in while offline (unsent text): refused with a clear message", msg is not None and "offline" in (msg or "").lower(), "toast %r after %.1fs" % (msg, dt))
    note("4 offline hand-in: dialog stayed %.1fs before the message; dialog still open=%s" % (dt, pg.locator(".ex-box").count() > 0))
    check("4 ...within 5 s", dt < 5, "%.1fs" % dt)
    check("4 ...not submitted on the server", live(eid)["status"] == "running")
    # hand in while offline with nothing unsent
    ctx.set_offline(False)
    wait_for(lambda: review(eid)["questions"][2]["final"] == "offline text", 10)
    ctx.set_offline(True)
    time.sleep(0.5)
    pg.evaluate("document.querySelector('#toast').hidden=true")
    if pg.locator(".ex-box").count() == 0:
        pg.click("[data-handin]")
    pg.click(".ex-box [data-ok]")
    msg = wait_for(lambda: pg.evaluate(toast_js), 15, 0.2)
    check("4 hand in while offline (all saved): student gets a plain-English message, not 'Failed to fetch'", msg is not None and "fetch" not in (msg or "").lower(), "toast %r" % msg)
    shot(pg, "s4-handin-offline-toast")
    ctx.set_offline(False)
    time.sleep(1)

    # ---- hand in for real ----
    if pg.locator(".ex-box").count() == 0:
        pg.click("[data-handin]")
    pg.click(".ex-box [data-ok]")
    ok = wait_for(lambda: pg.locator("#ans").is_disabled(), 8)
    check("4 hand in: inputs disabled", ok is not None)
    check("4 hand in: timer reads Handed in and banner says so", "Handed in" in pg.inner_text(".ex-timer") and "handed in" in pg.inner_text(".ex-bannerslot"), (pg.inner_text(".ex-timer"), pg.inner_text(".ex-bannerslot")))
    check("4 hand in: attach buttons and Hand in button hidden", pg.locator(".ex-attach").is_hidden() and pg.locator("[data-handin]").count() == 0)
    shot(pg, "s4-submitted")
    check("4 hand in: server status submitted", live(eid)["status"] == "submitted")
    # a late save attempt from this device is refused
    try:
        sapi("PUT", "/api/s/answers/q1", tok, {"text": "sneaky", "seq": 99})
        check("4 saves after hand in are refused", False)
    except ApiError as e:
        check("4 saves after hand in are refused (409)", e.status == 409, e.body)

    # ---- teacher reopens ----
    api("POST", "/api/t/exams/%s/reopen" % eid)
    ok = wait_for(lambda: not pg.locator("#ans").is_disabled(), 15)
    check("4 reopen after hand in: the student can continue without a refresh", ok is not None)
    check("4 reopen: timer counts again", ":" in pg.inner_text(".ex-timer"), pg.inner_text(".ex-timer"))
    check("4 reopen: 'handed in' banner gone", "handed in" not in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    pg.click('[data-go="0"]')
    pg.fill("#ans", "pi/6 after reopen")
    ok = wait_for(lambda: review(eid)["questions"][0]["final"] == "pi/6 after reopen", 8)
    check("4 reopen: typing saves again", ok is not None)
    check("4 reopen: Hand in button is back", pg.locator("[data-handin]").count() == 1 and pg.locator("[data-handin]").is_visible())

    # ---- lock then reopen ----
    api("POST", "/api/t/exams/%s/lock" % eid)
    ok = wait_for(lambda: "exam has ended" in pg.inner_text("#ex"), 15)
    check("4 lock: student sees 'The exam has ended'", ok is not None)
    shot(pg, "s4-locked")
    api("POST", "/api/t/exams/%s/reopen" % eid)
    ok = wait_for(lambda: pg.locator("#ans").count() > 0 and not pg.locator("#ans").is_disabled(), 15)
    check("4 reopen after lock: exam screen is back and open", ok is not None)
    check("4 reopen after lock: the answer is still there", wait_for(lambda: pg.input_value("#ans") == "pi/6 after reopen", 5) is not None, pg.input_value("#ans"))

    # ---- lock while the student has unsent text: is it lost? ----
    ctx.set_offline(True)
    pg.fill("#ans", "typed just before lock")
    api("POST", "/api/t/exams/%s/lock" % eid)
    time.sleep(1)
    ctx.set_offline(False)
    wait_for(lambda: "exam has ended" in pg.inner_text("#ex"), 15)
    srv = review(eid)["questions"][0]["final"]
    note("4 lock with unsent offline text: server has %r; locked screen says: %r" % (srv, pg.inner_text("#ex")[:160]))
    check("4 lock with unsent text: the student is told that some text did not arrive", srv == "typed just before lock" or "not" in pg.inner_text("#ex").lower().split("saved")[0][-40:], pg.inner_text("#ex")[:160])

    # ---- accidental hit: geometry of the bottom bar at phone width ----
    api("POST", "/api/t/exams/%s/reopen" % eid)
    pg.set_viewport_size({"width": 390, "height": 844})
    wait_for(lambda: pg.locator("[data-handin]").count() > 0, 15)
    hb = pg.locator("[data-handin]").bounding_box(); nb = pg.locator("[data-next]").bounding_box(); pb = pg.locator("[data-prev]").bounding_box()
    gap = nb["x"] - (hb["x"] + hb["width"])
    note("4 390px bottom bar: Previous %s Hand in %s Next %s gap handin->next %.0f px" % (pb, hb, nb, gap))
    check("4 Hand in is at least 16 px away from Next at phone width", gap >= 16, "gap %.0f px" % gap)
    check("4 Hand in looks different from Next (not the accent button)", "accent" not in (pg.locator("[data-handin]").get_attribute("class") or ""))
    shot(pg, "s4-390-bottombar")
    b.close()

check("4 no script errors", not el.errors, el.errors)
finish("s4_handin")
