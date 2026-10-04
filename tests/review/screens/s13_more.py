"""13. Warm home without any network answer, lesson opened first on a slow network, suggestion replies, Record offline after visit."""
from common import *


class Hold:
    def __init__(self, fake): self.fake = fake; self.q = []
    def route(self, route, request=None): self.q.append(route)
    def release(self):
        q, self.q = self.q, []
        for r in q: self.fake.route(r)


with sync_playwright() as p:
    b = launch(p); fake = FakeGH(); H = Hold(fake)
    c = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');")
    c.route("https://api.github.com/**", H.route)
    # first visit: let everything through
    pg = c.new_page(); pg.goto(B + "#/")
    for i in range(100):
        H.release(); pg.wait_for_timeout(100)
        if pg.locator("#homerevq").count() and "Loading" not in pg.locator("#homerevq").inner_text(): break
    pg.wait_for_timeout(500); H.release()
    # second visit: hold EVERY request; does the home page still draw from the device cache?
    p2 = c.new_page(); t0 = time.time(); p2.goto(B + "#/"); shown = None
    for i in range(60):
        p2.wait_for_timeout(100)
        if p2.locator(".tile").count(): shown = time.time() - t0; break
    print("warm home with the network answering nothing: tiles after", shown, "| held requests:", [r.request.url.split("/repos/")[-1][:60] for r in H.q])
    check("warm home draws from the device cache before GitHub answers", shown is not None and shown < 2, shown)
    txt = p2.locator("#app").inner_text()[:80].replace("\n", " "); print("home text while waiting:", txt)
    H.release(); p2.wait_for_timeout(500)
    # a lesson opened directly on a slow network, fresh device
    c2 = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block"); f2 = FakeGH(); H2 = Hold(f2)
    c2.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');"); c2.route("https://api.github.com/**", H2.route)
    p3 = c2.new_page(); p3.goto(B + "#/lesson/" + CHEM); p3.wait_for_timeout(600); first = p3.locator("#app").inner_text()[:60].replace("\n", " ")
    check("fresh device, lesson opened first: 'Opening the lesson' shows while the tree loads", "Opening the lesson" in first, first)
    H2.release(); p3.wait_for_timeout(600); second = p3.locator("#app").inner_text()[:60].replace("\n", " "); print("after the tree:", second, "| held now:", len(H2.q))
    H2.release(); p3.wait_for_timeout(800); H2.release(); p3.wait_for_timeout(300)
    check("...then the plan draws", p3.locator(".rail").count() == 1, p3.locator("#app").inner_text()[:60])
    c2.close()
    # Record offline after it was visited once
    f3 = FakeGH(); c3 = ctx(b, f3); p4 = page(c3, "#/record", ".stats .stat"); p4.wait_for_timeout(500); f3.fail = 500
    p4.goto(B + "#/"); p4.wait_for_timeout(1500); p4.goto(B + "#/record"); p4.wait_for_timeout(2000)
    check("Record visited once, then GitHub down: Record still draws from the cache", p4.locator(".stats .stat").count() == 4, p4.locator("#app").inner_text()[:80])
    p4.goto(B + "#/revise"); p4.wait_for_timeout(2000)
    print("revise with GitHub down after a visit:", p4.locator("#revbox").inner_text()[:120].replace("\n", " | "))
    check("Revise with GitHub down (mistakes cached): still shows the due list", p4.locator(".rev").count() == 1, p4.locator("#revbox").inner_text()[:100])
    p4.goto(B + "#/videos"); p4.wait_for_timeout(2000)
    print("videos with GitHub down after a visit:", p4.locator("#app").inner_text()[:160].replace("\n", " | "))
    check("Videos with GitHub down (never visited): error screen", "Couldn" in p4.locator("#app").inner_text())
    c3.close()
    # suggestion replies
    f5 = FakeGH(); c5 = ctx(b, f5); p5 = page(c5, "#/", ".tile"); p5.locator("[data-suggest]").first.click(); p5.wait_for_selector("#sug"); p5.wait_for_timeout(1000)
    p5.locator("#sug-list summary").click(); p5.wait_for_timeout(300)
    reps = [r for r in p5.locator(".sug-reply").all_inner_texts() if r.strip()]; print("replies:", reps[:4], len(reps))
    check("Your suggestions list shows Claude's replies", any(r.startswith("Done") or r.startswith("Later") for r in reps), reps[:3])
    shot(p5, "suggest-list-open-1280-light", full=False)
    c5.close(); c.close(); b.close()
summary()
