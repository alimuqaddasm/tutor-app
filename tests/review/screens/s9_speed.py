"""9. Speed: cold vs warm home page, request counts and bytes, slow network (2 s, 5 s) screens."""
from common import *
import json, re


def bytes_served(fake, log_from=0):
    tot = 0; blobs = 0; tree = 0; others = 0
    tj = json.dumps(fake.tree()); shamap = {t["sha"]: t["path"] for t in fake.tree()["tree"]}
    paths = []
    for m, pth in fake.log[log_from:]:
        if m != "GET": continue
        mm = re.search(r"/git/blobs/([0-9a-f]{40})$", pth)
        if mm: b = fake.blob(mm.group(1)) or b""; tot += len(b); blobs += 1; paths.append((shamap.get(mm.group(1), "?"), len(b)))
        elif "/git/trees/" in pth: tot += len(tj); tree += 1
        else: others += 1
    return dict(total=tot, blobs=blobs, tree=tree, treebytes=len(tj), others=others, paths=paths)


with sync_playwright() as p:
    b = launch(p)
    # cold
    fake = FakeGH(); c = ctx(b, fake); pg = c.new_page(); t0 = time.time(); pg.goto(B + "#/"); pg.wait_for_selector(".tile"); cold = time.time() - t0
    pg.wait_for_timeout(2500)  # let the revise box and the badge finish
    bs = bytes_served(fake); print("COLD home: %.2fs, requests %d, blobs %d, tree %d (%d bytes), total %d bytes" % (cold, len(fake.log), bs["blobs"], bs["tree"], bs["treebytes"], bs["total"]))
    for pth, n in sorted(bs["paths"], key=lambda x: -x[1]): print("   %7d  %s" % (n, pth))
    kinds = {}
    for pth, n in bs["paths"]: k = pth.split("/")[-1]; kinds[k] = kinds.get(k, 0) + 1
    print("   by file:", kinds)
    check("cold home page under 3 s on localhost", cold < 3, "%.2fs" % cold)
    check("home page does not download every lesson's script.json (needed only for title/summary)", kinds.get("script.json", 0) == 0, kinds.get("script.json"))
    check("home page downloads under 300 KB", bs["total"] < 300000, bs["total"])
    # warm: second visit in the same context (IndexedDB has the blobs)
    n0 = len(fake.log); pg2 = c.new_page(); t0 = time.time(); pg2.goto(B + "#/"); pg2.wait_for_selector(".tile"); warm = time.time() - t0; pg2.wait_for_timeout(2000)
    bs2 = bytes_served(fake, n0); print("WARM home: %.2fs, requests %d, blobs %d, total %d bytes" % (warm, len(fake.log) - n0, bs2["blobs"], bs2["total"]))
    check("warm home page: no blob downloads, only the tree request", bs2["blobs"] == 0 and bs2["tree"] >= 1, (bs2["blobs"], bs2["tree"]))
    check("warm home page draws from the device cache in under 1 s", warm < 1.0, "%.2fs" % warm)
    # warm home: how long until the first paint of content (tree in localStorage -> draw before network)?
    tfp = pg2.evaluate("performance.now()")
    # lesson open cold and warm
    n0 = len(fake.log); t0 = time.time(); pg2.goto(B + "#/lesson/" + MATHS); pg2.wait_for_selector(".rail"); tl = time.time() - t0; pg2.wait_for_timeout(3000)
    bs3 = bytes_served(fake, n0); print("LESSON (maths plan) after home: %.2fs, blobs %d, total %d bytes" % (tl, bs3["blobs"], bs3["total"]))
    for pth, n in sorted(bs3["paths"], key=lambda x: -x[1])[:12]: print("   %7d  %s" % (n, pth))
    imgs = [x for x in bs3["paths"] if re.search(r"\.(jpg|png)$", x[0])]
    print("   pictures prefetched: %d, %d bytes" % (len(imgs), sum(n for _, n in imgs)))
    n0 = len(fake.log); t0 = time.time(); pg2.goto(B + "#/record"); pg2.wait_for_selector(".stats .stat"); tr = time.time() - t0; pg2.wait_for_timeout(500)
    bs4 = bytes_served(fake, n0); print("RECORD: %.2fs, blobs %d, total %d bytes" % (tr, bs4["blobs"], bs4["total"]))
    c.close()
    # slow network: what does Ali see?
    for d in (2, 5):
        fake = FakeGH(); fake.delay = d; c = ctx(b, fake); pg = c.new_page()
        t0 = time.time(); pg.goto(B + "#/")
        pg.wait_for_timeout(300); first = pg.locator("#app").inner_text()[:80].replace("\n", " ")
        pg.wait_for_selector(".tile", timeout=120000); th = time.time() - t0
        pg.wait_for_timeout(300); rev = pg.locator("#homerevq").inner_text()
        print("DELAY %ds home: first screen '%s', tiles after %.1fs, revise box: '%s'" % (d, first, th, rev[:40]))
        check("delay %ds: a Loading message shows at once, not a blank page" % d, "Loading" in first, first)
        if d == 5: shot(pg, "home-loading-delay5-1366-light", full=False) if False else None
        n0 = len(fake.log); t0 = time.time(); pg.goto(B + "#/lesson/" + MATHS); pg.wait_for_timeout(300); first = pg.locator("#app").inner_text()[:60].replace("\n", " ")
        pg.wait_for_selector(".rail", timeout=120000); tl = time.time() - t0
        print("DELAY %ds lesson: first '%s', plan after %.1fs, requests %d" % (d, first, tl, len(fake.log) - n0))
        check("delay %ds: opening a lesson shows 'Opening the lesson' first" % d, "Opening" in first, first)
        # how long does the plan page take when the tree is already known (sequential requests?)
        n0 = len(fake.log); t0 = time.time(); pg.goto(B + "#/record"); pg.wait_for_timeout(300); first = pg.locator("#app").inner_text()[:80].replace("\n", " ")
        pg.wait_for_selector(".stats .stat", timeout=180000); trr = time.time() - t0
        print("DELAY %ds record: first '%s', after %.1fs, requests %d" % (d, first, trr, len(fake.log) - n0))
        check("delay %ds: Record shows 'Loading his record' first" % d, "Loading his record" in first, first)
        if d == 5:
            check("delay 5s: Record is drawn within ~2 round trips (under 16 s)", trr < 16, "%.1fs" % trr)
            check("delay 5s: lesson plan is drawn within ~2 round trips (under 16 s)", tl < 16, "%.1fs" % tl)
            check("delay 5s: home is drawn within ~3 round trips (under 20 s)", th < 20, "%.1fs" % th)
        c.close()
    # slow network + a tap: does the status line reflect the long save?
    fake = FakeGH(); fake.delay = 2; c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail", 60000); pg.wait_for_timeout(2500)
    pg.locator('[data-item="st9"] [data-v="right"]').click(); pg.wait_for_timeout(4300); s1 = saveline(pg); pg.wait_for_timeout(2500); s2 = saveline(pg)
    check("slow save: status goes Saving… then Saved", s1 == "Saving…" and s2.startswith("Saved"), (s1, s2))
    c.close(); b.close()
summary()
