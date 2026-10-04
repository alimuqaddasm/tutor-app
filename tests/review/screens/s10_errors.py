"""10. Script errors and console errors on every route, bad routes, broken script.json, GitHub down."""
from common import *
IGN = ("localStorage", "youtube", "ERR_TUNNEL", "ERR_CERT", "googlevideo", "cdnjs")


def clean(errs): return [e for e in errs if not any(k in e for k in IGN)]


with sync_playwright() as p:
    b = launch(p); fake = FakeGH(); fake.extra["students/UK-1/lessons/2026-10-03-chem/script.json"] = b'{"id": "x", broken json'
    c = ctx(b, fake); pg = page(c, "#/", ".tile")
    routes = ["#/", "#/lesson/" + MATHS, "#/lesson/" + CHEM, "#/lesson/" + M1, "#/lesson/" + C1, "#/record", "#/revise", "#/videos", "#/settings", "#/new", "#/exams",
              "#/lesson/does-not-exist", "#/lesson/2026-10-09-maths/teach", "#/lesson/" + CH3, "#/lesson/" + CH3 + "/teach", "#/lesson/%2F%2F%2F", "#/lesson/" + MATHS + "/student", "#/nothing-here", "#/lesson/"]
    for r in routes:
        c.errs[:] = []; c.console[:] = []
        pg.goto(B + r); pg.wait_for_timeout(1800)
        txt = pg.locator("#app").inner_text().strip().replace("\n", " | ")[:110]
        errs = clean(c.errs); cons = clean(c.console)
        check("no script error on %s" % r, not errs, errs)
        if cons: print("   console on %s: %s" % (r, cons[:3]))
        print("   %-42s -> %s" % (r, txt))
    # every Plan sub-part on each real lesson
    for lid in [MATHS, CHEM, M1, C1]:
        pg.goto(B + "#/lesson/" + lid); pg.wait_for_selector(".rail"); pg.wait_for_timeout(300)
        for ph in pg.locator(".rail button").all():
            c.errs[:] = []; ph.click(); pg.wait_for_timeout(250)
            errs = clean(c.errs)
            if errs: check("no script error in %s > %s" % (lid, ph.get_attribute("data-phase")), False, errs)
        check("no script error in any Plan part of %s" % lid, True)
    # bad routes: what Ali sees
    pg.goto(B + "#/lesson/does-not-exist"); pg.wait_for_timeout(1500); txt = pg.locator("#app").inner_text()
    print("does-not-exist screen:", txt[:200].replace("\n", " | "))
    check("unknown lesson id: a clear message, not a blank or an empty lesson that can be saved", ("not" in txt.lower() and "found" in txt.lower()) or "No script" in txt, txt[:120])
    shot(pg, "lesson-does-not-exist-1366-light", full=False)
    pg.goto(B + "#/lesson/" + CH3); pg.wait_for_timeout(1500); txt = pg.locator("#app").inner_text()
    check("broken script.json: 'This file is broken' screen with the file name", "broken" in txt.lower() and "script.json" in txt, txt[:160])
    shot(pg, "lesson-broken-script-1366-light", full=False)
    c.close()
    # GitHub down on each screen (no cached tree): error screens
    for r, name in [("#/", "home"), ("#/lesson/" + MATHS, "lesson"), ("#/record", "record"), ("#/revise", "revise"), ("#/videos", "videos")]:
        f2 = FakeGH(); f2.fail = 500; c2 = ctx(b, f2); pg2 = c2.new_page(); pg2.goto(B + r); pg2.wait_for_timeout(2500)
        txt = pg2.locator("#app").inner_text().replace("\n", " | ")[:160]; print("GitHub 500, %s: %s" % (name, txt))
        check("GitHub down, %s: a plain error screen with a Settings link, no raw JSON blob" % name, "Couldn" in txt and "Settings" in txt and len(txt) < 400, txt)
        shot(pg2, "error-github-down-%s-1366-light" % name, full=False)
        check("GitHub down, %s: no script error" % name, not clean(c2.errs), c2.errs)
        c2.close()
    # GitHub down AFTER a visit (tree cached): does the home page still show?
    f3 = FakeGH(); c3 = ctx(b, f3); pg3 = page(c3, "#/", ".tile"); pg3.wait_for_timeout(1000); f3.fail = 500
    pg3.reload(); pg3.wait_for_timeout(2500); txt = pg3.locator("#app").inner_text()[:100].replace("\n", " ")
    check("GitHub down after a first visit: home page still draws from the device cache", pg3.locator(".tile").count() == 2, txt)
    print("status line:", saveline(pg3))
    check("...and the status line says Offline", saveline(pg3).startswith("Offline"), saveline(pg3))
    pg3.goto(B + "#/lesson/" + MATHS); pg3.wait_for_timeout(2500)
    check("GitHub down: a lesson opened before still opens from the cache", pg3.locator(".rail").count() == 1, pg3.locator("#app").inner_text()[:100])
    pg3.goto(B + "#/record"); pg3.wait_for_timeout(2500)
    print("record with GitHub down after a visit:", pg3.locator("#app").inner_text()[:120].replace("\n", " | "))
    check("GitHub down: Record still draws from the cache", pg3.locator(".stats .stat").count() == 4, pg3.locator("#app").inner_text()[:100])
    c3.close()
    # Settings test with a refused key (401)
    f4 = FakeGH(); f4.fail = 401; c4 = ctx(b, f4); pg4 = c4.new_page(); pg4.goto(B + "#/settings"); pg4.wait_for_selector("#setform"); pg4.locator("#setform button[type=submit]").click(); pg4.wait_for_timeout(1500)
    check("Settings > Save and test with a refused key says so", "refused" in pg4.locator("#s-msg").inner_text(), pg4.locator("#s-msg").inner_text())
    # a tap with a refused key
    f5 = FakeGH(); c5 = ctx(b, f5); pg5 = page(c5, "#/lesson/" + MATHS, ".rail"); f5.fail_writes = 401
    pg5.locator('[data-item="st9"] [data-v="right"]').click(); pg5.wait_for_timeout(6000)
    check("tap with a refused key: status 'Key refused' + toast", saveline(pg5) == "Key refused" and "refused" in pg5.locator("#toast").inner_text(), (saveline(pg5), pg5.locator("#toast").inner_text()))
    shot(pg5, "plan-key-refused-1366-light", full=False)
    c4.close(); c5.close(); b.close()
summary()
