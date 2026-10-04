"""6. Videos: list from videos.json, search, subject switch, play, transcript."""
from common import *
import json
V = json.load(open("/home/user/tutoring/videos.json"))["videos"]
nchem = sum(1 for v in V if v["subject"] == "chem"); nmaths = len(V) - nchem
with sync_playwright() as p:
    b = launch(p); fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/videos", ".vrow"); pg.wait_for_timeout(500)
    check("videos list loads from videos.json: %d chemistry rows" % nchem, pg.locator(".vrow").count() == nchem, pg.locator(".vrow").count())
    check("chemistry chip pressed by default", pg.locator('[data-vsub="chem"]').get_attribute("aria-pressed") == "true")
    groups = pg.locator("#vwrap .section-h h2").all_inner_texts(); print("groups:", len(groups), groups[:3])
    pg.locator('[data-vsub="maths"]').click(); pg.wait_for_timeout(200)
    check("Maths chip: %d rows" % nmaths, pg.locator(".vrow").count() == nmaths, pg.locator(".vrow").count())
    pg.fill("#vq", "chain rule"); pg.wait_for_timeout(600)
    n = pg.locator(".vrow").count(); exp = sum(1 for v in V if v["subject"] == "maths" and ("chain rule" in v["title"].lower() or "chain rule" in v["group"].lower()))
    check("search 'chain rule' filters to %d" % exp, n == exp, n)
    check("search box keeps focus and text after redraw", pg.evaluate("document.activeElement && document.activeElement.id") == "vq" and pg.locator("#vq").input_value() == "chain rule")
    pg.fill("#vq", "zzzz nothing"); pg.wait_for_timeout(600)
    check("no match: empty state shown", pg.locator("#vwrap .empty h3").inner_text() == "No videos match")
    pg.fill("#vq", ""); pg.wait_for_timeout(600)
    # play one with a transcript, if any
    tr = pg.locator(".vrow:has(.pill.ok)"); print("rows with transcript:", tr.count())
    row = tr.first if tr.count() else pg.locator(".vrow").first
    title = row.locator("b").inner_text(); row.click(); pg.wait_for_timeout(800)
    check("player appears with the video title", pg.locator("#vplayer iframe").count() == 1 and title in pg.locator("#vplayer h3").inner_text(), pg.locator("#vplayer h3").inner_text() if pg.locator("#vplayer h3").count() else None)
    src = pg.locator("#vplayer iframe").get_attribute("src"); print("iframe src:", src)
    check("iframe is youtube-nocookie with autoplay", "youtube-nocookie.com/embed/" in src and "autoplay=1" in src, src)
    print("NOTE: YouTube is not reachable from this sandbox, so playback itself could not be tested.")
    if tr.count():
        pg.locator("[data-vtr]").click(); pg.wait_for_selector(".vtr p, #vtr .hint", timeout=15000); pg.wait_for_timeout(300)
        lines = pg.locator(".vtr p").count(); print("transcript lines:", lines)
        check("transcript shows timestamped lines with seek buttons", lines > 5 and pg.locator(".vtr [data-seek]").count() == lines, lines)
        pg.locator(".vtr [data-seek]").nth(3).click(); pg.wait_for_timeout(200)
        src2 = pg.locator("#vplayer iframe").get_attribute("src")
        check("tapping a transcript time seeks the player (start= changes)", src2 != src and "start=" in src2, src2)
    else: print("no transcript available in the catalogue: transcript button not tested")
    shot(pg, "videos-playing-1366-light", full=False)
    pg.locator("[data-vclose]").click(); pg.wait_for_timeout(200)
    check("Close empties the player", pg.locator("#vplayer").inner_html() == "")
    # subject switch in the sidebar changes the video subject too
    pg.locator('.subjsw [data-subj="chem"]').click(); pg.wait_for_timeout(500)
    check("sidebar Chemistry switch re-filters videos to chemistry", pg.locator(".vrow").count() == nchem, pg.locator(".vrow").count())
    pg.locator('.subjsw [data-subj="maths"]').click(); pg.wait_for_timeout(500)
    chips = pg.locator("[data-vsub]").count()
    check("with the sidebar on Maths the video subject chips are still shown (can Ali switch?)", chips == 2, chips)
    pg.locator('[data-vsub="chem"]').click(); pg.wait_for_timeout(300)
    check("video chip Chemistry overrides while sidebar says Maths", pg.locator(".vrow").count() == nchem, pg.locator(".vrow").count())
    pg.locator('.subjsw [data-subj="all"]').click(); pg.wait_for_timeout(300)
    # videos.json missing
    fake2 = FakeGH(); fake2.files.pop("videos.json", None); c2 = ctx(b, fake2); pg2 = page(c2, "#/videos", "#vwrap .empty h3");
    check("no videos.json: plain empty state", "No video list yet" in pg2.locator("#vwrap .empty h3").inner_text())
    errs = [e for e in c.errs + c2.errs if "localStorage" not in e]
    check("no page errors on Videos", not errs, errs)
    c.close(); c2.close(); b.close()
summary()
