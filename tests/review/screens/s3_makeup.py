"""3. Make-up minutes: pending ask, No I missed it, he missed it, try-out, numbers by hand."""
from common import *
import json

FAKE_LESSON = "2026-10-03-maths"
SCRIPT = json.dumps({"id": FAKE_LESSON, "date": "2026-10-03", "subject": "maths", "title": "Pretend maths lesson (QA)", "status": "ready", "phases": [{"id": "p1", "name": "Only part", "blocks": [{"type": "text", "html": "<p>Pretend content for the make-up test, long enough to be tickable here.</p>"}]}]}).encode()
MK = "students/UK-1/makeup.json"


def fresh():
    f = FakeGH(); f.extra["students/UK-1/lessons/%s/script.json" % FAKE_LESSON] = SCRIPT; return f


with sync_playwright() as p:
    b = launch(p)
    # real data: no pending ask expected (every dated lesson before today is logged with minutes + feedback)
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/", ".tile"); pg.wait_for_timeout(1200)
    check("real data: no 'Was it taught?' ask (all past lessons logged)", pg.locator(".ask").count() == 0, pg.locator(".ask").count())
    chip = pg.locator(".mkchip .num").inner_text(); side = pg.locator("#mkside .num").inner_text()
    check("real data: make-up owed = 135 + 45 - (10 + 3) - 0 = 167 (chip, sidebar, card agree)", chip == "167" and side == "167" and pg.locator("#mkcard .big").inner_text() == "167", (chip, side))
    lines = pg.locator("#mkcard .statline").all_inner_texts()
    check("real data: card lines 135 / +45 / -13 / -0", [l.split("\n")[-1] for l in lines] == ["135", "+45", "−13", "−0"], lines)
    c.close()

    # pretend lesson of Sat 3 Oct not taught -> ask shows
    fake = fresh(); c = ctx(b, fake); pg = page(c, "#/", ".tile"); pg.wait_for_timeout(1200)
    check("untaught dated lesson: the ask appears", pg.locator(".ask").count() == 1, pg.locator(".ask").count())
    print("ASK:", pg.locator(".ask").inner_text().replace("\n", " | "))
    check("ask names the day", "Sat 3 Oct" in pg.locator(".ask b").inner_text(), pg.locator(".ask b").inner_text())
    shot(pg, "home-ask-1366-light", full=False)
    print("tile maths:", pg.locator('.tile[data-subject="maths"] .meta').inner_text().replace("\n", " | "))
    pg.locator('[data-miss="ali"]').click(); pg.wait_for_timeout(2000)
    mk = fake.puts.get(MK)
    check("No, I missed it: makeup.json written", mk is not None)
    d = json.loads(mk); e = d["entries"][-1]
    check("entry: by ali, 45 min, kind miss, date 2026-10-03, lesson id, device", e["by"] == "ali" and e["minutes"] == 45 and e["kind"] == "miss" and e["date"] == "2026-10-03" and e["lesson"] == FAKE_LESSON and e["d"] == "test" and e["subject"] == "maths", e)
    check("entry id is miss-<lesson>-<date>", e["id"] == "miss-2026-10-03-maths-2026-10-03", e["id"])
    check("existing entry, start and 'about' preserved", len(d["entries"]) == 2 and d["entries"][0]["id"] == "miss-2026-10-01-maths-2026-10-01" and d["start"]["owed"] == 135 and d.get("about"), list(d))
    check("file ends with a newline", mk.endswith(b"\n"))
    pg.wait_for_selector(".tile"); pg.wait_for_timeout(1200)
    check("ask gone after answering", pg.locator(".ask").count() == 0)
    check("card now 212 = 167 + 45", pg.locator("#mkcard .big").inner_text() == "212" and pg.locator(".mkchip .num").inner_text() == "212", pg.locator("#mkcard .big").inner_text())
    t = pg.locator("#toast").inner_text(); print("toast:", t)
    check("toast says 45 min added and the lesson moves to Sun 4 Oct", "45 min added" in t and "Sun 4 Oct" in t, t)
    tile = pg.locator('.tile[data-subject="maths"]').inner_text().replace("\n", " | "); print("maths tile after miss:", tile)
    check("maths 'up next' tile is now the moved lesson", "Pretend maths" in tile and "Moved to Sun 4 Oct" in tile, tile)
    print("week dots:", pg.locator('.wd').all_inner_texts())
    c.close()

    # he missed it -> Yes add 45 / No
    for choice, mins in [("1", 45), ("0", 0)]:
        fake = fresh(); c = ctx(b, fake); pg = page(c, "#/", ".ask"); pg.wait_for_timeout(300)
        pg.locator('[data-miss="student"]').click(); pg.wait_for_timeout(200)
        check("he missed it: follow-up question shown", pg.locator("[data-mkadd]").count() == 2)
        pg.locator('[data-mkadd="%s"]' % choice).click(); pg.wait_for_timeout(2000)
        d = json.loads(fake.puts[MK]); e = d["entries"][-1]
        check("he missed it, add=%s: entry by student with %d min" % (choice, mins), e["by"] == "student" and e["minutes"] == mins, e)
        pg.wait_for_selector(".tile"); pg.wait_for_timeout(1000)
        check("card after student miss (%d): %d" % (mins, 167 + mins), pg.locator("#mkcard .big").inner_text() == str(167 + mins), pg.locator("#mkcard .big").inner_text())
        c.close()

    # try-out: must write nothing
    fake = fresh(); c = ctx(b, fake); pg = page(c, "?try#/", ".ask"); pg.wait_for_timeout(300)
    pg.locator('[data-miss="ali"]').click(); pg.wait_for_timeout(2000)
    check("try-out: nothing written to GitHub", not fake.puts and not [x for x in fake.log if x[0] == "PUT"], list(fake.puts))
    t = pg.locator("#toast").inner_text(); check("try-out: toast says not saved", "Try-out: not saved" in t, t)
    pg.wait_for_selector(".tile"); pg.wait_for_timeout(800)
    print("try-out card after miss:", pg.locator("#mkcard .big").inner_text(), "asks:", pg.locator(".ask").count())
    shot(pg, "home-tryout-1366-light", full=False)
    c.close()

    # a save failure on the ask: entry rolled back, ask returns
    fake = fresh(); c = ctx(b, fake); pg = page(c, "#/", ".ask"); pg.wait_for_timeout(300); fake.fail_writes = 500
    pg.locator('[data-miss="ali"]').click(); pg.wait_for_timeout(2500)
    t = pg.locator("#toast").inner_text(); print("fail toast:", t)
    pg.wait_for_selector(".tile"); pg.wait_for_timeout(800)
    check("GitHub 500 on the ask: ask comes back and the card stays 167", pg.locator(".ask").count() == 1 and pg.locator("#mkcard .big").inner_text() == "167", (pg.locator(".ask").count(), pg.locator("#mkcard .big").inner_text()))
    check("GitHub 500 on the ask: plain toast", "Not saved" in t, t)
    c.close()

    # make-up lesson: tick "Make-up lesson" when finishing: all minutes come off
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail"); pg.wait_for_timeout(400)
    pg.locator('.rail button[data-phase="_time"]').click(); pg.wait_for_timeout(200); pg.fill("#tm-m", "50"); pg.wait_for_timeout(200)
    pg.locator('.rail button[data-phase="_after"]').click(); pg.wait_for_timeout(300); pg.check("#fb-makeup"); pg.locator("#fbform button[type=submit]").click(); pg.wait_for_timeout(2500)
    s = sess(fake); check("make-up tick saved with minutes 50", s["makeup"] is True and s["time"]["minutes"] == 50 and s["status"] == "finished", (s.get("makeup"), s["time"]["minutes"]))
    pg.goto(B + "#/"); pg.wait_for_selector(".tile"); pg.wait_for_timeout(1500)
    check("home: make-up lesson of 50 min takes the card to 117 (167 - 50)", pg.locator("#mkcard .big").inner_text() == "117", pg.locator("#mkcard .big").inner_text())
    lines = pg.locator("#mkcard .statline").all_inner_texts(); print("card lines:", lines)
    check("home card shows the Make-up pill on the lesson row", pg.locator(".lrow:has-text('Stretched')").count() == 1 or pg.locator(".pill:has-text('Make-up')").count() >= 1)
    c.close(); b.close()
summary()
