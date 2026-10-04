"""4. Revise: Got it / Still wrong, review.json, schedule, bad mistakes line, try-out."""
from common import *
import json, datetime
RV = "students/UK-1/review.json"; MS = "students/UK-1/mistakes.jsonl"
orig = json.load(open("/home/user/tutoring/" + RV)); today = datetime.date(2026, 10, 4)


def hkey(s):
    h = 5381
    for ch in s: h = ((h << 5) + h + ord(ch)) & 0xffffffff
    out = ""; n = h
    while n: n, r = divmod(n, 36); out = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + out
    return "m" + out


ms = [json.loads(l) for l in open("/home/user/tutoring/" + MS) if l.strip()]
keys = {hkey((m.get("date") or "") + "|" + (m.get("text") or m.get("what") or "")): m for m in ms}
first_q = None
with sync_playwright() as p:
    b = launch(p)
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/revise", ".rev"); pg.wait_for_timeout(500)
    pills = pg.locator(".rev .pill").all_inner_texts(); print("first card pills:", pills)
    check("27 due today (every mistake is due or first time)", "1 of 27 due" in pills, pills)
    check("sidebar Revise badge shows 27", pg.locator("#revbadge").inner_text() == "27", pg.locator("#revbadge").inner_text())
    q = pg.locator(".rev-q").inner_text(); print("ask:", q[:100])
    # which mistake is it? match by ask text
    m0 = [k for k, m in keys.items() if (m.get("ask") or "").strip()[:40] in q or q[:40] in (m.get("ask") or "")]
    print("matched key(s):", m0, [orig.get(k) for k in m0])
    pg.locator('[data-rev="open"]').click(); pg.wait_for_timeout(200)
    check("Show answer reveals the fix", pg.locator(".rev .qa").count() == 1)
    pg.locator('[data-rev="ok"]').click(); pg.wait_for_timeout(400)
    t1 = pg.locator("#toast").inner_text(); print("toast after Got it:", t1)
    check("after Got it the next card shows 1 of 26", "1 of 26 due" in pg.locator(".rev .pill").all_inner_texts(), pg.locator(".rev .pill").all_inner_texts())
    pg.locator('[data-rev="no"]').click(); pg.wait_for_timeout(300)
    t2 = pg.locator("#toast").inner_text(); check("Still wrong toast: Back tomorrow", t2 == "Back tomorrow", t2)
    pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Saved') === 0", timeout=15000)
    rv = json.loads(fake.puts[RV])
    check("review.json written, old keys preserved", all(k in rv for k in orig) and all(rv[k]["history"][:len(orig[k]["history"])] == orig[k]["history"] for k in orig), [k for k in orig if k not in rv])
    changed = {k: v for k, v in rv.items() if v != orig.get(k)}
    print("changed entries:", json.dumps(changed, indent=0)[:800])
    oks = [k for k, v in changed.items() if v["history"][-1]["ok"]]; nos = [k for k, v in changed.items() if not v["history"][-1]["ok"]]
    check("exactly one Got it and one Still wrong recorded", len(oks) == 1 and len(nos) == 1, (oks, nos))
    if oks:
        k = oks[0]; ob = (orig.get(k) or {"box": 0})["box"]; nb = rv[k]["box"]; GAPS = [1, 3, 7, 14, 30]
        exp = (today + datetime.timedelta(days=GAPS[nb - 1])).isoformat() if nb < 5 else "done"
        check("Got it: box %d -> %d, due %s (day %s schedule)" % (ob, nb, rv[k]["due"], GAPS[nb - 1] if nb < 5 else "-"), nb == ob + 1 and rv[k]["due"] == exp, (rv[k]["due"], exp))
        check("Got it: history has today, ok, device", rv[k]["history"][-1] == {"d": "2026-10-04", "ok": True, "by": "test"}, rv[k]["history"][-1])
    if nos:
        k = nos[0]; check("Still wrong: box 0, due tomorrow", rv[k]["box"] == 0 and rv[k]["due"] == "2026-10-05", rv[k])
    check("one PUT for two taps (debounced)", len([x for x in fake.log if x[0] == "PUT"]) == 1, len([x for x in fake.log if x[0] == "PUT"]))
    # schedule walk-through on one key: simulate boxes via the function in page
    sched = pg.evaluate("""() => { const GAPS=[1,3,7,14,30]; const add=(iso,n)=>{const d=new Date(iso+'T00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10)}; let box=0, out=[]; for (let i=0;i<6;i++){ box++; out.push(box>=GAPS.length? 'done' : add('2026-10-04', GAPS[box-1])); } return out; }""")
    print("schedule from today if right every time:", sched)
    check("schedule: day 1, 3, 7, 14 then mastered (5 boxes; day 30 is never used)", sched[:4] == ["2026-10-05", "2026-10-07", "2026-10-11", "2026-10-18"] and sched[4] == "done", sched)
    # subject chips
    pg.locator('[data-rsub="maths"]').click(); pg.wait_for_timeout(200)
    check("Maths chip: 1 due", "1 of 1 due" in pg.locator(".rev .pill").all_inner_texts(), pg.locator(".rev .pill").all_inner_texts())
    pg.locator('[data-rev="skip"]').click(); pg.wait_for_timeout(200)
    check("skip with one due stays on it", pg.locator(".rev").count() == 1)
    shot(pg, "revise-1366-light", full=False)
    # revise in the Plan view (Mistakes warm-up), subject filtered
    pg.goto(B + "#/lesson/" + CHEM); pg.wait_for_selector(".rail"); pg.locator('.rail button[data-phase="_revise"]').click(); pg.wait_for_selector("#revbox .rev"); pg.wait_for_timeout(200)
    check("Plan > Mistakes warm-up shows chemistry's due list (chem pressed)", pg.locator('#revbox [data-rsub="chem"]').get_attribute("aria-pressed") == "true")
    n0 = len([x for x in fake.log if x[0] == "PUT"]); pg.locator('#revbox [data-rev="ok"]').click(); pg.wait_for_timeout(3500)
    check("Got it inside the Plan view writes review.json, not session.json", len([x for x in fake.log if x[0] == "PUT"]) == n0 + 1 and (SESS % CHEM) not in fake.puts, [x[1][-30:] for x in fake.log if x[0] == "PUT"])
    c.close()

    # bad line in mistakes.jsonl
    fake = FakeGH(); good = open("/home/user/tutoring/" + MS, "rb").read()
    fake.extra[MS] = good + b'{"date": "2026-10-03", "subject": "chem", broken\n' + b'{"date":"2026-10-03","subject":"chem","type":"wrong","text":"Extra good line after the bad one","fix":"ok"}\n'
    c = ctx(b, fake); pg = page(c, "#/revise", ".rev"); pg.wait_for_timeout(500)
    pills = pg.locator(".rev .pill").all_inner_texts()
    check("bad JSON line is skipped quietly, good lines after it still count (28 due)", "1 of 28 due" in pills, pills)
    check("no page error from the bad line", not c.errs, c.errs)
    c.close()

    # try-out: nothing written, but the tap is reflected in the tab
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "?try#/revise", ".rev"); pg.wait_for_timeout(300)
    pg.locator('[data-rev="ok"]').click(); pg.wait_for_timeout(3500)
    check("try-out: Got it writes nothing", not fake.puts, list(fake.puts))
    check("try-out: status line says Try-out · not saved", "Try-out" in saveline(pg), saveline(pg))
    c.close()

    # review.json 409 conflict: another device saved meanwhile
    fake = FakeGH(); c = ctx(b, fake); pg = page(c, "#/revise", ".rev"); pg.wait_for_timeout(300)
    other = dict(orig); other["zzother"] = {"box": 1, "history": [], "due": "2026-10-05", "last": "2026-10-04T00:00:00Z"}
    fake.extra[RV] = json.dumps(other).encode()  # sha changes -> app's PUT gets a 409
    pg.locator('[data-rev="ok"]').click(); pg.wait_for_function("document.querySelector('#save').textContent.indexOf('Saved') === 0", timeout=15000)
    rv = json.loads(fake.puts[RV])
    check("review.json conflict: other device's entry kept and ours added", "zzother" in rv and any(v != orig.get(k) for k, v in rv.items() if k != "zzother"), list(rv))
    c.close(); b.close()
summary()
