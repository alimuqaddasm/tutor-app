"""1b. Sync under stress: offline mid-save, 409, 500, two tabs (same context + two devices), refresh with unsaved, back mid-save."""
from common import *


class Holder:
    """Wraps FakeGH.route: can hold requests (answer later) or abort them (offline)."""
    def __init__(self, fake): self.fake = fake; self.hold = False; self.offline = False; self.pending = []
    def route(self, route, request=None):
        if self.offline: self.fake.log.append((route.request.method, "ABORTED " + route.request.url)); return route.abort("internetdisconnected")
        if self.hold and route.request.method == "PUT": self.pending.append(route); return
        return self.fake.route(route)
    def release(self):
        ps, self.pending = self.pending, []
        for r in ps: self.fake.route(r)
        return len(ps)


def puts_of(fake, lid=MATHS): return [m for m, pth in fake.log if m == "PUT" and pth.endswith(lid + "/session.json")]


def wait_save(pg, t=15000): pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Saved') === 0", timeout=t)


with sync_playwright() as p:
    b = launch(p)

    # ---- A. offline in the middle of a save ----
    fake = FakeGH(); H = Holder(fake)
    c = b.new_context(viewport={"width": 1366, "height": 768}, service_workers="block"); c.errs = []
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');")
    c.route("https://api.github.com/**", H.route)
    pg = c.new_page(); pg.on("pageerror", lambda e: c.errs.append(str(e)[:200])); pg.goto(B + "#/lesson/" + MATHS); pg.wait_for_selector(".rail"); pg.wait_for_timeout(500)
    H.hold = True
    pg.locator('[data-item="st9"] [data-v="right"]').click()
    pg.wait_for_function("document.querySelector('#save').textContent === 'Saving…'", timeout=8000)
    check("A: PUT is in flight (held)", len(H.pending) == 1, len(H.pending))
    H.offline = True; c.set_offline(True)
    pg.locator('.rail button[data-phase="m2"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-item="s6q15"] [data-v="wrong"]').click(); pg.locator('[data-item="s6q16"] [data-v="partly"]').click()
    pg.locator("#clkgo").click(); pg.wait_for_timeout(300)
    print("A: status while offline with a held PUT:", saveline(pg))
    H.hold = False; n = H.release(); pg.wait_for_timeout(2500)
    st = saveline(pg); print("A: status after the first PUT lands while offline:", st)
    check("A: after the in-flight PUT lands while offline the status says Offline, not Saved", st.startswith("Offline"), st)
    s = sess(fake); check("A: first PUT holds only the first tap", s and s["answers"].get("st9", {}).get("v") == "right" and "s6q15" not in s["answers"], list((s or {}).get("answers", {})))
    pg.wait_for_timeout(5000)
    check("A: nothing else was attempted while offline", len(puts_of(fake)) == 1 and not [x for x in fake.log if x[0] == "PUT" and "ABORTED" in x[1]], [x for x in fake.log if "ABORTED" in x[1]][:3])
    H.offline = False; c.set_offline(False)
    wait_save(pg, 20000)
    s = sess(fake)
    check("A: back online: every tap saved once, in one PUT", len(puts_of(fake)) == 2 and s["answers"]["st9"]["v"] == "right" and s["answers"]["s6q15"]["v"] == "wrong" and s["answers"]["s6q16"]["v"] == "partly" and s["time"]["log"][0]["e"] == "start", (len(puts_of(fake)), list(s["answers"]), s["time"]["log"]))
    check("A: no page errors", not c.errs, c.errs)
    c.close()

    # ---- B. 409 on every write, then recovery ----
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail"); pg.wait_for_timeout(500)
    fake.fail_writes = 409
    pg.locator('[data-item="st9"] [data-v="right"]').click()
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Not saved') === 0", timeout=12000)
    st = saveline(pg); cls = pg.locator("#save").get_attribute("class")
    check("B: 409 forever: status 'Not saved · kept on device' in red", st == "Not saved · kept on device" and "err" in cls, (st, cls))
    gets = [x for x in fake.log if x[0] == "GET" and "/contents/" in x[1]]
    check("B: on 409 the app re-read the remote file once and retried the PUT", len(gets) >= 1 and len(puts_of(fake)) == 2, (len(gets), len(puts_of(fake))))
    t0 = time.time(); fake.fail_writes = None
    pg.locator('[data-item="st9"] input.note').fill("note after conflict")
    try:
        wait_save(pg, 40000); print("B: recovered %.0fs after writes work again (a tap was made)" % (time.time() - t0)); ok = True
    except Exception as e: ok = False
    check("B: saves again once GitHub accepts writes", ok, saveline(pg))
    s = sess(fake); check("B: recovered file has verdict and note", s and s["answers"]["st9"]["v"] == "right" and s["answers"]["st9"]["note"] == "note after conflict", s and s["answers"])
    # 409 recovery with NO further tap: does the 25 s timer retry?
    fake.fail_writes = 409; pg.locator('[data-item="st9"] [data-v="wrong"]').click()
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Not saved') === 0", timeout=12000)
    fake.fail_writes = None; t0 = time.time()
    try: wait_save(pg, 40000); print("B: silent retry landed after %.0fs" % (time.time() - t0)); ok = True
    except Exception: ok = False
    check("B: with no further tap the app retries by itself within 40 s", ok, saveline(pg))
    c.close()

    # ---- C. 500 on writes ----
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail"); pg.wait_for_timeout(500)
    fake.fail_writes = 500
    pg.locator('[data-item="st9"] [data-v="right"]').click()
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Not saved') === 0", timeout=12000)
    check("C: 500: status Not saved · kept on device", saveline(pg) == "Not saved · kept on device", saveline(pg))
    check("C: toast? (none expected for a 500, only the status line)", pg.locator("#toast").is_hidden(), pg.locator("#toast").inner_text())
    shot(pg, "plan-notsaved-500-1366-light", full=False)
    n1 = len(puts_of(fake)); pg.wait_for_timeout(27000); n2 = len(puts_of(fake))
    check("C: the app keeps retrying every 25 s while GitHub fails", n2 > n1, (n1, n2))
    fake.fail_writes = None; wait_save(pg, 30000)
    check("C: saved after GitHub recovers", sess(fake)["answers"]["st9"]["v"] == "right")
    c.close()

    # ---- D. two tabs, same context (storage events) ----
    fake = FakeGH(); c = ctx(b, fake)
    p1 = page(c, "#/lesson/" + MATHS, ".rail"); p2 = page(c, "#/lesson/" + MATHS, ".rail"); p1.wait_for_timeout(500); p2.wait_for_timeout(500)
    p1.bring_to_front(); p1.locator('[data-item="st9"] [data-v="right"]').click(); p1.wait_for_timeout(600)
    p2.bring_to_front(); p2.wait_for_timeout(600)
    v2 = p2.locator('[data-item="st9"] [data-v="right"]').get_attribute("aria-pressed")
    check("D: tab 2 shows tab 1's verdict within a second (storage event)", v2 == "true", v2)
    p2.locator('.rail button[data-phase="m2"]').click(); p2.wait_for_timeout(200); p2.locator('[data-item="s6q15"] [data-v="wrong"]').click()
    p2.locator('.rail button[data-phase="m1"]').click(); p2.wait_for_timeout(200); p2.locator('[data-item="st9"] [data-v="wrong"]').click()  # same item, different verdict, later
    p1.bring_to_front(); p1.locator("#clkgo").click(); p1.wait_for_timeout(800)  # start clock in tab 1
    p2.bring_to_front(); p2.wait_for_timeout(800)
    check("D: tab 2 sees the running clock", p2.locator("#clkgo").inner_text() == "Pause", p2.locator("#clkgo").inner_text())
    p2.locator("#clkgo").click()  # pause in tab 2
    wait_save(p2, 20000); p1.bring_to_front(); p1.wait_for_timeout(6000); wait_save(p1, 20000); p2.wait_for_timeout(6000)
    s = sess(fake)
    check("D: same item tapped differently: the later tap wins (wrong)", s["answers"]["st9"]["v"] == "wrong", s["answers"]["st9"])
    check("D: both tabs' verdicts kept", s["answers"].get("s6q15", {}).get("v") == "wrong", list(s["answers"]))
    check("D: clock log is start then pause", [e["e"] for e in s["time"]["log"]] == ["start", "pause"], s["time"]["log"])
    print("D: PUTs", len(puts_of(fake)), "status p1", saveline(p1), "p2", saveline(p2))
    check("D: tab 1 shows the paused clock and no stale 'Saving'", p1.locator("#clkgo").inner_text() == "Resume" and saveline(p1).startswith("Saved"), (p1.locator("#clkgo").inner_text(), saveline(p1)))
    check("D: no page errors", not c.errs, c.errs)
    c.close()

    # ---- E. two devices (two contexts): tablet and laptop ----
    fake = FakeGH(); cT = ctx(b, fake, device="tablet"); cL = ctx(b, fake, device="la57")
    pT = page(cT, "#/lesson/" + MATHS, ".rail"); pL = page(cL, "#/lesson/" + MATHS, ".rail"); pT.wait_for_timeout(500); pL.wait_for_timeout(500)
    pT.locator('[data-item="st9"] [data-v="right"]').click(); pT.locator("#clkgo").click(); wait_save(pT)
    pL.locator('[data-item="st9"] [data-v="wrong"]').click(); pL.locator('.rail button[data-phase="m2"]').click(); pL.wait_for_timeout(200); pL.locator('[data-item="s6q16"] [data-v="partly"]').click()
    wait_save(pL, 20000)
    s = sess(fake)
    check("E: laptop save hit a 409 and merged: tablet's tap, laptop's taps and the clock all present", s["answers"]["st9"]["v"] == "wrong" and s["answers"]["s6q16"]["v"] == "partly" and s["time"]["log"] and s["time"]["log"][0]["e"] == "start", (s["answers"], s["time"]["log"]))
    check("E: devices lists both", sorted(s["devices"]) == ["la57", "tablet"], s["devices"])
    # laptop view after merge: does it show the running clock the tablet started?
    pL.wait_for_timeout(500)
    print("E: laptop clock button after merge:", pL.locator("#clkgo").inner_text(), "| tablet says st9 =", pT.locator('[data-item="st9"] [data-v="right"]').get_attribute("aria-pressed"))
    check("E: laptop shows the clock the tablet started (merged in)", pL.locator("#clkgo").inner_text() == "Pause", pL.locator("#clkgo").inner_text())
    # laptop pauses; tablet (unaware) ticks a step
    if pL.locator("#clkgo").inner_text() != "Pause": pL.reload(); pL.wait_for_selector(".rail"); pL.wait_for_timeout(800)
    pL.locator("#clkgo").click(); wait_save(pL, 20000)
    pT.locator("[data-tick]").first.click(); wait_save(pT, 20000)
    s = sess(fake)
    check("E: tablet's later save keeps the laptop's pause", [e["e"] for e in s["time"]["log"]] == ["start", "pause"], s["time"]["log"])
    check("E: tablet's tick kept too", any(not v.get("off") for v in s["done"].values()), s["done"])
    pT.wait_for_timeout(300)
    check("E: tablet's screen now shows the paused clock", pT.locator("#clkgo").inner_text() == "Resume", pT.locator("#clkgo").inner_text())
    check("E: tablet's screen shows the laptop's verdict on st9 (wrong) after the merge", pT.locator('[data-item="st9"] [data-v="wrong"]').get_attribute("aria-pressed") == "true", pT.locator('[data-item="st9"] [data-v="wrong"]').get_attribute("aria-pressed"))
    shot(pT, "plan-tablet-after-merge-1366-light", full=False)
    cT.close(); cL.close()

    # ---- F. refresh with unsaved changes (Kept on device) ----
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail"); pg.wait_for_timeout(500)
    fake.fail_writes = 500
    pg.locator('[data-item="st9"] [data-v="partly"]').click(); pg.locator('[data-item="st9"] input.note').fill("unsaved note")
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Not saved') === 0", timeout=12000)
    pg.reload(); pg.wait_for_selector(".rail"); pg.wait_for_timeout(1500)
    check("F: after a refresh the unsaved verdict is back", pg.locator('[data-item="st9"] [data-v="partly"]').get_attribute("aria-pressed") == "true")
    check("F: after a refresh the unsaved note is back", pg.locator('[data-item="st9"] input.note').input_value() == "unsaved note", pg.locator('[data-item="st9"] input.note').input_value())
    print("F: status after reload with GitHub still failing:", saveline(pg))
    fake.fail_writes = None; pg.reload(); pg.wait_for_selector(".rail"); wait_save(pg, 30000)
    check("F: the local copy is pushed on the next open when GitHub works", sess(fake)["answers"]["st9"]["note"] == "unsaved note")
    c.close()

    # ---- G. back button to home while a save is in flight ----
    fake = FakeGH(); H = Holder(fake)
    c = b.new_context(viewport={"width": 1366, "height": 768}, service_workers="block"); c.errs = []
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');")
    c.route("https://api.github.com/**", H.route)
    pg = c.new_page(); pg.on("pageerror", lambda e: c.errs.append(str(e)[:200])); pg.goto(B + "#/"); pg.wait_for_selector(".tile")
    pg.goto(B + "#/lesson/" + MATHS); pg.wait_for_selector(".rail"); pg.wait_for_timeout(500)
    H.hold = True; pg.locator('[data-item="st9"] [data-v="right"]').click()
    pg.wait_for_function("document.querySelector('#save').textContent === 'Saving…'", timeout=8000)
    pg.go_back(); pg.wait_for_selector(".tile", timeout=15000)
    check("G: home shows after back while saving", pg.locator(".tile").count() == 2)
    H.hold = False; H.release(); pg.wait_for_timeout(1500)
    check("G: the in-flight save still lands", sess(fake) and sess(fake)["answers"]["st9"]["v"] == "right")
    check("G: status line says Saved on the home page", saveline(pg).startswith("Saved"), saveline(pg))
    pg.wait_for_timeout(1500)
    # does the home page reflect the in-progress lesson?
    print("G: home tile meta:", pg.locator(".tile .st").all_inner_texts())
    check("G: no page errors", not c.errs, c.errs)
    c.close()
    b.close()
summary()
