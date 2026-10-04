"""8. Suggest a change: open, point, save; docs/ui-feedback.jsonl; offline queue; try-out still sends."""
from common import *
import json
SF = "docs/ui-feedback.jsonl"; orig = open("/home/user/tutoring/" + SF, "rb").read()
with sync_playwright() as p:
    b = launch(p); fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/lesson/" + MATHS, ".rail"); pg.wait_for_timeout(400)
    pg.locator("[data-suggest]").first.click(); pg.wait_for_selector("#sug"); pg.wait_for_timeout(800)
    check("panel opens with Where = Plan · lesson · phase", "Plan" in pg.locator("#sug-w").inner_text() and MATHS in pg.locator("#sug-w").inner_text(), pg.locator("#sug-w").inner_text())
    items = pg.locator("#sug-items .sug-item").count(); print("earlier suggestions listed:", items)
    check("earlier suggestions load from docs/ui-feedback.jsonl", items >= 5, items)
    replies = pg.locator(".sug-reply").all_inner_texts(); print("replies:", replies[:4])
    shot(pg, "suggest-panel-1366-light", full=False)
    pg.locator("#sug-point").click(); pg.wait_for_timeout(200)
    check("Point: panel closes, body gets 'pointing'", pg.locator("#sug").count() == 0 and pg.evaluate("document.body.classList.contains('pointing')"))
    pg.locator("#clkgo").click(); pg.wait_for_selector("#sug"); pg.wait_for_timeout(200)
    check("pointing at the clock button did NOT start the clock", pg.locator("#clkgo").inner_text() == "Start lesson", pg.locator("#clkgo").inner_text())
    tgt = pg.locator(".sug-t").inner_text(); check("panel reopens naming the pointed element", "Start lesson" in tgt, tgt)
    pg.locator('[data-sugtag="Layout"]').click(); pg.locator('[data-sugtag="Bug"]').click()
    pg.fill("#sug-text", "QA suggestion one"); pg.locator("#sug-save").click(); pg.wait_for_timeout(2500)
    body = fake.puts.get(SF); check("ui-feedback.jsonl written", body is not None)
    check("existing lines kept byte for byte", body.startswith(orig.rstrip(b"\n") + b"\n"), len(body))
    new = [json.loads(l) for l in body[len(orig.rstrip(b"\n")) + 1:].decode().split("\n") if l.strip()]
    check("one new line appended", len(new) == 1, len(new))
    it = new[0]; print("new item:", it)
    check("item fields: text, where, pointed, tags, device, app, screen, theme", it["text"] == "QA suggestion one" and "Plan" in it["where"] and "Start lesson" in it.get("pointed", "") and sorted(it["tags"]) == ["Bug", "Layout"] and it["device"] == "test" and it["app"] and it["screen"] == "1366×768" and it["theme"] == "auto", it)
    check("app version stamped in the suggestion matches the deployed app.js?v= (25)", it["app"] == "v25", it["app"])
    check("toast: Suggestion saved", "saved" in pg.locator("#toast").inner_text().lower(), pg.locator("#toast").inner_text())
    check("queue emptied", pg.evaluate("localStorage.getItem('tutor.sugq')") in ("[]", None), pg.evaluate("localStorage.getItem('tutor.sugq')"))
    # offline: queue, then online
    c.set_offline(True); pg.locator("[data-suggest]").first.click(); pg.wait_for_selector("#sug"); pg.fill("#sug-text", "QA offline two"); pg.locator("#sug-save").click(); pg.wait_for_timeout(800)
    t = pg.locator("#toast").inner_text(); print("offline toast:", t)
    q = json.loads(pg.evaluate("localStorage.getItem('tutor.sugq')") or "[]")
    check("offline: suggestion queued on the device", len(q) == 1 and q[0]["text"] == "QA offline two", q)
    check("offline: toast tells Ali it is noted (not an error)", "noted" in t.lower() or "kept" in t.lower(), t)
    n0 = len([x for x in fake.log if x[0] == "PUT"]); c.set_offline(False); pg.wait_for_timeout(3000)
    body = fake.puts[SF].decode()
    check("back online: the queued suggestion is sent by itself", "QA offline two" in body and len([x for x in fake.log if x[0] == "PUT"]) == n0 + 1, (n0, len([x for x in fake.log if x[0] == "PUT"])))
    check("queue emptied after sending", pg.evaluate("localStorage.getItem('tutor.sugq')") == "[]")
    # 409 on the suggestion PUT: retried?
    fake.fail_writes = 409; pg.locator("[data-suggest]").first.click(); pg.wait_for_selector("#sug"); pg.fill("#sug-text", "QA conflict three"); pg.locator("#sug-save").click(); pg.wait_for_timeout(2500)
    t = pg.locator("#toast").inner_text(); print("409 toast:", t); fake.fail_writes = None
    puts = [x for x in fake.log if x[0] == "PUT" and x[1].endswith("ui-feedback.jsonl")]
    check("409 x3: gives up with a 'kept on this device' toast and retries later", "kept" in t.lower(), t)
    pg.wait_for_timeout(31000)
    check("after 30 s the queued suggestion is retried and lands", "QA conflict three" in fake.puts[SF].decode())
    c.close()
    # try-out: must still send
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "?try#/", ".tile"); pg.wait_for_timeout(300)
    pg.locator("[data-suggest]").first.click(); pg.wait_for_selector("#sug")
    check("try-out panel says this is the only thing saved", "only thing" in pg.locator("#sug-st").inner_text(), pg.locator("#sug-st").inner_text())
    pg.fill("#sug-text", "QA tryout four"); pg.locator("#sug-save").click(); pg.wait_for_timeout(2500)
    body = fake.puts.get(SF, b"").decode(); it = [json.loads(l) for l in body.split("\n") if "QA tryout four" in l]
    check("try-out: the suggestion IS sent, marked tryout:true, where=home", len(it) == 1 and it[0]["tryout"] is True and it[0]["where"] == "home", it)
    check("try-out: nothing else written", list(fake.puts) == [SF], list(fake.puts))
    # keyboard: Escape closes; empty save refocuses
    pg.locator("[data-suggest]").first.click(); pg.wait_for_selector("#sug"); pg.locator("#sug-save").click(); pg.wait_for_timeout(200)
    check("empty text: panel stays open, nothing sent", pg.locator("#sug").count() == 1)
    pg.keyboard.press("Escape"); check("Escape closes the panel", pg.locator("#sug").count() == 0)
    shot(pg, "home-tryout-dot-1366-light", full=False)
    check("no page errors", not [e for e in c.errs if "localStorage" not in e], c.errs)
    c.close(); b.close()
summary()
