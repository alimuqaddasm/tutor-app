"""Round 10 bug hunt (1 Oct): one check per bug fixed in v16. Every check prints PASS or FAIL; exit code 1 on any FAIL.
Writes never reach GitHub: a pretend GitHub in this file takes the saves (with real 409 conflicts), so two-tab saving
can be tested end to end. (Waits use page.wait_for_timeout: a plain sleep stops Playwright from seeing requests.)"""
import subprocess, sys, time, json, os, base64, urllib.parse
from playwright.sync_api import sync_playwright
TOK = subprocess.run([r"C:/Program Files/GitHub CLI/gh.exe", "auth", "token"], capture_output=True, text=True).stdout.strip()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "tests", "shots"); os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", HERE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2); B = "http://localhost:8765/"; CH, MA = "2026-10-01-chem", "2026-10-01-maths"
errs, fails = [], []


def check(name, ok, info=""):
    print(("PASS " if ok else "FAIL ") + name + ("  [" + str(info) + "]" if info != "" else ""))
    if not ok: fails.append(name)


class FakeGH:
    """Saves land here, never on GitHub. A PUT with a stale sha gets a 409 like the real thing."""
    def __init__(self): self.files, self.blobs, self.n, self.offline = {}, {}, 0, False

    def route(self, r):
        u, m = r.request.url, r.request.method
        if self.offline: return r.abort()
        if m == "PUT" and "/contents/" in u:
            path = urllib.parse.unquote(u.split("/contents/")[1].split("?")[0]); body = json.loads(r.request.post_data); cur = self.files.get(path)
            if cur and body.get("sha") != cur[0]: return r.fulfill(status=409, body='{"message":"conflict"}')
            self.n += 1; sha = "fake%036d" % self.n; data = base64.b64decode(body["content"]); self.files[path] = (sha, data); self.blobs[sha] = data
            return r.fulfill(status=200, content_type="application/json", body=json.dumps({"content": {"sha": sha}}))
        if m != "GET": return r.abort()
        if "/git/blobs/fake" in u: return r.fulfill(status=200, body=self.blobs[u.split("/git/blobs/")[1].split("?")[0]])
        if "/contents/" in u:
            path = urllib.parse.unquote(u.split("/contents/")[1].split("?")[0])
            if path in self.files: sha, data = self.files[path]; return r.fulfill(status=200, content_type="application/json", body=json.dumps({"sha": sha, "content": base64.b64encode(data).decode()}))
        if "/git/trees/" in u and self.files:
            resp = r.fetch(); j = resp.json()
            for t in j["tree"]:
                if t["path"] in self.files: t["sha"] = self.files[t["path"]][0]
            return r.fulfill(response=resp, body=json.dumps(j))
        r.continue_()

    def session(self, lesson): return json.loads(self.files["students/UK-1/lessons/%s/session.json" % lesson][1])


def ctx_(b, w=1400, h=900, fake=None):
    c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token', %s); localStorage.setItem('tutor.device','test');" % json.dumps(TOK))
    c.route("https://api.github.com/**", fake.route if fake else (lambda r: r.abort() if r.request.method != "GET" else r.continue_()))
    return c


def page(c, url, sel=".teach3"):
    p = c.new_page(); p.on("pageerror", lambda e: errs.append("PE " + str(e)[:200]))
    p.goto(B + url); p.wait_for_selector(sel, timeout=60000); p.wait_for_timeout(600); return p


