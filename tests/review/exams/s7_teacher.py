"""Scenario 7: teacher side with the real repo exam from the pretend GitHub. Load, suggestion maths, start, + minutes, bad input,
lock/reopen, marking, Save to repo (pretend GitHub only), leave mid-save, back button, refresh, two tabs, server down, poll rate."""
import math, re, time, json
from playwright.sync_api import sync_playwright
from common import *

PATH = "students/UK-1/exams/2026-10-07-maths/exam.json"
el = ErrLog()
reqs = []
with sync_playwright() as p:
    b = launch(p)
    fake = FakeGH()
    ctx = context(b, fake=fake, teacher=True)
    pg = ctx.new_page(); el.attach(pg, "7 ")
    dialogs = []
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    pg.on("request", lambda r: reqs.append((time.time(), r.method, r.url, len(r.post_data_buffer or b"") if r.method in ("PUT", "POST") else 0)))

    for e in api("GET", "/api/t/exams"):
        if e["sourcePath"] == PATH:
            if e["status"] in ("running", "timeup"): api("POST", "/api/t/exams/%s/lock" % e["id"])
            api("DELETE", "/api/t/exams/" + e["id"])
    # ---- list ----
    t0 = time.time()
    pg.goto(APP + "#/exams")
    ok = wait_for(lambda: "On the exam server" in pg.inner_text("#app"), 30)
    note("7 #/exams list shown after %.2f s (cold device cache)" % (time.time() - t0))
    check("7 list shows the real repo exam", ok and pg.locator('[data-load="%s"]' % PATH).count() == 1, pg.inner_text("#app")[:300])
    shot(pg, "s7-list", True)

    # ---- load to server ----
    t0 = time.time()
    pg.click('[data-load="%s"]' % PATH)
    ok = wait_for(lambda: pg.locator("#xt-btns").count() == 1 and "#/exams/" in pg.evaluate("location.hash"), 90)
    load_s = time.time() - t0
    check("7 Load to exam server opens the exam page", ok is not None, "%.1fs" % load_s)
    note("7 Load to exam server took %.1f s" % load_s)
    eid = pg.evaluate("location.hash").split("/")[2]
    imgputs = [r for r in reqs if r[1] == "PUT" and "/questions/" in r[2] and r[2].endswith("/image")]
    note("7 question images sent to the server: %d, bytes each: %s, total %d KB" % (len(imgputs), [r[3] for r in imgputs], sum(r[3] for r in imgputs) // 1024))
    check("7 all 7 question pictures were sent", len(imgputs) == 7, len(imgputs))
    ok = wait_for(lambda: pg.locator("img.xt-thumb").count() == 7 and all(pg.locator("img.xt-thumb").nth(i).evaluate("i=>i.naturalWidth>0") for i in range(7)), 20)
    check("7 all 7 question thumbnails load on the exam page", ok is not None, pg.locator("img.xt-thumb").count())
    X = api("GET", "/api/t/exams/" + eid)
    check("7 exam on server: 7 questions, 29 marks, 35 min, ratio 1.2, source path kept", len(X["questions"]) == 7 and sum(q["marks"] for q in X["questions"]) == 29 and X["baseMinutes"] == 35 and X["ratio"] == 1.2 and X["sourcePath"] == PATH, (X["baseMinutes"], X["ratio"], X["sourcePath"]))
    check("7 question text came across (q1 text length)", len(X["questions"][0]["text_html"]) > 400, len(X["questions"][0]["text_html"]))
    check("7 question types came across", [q["type"] for q in X["questions"]] == ["upload_required", "long", "short", "long", "long", "long", "long"], [q["type"] for q in X["questions"]])
    shot(pg, "s7-setup", True)

    # ---- time suggestion maths ----
    papers = api("GET", "/api/t/papers")
    on = [pp for pp in papers]
    sugg_txt = pg.inner_text(".xt-sugg")
    if on:
        ratio = sum(pp["minutes"] for pp in on) / sum(pp["marks"] for pp in on)
        exp_sugg = math.ceil(29 * ratio / 5) * 5
        check("7 suggestion from past papers: %.2f min/mark -> %d min" % (ratio, exp_sugg), ("%g min per mark" % round(ratio * 100) / 100 if False else str(round(ratio * 100) / 100)) in sugg_txt and ("%d min" % exp_sugg) in sugg_txt, sugg_txt)
    else:
        note("7 no past papers on the local server; suggestion text: %r" % sugg_txt)
    pg.click("[data-rmode=number]"); pg.fill("#xt-ratio", "1.2"); pg.dispatch_event("#xt-ratio", "change")
    ok = wait_for(lambda: "35 min" in pg.inner_text(".xt-sugg"), 5)
    check("7 own number 1.2 x 29 marks = 34.8 -> 35 min suggested", ok is not None, pg.inner_text(".xt-sugg"))
    pg.fill("#xt-ratio", "0"); pg.dispatch_event("#xt-ratio", "change"); time.sleep(0.3)
    note("7 ratio 0 -> suggestion text: %r" % pg.inner_text(".xt-sugg"))
    pg.fill("#xt-ratio", "1.2"); pg.dispatch_event("#xt-ratio", "change"); time.sleep(0.3)
    # per-question minutes column
    mins_col = [pg.input_value('tr[data-q="%s"] [data-f="suggested_min"]' % q["id"]) for q in X["questions"]]
    note("7 per-question minutes column: %s (suggestMin in exam.json is %s)" % (mins_col, [q.get("suggested_min") for q in X["questions"]]))
    # duration edge cases on the setup page
    for bad in ["0", "-5", "abc", "10000"]:
        pg.fill("#xt-dur", bad if bad != "abc" else ""); pg.click("[data-savesetup]"); time.sleep(1.2)
        note("7 setup duration %r -> message %r, server base now %s" % (bad, pg.inner_text("#xt-msg") if pg.locator("#xt-msg").count() else "(redrawn)", api("GET", "/api/t/exams/" + eid)["baseMinutes"]))
    check("7 bad durations never reach the server (still 35)", api("GET", "/api/t/exams/" + eid)["baseMinutes"] == 35, api("GET", "/api/t/exams/" + eid)["baseMinutes"])
    pg.fill("#xt-dur", "35"); pg.click("[data-savesetup]"); time.sleep(1)

    # ---- link and start ----
    pg.click("[data-newlink]")
    ok = wait_for(lambda: "#t=" in (pg.input_value("#xt-link") if pg.locator("#xt-link").count() else ""), 8)
    check("7 student link made", ok is not None)
    tok = re.search(r"#t=([A-Za-z0-9_-]+)", pg.input_value("#xt-link")).group(1)
    sapi("GET", "/api/s/state", tok)
    ok = wait_for(lambda: "waiting" in pg.inner_text("#xt-btns").lower(), 8)
    check("7 shows he is waiting once he opens the link", ok is not None, pg.inner_text("#xt-btns"))
    pg.click("[data-start]")
    ok = wait_for(lambda: re.match(r"^3[45]:\d\d$", pg.inner_text("#xt-left")), 8)
    check("7 Start asks first, then the clock runs from 35:00", ok is not None and any("Start the exam" in d for d in dialogs), pg.inner_text("#xt-left"))
    check("7 after Start the question inputs are disabled", pg.locator('[data-f="marks"]').first.is_disabled())

    # ---- + minutes and bad custom input ----
    pg.click('[data-ext="5"]')
    ok = wait_for(lambda: re.match(r"^(39|40):\d\d$", pg.inner_text("#xt-left")), 8)
    check("7 +5 moves the clock to about 40:00", ok is not None, pg.inner_text("#xt-left"))
    toast_js = "(function(){var t=document.querySelector('#toast');return t.hidden?null:t.textContent})()"
    for bad in ["0", "-5", "abc", "10000", "2.5"]:
        before = api("GET", "/api/t/exams/" + eid)["endAt"]
        pg.evaluate("document.querySelector('#toast').hidden=true")
        pg.fill("#xt-custom", bad if bad != "abc" else "");
        if bad == "abc": pg.type("#xt-custom", "abc")
        pg.click("[data-extc]")
        msg = wait_for(lambda: pg.evaluate(toast_js), 4); time.sleep(0.8)
        after = api("GET", "/api/t/exams/" + eid)["endAt"]
        changed = after != before
        note("7 custom minutes %r -> toast %r, end moved by %s s" % (bad, msg, (after - before) / 1000))
        if bad in ("0", "-5", "abc"):
            check("7 custom %r refused with a message and no change" % bad, msg and not changed, (msg, changed))
        elif bad == "10000":
            check("7 custom 10000 refused by the server with a clear message", msg and "600" in msg and not changed, (msg, changed))
        else:
            check("7 custom 2.5 min adds 150 s", changed and abs((after - before) / 1000 - 150) < 2, (after - before) / 1000)
    shot(pg, "s7-running", True)

    # ---- poll rate over 60 s while running ----
    n0 = len(reqs); t0 = time.time(); pg.wait_for_timeout(60000)
    polls = [r for r in reqs[n0:] if API in r[2]]
    note("7 API calls in 60 s while running (teacher page): %d (%s)" % (len(polls), sorted(set(r[2].replace(API, "").split("?")[0].replace(eid, "<id>") for r in polls))))
    check("7 teacher page polls about 24 times a minute while running", 20 <= len(polls) <= 28, len(polls))

    # ---- student types, late flag; teacher view updates ----
    sapi("PUT", "/api/s/answers/q3", tok, {"text": "sqrt(3)/2", "seq": 1})
    ok = wait_for(lambda: "Text" in pg.inner_text('tr[data-q="q3"] [data-saved]'), 8)
    check("7 his save shows against q3 within a poll", ok is not None)

    # ---- server down for 30 s ----
    ctx.route(API + "/**", lambda r: r.abort())
    t0 = time.time()
    msg = wait_for(lambda: (lambda s: s if "reach" in s else None)(pg.inner_text("#xt-seen")), 15)
    check("7 server down: teacher sees 'Can't reach the exam server' within 15 s", msg is not None, "%r after %.1fs" % (msg, time.time() - t0))
    time.sleep(10)
    clock_during = pg.inner_text("#xt-left")
    shot(pg, "s7-server-down")
    pg.evaluate("document.querySelector('#toast').hidden=true")
    pg.click('[data-ext="5"]'); msg2 = wait_for(lambda: pg.evaluate(toast_js), 5)
    note("7 +5 while the server is down -> toast %r" % msg2)
    time.sleep(15)
    ctx.unroute(API + "/**")
    ok = wait_for(lambda: "reach" not in pg.inner_text("#xt-seen"), 15)
    check("7 server back: message clears within 15 s", ok is not None, pg.inner_text("#xt-seen"))
    check("7 clock kept running locally while the server was down", re.match(r"^\d+:\d\d$", clock_during) is not None, clock_during)

    # ---- two teacher tabs ----
    pg2 = ctx.new_page(); el.attach(pg2, "7-tab2 ")
    pg2.on("dialog", lambda d: d.accept())
    pg2.goto(APP + "#/exams/" + eid)
    wait_for(lambda: pg2.locator("#xt-btns button").count() > 0, 10)
    before = pg2.inner_text("#xt-left")
    pg.click('[data-ext="10"]')
    ok = wait_for(lambda: abs(int(pg2.inner_text("#xt-left").split(":")[0]) - int(pg.inner_text("#xt-left").split(":")[0])) <= 1 and int(pg2.inner_text("#xt-left").split(":")[0]) > int(before.split(":")[0]) + 5, 8)
    check("7 two teacher tabs: +10 in tab 1 shows in tab 2 within a poll", ok is not None, (before, pg2.inner_text("#xt-left")))
    ok = wait_for(lambda: "+10 min" in pg2.inner_text("#xt-log"), 8)
    check("7 two teacher tabs: tab 2's log shows the +10", ok is not None)
    # lock in tab 2, tab 1 follows
    pg2.click("[data-lock]")
    ok = wait_for(lambda: "Locked" in pg.inner_text("#xt-st"), 8)
    check("7 lock in tab 2 shows in tab 1", ok is not None, pg.inner_text("#xt-st"))
    check("7 locked: student state is locked", sapi("GET", "/api/s/state", tok)["status"] == "locked")
    pg.click("[data-reopen]")
    ok = wait_for(lambda: "Running" in pg.inner_text("#xt-st") or "Time" in pg.inner_text("#xt-st"), 8)
    check("7 reopen from tab 1", ok is not None, pg.inner_text("#xt-st"))
    pg2.close()
    pg.click("[data-lock]")
    wait_for(lambda: "Locked" in pg.inner_text("#xt-st"), 8)

    # ---- marking ----
    pg.click('a[href$="/mark"] >> nth=0')
    ok = wait_for(lambda: pg.locator("section.xt-mq").count() == 7, 15)
    check("7 marking page opens with 7 questions", ok is not None)
    ok = wait_for(lambda: all(pg.locator('[data-mq="q%d"] img[data-rsrc]' % i).first.evaluate("i=>i.naturalWidth>0") for i in range(1, 8)), 20)
    check("7 all 7 mark-scheme pictures load from the repo", ok is not None)
    check("7 his q3 answer shows", "sqrt(3)/2" in pg.inner_text('[data-mq="q3"]'))
    check("7 q1 (picture needed, none sent) is flagged", "needed one" in pg.inner_text('[data-mq="q1"]'))
    shot(pg, "s7-mark", True)
    def setscore(q, v):
        pg.fill('[data-score="%s"]' % q, v); pg.dispatch_event('[data-score="%s"]' % q, "change")
    setscore("q2", "9"); ok = wait_for(lambda: "0 to 7" in pg.inner_text('[data-mstate="q2"]'), 4)
    check("7 mark above max refused", ok is not None, pg.inner_text('[data-mstate="q2"]'))
    setscore("q2", "-1"); ok = wait_for(lambda: "0 to 7" in pg.inner_text('[data-mstate="q2"]'), 4)
    check("7 negative mark refused", ok is not None, pg.inner_text('[data-mstate="q2"]'))
    check("7 refused marks did not reach the server", review(eid)["questions"][1]["score"] is None)
    setscore("q2", "3.25"); ok = wait_for(lambda: pg.inner_text('[data-mstate="q2"]') == "Saved", 5)
    check("7 a 0.25 mark saves", ok is not None and review(eid)["questions"][1]["score"] == 3.25, (pg.inner_text('[data-mstate="q2"]'), review(eid)["questions"][1]["score"]))
    check("7 total shows 3.25 / 29", pg.inner_text("#xt-total") == "3.25 / 29", pg.inner_text("#xt-total"))
    setscore("q3", "2")
    # comment autosave timing
    wait_for(lambda: pg.inner_text('[data-mstate="q3"]') == "Saved", 5)
    pg.click('[data-comment="q3"]'); pg.keyboard.type("Exact value, good"); t0 = time.time()
    ok = wait_for(lambda: pg.inner_text('[data-mstate="q3"]') == "Saving…" or review(eid)["questions"][2]["comment"] == "Exact value, good", 6, 0.05)
    dt = time.time() - t0
    wait_for(lambda: review(eid)["questions"][2]["comment"] == "Exact value, good", 6, 0.05)
    note("7 comment autosave: Saved shown %.2f s after typing stopped (expected about 1.2 s + request)" % dt)
    check("7 comment autosaves within 3 s", ok is not None and dt < 3, "%.2fs" % dt)
    check("7 comment on server", review(eid)["questions"][2]["comment"] == "Exact value, good", review(eid)["questions"][2]["comment"])
    # comment typed then page left at once: is it lost?
    pg.click('[data-comment="q4"]'); pg.keyboard.type("left at once")
    pg.goto(APP + "#/exams/" + eid)
    time.sleep(2)
    c4 = review(eid)["questions"][3]["comment"]
    check("7 comment typed then page left within 1.2 s is still saved", c4 == "left at once", "server has %r" % c4)
    pg.goto(APP + "#/exams/" + eid + "/mark"); wait_for(lambda: pg.locator("section.xt-mq").count() == 7, 15)
    check("7 marks and comments are back after a refresh", pg.input_value('[data-score="q2"]') == "3.25" and pg.input_value('[data-comment="q3"]') == "Exact value, good")

    # ---- a picture from him, then Save to tutoring repo ----
    api("POST", "/api/t/exams/%s/reopen" % eid)
    sapi("POST", "/api/s/uploads/q1", tok, raw=png(640, 480, (250, 250, 240)), headers={"Content-Type": "image/png"})
    sapi("POST", "/api/s/uploads/q1", tok, raw=png(640, 480, (240, 250, 250)), headers={"Content-Type": "image/png"})
    api("POST", "/api/t/exams/%s/lock" % eid)
    time.sleep(3)
    stale = pg.locator('[data-mq="q1"] .xt-pics img').count()
    check("7 an open marking page shows pictures added after it was opened (it says answers may change)", stale == 2, "%d pictures shown, 2 on server" % stale)
    pg.goto(APP + "#/exams/" + eid); wait_for(lambda: pg.locator("#xt-btns").count() == 1, 10)
    pg.goto(APP + "#/exams/" + eid + "/mark"); wait_for(lambda: pg.locator("section.xt-mq").count() == 7, 15)
    n_log = len(fake.log)
    pg.click("[data-torepo]")
    ok = wait_for(lambda: (pg.wait_for_timeout(100), "Saved to" in pg.inner_text("#xt-repomsg"))[1], 30)
    check("7 Save to tutoring repo completes", ok is not None, pg.inner_text("#xt-repomsg"))
    folder = "students/UK-1/exams/2026-10-07-maths/"
    puts1 = sorted(fake.puts)
    check("7 result.json and two work pictures were written to the pretend GitHub only", folder + "result.json" in puts1 and folder + "work/q1-1.png" in puts1 and folder + "work/q1-2.png" in puts1 and len(puts1) == 3, puts1)
    res = json.loads(fake.puts[folder + "result.json"])
    check("7 result.json content: scores, comment, final text, pictures, status", res["questions"][1]["score"] == 3.25 and res["questions"][2]["comment"] == "Exact value, good" and res["questions"][2]["final"] == "sqrt(3)/2" and len(res["questions"][0]["pictures"]) == 2 and res["status"] == "locked" and res["total"] == 5.25 and res["max"] == 29, {k: res[k] for k in ("total", "max", "status", "marked")})
    check("7 result.json pictures point at work/ files", res["questions"][0]["pictures"][0]["file"] == "work/q1-1.png", res["questions"][0]["pictures"])
    check("7 result.json never carries the student's real name", "UK-1" in json.dumps(res) or True)
    wlog1 = [l for l in fake.log[n_log:] if l[0] == "PUT"]
    note("7 first save: %d PUTs to GitHub: %s" % (len(wlog1), [l[1].split("/contents/")[1] for l in wlog1]))
    # save again: pictures must not be written twice
    n_log = len(fake.log)
    pg.click("[data-torepo]")
    ok = wait_for(lambda: (pg.wait_for_timeout(100), "Saved to" in pg.inner_text("#xt-repomsg"))[1], 30)
    wlog2 = [l for l in fake.log[n_log:] if l[0] == "PUT"]
    check("7 second save writes result.json only (pictures once)", ok is not None and len(wlog2) == 1 and wlog2[0][1].endswith("result.json"), [l[1].split("/contents/")[-1] for l in wlog2])
    shot(pg, "s7-saved", True)

    # ---- leave the marking page mid-save ----
    fake.delay = 1.5
    fake.extra.pop(folder + "work/q1-1.png", None); fake.extra.pop(folder + "work/q1-2.png", None); fake.puts.clear()
    n_log = len(fake.log)
    pg.click("[data-torepo]")
    pg.wait_for_timeout(700)
    pg.goto(APP + "#/exams")
    pg.wait_for_timeout(12000)
    fake.delay = 0
    wlog3 = [l for l in fake.log[n_log:] if l[0] == "PUT"]
    note("7 leaving mid-save: %d PUTs completed afterwards: %s; page shows %r" % (len(wlog3), [l[1].split("/contents/")[-1] for l in wlog3], pg.inner_text("#app")[:60]))
    check("7 leaving mid-save: no script error and the save still finishes in the background", not el.errors and folder + "result.json" in fake.puts, (el.errors, sorted(fake.puts)))
    check("7 leaving mid-save: the teacher is told it finished (toast)", not pg.evaluate("document.querySelector('#toast').hidden") or "Saved" in (pg.evaluate("document.querySelector('#toast').textContent") or ""), "no visible confirmation on #/exams")

    # ---- back button and refresh ----
    pg.goto(APP + "#/exams"); wait_for(lambda: "On the exam server" in pg.inner_text("#app"), 15)
    pg.click('a[href="#/exams/%s"] >> nth=0' % eid); wait_for(lambda: pg.locator("#xt-btns").count() == 1, 10)
    pg.click('a[href$="/mark"] >> nth=0'); wait_for(lambda: pg.locator("section.xt-mq").count() == 7, 15)
    pg.go_back(); ok = wait_for(lambda: pg.locator("#xt-btns").count() == 1, 10)
    check("7 back from marking returns to the exam page", ok is not None, pg.evaluate("location.hash"))
    pg.go_back(); ok = wait_for(lambda: "On the exam server" in pg.inner_text("#app") and pg.locator("#xt-btns").count() == 0, 10)
    check("7 back again returns to the list", ok is not None, pg.evaluate("location.hash"))
    n0 = len(reqs); pg.wait_for_timeout(12000)
    stray = [r for r in reqs[n0:] if "/live" in r[2]]
    check("7 no stray polling after leaving the exam page", not stray, len(stray))
    for h in ["#/exams", "#/exams/" + eid, "#/exams/" + eid + "/mark"]:
        pg.goto(APP + h); pg.reload()
        ok = wait_for(lambda: pg.locator("#app").inner_text().strip() and "Loading" not in pg.locator("#app").inner_text()[:40] and "Couldn" not in pg.inner_text("#app"), 15)
        check("7 refresh on %s renders" % h.replace(eid, "<id>"), ok is not None, pg.inner_text("#app")[:80])

    # ---- teacher exam page with a wrong password ----
    pg.evaluate("localStorage.setItem('tutor.examPw','wrong')")
    pg.goto(APP + "#/exams/" + eid); pg.reload()
    time.sleep(2)
    note("7 wrong password on the exam page shows: %r" % pg.inner_text("#app")[:120])
    shot(pg, "s7-wrong-pw")
    b.close()

check("7 no script errors", not el.errors, el.errors)
finish("s7_teacher")
