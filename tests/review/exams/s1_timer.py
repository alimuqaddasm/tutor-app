"""Scenario 1: timer. Refresh, clock drift, sleep/offline, time up, +5 min, +5 after time up."""
import re, time
from playwright.sync_api import sync_playwright
from common import *


def timer_secs(txt):
    m = re.match(r"^(?:(\d+):)?(\d+):(\d\d)$", txt.strip())
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h or 0) * 3600 + int(mi) * 60 + int(s)


def server_left(eid):
    d = live(eid)
    return (d["endAt"] - d["serverNow"]) / 1000.0, d


el = ErrLog()
with sync_playwright() as p:
    b = launch(p)

    # ---- 1a. refresh mid exam ----
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "1a ")
    eid, tok = make_exam(minutes=10, title="Timer refresh", start=True)
    pg.goto(link(tok))
    wait_for(lambda: pg.locator(".ex-timer").count() > 0, 10)
    pg.fill("#ans", "before refresh")
    wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 6)
    t_before = timer_secs(pg.inner_text(".ex-timer")); sl, _ = server_left(eid)
    pg.reload()
    wait_for(lambda: pg.locator(".ex-timer").count() > 0 and timer_secs(pg.inner_text(".ex-timer")) is not None, 10)
    t_after = timer_secs(pg.inner_text(".ex-timer")); sl2, _ = server_left(eid)
    check("1a refresh: countdown continues (page vs server within 2 s)", t_after is not None and abs(t_after - sl2) <= 2, "page %s server %.1f" % (t_after, sl2))
    check("1a refresh: typed answer is still there", pg.input_value("#ans") == "before refresh", pg.input_value("#ans"))
    ctx.close()

    # ---- 1b. device clock drift +5 min and -5 min ----
    for drift in (5 * 60000, -5 * 60000):
        ctx = context(b)
        ctx.add_init_script("(function(){var r=Date.now.bind(Date);Date.now=function(){return r()+%d};var D=Date;window.Date=function(){if(arguments.length)return new D(...arguments);return new D(r()+%d)};window.Date.prototype=D.prototype;window.Date.now=function(){return r()+%d};window.Date.UTC=D.UTC;window.Date.parse=D.parse;})();" % (drift, drift, drift))
        pg = ctx.new_page(); el.attach(pg, "1b ")
        pg.goto(link(tok))
        wait_for(lambda: pg.locator(".ex-timer").count() > 0 and timer_secs(pg.inner_text(".ex-timer")) is not None, 10)
        time.sleep(1)
        t = timer_secs(pg.inner_text(".ex-timer")); sl, _ = server_left(eid)
        check("1b clock drift %+d min: timer shows server time (within 2 s)" % (drift // 60000), t is not None and abs(t - sl) <= 2, "page %s server %.1f" % (t, sl))
        shot(pg, "s1-drift-%s" % ("plus" if drift > 0 else "minus"))
        # the "Saved hh:mm" label uses server savedAt converted with the (drifted) local clock
        pg.fill("#ans", "drift " + str(drift))
        wait_for(lambda: pg.inner_text(".ex-save").startswith("Saved"), 6)
        note("1b drift %+d: save label reads '%s' (local wall clock is drifted, so this label follows the device clock)" % (drift // 60000, pg.inner_text(".ex-save")))
        ctx.close()

    # ---- 1c. sleep: offline 40 s, teacher adds time meanwhile, come back ----
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "1c ")
    pg.goto(link(tok))
    wait_for(lambda: pg.locator(".ex-timer").count() > 0 and timer_secs(pg.inner_text(".ex-timer")) is not None, 10)
    ctx.set_offline(True)
    time.sleep(3)
    pg.fill("#ans", "typed while asleep")
    api("POST", "/api/t/exams/%s/extend" % eid, {"minutes": 5})
    time.sleep(37)
    off_txt = pg.inner_text(".ex-save")
    check("1c offline 40 s: page says offline/kept", "Offline" in off_txt, off_txt)
    shot(pg, "s1-offline40")
    ctx.set_offline(False)
    t0 = time.time()
    got = wait_for(lambda: abs(timer_secs(pg.inner_text(".ex-timer")) - server_left(eid)[0]) <= 2 and pg.inner_text(".ex-save").startswith("Saved"), 40, 0.5)
    check("1c back online: timer picks up the +5 and the answer is sent (no manual online event)", got is not None, "took %.1fs, timer %s save %s" % (time.time() - t0, pg.inner_text(".ex-timer"), pg.inner_text(".ex-save")))
    note("1c recovery took %.1f s after reconnect" % (time.time() - t0))
    r = review(eid)["questions"][0]["final"]
    check("1c answer typed offline reached the server", r == "typed while asleep", r)
    check("1c banner shows the added time after reconnect", "added 5" in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    ctx.close()

    # ---- 1d. time up on a 0.5 minute exam; keep typing; +5 after time up ----
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "1d ")
    eid2, tok2 = make_exam(minutes=0.5, title="Time up test")
    pg.goto(link(tok2))
    wait_for(lambda: "will start" in pg.inner_text("#ex"), 8)
    st = api("POST", "/api/t/exams/%s/start" % eid2)
    end_at = st["endAt"] / 1000.0
    wait_for(lambda: pg.locator("#ans").count() > 0, 8)
    pg.fill("#ans", "in time")
    wait_for(lambda: review(eid2)["questions"][0]["final"] == "in time", 6)
    got = wait_for(lambda: "Time is up" in pg.inner_text(".ex-timer"), 45, 0.1)
    seen_at = time.time()
    srv_now = api("GET", "/api/t/check")["serverNow"] / 1000.0
    check("1d 'Time is up' appears within 3 s of the real end", got is not None and abs(srv_now - end_at) <= 3, "shown %.1f s after server end" % (srv_now - end_at))
    check("1d time-up banner says he can keep working", "keep working" in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    check("1d answer box still enabled after time up", not pg.locator("#ans").is_disabled())
    shot(pg, "s1-timeup")
    pg.fill("#ans", "in time and late")
    r = wait_for(lambda: (lambda q: q if q["final"] == "in time and late" else None)(review(eid2)["questions"][0]), 8)
    check("1d typing after time up is saved and flagged late", r is not None and r["writtenLate"] and r["atOriginalEnd"] == "in time", r and {k: r[k] for k in ("final", "writtenLate", "atOriginalEnd")})
    # teacher status
    check("1d teacher live status is timeup", live(eid2)["status"] == "timeup")
    # +5 after time up
    ext = api("POST", "/api/t/exams/%s/extend" % eid2, {"minutes": 5})
    got = wait_for(lambda: timer_secs(pg.inner_text(".ex-timer")) is not None, 8)
    t = timer_secs(pg.inner_text(".ex-timer")); sl, d = server_left(eid2)
    check("1d +5 after time up: timer counts again from about 5:00", t is not None and abs(t - sl) <= 2 and 290 <= sl <= 300, "page %s server %.1f" % (t, sl))
    check("1d +5 after time up: banner says teacher added 5 min", "added 5" in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    check("1d +5 after time up: time-up banner gone", "Time is up" not in pg.inner_text(".ex-bannerslot"))
    shot(pg, "s1-after-ext")
    pg.fill("#ans", "in time and late and extended")
    r = wait_for(lambda: (lambda q: q if q["final"].endswith("extended") else None)(review(eid2)["questions"][0]), 8)
    check("1d text written in extra time is still flagged late (after original end)", r is not None and r["writtenLate"], r and r["writtenLate"])
    # +5 while running: banner and jump
    sl_before, _ = server_left(eid2)
    api("POST", "/api/t/exams/%s/extend" % eid2, {"minutes": 5})
    got = wait_for(lambda: timer_secs(pg.inner_text(".ex-timer")) is not None and timer_secs(pg.inner_text(".ex-timer")) > sl_before + 200, 8)
    check("1d second +5 while running reaches the student within a poll", got is not None, pg.inner_text(".ex-timer"))
    check("1d second +5 banner", "added 5" in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    # does the banner persist across polls? wait 7 s
    time.sleep(7)
    check("1d banner still visible 7 s later", "added 5" in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    # Teacher view in parallel: what does the teacher page show at time up
    tctx = context(b, teacher=True)
    tp = tctx.new_page(); el.attach(tp, "1d-teacher ")
    tp.goto(APP + "#/exams/" + eid2)
    wait_for(lambda: tp.locator("#xt-left").count() > 0, 10)
    time.sleep(1)
    note("1d teacher clock reads %r status %r" % (tp.inner_text("#xt-left"), tp.inner_text("#xt-st")))
    tctx.close()
    ctx.close()

    # ---- 1e. refresh right after time-up (status timeup from server) ----
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "1e ")
    eid3, tok3 = make_exam(minutes=0.1, title="Timeup refresh", start=True)
    time.sleep(8)
    pg.goto(link(tok3))
    wait_for(lambda: pg.locator(".ex-timer").count() > 0, 8)
    check("1e opening the page after time up shows Time is up and the box is open", "Time is up" in pg.inner_text(".ex-timer") and not pg.locator("#ans").is_disabled(), pg.inner_text(".ex-timer"))
    check("1e time up banner on fresh load", "keep working" in pg.inner_text(".ex-bannerslot"), pg.inner_text(".ex-bannerslot"))
    ctx.close()

    b.close()

check("1 no script errors", not el.errors, el.errors)
note("console: %s" % el.summary()["console"][:10])
finish("s1_timer")