def jump_ic(p, ic, n=0): p.evaluate("([ic, n]) => Array.from(document.querySelectorAll('.outline .oc')).filter(b => b.querySelector('.ic').textContent == ic)[n].click()", [ic, n]); p.wait_for_timeout(500)
def jump(p, f): p.evaluate("f => Array.from(document.querySelectorAll('.outline .oc')).find(x => x.querySelector('.tx').textContent.indexOf(f) >= 0).click()", f); p.wait_for_timeout(500)
def pos(p): return "/".join(__import__("re").findall(r"\d+", p.locator(".tmini .num").inner_text()))   # "Step 21 of 144" reads as "21/144"
def wide(p): return p.evaluate("document.documentElement.scrollWidth") - p.evaluate("document.documentElement.clientWidth")
COVER = """() => Array.from(document.querySelectorAll('.tfoot button')).filter(b => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h && h.closest('.trybar'); }).map(b => b.textContent.trim().slice(0, 12))"""


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        # 1-2. try-out strip never covers the lesson buttons; phone Teach bar fits the screen
        for w, h in [(1400, 900), (1024, 768), (390, 844)]:
            c = ctx_(b, w, h); p = page(c, "?try#/lesson/" + CH + "/teach"); jump_ic(p, "Q", 3); p.wait_for_timeout(500)
            check("try-out strip leaves the Teach buttons free at %d px" % w, p.evaluate(COVER) == [], p.evaluate(COVER))
            check("Teach page has no sideways scroll at %d px" % w, wide(p) <= 0, wide(p))
            if w == 390:
                p.screenshot(path=os.path.join(OUT, "r10-phone-try-teach.png"))
                p.evaluate("location.hash = '#/lesson/%s'" % CH); p.wait_for_selector(".rail"); p.locator('.rail button[data-phase="_work"]').dispatch_event("click"); p.wait_for_timeout(500)
                check("phone 'His work' page has no sideways scroll", wide(p) <= 0, wide(p))
            c.close()
        # 3-4. reload on a question, then Show him and Start: both use the part on screen
        c = ctx_(b); p = page(c, "#/lesson/" + CH + "/teach"); jump_ic(p, "Q", 5); p.reload(); p.wait_for_selector(".teach3"); p.wait_for_timeout(800)
        want = p.evaluate("document.querySelector('.chunk.cur .qcard img').dataset.src")
        p.locator(".tfoot [data-show]").click(); p.wait_for_timeout(1200)
        got = p.evaluate("(document.querySelector('#sh-body img') || {dataset: {}}).dataset.src")
        check("Show him after a reload shows this question", got == want, (want, got)); p.keyboard.press("Escape"); p.wait_for_timeout(300)
        part = p.locator(".tcrumb b").inner_text(); p.click("#clkgo"); p.wait_for_timeout(1200)
        p.evaluate("location.hash = '#/lesson/%s'" % CH); p.wait_for_selector(".rail"); p.wait_for_timeout(500)
        live = p.locator(".rail button.live .nm").all_inner_texts()
        check("Start after a reload counts time for the part on screen", len(live) == 1 and live[0].lower() in part.lower(), (part, live))  # the rail shows the part name without its kind (Clear Desk, 8 Oct); c.close()
        # 5. Ctrl/Alt + keys do nothing; 6. nothing moves behind a zoomed picture
        c = ctx_(b); p = page(c, "?try#/lesson/" + CH + "/teach"); jump(p, "Choose the quiz"); p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
        v0 = p.locator(".chunk.cur .ctl.big [aria-pressed=true]").all_inner_texts(); p.keyboard.press("Control+1"); p.keyboard.press("Alt+2"); p.wait_for_timeout(200); a = pos(p); p.keyboard.press("Control+ArrowRight"); p.wait_for_timeout(200)
        check("Ctrl/Alt + number sets no verdict, Ctrl+Right does not move", p.locator(".chunk.cur .ctl.big [aria-pressed=true]").all_inner_texts() == v0 and pos(p) == a, (p.locator(".chunk.cur .ctl.big [aria-pressed=true]").all_inner_texts(), a, pos(p)))
        p.keyboard.press("1"); p.wait_for_timeout(200); check("plain key 1 still marks Right", p.locator(".chunk.cur .ctl.big [aria-pressed=true][data-v]").first.get_attribute("data-v") == "right")
        jump_ic(p, "\u25a7", 2); p.wait_for_timeout(1500); a = pos(p); p.locator(".chunk.cur .tfig img").click(); p.wait_for_timeout(300)
        p.keyboard.press("ArrowRight"); p.keyboard.press("ArrowRight"); p.wait_for_timeout(300)
        check("arrows do not move the lesson behind a zoomed picture", pos(p) == a, (a, pos(p))); p.keyboard.press("Escape"); p.wait_for_timeout(200)
        p.keyboard.press("ArrowRight"); p.wait_for_timeout(200); check("arrows work again after closing the zoom", pos(p) != a)
        # 7. the chosen quiz set survives a reload and a trip to Plan
        c.close(); c = ctx_(b); p = page(c, "#/lesson/" + CH + "/teach"); jump(p, "Choose the quiz"); p.locator(".chunk.cur .chip").filter(has_text="All").first.click(); p.wait_for_timeout(300)
        jump(p, "Bromoethane to ethanol"); a = (pos(p), p.locator(".chunk.cur .qtext").inner_text())
        p.reload(); p.wait_for_selector(".teach3"); p.wait_for_timeout(800); r1 = (pos(p), p.locator(".chunk.cur .qtext").inner_text() if p.locator(".chunk.cur .qtext").count() else "")
        p.locator(".tbar a.back").click(); p.wait_for_selector(".rail"); p.wait_for_timeout(300); p.locator(".modes a").filter(has_text="Teach").click(); p.wait_for_selector(".teach3"); p.wait_for_timeout(600)
        r2 = (pos(p), p.locator(".chunk.cur .qtext").inner_text() if p.locator(".chunk.cur .qtext").count() else "")
        check("quiz set 'All' and the place survive a reload and Plan and back", r1 == a and r2 == a, (a, r1, r2))
        # 8. a double tap on Next moves one chunk
        p.locator(".tfoot .btn.next").dblclick(); p.wait_for_timeout(300); n0 = int(a[0].split("/")[0]); n1 = int(pos(p).split("/")[0])
        check("double tap on Next moves one chunk", n1 == n0 + 1, (n0, n1))
        # 9. keyboard: Enter on Next, then Enter again, keeps going
        p.evaluate("document.querySelector('.tfoot .btn.next').focus()"); p.keyboard.press("Enter"); p.wait_for_timeout(200); p.keyboard.press("Enter"); p.wait_for_timeout(200)
        check("Enter, Enter on Next moves two chunks (focus stays on the button)", int(pos(p).split("/")[0]) == n1 + 2, (n1, pos(p))); c.close()
        # 10. try-out: Teach -> Plan keeps the clock and ticks of this tab
        c = ctx_(b); p = page(c, "?try#/lesson/" + CH + "/teach"); p.click("#clkgo"); p.wait_for_timeout(300)
        for i in range(3): p.locator(".tfoot .btn.next").dispatch_event("click"); p.wait_for_timeout(200)
        p.locator(".tbar a.back").click(); p.wait_for_selector(".rail"); p.wait_for_timeout(800)
        check("try-out: Plan still shows the running clock after Teach", p.locator("#clkgo").inner_text() == "Pause", p.locator("#clkgo").inner_text())
        p.locator(".modes a").filter(has_text="Teach").click(); p.wait_for_selector(".teach3"); p.wait_for_timeout(500)
        check("try-out: ticks kept after Plan and back", p.evaluate("document.querySelectorAll('.outline .oc.done').length") >= 1)
        # 11. Finish in try-out does not claim it saved
        p.evaluate("location.hash = '#/lesson/%s'" % CH); p.wait_for_selector(".rail"); p.locator('.rail button[data-phase="_after"]').dispatch_event("click"); p.wait_for_timeout(400)
        p.locator("#fbform button[type=submit]").dispatch_event("click"); p.wait_for_timeout(600)
        check("try-out Finish does not say 'saved to GitHub'", "GitHub" not in p.locator("#toast").inner_text(), p.locator("#toast").inner_text()); c.close()
        # 12. offline Finish says it is kept on the device; online Finish saves for real (to the pretend GitHub)
        F = FakeGH(); c = ctx_(b, fake=F); p = page(c, "#/lesson/" + CH, "[data-phase]"); p.wait_for_timeout(1500)   # a finished lesson opens on its After page (Clear Desk)
        if not p.locator("#fbform").count(): p.locator('button[data-phase="_after"]').first.dispatch_event("click"); p.wait_for_timeout(400)
        c.set_offline(True); F.offline = True; p.wait_for_timeout(300); p.locator("#fbform button[type=submit]").dispatch_event("click"); p.wait_for_timeout(800)
        check("offline Finish says it is kept on the device", "GitHub" not in p.locator("#toast").inner_text() and "device" in p.locator("#toast").inner_text(), p.locator("#toast").inner_text())
        c.set_offline(False); F.offline = False; p.wait_for_timeout(3000)
        p.locator("#fbform button[type=submit]").dispatch_event("click"); p.wait_for_timeout(2500)
        check("online Finish saves and says so", p.locator("#toast").inner_text() == "Lesson saved to GitHub" and F.session(CH)["status"] == "finished", p.locator("#toast").inner_text())
        p.evaluate("Object.keys(localStorage).filter(k => k.indexOf('tutor.s.') == 0).forEach(k => localStorage.removeItem(k))"); c.close()
        # 13. two tabs on one lesson: the second tab sees the running clock and the saved file keeps it running
        F = FakeGH(); c = ctx_(b, fake=F); A = page(c, "#/lesson/" + CH + "/teach"); P2 = page(c, "#/lesson/" + CH, "[data-phase]")
        A.bring_to_front(); A.click("#clkgo"); A.wait_for_timeout(300)
        for i in range(3): A.locator(".tfoot .btn.next").dispatch_event("click"); A.wait_for_timeout(200)
        P2.bring_to_front(); P2.wait_for_timeout(1500)
        check("second tab shows the clock running", P2.locator("#clkgo").inner_text() == "Pause", P2.locator("#clkgo").inner_text())
        P2.locator('button[data-phase]:not([data-phase^="_"])').first.dispatch_event("click"); P2.wait_for_timeout(300); P2.locator('#phasebox [data-v="right"]').first.dispatch_event("click"); P2.wait_for_timeout(6000)
        A.bring_to_front(); A.wait_for_timeout(6000); s = F.session(CH)
        check("both tabs' work saved: clock running, ticks and the verdict", [e["e"] for e in s["time"]["log"]][:1] == ["start"] and s["time"]["log"][-1]["e"] not in ("pause", "end") and sum(1 for d in s["done"].values() if not d.get("off")) >= 1 and any(a.get("v") == "right" for a in s["answers"].values()),
              ([e["e"] for e in s["time"]["log"]], sum(1 for d in s["done"].values() if not d.get("off")), [a.get("v") for a in s["answers"].values()]))
        check("first tab shows the second tab's verdict", A.evaluate("document.querySelectorAll('.outline .oc.v-right').length") >= 1)
        A.evaluate("Object.keys(localStorage).filter(k => k.indexOf('tutor.s.') == 0 || k.indexOf('tutor.tquiz') == 0).forEach(k => localStorage.removeItem(k))")
        b.close()
finally:
    srv.terminate()
print("errors:", errs)
print("FAILED: %d" % len(fails) if fails else "ALL PASS")
sys.exit(1 if fails or errs else 0)
