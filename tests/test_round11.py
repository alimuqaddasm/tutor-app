"""Round 11 (2 Oct): Ali's 5 suggestions of 1 Oct evening. Every check prints PASS or FAIL; exit code 1 on any FAIL.
Saves go to the pretend GitHub from test_bugs_round10 (never to the real repo); try-out tabs send nothing.
1. Oral quiz: "I skipped this question" (Ali's choice, key 0), apart from "He didn't answer" (key 6).
2. Teach while the clock runs: Skip (recorded) / Next (no tick, key →) / Taught (tick, key T).
3. Student view: arrows, the edge buttons and a swipe go through every question; no side panel needed.
4-5. Home: nothing is marked done at midnight; a lesson whose day passed untaught asks "was it taught?" and whose miss;
     the make-up counter (170 min to start), and the "Make-up lesson" switch."""
import os, sys, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import types  # noqa: E402
# reuse round 10's helpers (pretend GitHub, local server, page helpers) without running its checks
R = types.SimpleNamespace(); _src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_bugs_round10.py"), encoding="utf-8").read().split("\ntry:\n")[0]
_ns = {"__file__": os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_bugs_round10.py")}; exec(_src, _ns); R.__dict__.update(_ns)
from playwright.sync_api import sync_playwright

CH, MA, MK = R.CH, R.MA, "students/UK-1/makeup.json"
check, ctx_, page, jump, jump_ic, pos = R.check, R.ctx_, R.page, R.jump, R.jump_ic, R.pos
errs, fails = R.errs, R.fails
SEED = {"start": {"date": "2026-10-01", "owed": 135}, "entries": []}


def at(c, iso):  # the page's clock says this date (timers still run)
    c.add_init_script("(() => { const T = %d, d0 = Date.now(), N = Date; class D extends N { constructor(...a) { super(...(a.length ? a : [T + (N.now() - d0)])); } static now() { return T + (N.now() - d0); } } window.Date = D; })();"
                      % int(datetime.datetime.fromisoformat(iso).timestamp() * 1000))


def home(c): p = page(c, "#/", ".home"); p.wait_for_timeout(2500); return p


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        # 1. quiz: I skipped this question
        c = ctx_(b); p = page(c, "?try#/lesson/" + CH + "/teach"); jump(p, "Choose the quiz"); p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
        check("quiz: 'I skipped it' sits in the bottom bar next to Next (v19)", p.locator(".tfoot .btn.iskip").count() == 1 and p.locator(".chunk.cur button.vt").count() == 0)
        a0 = pos(p); p.keyboard.press("0"); p.wait_for_timeout(300)
        check("key 0 = I skipped it, and moves on", pos(p) != a0 and p.locator(".outline .oc.v-tskip").count() >= 1)
        p.keyboard.press("ArrowLeft"); p.wait_for_timeout(300)
        check("back on it, the button shows it is set", p.locator(".tfoot .btn.iskip").get_attribute("aria-pressed") == "true")
        p.keyboard.press("6"); p.wait_for_timeout(200)
        check("key 6 is 'He didn't answer' and replaces it", p.locator('.chunk.cur [data-v="skipped"]').first.get_attribute("aria-pressed") == "true")
        p.screenshot(path=os.path.join(R.OUT, "r11-quiz-skip.png")); c.close()
        # 2. three buttons while the clock runs
        c = ctx_(b); c.add_init_script("localStorage.setItem('tutor.fold.maths', '0')"); p = page(c, "?try#/lesson/" + MA + "/teach")  # maths 1 Oct: nothing ticked yet; hints shown as steps for this check
        while p.locator(".chunk.cur.t-step").count() == 0: p.keyboard.press("ArrowRight"); p.wait_for_timeout(150)
        check("preview (clock off): only Next, no Taught/Skip", p.locator(".tfoot .btn.skip").count() == 0 and p.locator(".tfoot.three").count() == 0)
        p.click("#clkgo"); p.wait_for_timeout(400)
        labs = [t.strip() for t in p.locator(".tfoot > .btn").all_inner_texts()]
        check("clock on: Back, Skip, Next, Taught", [l.replace("✓", "").split()[0] for l in labs] == ["←", "Skip", "Next", "Taught"], labs)
        done0 = p.locator(".outline .oc.done").count(); p.locator('.tfoot [data-tgo="next"]').click(); p.wait_for_timeout(300)
        check("Next moves on without a tick", p.locator(".outline .oc.done").count() == done0)
        p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
        check("arrow key = Next (no tick)", p.locator(".outline .oc.done").count() == done0)
        def to_step():
            while p.locator(".chunk.cur.t-step").count() == 0: p.keyboard.press("ArrowRight"); p.wait_for_timeout(150)
        to_step(); p.keyboard.press("t"); p.wait_for_timeout(300)
        check("T / Taught ticks and moves on", p.locator(".outline .oc.done").count() == done0 + 1)
        to_step(); p.locator('.tfoot [data-tgo="skip"]').click(); p.wait_for_timeout(300)
        check("Skip is recorded as skipped on purpose (not ticked)", p.locator(".outline .oc.s-skip").count() == 1 and p.locator(".outline .oc.done").count() == done0 + 1)
        p.screenshot(path=os.path.join(R.OUT, "r11-three-buttons.png"))
        for w, h in [(1024, 768), (390, 844)]:
            p.set_viewport_size({"width": w, "height": h}); p.wait_for_timeout(300)
            check("three buttons fit at %d px (no sideways scroll)" % w, R.wide(p) <= 0, R.wide(p))
            p.screenshot(path=os.path.join(R.OUT, "r11-three-%d.png" % w))
        c.close()
        # 3. student view
        c = ctx_(b, 1440, 765); p = page(c, "?try#/lesson/" + CH + "/student", ".stu"); n = p.evaluate("document.querySelector('.stu-view').dataset.pos").split("/")[1]
        for i in range(int(n)): p.keyboard.press("ArrowRight"); p.wait_for_timeout(120)
        check("arrows go on past the last exam question into the quick questions", p.locator(".stu-view .stu-q").count() == 1, p.evaluate("document.querySelector('.stu-view').dataset.pos"))
        q1 = p.locator(".stu-view .stu-q").inner_text(); p.keyboard.press("ArrowLeft"); p.wait_for_timeout(200); p.keyboard.press("ArrowRight"); p.wait_for_timeout(200)
        check("left then right comes back to the same question", p.locator(".stu-view .stu-q").count() == 1 and p.locator(".stu-view .stu-q").inner_text() == q1)
        a = p.evaluate("document.querySelector('.stu-view').dataset.pos"); p.locator(".stu-edge.prev").click(); p.wait_for_timeout(200)
        check("the faint edge button moves too", p.evaluate("document.querySelector('.stu-view').dataset.pos") != a)
        check("side panel stays closed", p.locator(".stu-drawer").is_hidden())
        c.close(); c = b.new_context(viewport={"width": 1024, "height": 700}, has_touch=True, service_workers="block"); c.add_init_script("localStorage.setItem('tutor.token', %s);" % json.dumps(R.TOK))
        c.route("https://api.github.com/**", lambda r: r.abort() if r.request.method != "GET" else r.continue_())
        p = page(c, "?try#/lesson/" + CH + "/student", ".stu"); a = p.evaluate("document.querySelector('.stu-view').dataset.pos")
        SW = "dx => { const t = (x) => new Touch({identifier: 1, target: document.body, clientX: x, clientY: 300}); document.dispatchEvent(new TouchEvent('touchstart', {touches: [t(600)], changedTouches: [t(600)]})); document.dispatchEvent(new TouchEvent('touchend', {touches: [], changedTouches: [t(600 + dx)]})); }"
        p.evaluate(SW, -200); p.wait_for_timeout(300); b1 = p.evaluate("document.querySelector('.stu-view').dataset.pos")
        p.evaluate(SW, 200); p.wait_for_timeout(300); b2 = p.evaluate("document.querySelector('.stu-view').dataset.pos")
        check("swipe left = next, swipe right = back", b1 != a and b2 == a, (a, b1, b2)); c.close()
        # 4. home, today (Fri 2 Oct): the real makeup.json; the missed 1 Oct maths is still up next, nothing asked yet
        c = ctx_(b); at(c, "2026-10-02T10:00:00"); p = home(c)
        tile = p.locator('.tile[data-subject="maths"]').inner_text()
        check("1 Oct maths (untaught) is still up next after midnight", "Draft it" not in tile and "Moved to Sat 3 Oct" in tile, tile.replace("\n", " | ")[:160])
        check("make-up counter starts at 170", p.locator("#mkcard .big").inner_text() == "170", p.locator("#mkcard").inner_text().replace("\n", " | ") if p.locator("#mkcard").count() else "no card")
        check("no 'was it taught?' yet (its new day is Sat 3 Oct)", p.locator(".ask").count() == 0)
        p.screenshot(path=os.path.join(R.OUT, "r11-home-fri.png"), full_page=True); c.close()
        # on Sun 4 Oct (Sat untaught) it asks; his miss -> "add 45?" -> Yes: saved, counter 215, moved to Mon 5 Oct
        F = R.FakeGH(); F.n += 1; F.files[MK] = ("fake%036d" % F.n, json.dumps(json.load(open(os.path.join(os.path.dirname(R.HERE), "tutoring", MK), encoding="utf-8"))).encode()); F.blobs[F.files[MK][0]] = F.files[MK][1]
        c = ctx_(b, fake=F); at(c, "2026-10-04T10:00:00"); p = home(c)
        ask = p.locator('.ask[data-ask="%s"]' % MA)
        check("Sun 4 Oct: asks whether Sat 3 Oct's maths was taught", ask.count() == 1 and "Sat 3 Oct" in ask.inner_text(), p.locator(".asks").inner_text().replace("\n", " | ") if p.locator(".asks").count() else "none")
        p.screenshot(path=os.path.join(R.OUT, "r11-home-ask.png"))
        ask.locator('[data-miss="student"]').click(); p.wait_for_timeout(300)
        check("his miss: asks whether to add 45 min", ask.locator("[data-mkadd]").count() == 2)
        ask.locator('[data-mkadd="1"]').click(); p.wait_for_timeout(3500)
        ent = json.loads(F.files[MK][1])["entries"]
        check("saved: a student miss of 45 min for Sat 3 Oct", ent[-1]["by"] == "student" and ent[-1]["minutes"] == 45 and ent[-1]["date"] == "2026-10-03", ent[-1])
        check("counter now 215, question gone, lesson up next today (Sunday is a lesson day)", p.locator("#mkcard .big").inner_text() == "215" and p.locator('.ask[data-ask="%s"]' % MA).count() == 0 and "Sun 4 Oct" in p.locator('.tile[data-subject="maths"]').inner_text(),
              (p.locator("#mkcard .big").inner_text(), p.locator(".ask").count()))
        c.close()
        # my miss adds 45 at once; try-out sends nothing
        F2 = R.FakeGH(); F2.n += 1; F2.files[MK] = ("fake%036d" % F2.n, json.dumps(SEED).encode()); F2.blobs[F2.files[MK][0]] = F2.files[MK][1]
        c = ctx_(b, fake=F2); at(c, "2026-10-02T10:00:00"); p = home(c)
        p.locator('.ask[data-ask="%s"] [data-miss="ali"]' % MA).click(); p.wait_for_timeout(3000)
        ent = json.loads(F2.files[MK][1])["entries"]
        check("my miss: 45 min added straight away", len(ent) == 1 and ent[0]["by"] == "ali" and ent[0]["minutes"] == 45, ent); c.close()
        F3 = R.FakeGH(); c = ctx_(b, fake=F3); at(c, "2026-10-04T10:00:00"); p = page(c, "?try#/", ".home"); p.wait_for_timeout(2500)
        p.locator('.ask[data-ask="%s"] [data-miss="ali"]' % MA).click(); p.wait_for_timeout(1500)
        check("try-out: recording a miss sends nothing", F3.n == 0 and p.locator('.ask[data-ask="%s"]' % MA).count() == 0, F3.n); c.close()
        # 5. the make-up switch is saved with the lesson
        F4 = R.FakeGH(); c = ctx_(b, fake=F4); p = page(c, "#/lesson/" + CH, ".rail"); p.wait_for_timeout(1500)
        p.locator('.rail button[data-phase="_after"]').dispatch_event("click"); p.wait_for_timeout(400)
        p.locator("#fb-makeup").check(); p.wait_for_timeout(5500)
        check("'Make-up lesson' is saved in the lesson file", F4.session(CH).get("makeup") is True)
        p.evaluate("Object.keys(localStorage).filter(k => k.indexOf('tutor.s.') == 0).forEach(k => localStorage.removeItem(k))"); c.close()
        b.close()
finally:
    R.srv.kill()
for e in errs: print(e)
print("\n%d FAIL" % len(fails) if fails else "\nall PASS")
sys.exit(1 if fails or errs else 0)
