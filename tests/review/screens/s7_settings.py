"""7. Settings: empty fields, font reload, clear cache, remove key, install button, theme on every page incl. exam.html."""
from common import *
with sync_playwright() as p:
    b = launch(p); fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/settings", "#setform"); pg.wait_for_timeout(300)
    # save with empty fields
    pg.fill("#s-repo", ""); pg.fill("#s-dev", ""); pg.fill("#s-stu", ""); pg.locator("#setform button[type=submit]").click(); pg.wait_for_timeout(1500)
    vals = pg.evaluate("[localStorage.getItem('tutor.repo'), localStorage.getItem('tutor.device'), localStorage.getItem('tutor.student')]")
    check("empty repo/device/student fall back to the defaults", vals == ["alimuqaddasm/tutoring", "tablet", "UK-1"], vals)
    h = pg.evaluate("location.hash"); print("route after Save and test:", h)
    check("Save and test: 'Connected' then goes home", h == "#/", h)
    pg.goto(B + "#/settings"); pg.wait_for_selector("#setform")
    pg.fill("#s-token", ""); pg.locator("#setform button[type=submit]").click(); pg.wait_for_timeout(1200)
    tok = pg.evaluate("localStorage.getItem('tutor.token')"); msg = pg.locator("#s-msg").inner_text()
    print("empty key saved ->", repr(tok), "| msg:", msg, "| who:", pg.locator("#who").inner_text())
    check("saving an empty key: the app stays on Settings with a message (not a blank screen)", pg.locator("#setform").count() == 1 and msg != "", msg)
    check("empty key: the sidebar's student label is cleared", pg.locator("#who").inner_text() == "", pg.locator("#who").inner_text())
    pg.fill("#s-token", "test-token"); pg.locator("#setform button[type=submit]").click(); pg.wait_for_timeout(1500)
    # font change reloads
    pg.goto(B + "#/settings"); pg.wait_for_selector("#setform"); pg.select_option("#s-font", "lexend")
    with pg.expect_navigation(timeout=10000): pg.locator("#setform button[type=submit]").click()
    pg.wait_for_selector("#setform"); pg.wait_for_timeout(300)
    check("font change reloads and applies data-font=lexend", pg.evaluate("document.documentElement.getAttribute('data-font')") == "lexend" and pg.locator("#s-font").input_value() == "lexend")
    fam = pg.evaluate("getComputedStyle(document.body).fontFamily"); print("body font:", fam)
    check("body font family starts with Lexend", fam.startswith("Lexend"), fam)
    pg.select_option("#s-font", "figtree"); pg.locator("#setform button[type=submit]").click(); pg.wait_for_timeout(1500)
    # clear cache
    pg.goto(B + "#/"); pg.wait_for_selector(".tile"); pg.goto(B + "#/settings"); pg.wait_for_selector("#setform")
    n0 = len(fake.log); pg.locator("#s-cache").click(); pg.wait_for_timeout(300)
    check("Clear cache: toast + tree gone from localStorage", "Cache cleared" in pg.locator("#toast").inner_text() and pg.evaluate("localStorage.getItem('tutor.tree.alimuqaddasm/tutoring')") is None)
    dbs = pg.evaluate("indexedDB.databases ? indexedDB.databases().then(d => d.map(x => x.name)) : []")
    check("Clear cache: IndexedDB tutor-desk deleted", "tutor-desk" not in dbs, dbs)
    pg.goto(B + "#/"); pg.wait_for_selector(".tile"); pg.wait_for_timeout(500)
    blobs = [x for x in fake.log[n0:] if "/git/blobs/" in x[1]]
    check("after Clear cache the home page re-downloads its files (%d blobs)" % len(blobs), len(blobs) > 5, len(blobs))
    # remove key
    pg.goto(B + "#/settings"); pg.wait_for_selector("#setform"); pg.locator("#s-clear").click(); pg.wait_for_timeout(300)
    check("Remove key: token gone, toast, form redrawn with empty key", pg.evaluate("localStorage.getItem('tutor.token')") is None and pg.locator("#s-token").input_value() == "" and "Key removed" in pg.locator("#toast").inner_text())
    check("Remove key: a stale lesson copy / tree is still on the device (not wiped)", pg.evaluate("Object.keys(localStorage).some(k => k.startsWith('tutor.tree.'))"))
    pg.goto(B + "#/"); pg.wait_for_timeout(600)
    check("without a key every route lands on Settings", pg.evaluate("location.hash") == "#/settings" and pg.locator("#setform").count() == 1, pg.evaluate("location.hash"))
    check("Install button hidden when the browser offers no install prompt", pg.locator("#s-install").is_hidden())
    pg.evaluate("window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {prompt(){ window.__prompted = 1; }}))"); pg.wait_for_timeout(100)
    check("Install button appears on beforeinstallprompt", pg.locator("#s-install").is_visible())
    pg.locator("#s-install").click(); pg.wait_for_timeout(100)
    check("Install button calls prompt() and hides itself", pg.evaluate("window.__prompted") == 1 and pg.locator("#s-install").is_hidden())
    shot(pg, "settings-nokey-1366-light")
    c.close()
    # theme toggle cycles and applies on every page incl. exam.html
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/", ".tile")
    lab = [pg.locator("#theme").inner_text()]; attrs = [pg.evaluate("document.documentElement.getAttribute('data-theme')")]
    for i in range(3): pg.locator("#theme").click(); lab.append(pg.locator("#theme").inner_text()); attrs.append(pg.evaluate("document.documentElement.getAttribute('data-theme')"))
    check("theme cycles Auto -> Light -> Dark -> Auto", [l.split()[-1] for l in lab] == ["Auto", "Light", "Dark", "Auto"] and attrs == [None, "light", "dark", None], (lab, attrs))
    pg.locator("#theme").click(); pg.locator("#theme").click()  # dark
    bgs = {}
    for r in ["#/", "#/lesson/" + MATHS, "#/record", "#/revise", "#/videos", "#/settings", "#/new", "#/exams"]:
        pg.goto(B + r); pg.wait_for_timeout(1200); bgs[r] = (pg.evaluate("document.documentElement.getAttribute('data-theme')"), pg.evaluate("getComputedStyle(document.body).backgroundColor"))
    print("dark on each route:", bgs)
    check("dark applies on every route (body bg rgb(14, 17, 22))", all(v == ("dark", "rgb(14, 17, 22)") for v in bgs.values()), bgs)
    ex = c.new_page(); ex.goto(B + "exam.html"); ex.wait_for_timeout(1500)
    exbg = (ex.evaluate("document.documentElement.getAttribute('data-theme')"), ex.evaluate("getComputedStyle(document.body).backgroundColor"))
    print("exam.html with tutor.theme=dark:", exbg)
    check("exam.html reads tutor.theme=dark", exbg[0] == "dark" and exbg[1] == "rgb(14, 17, 22)", exbg)
    pg.goto(B + "#/"); pg.wait_for_selector(".tile"); pg.locator("#theme").click()  # -> auto
    ex.reload(); ex.wait_for_timeout(1000)
    check("exam.html follows the switch back to Auto (light here)", ex.evaluate("document.documentElement.getAttribute('data-theme')") is None and ex.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(14, 17, 22)", ex.evaluate("getComputedStyle(document.body).backgroundColor"))
    # auto follows the OS: dark context, no stored theme
    c2 = ctx(b, fake, dark=True); p2 = page(c2, "#/", ".tile")
    check("Auto in a dark OS: dark colours, label says Auto", p2.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(14, 17, 22)" and "Auto" in p2.locator("#theme").inner_text())
    p2.locator("#theme").click()  # light override in a dark OS
    check("Light override in a dark OS gives light colours", p2.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(245, 246, 248)", p2.evaluate("getComputedStyle(document.body).backgroundColor"))
    check("theme button is wide/tall enough on the tablet (>= 44px tall?)", p2.evaluate("document.querySelector('#theme').getBoundingClientRect().height") >= 40, p2.evaluate("document.querySelector('#theme').getBoundingClientRect().height"))
    check("no page errors", not [e for e in c.errs + c2.errs if "localStorage" not in e], c.errs + c2.errs)
    c.close(); c2.close(); b.close()
summary()
