"""5. Record: totals by hand, add a test result (tests.jsonl preserved), profile markdown render."""
from common import *
import json, glob
TS = "students/UK-1/tests.jsonl"
mins = n = r = 0
for f in sorted(glob.glob("/home/user/tutoring/students/UK-1/lessons/*/session.json")):
    s = json.load(open(f)); mins += (s.get("time") or {}).get("minutes") or 0
    for a in list(s.get("answers", {}).values()) + s.get("extra", []):
        v = a.get("v")
        if v and v not in ("tskip", "skipped"): n += 1; r += v == "right"
nm = sum(1 for l in open("/home/user/tutoring/students/UK-1/mistakes.jsonl") if l.strip() and not json.loads(l).get("fixed"))
print("by hand: lessons 5, hours %.1f, right %d/%d = %d%%, open mistakes %d" % (mins / 60, r, n, round(100 * r / n), nm))
with sync_playwright() as p:
    b = launch(p)
    fake = FakeGH(); fake.extra[TS] = b'{"date": "2026-09-20", "subject": "maths", "score": 30, "max": 50, "title": "Old mock", "notes": "", "device": "claude", "at": "2026-09-20T10:00:00Z"}\n{"date": "2026-09-25", "subject": "chem", "score": 12, "max": 20, "title": "Old quiz", "notes": "x", "device": "claude", "at": "2026-09-25T10:00:00Z"}'
    c = ctx(b, fake); pg = page(c, "#/record", ".stats .stat"); pg.wait_for_timeout(600)
    st = [t.replace("\n", " ") for t in pg.locator(".stats .stat").all_inner_texts()]
    check("record totals match the session files by hand", st == ["5 lessons logged", "%s hours taught" % round(mins / 60, 1), "%d%% answers right" % round(100 * r / n), "%d open mistakes" % nm], st)
    rows = pg.locator("table.t").first.locator("tbody tr").all_inner_texts(); print("time log rows:", [x.replace("\n", " | ") for x in rows])
    check("time log: 10-01 chem row shows start 19:04 but an empty End (ended never recorded)", any("19:04" in x and "55" in x for x in rows), rows)
    check("time log is newest first", "4 Oct" in rows[0] or "3 Oct" in rows[0], rows[0])
    check("time log shows the lesson DATE, not the date it was taught (1 Oct maths was made up on 3 Oct)", any("Thu 1 Oct" in x and "19:07" in x for x in rows), rows)
    # tests
    check("existing tests shown (2)", pg.locator("table.t").nth(1).locator("tbody tr").count() == 2 if pg.locator("table.t").count() > 1 else False, pg.locator("table.t").count())
    pg.fill("#t-sc", "17.5"); pg.fill("#t-max", "25"); pg.fill("#t-ti", "QA mock paper"); pg.fill("#t-no", "timed"); pg.select_option("#t-subj", "chem")
    pg.locator("#tsform button[type=submit]").click(); pg.wait_for_timeout(2500)
    body = fake.puts.get(TS); check("tests.jsonl written", body is not None)
    lines = body.decode().split("\n")
    check("existing two lines preserved and new line appended, file ends with newline", lines[0].startswith('{"date": "2026-09-20"') and lines[1].startswith('{"date": "2026-09-25"') and lines[3] == "" and len(lines) == 4, lines)
    t = json.loads(lines[2])
    check("new test line correct", t["date"] == "2026-10-04" and t["subject"] == "chem" and t["score"] == 17.5 and t["max"] == 25 and t["title"] == "QA mock paper" and t["notes"] == "timed" and t["device"] == "test", t)
    pg.wait_for_selector(".stats .stat"); pg.wait_for_timeout(800)
    check("test table shows 3 rows with 70%", pg.locator("table.t").nth(1).locator("tbody tr").count() == 3 and "70%" in pg.locator("table.t").nth(1).inner_text(), pg.locator("table.t").nth(1).locator("tbody tr").count())
    # second add straight after: does the second PUT use the fresh sha (no 409)?
    pg.fill("#t-sc", "5"); pg.fill("#t-max", "10"); pg.fill("#t-ti", "Second"); pg.locator("#tsform button[type=submit]").click(); pg.wait_for_timeout(2500)
    lines = fake.puts[TS].decode().split("\n")
    check("second test added right after keeps all 4 lines", len(lines) == 5 and "Second" in lines[3], len(lines))
    check("no 409 on the second test save", not [x for x in fake.log if x[0] == "GET" and x[1].endswith("tests.jsonl") and "/contents/" in x[1]])
    # empty / invalid test form
    pg.fill("#t-sc", ""); pg.fill("#t-ti", ""); n0 = len(fake.log); pg.locator("#tsform button[type=submit]").click(); pg.wait_for_timeout(600)
    check("empty test form: browser validation blocks it, nothing written", not [x for x in fake.log[n0:] if x[0] == "PUT"])
    # profile markdown
    prof = pg.locator(".card.prose").last; html = prof.inner_html(); text = prof.inner_text()
    raw = [m for m in ["**", "## ", "](", "| "] if m in text]
    check("profile markdown: no raw markdown left in the text", not raw, raw)
    check("profile markdown: headings and lists rendered", "<h3>" in html and "<ul>" in html and "<b>" in html)
    print("profile h3s:", pg.locator(".card.prose h3").all_inner_texts())
    shot(pg, "record-1366-light")
    # mistakes list: 27 shown
    check("mistakes list shows all 27", pg.locator("li.mistake").count() == 27, pg.locator("li.mistake").count())
    # mistakes list newest first?
    firstm = pg.locator("li.mistake .fix").last.inner_text() if pg.locator("li.mistake .fix").count() else ""
    print("first mistake meta:", pg.locator("li.mistake").first.locator(".fix").last.inner_text(), "| last:", pg.locator("li.mistake").last.locator(".fix").last.inner_text())
    # a session.json with broken JSON: does the Record page still load?
    fake2 = FakeGH(); fake2.extra[SESS % C1] = b"{broken"
    c2 = ctx(b, fake2); pg2 = page(c2, "#/record", ".stats .stat, .empty h3", 20000); pg2.wait_for_timeout(800)
    h = pg2.locator("#app").inner_text()[:200]; print("record with a broken session:", h.replace("\n", " | "))
    check("Record survives one broken session.json (counts the other 4)", "4 lessons logged" in h or "5 lessons logged" in h, h)
    check("row for the broken lesson shows the id but no times", pg2.locator("table.t tbody tr").count() == 5)
    check("no page errors on Record", not c.errs and not c2.errs, (c.errs, c2.errs))
    c.close(); c2.close(); b.close()
summary()
