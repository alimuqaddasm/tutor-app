"""Scenario 3: pictures. Big, tiny, wrong types, 21 per question, remove, remove offline, drawing, phone page."""
import time
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
with sync_playwright() as p:
    b = launch(p)
    eid, tok = make_exam(minutes=30, title="Pictures test", start=True)
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "3 ")
    toasts = []
    pg.goto(link(tok))
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    check("3 DOMPurify loaded (question HTML renders as HTML, not tags)", pg.evaluate("typeof DOMPurify") == "object" and pg.locator(".ex-qtext p").count() == 1, pg.inner_text(".ex-qtext"))
    pg.click('[data-go="1"]')  # q2 upload_optional

    def toast_watch():
        return pg.evaluate("(function(){var t=document.querySelector('#toast');return t.hidden?null:t.textContent})()")

    def n_saved():
        return len([u for u in review(eid)["questions"][1]["uploads"]])

    # ---- big 6000x6000 PNG ----
    t0 = time.time()
    bigpng = png(6000, 6000, (200, 220, 240))
    note("3 6000x6000 PNG made in %.1fs, %d bytes" % (time.time() - t0, len(bigpng)))
    t0 = time.time()
    pg.set_input_files("[data-file]", files=[{"name": "big.png", "mimeType": "image/png", "buffer": bigpng}])
    ok = wait_for(lambda: n_saved() == 1, 30)
    up = review(eid)["questions"][1]["uploads"]
    check("3 6000x6000 PNG is shrunk and accepted", ok is not None, "took %.1fs" % (time.time() - t0))
    if up:
        check("3 ...stored at most 2000 px, as JPEG", up[0]["width"] <= 2000 and up[0]["height"] <= 2000 and up[0]["mime"] == "image/jpeg", up[0])
        note("3 big upload stored: %s" % {k: up[0][k] for k in ("mime", "bytes", "width", "height")})
    check("3 ...the card appears without 'waiting'", wait_for(lambda: pg.locator(".ex-pic:not(.pending)").count() == 1, 8) is not None)

    # ---- tiny 1x1 ----
    pg.set_input_files("[data-file]", files=[{"name": "tiny.png", "mimeType": "image/png", "buffer": png(1, 1)}])
    ok = wait_for(lambda: n_saved() == 2, 10)
    check("3 1x1 PNG accepted", ok is not None)

    # ---- wrong types ----
    cases = [("notes.jpg", "image/jpeg", b"this is plain text pretending to be a jpeg"),
             ("scan.pdf", "application/pdf", b"%PDF-1.4\n%fake"),
             ("anim.gif", "image/gif", gif()),
             ("pic.webp", "image/webp", webp()),
             ("photo.heic", "image/heic", b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200),
             ("photo.HEIC", "", b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200)]
    for name, mime, buf in cases:
        before = n_saved()
        pg.evaluate("document.querySelector('#toast').hidden=true")
        pg.set_input_files("[data-file]", files=[{"name": name, "mimeType": mime, "buffer": buf}])
        msg = wait_for(toast_watch, 6)
        time.sleep(1.5)
        after = n_saved()
        pend = pg.locator(".ex-pic.pending").count()
        note("3 %s (%s): toast=%r saved %d->%d pending=%d" % (name, mime or "no type", msg, before, after, pend))
        if name in ("anim.gif", "pic.webp"):
            check("3 %s converts and uploads" % name, after == before + 1, "toast %r" % msg)
        else:
            check("3 %s is refused with a clear message" % name, after == before and msg and ("picture" in msg.lower()), "toast %r" % msg)
    shot(pg, "s3-wrongtype")

    # ---- 21 pictures to one question ----
    pg.click('[data-go="3"]')  # q4 upload_required, empty so far
    for i in range(20):
        sapi("POST", "/api/s/uploads/q4", tok, raw=png(50, 40, (i * 10, 100, 100)), headers={"Content-Type": "image/png"})
    try:
        sapi("POST", "/api/s/uploads/q4", tok, raw=png(50, 40), headers={"Content-Type": "image/png"})
        check("3 server refuses the 21st picture", False)
    except ApiError as e:
        check("3 server refuses the 21st picture with 409", e.status == 409, e.body)
    time.sleep(3.5)  # poll
    check("3 the 20 pictures show on the page", wait_for(lambda: pg.locator('.ex-pic').count() == 20, 8) is not None, pg.locator(".ex-pic").count())
    pg.evaluate("document.querySelector('#toast').hidden=true")
    pg.set_input_files("[data-file]", files=[{"name": "p21.png", "mimeType": "image/png", "buffer": png(60, 60)}])
    msg = wait_for(toast_watch, 8)
    check("3 21st picture from the page: student is told why", msg is not None and "20" in (msg or ""), msg)
    time.sleep(1)
    check("3 21st picture: no card left waiting", pg.locator(".ex-pic.pending").count() == 0)
    shot(pg, "s3-21pics", full=True)
    # the dot/nav: is a 20-picture grid usable? measure page height
    note("3 page height with 20 pictures: %d px" % pg.evaluate("document.documentElement.scrollHeight"))

    # ---- remove a picture ----
    pg.click('[data-go="1"]')
    confirms = []
    pg.on("dialog", lambda d: (confirms.append(d.message), d.accept()))
    n0 = n_saved()
    pg.locator("[data-rm]").first.click()
    ok = wait_for(lambda: n_saved() == n0 - 1, 8)
    check("3 Remove asks first and removes the picture", ok is not None and confirms and "Remove" in confirms[0], confirms)
    check("3 ...card gone from the page", wait_for(lambda: pg.locator(".ex-pic").count() == n0 - 1, 5) is not None, pg.locator(".ex-pic").count())

    # ---- remove while offline ----
    ctx.set_offline(True)
    n0 = n_saved()
    pg.evaluate("document.querySelector('#toast').hidden=true")
    pg.locator("[data-rm]").first.click()
    msg = wait_for(toast_watch, 6)
    time.sleep(1)
    check("3 remove while offline: picture stays and the student is told", pg.locator(".ex-pic").count() == n0 and msg, "toast %r cards %d" % (msg, pg.locator(".ex-pic").count()))
    note("3 offline-remove toast text: %r" % msg)
    ctx.set_offline(False)
    time.sleep(1)
    check("3 ...and it is not removed later on its own", n_saved() == n0)

    # ---- add a picture while offline, then back ----
    ctx.set_offline(True)
    pg.set_input_files("[data-file]", files=[{"name": "off.png", "mimeType": "image/png", "buffer": png(80, 80, (10, 200, 10))}])
    ok = wait_for(lambda: pg.locator(".ex-pic.pending").count() == 1, 6)
    check("3 picture chosen offline shows as waiting to send", ok is not None, pg.inner_text(".ex-save"))
    shot(pg, "s3-offline-pending")
    # reload while offline: is the waiting picture still there (IndexedDB outbox)?
    pg.reload()
    wait_for(lambda: pg.locator("#ans").count() > 0 or "Connecting" in pg.inner_text("#ex"), 10)
    note("3 offline reload shows: %r" % pg.inner_text("#ex")[:80])
    ctx.set_offline(False)
    ok = wait_for(lambda: n_saved() == n0 + 1, 20)
    check("3 picture chosen offline is sent after reconnect (even across a reload)", ok is not None)

    # ---- drawing ----
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    pg.click('[data-go="1"]')
    pg.click("[data-draw]")
    cv = pg.locator(".ex-draw canvas").bounding_box()
    pg.mouse.move(cv["x"] + 40, cv["y"] + 40); pg.mouse.down()
    for i in range(20):
        pg.mouse.move(cv["x"] + 40 + i * 15, cv["y"] + 40 + (i % 5) * 20)
    pg.mouse.up()
    shot(pg, "s3-draw-dialog")
    confirms.clear()
    pg.click("[data-x]")  # cancel with strokes
    time.sleep(0.5)
    check("3 Cancel with strokes asks first", confirms and "without adding" in confirms[0], confirms)
    check("3 ...and closes after Yes", pg.locator(".ex-draw").count() == 0)
    n0 = n_saved()
    pg.click("[data-draw]")
    cv = pg.locator(".ex-draw canvas").bounding_box()
    pg.mouse.move(cv["x"] + 40, cv["y"] + 40); pg.mouse.down(); pg.mouse.move(cv["x"] + 300, cv["y"] + 200); pg.mouse.up()
    pg.click("[data-save]")
    ok = wait_for(lambda: n_saved() == n0 + 1 and review(eid)["questions"][1]["uploads"][-1]["source"] == "drawing", 10)
    check("3 drawing is added as a picture (source drawing)", ok is not None)
    up = review(eid)["questions"][1]["uploads"][-1]
    note("3 drawing stored: %s" % {k: up[k] for k in ("mime", "bytes", "width", "height")})
    pg.click("[data-draw]")
    confirms.clear()
    pg.click("[data-save]")  # nothing drawn
    msg = wait_for(toast_watch, 3)
    check("3 Add with an empty drawing: told to draw first", msg == "Draw something first", msg)
    pg.click("[data-x]")

    # ---- phone page ----
    ptok = sapi("POST", "/api/s/phone-token/q2", tok)["token"]
    pctx = context(b, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=3)
    ph = pctx.new_page(); el.attach(ph, "3-phone ")
    ph.goto(plink(ptok))
    ok = wait_for(lambda: "Question 2" in ph.inner_text("#ex"), 8)
    check("3 phone page opens and names question 2", ok is not None, ph.inner_text("#ex")[:100])
    shot(ph, "s3-phone-390")
    n0 = n_saved()
    ph.set_input_files("[data-cam]", files=[{"name": "photo.png", "mimeType": "image/png", "buffer": png(1200, 1600, (200, 60, 40))}])
    ok = wait_for(lambda: "Sent" in ph.inner_text("#phpics"), 10)
    check("3 phone photo sent", ok is not None, ph.inner_text("#phpics"))
    check("3 ...appears on the student page within a poll", wait_for(lambda: pg.locator('.ex-pic').count() >= 1 and any(u["source"] == "phone" for u in review(eid)["questions"][1]["uploads"]), 8) is not None)
    time.sleep(3.5)
    check("3 ...student page shows the Phone card", "Phone" in pg.inner_text(".ex-pics"), pg.inner_text(".ex-pics")[:200])
    # phone page when the exam is locked
    tctx = context(b, teacher=True)
    tp = tctx.new_page(); el.attach(tp, "3-teacher ")
    tp.goto(APP + "#/exams/" + eid)
    ok = wait_for(lambda: "picture" in tp.inner_text('tr[data-q="q2"] [data-saved]'), 10)
    check("3 teacher page counts the pictures against q2", ok is not None, tp.inner_text('tr[data-q="q2"] [data-saved]'))
    tp.goto(APP + "#/exams/" + eid + "/mark")
    ok = wait_for(lambda: tp.locator('[data-mq="q2"] .xt-pics img').count() >= 1 and tp.locator('[data-mq="q2"] .xt-pics img').first.evaluate("i=>i.naturalWidth>0"), 15)
    check("3 marking page shows the phone picture", ok is not None, tp.locator('[data-mq="q2"] .xt-pics img').count())
    note("3 marking page q4 shows %d pictures" % tp.locator('[data-mq="q4"] .xt-pics img').count())
    shot(tp, "s3-mark-pics", full=True)
    # phone page after lock
    api("POST", "/api/t/exams/%s/lock" % eid)
    ph.reload()
    ok = wait_for(lambda: "not open" in ph.inner_text("#ex"), 8)
    check("3 phone page after lock says the exam is not open", ok is not None, ph.inner_text("#ex")[:120])
    # phone page without a reload after lock: does it learn about the lock by itself?
    api("POST", "/api/t/exams/%s/reopen" % eid)
    ph.reload(); wait_for(lambda: "Take a photo" in ph.inner_text("#ex"), 8)
    api("POST", "/api/t/exams/%s/lock" % eid)
    time.sleep(12)
    stale = "Take a photo" in ph.inner_text("#ex")
    check("3 phone page learns about the lock without a reload", not stale, "still shows Take a photo 12 s after lock" if stale else "")
    ph.set_input_files("[data-cam]", files=[{"name": "late.png", "mimeType": "image/png", "buffer": png(100, 100)}]) if stale else None
    if stale:
        msg = wait_for(lambda: (lambda t: t if t and t != "Photo sent" else None)(ph.evaluate("(function(){var t=document.querySelector('#toast');return t.hidden?null:t.textContent})()")), 8)
        note("3 phone upload after lock (stale page) toast: %r" % msg)
        shot(ph, "s3-phone-stale-lock")

    b.close()

check("3 no script errors", not el.errors, el.errors)
finish("s3_pictures")
