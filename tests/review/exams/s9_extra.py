"""Extra checks: comment autosave timing, 'He hasn't opened the link yet' vs 'Last seen', time-up banner visibility when scrolled, late-flag of pictures, phone QR dialog poll leak."""
import time
from playwright.sync_api import sync_playwright
from common import *
el = ErrLog()
with sync_playwright() as p:
    b = launch(p)
    # comment autosave timing (precise)
    eid, tok = make_exam(minutes=30, title="Extra", start=True)
    sapi("PUT", "/api/s/answers/q1", tok, {"text": "x", "seq": 1})
    tctx = context(b, teacher=True); tp = tctx.new_page(); el.attach(tp, "9t ")
    tp.goto(APP + "#/exams/" + eid + "/mark"); wait_for(lambda: tp.locator("section.xt-mq").count() == 4, 15)
    tp.click('[data-comment="q1"]'); tp.keyboard.type("timing test"); t0 = time.time()
    ok = wait_for(lambda: review(eid)["questions"][0]["comment"] == "timing test", 8, 0.05)
    note("9 comment reached the server %.2f s after the last keystroke" % (time.time() - t0))
    check("9 comment autosaves within 2.5 s of the last keystroke", ok is not None and time.time() - t0 < 2.5)
    # leaving the marking page with a comment pending: script error at exams.js:369?
    tp.click('[data-comment="q2"]'); tp.keyboard.type("leave now")
    tp.goto(APP + "#/exams"); time.sleep(2.5)
    check("9 leaving the marking page right after typing a comment causes no script error", not el.errors, el.errors)
    note("9 q2 comment on server after leaving: %r" % review(eid)["questions"][1]["comment"])
    # 'He hasn't opened the link yet' vs 'Last seen'
    eid2, tok2 = make_exam(minutes=30, title="Seen test")
    sapi("GET", "/api/s/state", tok2); time.sleep(12)
    tp.goto(APP + "#/exams/" + eid2); wait_for(lambda: tp.locator("#xt-btns").count() == 1, 10); time.sleep(0.5)
    btn = tp.inner_text("#xt-btns"); seen = tp.inner_text("#xt-seen")
    check("9 waiting page does not say 'hasn't opened' while also saying 'Last seen N s ago'", not ("hasn" in btn and "Last seen" in seen), (btn, seen))
    shot(tp, "s9-seen-contradiction")
    tctx.close()
    # time-up banner visible when the student is scrolled down typing (phone)
    eid3, tok3 = make_exam(minutes=0.4, title="Banner test", start=True)
    ctx = context(b, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); el.attach(pg, "9s ")
    pg.goto(link(tok3)); wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    pg.click('[data-go="2"]'); pg.click("#ans"); pg.keyboard.type("typing away " * 30)
    pg.evaluate("document.querySelector('#ans').scrollIntoView({block:'center'})")
    wait_for(lambda: "Time is up" in pg.inner_text(".ex-timer"), 30)
    time.sleep(0.5)
    bb = pg.locator(".ex-banner").bounding_box()
    vis = bb and bb["y"] + bb["height"] > 0 and bb["y"] < 844
    check("9 at time up, the 'keep working' banner is on screen for a student scrolled down typing", bool(vis), bb)
    shot(pg, "s9-timeup-scrolled")
    # picture after original end is flagged late on the marking page
    sapi("POST", "/api/s/uploads/q2", tok3, raw=png(50, 50), headers={"Content-Type": "image/png"})
    r = review(eid3)["questions"][1]["uploads"]
    check("9 picture sent after time up is flagged late", r and r[-1]["late"], r)
    # phone QR dialog: fast poll stops when closed with Escape? (close via Escape bypasses the wrapped close)
    reqs = []
    pg.on("request", lambda rq: reqs.append(rq.url))
    pg.click("[data-phone]"); wait_for(lambda: pg.locator(".ex-qr").count() == 1, 6)
    pg.keyboard.press("Escape"); time.sleep(0.3)
    check("9 Escape closes the phone dialog", pg.locator(".ex-box").count() == 0)
    reqs.clear(); pg.wait_for_timeout(12000)
    n = len([u for u in reqs if "/api/s/state" in u])
    check("9 after closing the phone dialog with Escape, polling is back to every 3 s (about 4 in 12 s)", n <= 5, "%d state polls in 12 s" % n)
    b.close()
check("9 no script errors", not el.errors, el.errors)
finish("s9_extra")
