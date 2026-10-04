"""9b. Slow network measured properly: requests are delayed without blocking the Playwright loop, so they overlap like real ones."""
from common import *


class Delayed:
    def __init__(self, fake, d): self.fake = fake; self.d = d; self.q = []
    def route(self, route, request=None): self.q.append((time.time() + self.d, route))
    def pump(self):
        now = time.time(); keep = []
        for t, r in self.q:
            if t <= now: self.fake.route(r)
            else: keep.append((t, r))
        self.q = keep


def wait_for(pg, D, sel, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        D.pump(); pg.wait_for_timeout(50)
        if pg.locator(sel).count(): return time.time() - t0
    return None


with sync_playwright() as p:
    b = launch(p)
    for d in (2, 5):
        fake = FakeGH(); D = Delayed(fake, d)
        c = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');")
        c.route("https://api.github.com/**", D.route); pg = c.new_page()
        pg.goto(B + "#/"); n0 = len(fake.log)
        th = wait_for(pg, D, ".tile")
        shot(pg, "home-justloaded-delay%d-1280-light" % d, full=False)
        trev = wait_for(pg, D, "#homerevq:not(:has-text('Loading'))")
        print("DELAY %ds COLD home: tiles after %.1fs (%.1f round trips), warm-up box filled after %.1fs, %d requests" % (d, th, th / d, th + (trev or 0), len(fake.log) - n0))
        check("delay %ds: cold home draws within 4 round trips" % d, th <= 4 * d + 1, "%.1fs" % th)
        # a lesson never opened before, in this context (tree known, blobs for the script not yet)
        pg.goto(B + "#/lesson/" + CHEM); pg.wait_for_timeout(100); first = pg.locator("#app").inner_text()[:40].replace("\n", " ")
        tl = wait_for(pg, D, ".rail"); print("DELAY %ds lesson (not cached): first '%s', plan after %.1fs" % (d, first, tl))
        check("delay %ds: lesson shows 'Opening the lesson' while it loads" % d, "Opening" in first, first)
        check("delay %ds: lesson plan within 2 round trips" % d, tl <= 2 * d + 1, "%.1fs" % tl)
        if d == 5: shot(pg, "lesson-opening-delay5-1280-light", full=False) if False else None
        pg.goto(B + "#/record"); pg.wait_for_timeout(100); first = pg.locator("#app").inner_text()[:120].replace("\n", " ")
        tr = wait_for(pg, D, ".stats .stat"); print("DELAY %ds record: first '%s', drawn after %.1fs" % (d, first, tr))
        check("delay %ds: Record shows 'Loading his record' first" % d, "Loading his record" in first, first)
        check("delay %ds: Record within 2 round trips" % d, tr <= 2 * d + 1, "%.1fs" % tr)
        # a tap on a slow network: status line
        pg.goto(B + "#/lesson/" + MATHS); wait_for(pg, D, ".rail"); pg.wait_for_timeout(300)
        pg.locator('[data-item="st9"] [data-v="right"]').click(); t0 = time.time(); seen = []
        while time.time() - t0 < 4 + d + 3:
            D.pump(); pg.wait_for_timeout(100); s = saveline(pg)
            if not seen or seen[-1] != s: seen.append(s)
        print("DELAY %ds save status sequence:" % d, seen)
        check("delay %ds: status Kept on device -> Saving… -> Saved" % d, seen[:3] == ["Kept on device", "Saving…"] + [x for x in seen[2:3]] and seen[-1].startswith("Saved"), seen)
        # warm start in a new page of the same context: tree from localStorage, blobs from IndexedDB
        p2 = c.new_page(); p2.goto(B + "#/"); tw = wait_for(p2, D, ".tile"); print("DELAY %ds WARM home (same device, second visit): tiles after %.2fs" % (d, tw))
        check("delay %ds: warm home draws instantly from the device cache (under 1 s)" % d, tw < 1, "%.2fs" % tw)
        c.close()
    b.close()
summary()
