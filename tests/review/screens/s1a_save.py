"""1. Saving: verdicts, notes, clock, ticks, extra question, uploads, After the lesson + Finish."""
from common import *
from PIL import Image

fake = FakeGH()
jpg = os.path.join(HERE, "big.jpg"); pdf = os.path.join(HERE, "work.pdf"); txt = os.path.join(HERE, "notes.txt")
if not os.path.exists(jpg):
    im = Image.new("RGB", (3000, 4000), (240, 240, 230))
    for y in range(0, 4000, 200): im.paste((20, 20, 120), (100, y, 2900, y + 6))
    im.save(jpg, "JPEG", quality=90)
if not os.path.exists(pdf):
    Image.new("RGB", (800, 1100), "white").save(pdf, "PDF")
open(txt, "w").write("not a photo")
print("jpeg bytes", os.path.getsize(jpg))

with sync_playwright() as p:
    b = launch(p); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail")
    pg.wait_for_timeout(800)
    # verdict + note on st9
    pg.locator('[data-item="st9"] [data-v="right"]').click()
    check("tap shows Kept on device at once", saveline(pg) == "Kept on device", saveline(pg))
    pg.locator('[data-item="st9"] input.note').fill("drew the stretch wrong first")
    pg.locator("#clkgo").click(); pg.wait_for_timeout(300)
    check("clock button turns into Pause", pg.locator("#clkgo").inner_text() == "Pause", pg.locator("#clkgo").inner_text())
    pg.locator("[data-tick]").first.click()
    pg.locator('.rail button[data-phase="m2"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-item="s6q15"] [data-v="wrong"]').click()
    pg.locator('[data-item="s6q15"] input.mk').fill("3")
    t0 = time.time()
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Saved') === 0", timeout=15000)
    print("first save landed after %.1fs" % (time.time() - t0))
    s = sess(fake)
    check("session.json written", s is not None)
    check("verdict right on st9 saved", s["answers"]["st9"]["v"] == "right")
    check("note saved", s["answers"]["st9"]["note"] == "drew the stretch wrong first", s["answers"]["st9"].get("note"))
    check("verdict wrong + marks on s6q15 saved", s["answers"]["s6q15"]["v"] == "wrong" and s["answers"]["s6q15"]["m"] == 3, s["answers"]["s6q15"])
    check("status in-progress", s["status"] == "in-progress", s["status"])
    check("time log has start with phase m1", s["time"]["log"][0]["e"] == "start" and s["time"]["log"][0]["p"] == "m1", s["time"]["log"])
    check("one step ticked", len([k for k, v in s["done"].items() if not v.get("off")]) == 1, s["done"])
    check("device recorded", s["devices"] == ["test"] and s["time"]["log"][0]["d"] == "test", s["devices"])
    nputs = sum(1 for m, pth in fake.log if m == "PUT")
    check("all of that went in ONE PUT", nputs == 1, nputs)
    # extra question
    pg.locator('.rail button[data-phase="_extra"]').click(); pg.wait_for_timeout(200)
    pg.fill("#ex-q", "Why is 2cosec2x undefined at 0?"); pg.locator('[data-exv="partly"]').click(); pg.fill("#ex-note", "said asymptote at pi/4")
    pg.locator("#exform button[type=submit]").click(); pg.wait_for_timeout(300)
    check("extra question listed", pg.locator(".items .item input[data-exq]").count() == 1)
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Saved') === 0", timeout=15000)
    s = sess(fake); ex = s["extra"]
    check("extra saved with verdict and note", len(ex) == 1 and ex[0]["v"] == "partly" and ex[0]["note"] == "said asymptote at pi/4", ex)
    # uploads
    pg.locator('.rail button[data-phase="_work"]').click(); pg.wait_for_timeout(200)
    pg.set_input_files("#wk-files", [jpg, pdf]); pg.select_option("#wk-item", "s6q15"); pg.fill("#wk-note", "page 1 blurry")
    pg.locator("#wk-go").click()
    pg.wait_for_function("document.querySelectorAll('#phasebox .thumbs').length >= 2", timeout=60000); pg.wait_for_timeout(300)
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Saved') === 0", timeout=15000)
    work = [k for k in fake.puts if "/work/" in k]
    print("work files:", work, [len(fake.puts[k]) for k in work])
    check("two work files uploaded (jpg + pdf)", len(work) == 2 and any(k.endswith(".jpg") for k in work) and any(k.endswith(".pdf") for k in work), work)
    jk = [k for k in work if k.endswith(".jpg")][0]
    import io
    im = Image.open(io.BytesIO(fake.puts[jk])); print("uploaded jpeg size", im.size, len(fake.puts[jk]))
    check("photo shrunk to long side 2400", max(im.size) == 2400 and im.size == (1800, 2400), im.size)
    check("uploaded jpeg under 1.5 MB", len(fake.puts[jk]) < 1500000, len(fake.puts[jk]))
    check("pdf bytes intact", fake.puts[[k for k in work if k.endswith(".pdf")][0]] == open(pdf, "rb").read())
    s = sess(fake); w = s["work"]
    check("session.work has 2 entries with item + kind + note", len(w) == 2 and all(x["item"] == "s6q15" and x["kind"] == "class" and x["note"] == "page 1 blurry" for x in w), w)
    check("work file names contain the item", all("s6q15" in x["file"] for x in w), [x["file"] for x in w])
    shot(pg, "plan-work-after-upload-1366-light", full=False)
    # wrong type
    nb = len(fake.puts)
    pg.set_input_files("#wk-files", [txt]); pg.locator("#wk-go").click(); pg.wait_for_timeout(1500)
    msg = pg.locator("#wk-st").inner_text()
    check("wrong file type gives a plain message and no upload", "isn" in msg and len(fake.puts) == nb, msg)
    check("upload button re-enabled after the failure", not pg.locator("#wk-go").is_disabled())
    # After the lesson + finish
    pg.locator('.rail button[data-phase="_after"]').click(); pg.wait_for_timeout(300)
    pg.locator('[data-rate="4"]').click(); pg.fill("#fb-cov", "Did Q15 to Q17"); pg.fill("#fb-change", "More time on sketches"); pg.fill("#fb-hw", "Q18")
    check("rail Times shows minutes", "min" in pg.locator('.rail button[data-phase="_time"] .tm').inner_text(), pg.locator('.rail button[data-phase="_time"] .tm').inner_text())
    before = sum(1 for m, pth in fake.log if m == "PUT")
    pg.locator("#fbform button[type=submit]").click(); pg.wait_for_timeout(2500)
    s = sess(fake)
    check("Finish: status finished", s["status"] == "finished", s["status"])
    check("Finish: feedback saved (rating, covered, change, hw)", s["feedback"]["rating"] == 4 and s["feedback"]["covered"] == "Did Q15 to Q17" and s["feedback"]["change"] == "More time on sketches" and s["feedback"]["hw"] == "Q18", s["feedback"])
    check("Finish: clock ended, log ends with end", s["time"]["log"][-1]["e"] == "end", s["time"]["log"])
    check("Finish: minutes computed (>0, small)", s["time"]["minutes"] is not None and 0 < s["time"]["minutes"] < 2, s["time"]["minutes"])
    check("Finish: started/ended set", s["time"]["started"] and s["time"]["ended"], s["time"])
    after = sum(1 for m, pth in fake.log if m == "PUT")
    check("Finish used one PUT", after - before == 1, after - before)
    check("toast says Lesson saved to GitHub", "Lesson saved" in pg.locator("#toast").inner_text(), pg.locator("#toast").inner_text())
    check("button now says Save changes + Reopen", pg.locator("#reopen").count() == 1 and "Save changes" in pg.locator("#fbform button[type=submit]").inner_text())
    shot(pg, "plan-after-finished-1366-light", full=False)
    # the whole session is valid JSON with v:2 and still has the earlier answers
    check("earlier verdicts survive Finish", s["answers"]["st9"]["v"] == "right" and len(s["extra"]) == 1 and len(s["work"]) == 2)
    allputs = [pth for m, pth in fake.log if m == "PUT"]
    print("PUT paths:", allputs)
    check("no 409 / repeated PUTs for the same save", len([x for x in allputs if x.endswith("session.json")]) <= 5, len([x for x in allputs if x.endswith("session.json")]))
    check("no page errors (ignoring the youtube iframe localStorage one)", not [e for e in c.errs if "localStorage" not in e], c.errs)
    b.close()
summary()
