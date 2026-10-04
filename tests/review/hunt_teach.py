"""Teach-mode stress test against the pretend GitHub. PASS/FAIL checks + screenshots in ./shots."""
import json, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from fakegh import FakeGH
from playwright.sync_api import sync_playwright

APP = "http://localhost:8765/"
LID = os.environ.get("LESSON", "2026-10-04-maths")
SH = os.path.join(HERE, "shots"); os.makedirs(SH, exist_ok=True)
R = []
def check(name, ok, info=""):
    R.append((name, bool(ok), info)); print(("PASS " if ok else "FAIL ") + name + ("" if ok or not info else " | " + str(info)[:300]))
def shot(pg, name): pg.screenshot(path=os.path.join(SH, name + ".png"))
def wait(fn, t=10, step=0.1):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None
def sess(fake):
    p = "students/UK-1/lessons/%s/session.json" % LID
    return json.loads(fake.puts[p].decode()) if p in fake.puts else None

def ctx_(b, w, h, layout="flip", extra="", **kw):
    c = b.new_context(viewport={"width": w, "height": h}, service_workers="block", **kw)
    c.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','la57');localStorage.setItem('tutor.layout',%s);%s" % (json.dumps(layout), extra))
    return c

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    fake = FakeGH()
    c = ctx_(b, 1366, 768)
    c.route("https://api.github.com/**", fake.route)
    pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)

    # ---- 1. open Teach cold: timing and request count ----
    t0 = time.time(); n0 = len(fake.log)
    pg.goto(APP + "#/lesson/" + LID + "/teach")
    pg.wait_for_selector(".chunk.cur", timeout=30000)
    t_first = time.time() - t0
    check("Teach opens (cold cache)", True, "%.2fs" % t_first)
    pg.wait_for_timeout(4000)
    blobs = [l for l in fake.log[n0:] if "/git/blobs/" in l[1]]
    check("cold open: requests", True, "%d GitHub requests, %d blobs in first 4 s" % (len(fake.log) - n0, len(blobs)))
    shot(pg, "teach-01-first")
    check("no script errors on open", not errs, errs)

    # ---- 2. preview mode: verdict taps are saved even though the banner says nothing is recorded ----
    check("preview banner shown", pg.locator(".preview").count() == 1)
    # jump to the first drill/quiz/question chunk
    def goto_kind(kind):
        idx = pg.evaluate("""(k)=>{const bs=[...document.querySelectorAll('.outline .oc')]; for(const b of bs){ if(b.querySelector('.ic').textContent.trim()===k) return +b.getAttribute('data-tjump'); } return -1;}""", kind)
        if idx < 0: return False
        pg.evaluate("(i)=>document.querySelector('.outline [data-tjump=\"'+i+'\"]').click()", idx)
        pg.wait_for_selector(".chunk.cur", timeout=5000); return True
    check("outline has a question chunk", goto_kind("?") or goto_kind("Q"))
    pg.wait_for_timeout(300)
    shot(pg, "teach-02-question-flip")
    cur_cls = pg.evaluate("document.querySelector('.chunk.cur').className")
    check("question uses Flip layout", "flip" in cur_cls, cur_cls)
    # the verdict strip lives in the footer
    check("verdict strip in the bottom bar", pg.locator(".tfoot .vstrip .ctl.big").count() == 1)
    pg.click(".vstrip .vb-right")
    pg.wait_for_timeout(4600)
    s = sess(fake)
    check("BUG? preview mode: a verdict tap is saved to GitHub while the banner says nothing is recorded", s is not None and any(a.get("v") == "right" for a in s["answers"].values()), "status=%s" % (s and s["status"]))
    # undo it for later checks
    pg.click(".vstrip .vb-right"); pg.wait_for_timeout(200)
    check("tapping the same verdict again clears it (toggle)", pg.get_attribute(".vstrip .vb-right", "aria-pressed") == "false")

    # ---- 3. Flip: back side images load only after flipping ----
    has_flip = pg.locator("[data-flip]").count() == 1
    check("Show answer button present", has_flip)
    if has_flip:
        # are the answer images loaded already (src set) before flipping?
        pre = pg.evaluate("[...document.querySelectorAll('.chunk.cur .fita img')].map(i=>!!i.getAttribute('src'))")
        check("answer-side pictures already loaded before Show answer (prefetch should make this true)", all(pre) if pre else True, "img src set: %s" % pre)
        t1 = time.time(); pg.click("[data-flip]")
        ok = wait(lambda: pg.evaluate("[...document.querySelectorAll('.chunk.cur .fita img')].every(i=>i.complete&&i.naturalWidth>0)"), 10)
        dt = time.time() - t1
        check("answer picture visible after Show answer", ok, "%.2fs" % dt)
        check("answer picture appears within 0.3 s of Show answer", ok and dt < 0.3, "%.2fs after the tap" % dt)
        shot(pg, "teach-03-answer-side")
        # notes on the back side
        check("BUG? 'Note for you' is moved to the answer side in Flip (hidden until Show answer)", pg.locator(".chunk.cur .fita .tnote").count() == 0, "%d note(s) sit on the back of the card" % pg.locator(".chunk.cur .fita .tnote").count())
        pg.keyboard.press("a"); pg.wait_for_timeout(200)
        check("key A flips back", "flipped" not in pg.evaluate("document.querySelector('.chunk.cur').className"))

    # ---- 4. start the clock, Taught/Skip/Next, keyboard, rapid clicks ----
    pg.click("#clkgo"); pg.wait_for_timeout(300)
    check("clock starts", pg.locator(".preview").count() == 0 and pg.inner_text("#clkgo") == "Pause")
    pos0 = pg.evaluate("+document.querySelector('.tmini .hint.num').textContent.split('/')[0]")
    # rapid clicks on Next / Taught: 10 fast clicks should move exactly 10 (or be ignored as double-clicks)
    for i in range(10):
        pg.click(".tfoot .btn.next", delay=10)
    pg.wait_for_timeout(500)
    pos1 = pg.evaluate("+document.querySelector('.tmini .hint.num').textContent.split('/')[0]")
    check("10 rapid Next taps move 10 screens (none lost, none doubled)", pos1 - pos0 == 10, "moved %d" % (pos1 - pos0))
    # double click guard: dblclick should count once
    pg.dblclick(".tfoot .btn.next"); pg.wait_for_timeout(300)
    pos2 = pg.evaluate("+document.querySelector('.tmini .hint.num').textContent.split('/')[0]")
    check("a double tap on Next moves one screen only", pos2 - pos1 == 1, "moved %d" % (pos2 - pos1))
    # keyboard
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(150)
    pos3 = pg.evaluate("+document.querySelector('.tmini .hint.num').textContent.split('/')[0]")
    check("Left arrow goes back one", pos3 == pos2 - 1)
    shot(pg, "teach-04-live-step")

    # ---- 5. refresh mid-lesson: position, clock and verdicts survive ----
    goto_kind("?") or goto_kind("Q")
    pg.click(".vstrip .vb-partly"); pg.wait_for_timeout(100)
    posq = pg.evaluate("+document.querySelector('.tmini .hint.num').textContent.split('/')[0]")
    pg.reload(); pg.wait_for_selector(".chunk.cur", timeout=20000); pg.wait_for_timeout(500)
    posr = pg.evaluate("+document.querySelector('.tmini .hint.num').textContent.split('/')[0]")
    check("refresh keeps the Teach position", posr == posq, "%s -> %s" % (posq, posr))
    check("refresh keeps the verdict (Partly)", pg.get_attribute(".vstrip .vb-partly", "aria-pressed") == "true")
    check("refresh keeps the clock running", pg.inner_text("#clkgo") == "Pause")

    # ---- 6. offline mid-save, then online ----
    c.set_offline(True)
    pg.click(".vstrip .vb-wrong"); pg.wait_for_timeout(4600)
    st = pg.inner_text("#save")
    check("offline: status says kept on device", "Offline" in st or "kept" in st.lower(), st)
    shot(pg, "teach-05-offline")
    c.set_offline(False); pg.wait_for_timeout(100)
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    ok = wait(lambda: "Saved" in pg.inner_text("#save"), 15)
    check("back online: the save goes through by itself", ok, pg.inner_text("#save"))
    s = sess(fake)
    check("the offline verdict (Wrong) reached GitHub", s and any(a.get("v") == "wrong" for a in s["answers"].values()))

    # ---- 7. save failures: 500 then recovery; 409 conflict merge ----
    fake.fail_writes = 500
    pg.click(".vstrip .vb-right"); pg.wait_for_timeout(4800)
    st = pg.inner_text("#save")
    check("GitHub 500: status warns, work kept", "Not saved" in st or "kept" in st.lower(), st)
    fake.fail_writes = None
    pg.wait_for_timeout(26000)   # the 25 s retry timer
    check("after a 500 the app retries by itself within 25 s", "Saved" in pg.inner_text("#save"), pg.inner_text("#save"))
    # 409: another device wrote in between -> merge
    path = "students/UK-1/lessons/%s/session.json" % LID
    remote = json.loads(fake.extra[path].decode()); remote["extra"].append({"id": "xother", "q": "tablet question", "v": "right", "note": "", "at": "2026-10-04T09:00:00.000Z", "d": "tablet"}); remote["updated"] = "2026-10-04T09:00:00.000Z"
    fake.extra[path] = json.dumps(remote).encode()   # sha changes -> next PUT from the page gets 409
    pg.click(".vstrip .vb-partly");
    ok = wait(lambda: "Saved" in pg.inner_text("#save") and sess(fake) and any(e["id"] == "xother" for e in sess(fake)["extra"]), 15)
    check("409 conflict: the other device's extra question is merged, not overwritten", ok, pg.inner_text("#save"))
    s = sess(fake)
    check("409 conflict: my verdict (Partly) survives the merge", s and any(a.get("v") == "partly" for a in s["answers"].values()))

    # ---- 8. two tabs, same browser: a verdict in tab B shows in tab A ----
    pg2 = c.new_page(); pg2.goto(APP + "#/lesson/" + LID + "/teach"); pg2.wait_for_selector(".chunk.cur", timeout=20000); pg2.wait_for_timeout(500)
    pg2.click(".vstrip .vb-wrong"); pg2.wait_for_timeout(600)
    ok = wait(lambda: pg.get_attribute(".vstrip .vb-wrong", "aria-pressed") == "true", 5)
    check("two tabs: tab A shows tab B's verdict within 5 s", ok)
    pg2.close()

    # ---- 9. Student view in the same browser follows Show him; in another device it cannot ----
    stu = c.new_page(); stu.goto(APP + "#/lesson/" + LID + "/student"); stu.wait_for_selector(".stu", timeout=20000); stu.wait_for_timeout(4500)
    shot(stu, "student-01")
    # find an exam question with a picture in Teach
    if goto_kind("Q"):
        qid = pg.evaluate("document.querySelector('.chunk.cur .ctl.big') && document.querySelector('.chunk.cur .ctl.big').getAttribute('data-item')")
        if pg.locator(".tfoot [data-show]").count():
            pg.click(".tfoot [data-show]"); pg.wait_for_timeout(800)
            check("Show him (same browser): sent to the student tab, not full screen here", pg.locator("#show").count() == 0)
            ok = wait(lambda: stu.evaluate("document.querySelector('.stu-view img') && document.querySelector('.stu-view img').naturalWidth>0"), 8)
            check("student tab shows the picture", ok)
            shot(stu, "student-02-shown")
    # a different device (new context): BroadcastChannel cannot reach it
    c2 = ctx_(b, 1280, 800); c2.route("https://api.github.com/**", fake.route)
    tab = c2.new_page(); tab.goto(APP + "#/lesson/" + LID + "/student"); tab.wait_for_selector(".stu", timeout=20000); tab.wait_for_timeout(4500)
    before = tab.evaluate("document.querySelector('.stu-view').getAttribute('data-pos')")
    if goto_kind("Q") and pg.locator(".tfoot [data-show]").count():
        pg.evaluate("document.querySelector('.tfoot [data-show]').click()"); pg.wait_for_timeout(1500)
        if pg.locator("#show").count(): pg.keyboard.press("Escape")
    after = tab.evaluate("document.querySelector('.stu-view').getAttribute('data-pos')")
    check("DESIGN GAP: Student view on another device (the tablet) does not follow Show him", before != after, "tablet stayed at %s" % after)
    shot(tab, "student-03-tablet-landscape")
    tab.set_viewport_size({"width": 800, "height": 1280}); tab.wait_for_timeout(400); shot(tab, "student-04-tablet-portrait")
    c2.close(); stu.close()

    # ---- 10. layouts and sizes ----
    for lay in ["flip", "side", "float", "classic"]:
        pg.evaluate("localStorage.setItem('tutor.layout', %s)" % json.dumps(lay))
        for (w, h, nm) in [(1366, 768, "laptop"), (1280, 800, "tab-land"), (800, 1280, "tab-port"), (390, 844, "phone")]:
            pg.set_viewport_size({"width": w, "height": h}); pg.reload(); pg.wait_for_selector(".chunk.cur", timeout=20000)
            goto_kind("?") or goto_kind("Q"); pg.wait_for_timeout(700)
            over = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            small = pg.evaluate("""[...document.querySelectorAll('button:not([hidden]), a.btn')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&(r.height<40||r.width<40)&&getComputedStyle(e).visibility!=='hidden';}).map(e=>(e.className||e.tagName)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)+' '+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,18)).slice(0,12)""")
            qvis = pg.evaluate("(()=>{const q=document.querySelector('.chunk.cur .qtext, .chunk.cur .qcard'); if(!q) return null; const r=q.getBoundingClientRect(); const f=document.querySelector('.tfoot').getBoundingClientRect(); return {qtop:Math.round(r.top), qbottom:Math.round(r.bottom), foottop:Math.round(f.top), inner:window.innerHeight};})()")
            check("%s %s: no horizontal scroll" % (lay, nm), not over)
            check("%s %s: question visible above the bottom bar" % (lay, nm), qvis and qvis["qtop"] >= 0 and qvis["qtop"] < qvis["foottop"], qvis)
            if small: print("   small taps %s %s: %s" % (lay, nm, small))
            shot(pg, "teach-lay-%s-%s" % (lay, nm))
            if lay == "flip" and nm in ("laptop", "tab-port") and pg.locator("[data-flip]").count():
                pg.click("[data-flip]"); pg.wait_for_timeout(600); shot(pg, "teach-lay-%s-%s-answer" % (lay, nm)); pg.click("[data-flip]")
    pg.evaluate("localStorage.setItem('tutor.layout','flip')"); pg.set_viewport_size({"width": 1366, "height": 768}); pg.reload(); pg.wait_for_selector(".chunk.cur", timeout=20000)

    # ---- 11. dark mode screenshots ----
    pg.evaluate("localStorage.setItem('tutor.theme','dark')"); pg.reload(); pg.wait_for_selector(".chunk.cur", timeout=20000); goto_kind("?") or goto_kind("Q"); pg.wait_for_timeout(500)
    shot(pg, "teach-dark-question")
    if pg.locator("[data-flip]").count(): pg.click("[data-flip]"); pg.wait_for_timeout(500); shot(pg, "teach-dark-answer"); pg.click("[data-flip]")
    pg.evaluate("localStorage.setItem('tutor.theme','light')")

    # ---- 12. outline, skip part, warm-up overlay, suggest ----
    pg.reload(); pg.wait_for_selector(".chunk.cur", timeout=20000)
    pg.click("[data-warmup]"); ok = wait(lambda: pg.locator("#wuov .rev, #wuov .empty").count() > 0, 10)
    check("warm-up overlay opens with content", ok); shot(pg, "teach-06-warmup"); pg.keyboard.press("Escape")
    pg.click(".tmini [data-suggest]"); pg.wait_for_selector("#sug"); shot(pg, "teach-07-suggest"); pg.keyboard.press("Escape")

    # ---- 13. End of script -> After the lesson -> Finish; then double submit ----
    pg.evaluate("(()=>{const bs=[...document.querySelectorAll('.outline [data-tjump]')]; bs[bs.length-1].click();})()"); pg.wait_for_timeout(300)
    for i in range(3): pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    check("End of the script screen reached", pg.locator("[data-tgo=after]").count() == 1)
    pg.click("[data-tgo=after]"); pg.wait_for_selector("#fbform", timeout=10000)
    shot(pg, "after-01")
    pg.fill("#fb-change", "test note"); pg.click('[data-rate="4"]')
    n_before = len([k for k in fake.log if k[0] == "PUT"])
    pg.click("#fbform button[type=submit]"); pg.click("#fbform button[type=submit]")
    pg.wait_for_timeout(3000)
    s = sess(fake)
    check("Finish saves status finished with the note", s and s["status"] == "finished" and s["feedback"].get("change") == "test note")
    n_after = len([k for k in fake.log if k[0] == "PUT"])
    check("double-tap on Finish does not double-save", n_after - n_before <= 2, "%d PUTs" % (n_after - n_before))
    check("clock ended on Finish", s and s["time"]["ended"] is not None)

    # ---- 14. errors summary ----
    check("no script errors in the whole run", not errs, errs[:5])
    print("\nERRORS:", json.dumps(errs, indent=1)[:3000])
    b.close()

fails = [r for r in R if not r[1]]
print("\n%d checks, %d FAIL" % (len(R), len(fails)))
json.dump([{"name": n, "ok": o, "info": str(i)} for n, o, i in R], open(os.path.join(HERE, "results.json"), "w"), indent=1)
