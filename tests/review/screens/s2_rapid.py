"""2. Rapid clicks and double taps. Also re-runs scenario A (offline mid-save) with a proper hold."""
from common import *


class Holder:
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
    # ---- A again: offline in the middle of a save ----
    fake = FakeGH(); H = Holder(fake)
    c = b.new_context(viewport={"width": 1366, "height": 768}, service_workers="block"); c.errs = []
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');")
    c.route("https://api.github.com/**", H.route)
    pg = c.new_page(); pg.on("pageerror", lambda e: c.errs.append(str(e)[:200])); pg.goto(B + "#/lesson/" + MATHS); pg.wait_for_selector(".rail"); pg.wait_for_timeout(500)
    H.hold = True
    pg.locator('[data-item="st9"] [data-v="right"]').click()
    pg.wait_for_function("document.querySelector('#save').textContent === 'Saving…'", timeout=8000); pg.wait_for_timeout(400)
    check("A: PUT is in flight (held)", len(H.pending) == 1, len(H.pending))
    H.offline = True; c.set_offline(True)
    pg.locator('.rail button[data-phase="m2"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-item="s6q15"] [data-v="wrong"]').click(); pg.locator('[data-item="s6q16"] [data-v="partly"]').click()
    pg.locator("#clkgo").click(); pg.wait_for_timeout(300)
    print("A: status while offline with a held PUT:", saveline(pg))
    H.hold = False; H.release(); pg.wait_for_timeout(2500)
    st = saveline(pg); print("A: status after the first PUT lands while offline:", st)
    check("A: after the in-flight PUT lands while offline the status says Offline", st.startswith("Offline"), st)
    s = sess(fake); check("A: first PUT holds only the first tap", s and s["answers"].get("st9", {}).get("v") == "right" and "s6q15" not in s["answers"], list((s or {}).get("answers", {})))
    pg.wait_for_timeout(5000)
    aborted = [x for x in fake.log if x[0] == "PUT" and "ABORTED" in x[1]]
    check("A: no PUT attempted while offline", len(puts_of(fake)) == 1 and not aborted, aborted[:3])
    H.offline = False; c.set_offline(False); wait_save(pg, 20000)
    s = sess(fake)
    check("A: back online: every tap saved, in one more PUT", len(puts_of(fake)) == 2 and s["answers"]["st9"]["v"] == "right" and s["answers"]["s6q15"]["v"] == "wrong" and s["answers"]["s6q16"]["v"] == "partly" and s["time"]["log"][0]["e"] == "start", (len(puts_of(fake)), list(s["answers"])))
    c.close()

    # ---- rapid clicking ----
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail"); pg.wait_for_timeout(500)
    # verdict double tap
    btn = pg.locator('[data-item="st9"] [data-v="right"]'); btn.dblclick(); pg.wait_for_timeout(200)
    check("double tap on a verdict un-sets it (aria-pressed false)", btn.get_attribute("aria-pressed") == "false", btn.get_attribute("aria-pressed"))
    tally = pg.locator("#tally").inner_text()
    check("tally after the double tap shows no answer counted", "Tap a verdict" in tally, tally)
    btn.click(); pg.wait_for_timeout(100); check("single tap sets it again", btn.get_attribute("aria-pressed") == "true")
    # rapid 7 clicks on the clock
    for i in range(7): pg.locator("#clkgo").click()
    pg.wait_for_timeout(400); lg = pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('tutor.s.')))).session.time.log.map(e=>e.e)")
    check("7 quick clock taps give start,pause,resume... (7 entries) and the button reads Pause", lg == ["start", "pause", "resume", "pause", "resume", "pause", "resume"] and pg.locator("#clkgo").inner_text() == "Pause", (lg, pg.locator("#clkgo").inner_text()))
    # rapid rail phase buttons
    for ph in ["m2", "m3", "m4", "m5", "m1", "m3", "_time", "m2"]: pg.locator('.rail button[data-phase="%s"]' % ph).click()
    pg.wait_for_timeout(400)
    check("rapid rail taps end on the last phase", pg.locator('.rail button[aria-current="step"]').get_attribute("data-phase") == "m2")
    lg = pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('tutor.s.')))).session.time.log")
    print("phase events logged by rail taps:", [(e["e"], e.get("p")) for e in lg][-8:])
    # rail Times shows "took" for phases visited for a split second?
    wait_save(pg, 20000)
    s = sess(fake); pm = s["time"]["phaseMinutes"]; print("phaseMinutes after rapid rail taps:", pm)
    # Add extra: double click submit
    pg.locator('.rail button[data-phase="_extra"]').click(); pg.wait_for_timeout(200)
    pg.fill("#ex-q", "dup?"); pg.locator('[data-exv="right"]').click(); pg.locator("#exform button[type=submit]").dblclick(); pg.wait_for_timeout(400)
    n = pg.locator("input[data-exq]").count()
    check("double click on Add makes one extra question, not two", n == 1, n)
    # Extra verdict chips: click twice toggles off (intended?)
    pg.locator('[data-exv="wrong"]').click(); pg.locator('[data-exv="wrong"]').click()
    check("extra verdict chip: second tap un-presses it", pg.locator('[data-exv="wrong"]').get_attribute("aria-pressed") == "false")
    # upload double click
    jpg = os.path.join(HERE, "big.jpg"); pg.locator('.rail button[data-phase="_work"]').click(); pg.wait_for_timeout(200)
    pg.set_input_files("#wk-files", [jpg]); pg.locator("#wk-go").dblclick()
    pg.wait_for_function("document.querySelectorAll('#phasebox .thumbs').length >= 1", timeout=60000); pg.wait_for_timeout(1500)
    work = [k for k in fake.puts if "/work/" in k]
    check("double click on Upload uploads the photo once", len(work) == 1, work)
    # Finish double submit
    pg.locator('.rail button[data-phase="_after"]').click(); pg.wait_for_timeout(300); pg.fill("#fb-cov", "x")
    before = len(puts_of(fake)); pg.locator("#fbform button[type=submit]").dblclick(); pg.wait_for_timeout(3000)
    s = sess(fake); ends = [e for e in s["time"]["log"] if e["e"] == "end"]
    check("double click on Finish: status finished, one 'end' in the log", s["status"] == "finished" and len(ends) == 1, (s["status"], len(ends)))
    check("double click on Finish: at most 2 PUTs, none conflicting", len(puts_of(fake)) - before <= 2 and not [x for x in fake.log if x[0] == "GET" and x[1].endswith("session.json") and "/contents/" in x[1]], len(puts_of(fake)) - before)
    # theme button rapid
    for i in range(4): pg.locator("#theme").click()
    pg.wait_for_timeout(100); lab = pg.locator("#theme").inner_text(); th = pg.evaluate("localStorage.getItem('tutor.theme')"); attr = pg.evaluate("document.documentElement.getAttribute('data-theme')")
    check("4 quick theme taps: label, storage and attribute agree (light)", th == "light" and "Light" in lab and attr == "light", (lab, th, attr))
    check("no page errors in the rapid-click run", not [e for e in c.errs if "localStorage" not in e], c.errs)
    c.close(); b.close()
summary()
