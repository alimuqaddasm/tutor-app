"""Round 44 (11 Nov, app v74, exams v32): speed.
  1. The file list (about 1 MB) is downloaded once. After that the app asks GitHub only for the newest commit's id,
     and downloads the list again only when something changed.
  2. Home is drawn once when nothing changed, and again when something did.
  3. Script text is made safe once and remembered: Teach steps do not clean the whole script again. Same output as before.
  4. Warm-up Shuffle still changes the order.
  6. Exams (v32): the list, an exam page and the marking page show from the copy kept on the device before the far-away
     exam server answers; question pictures are kept on the device (needs the local exam server on :8787; skipped without it).
  5. The offline shell: versioned files (app.js?v=73) and vendor/ come from the saved copy with no network request;
     index.html still asks the server first; with the server gone, the app still opens.
Run:  python tests/runtest.py tests/test_round44.py      (own server on :8766, pretend GitHub, nothing is written)"""
import http.server, json, os, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
hits = []; down = {"on": False}
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        if down["on"]:
            self.send_error(503); return
        hits.append(self.path); super().do_GET()
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8766), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = "http://localhost:8766/"; res = []
def ok(name, cond, extra=""):
    res.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra and not cond else ""))

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        fake = FakeGH()
        c = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','fake-token'); localStorage.setItem('tutor.device','speed');")
        c.route("https://api.github.com/**", fake.route)
        c.route("**/*workers.dev/**", lambda r: r.abort())
        p = c.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        trees = lambda: sum(1 for m, pth in fake.log if "/git/trees/" in pth)
        heads = lambda: sum(1 for m, pth in fake.log if pth.endswith("/commits/HEAD"))

        # 1. the list once, then only the commit id
        p.goto(B + "#/"); p.wait_for_selector(".home", timeout=60000); p.wait_for_timeout(1500)
        ok("first visit downloads the file list once", trees() == 1, trees())
        ok("the commit id is kept on the device", p.evaluate("/^[0-9a-f]{40}$/.test(localStorage.getItem('tutor.head.alimuqaddasm/tutoring')||'')"))
        fake.log.clear(); p.reload(); p.wait_for_selector(".home", timeout=60000); p.wait_for_timeout(1500)
        ok("reload: asks for the commit id", heads() >= 1, heads())
        ok("reload: does not download the file list again", trees() == 0, trees())

        # 2. one draw when nothing changed
        p.evaluate("""() => { window.__draws = 0; new MutationObserver(ms => { if (ms.some(m => m.target.id === 'app' && [...m.addedNodes].some(n => n.classList && n.classList.contains('home')))) window.__draws++; }).observe(document.querySelector('#app'), { childList: true }); }""")
        fake.log.clear(); p.evaluate("location.hash = '#/settings'"); p.wait_for_selector("#setform"); p.evaluate("window.__draws = 0; location.hash = '#/'"); p.wait_for_selector(".home"); p.wait_for_timeout(1500)
        ok("home with nothing new: drawn once", p.evaluate("window.__draws") == 1, p.evaluate("window.__draws"))
        ok("moving between screens: no file list download", trees() == 0, trees())

        # something changes on GitHub (another device saved): the list comes again and home is redrawn
        ids = sorted(k.split("/")[3] for k in fake.files if k.startswith("students/UK-1/lessons/") and k.endswith("/script.json"))
        newid = "2031-01-06-maths"
        fake.extra["students/UK-1/lessons/%s/script.json" % newid] = json.dumps({"title": "Speed check lesson", "subject": "maths", "date": "2031-01-06", "phases": [{"id": "a", "name": "Part one", "blocks": [{"type": "steps", "items": [{"html": "<b>One</b> step"}]}]}]}).encode()
        fake.log.clear(); p.evaluate("location.hash = '#/settings'"); p.wait_for_selector("#setform"); p.evaluate("location.hash = '#/'"); p.wait_for_selector(".home"); p.wait_for_timeout(2000)
        ok("a change on GitHub: the file list is downloaded again", trees() == 1, trees())
        fake.log.clear(); p.goto(B + "#/lesson/" + newid); p.wait_for_selector(".teach3, .lpage, .lesson", timeout=30000); p.wait_for_timeout(800)
        ok("the new lesson opens", "Speed Check Lesson".lower() in p.inner_text("#app").lower() or "one step" in p.inner_text("#app").lower(), p.inner_text("#app")[:120])

        # 3. cleaned text is remembered, and is the same text
        big = "2026-09-30-chem" if "2026-09-30-chem" in ids else ids[-1]
        p.goto(B + "#/lesson/" + big + "/teach"); p.wait_for_selector(".teach3", timeout=30000); p.wait_for_timeout(1200)
        n = p.evaluate("""() => { let n = 0; const o = DOMPurify.sanitize; DOMPurify.sanitize = function () { n++; return o.apply(this, arguments); }; window.__n = () => n; return 0; }""")
        for i in range(12): p.keyboard.press("ArrowRight")
        for i in range(12): p.keyboard.press("ArrowLeft")
        p.wait_for_timeout(300); p.evaluate("window.__base = window.__n()")
        for i in range(12): p.keyboard.press("ArrowRight")
        for i in range(12): p.keyboard.press("ArrowLeft")
        p.wait_for_timeout(300); again = p.evaluate("window.__n() - window.__base")
        ok("going over the same 12 steps again cleans nothing new", again == 0, again)
        ok("no script error in Teach", not errs, errs[:2])

        # 4. Shuffle still works
        p.goto(B + "#/revise"); p.wait_for_timeout(1500)
        sh = p.locator('[data-rev="shuffle"]')
        if sh.count():
            before = p.inner_text("#app"); sh.first.click(); p.wait_for_timeout(400); after = p.inner_text("#app")
            ok("Warm-up Shuffle changes the card", before != after)
        else:
            print("SKIP Warm-up Shuffle (nothing due today)")
        c.close()

        # 5. the offline shell
        c = b.new_context(viewport={"width": 1280, "height": 860})
        c.add_init_script("localStorage.setItem('tutor.token','fake-token');")
        fake2 = FakeGH(); c.route("https://api.github.com/**", fake2.route); c.route("**/*workers.dev/**", lambda r: r.abort()); c.route("**/fonts.g*/**", lambda r: r.abort())
        p = c.new_page(); p.goto(B + "#/"); p.wait_for_selector(".home", timeout=60000)
        p.evaluate("navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready)"); p.wait_for_timeout(2500)
        ok("offline shell installed", p.evaluate("caches.keys().then(k => k.some(x => /^tutor-shell-v/.test(x)))"))
        hits.clear(); p.reload(); p.wait_for_selector(".home", timeout=60000); p.wait_for_timeout(800)
        ver = [h for h in hits if "?v=" in h or "/vendor/" in h]
        ok("reload: versioned files and vendor/ are not asked for again", not ver, ver[:4])
        ok("reload: the page itself still asks the server first", any(h.split("?")[0] in ("/", "/index.html") for h in hits), hits[:6])
        down["on"] = True; t0 = time.time(); p.reload(); p.wait_for_selector(".home", timeout=20000); dt = time.time() - t0
        ok("server gone: the app still opens from the saved copy", True); ok("server gone: opens in under 2 s", dt < 2, round(dt, 2))
        down["on"] = False
        c.close()

        # 6. Exams: the copy kept on the device shows at once (needs the local exam server on :8787, and the app on :8765 for its CORS rule)
        import urllib.request
        API = os.environ.get("EXAM_API", "http://localhost:8787"); PW = os.environ.get("EXAM_PW", "local-test")
        try: urllib.request.urlopen(API + "/api/health", timeout=3); up = True
        except Exception: up = False
        if not up:
            print("SKIP Exams checks (no exam server on :8787)")
        else:
            srv2 = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H) if not os.environ.get("APP_UP") else None
            if srv2: threading.Thread(target=srv2.serve_forever, daemon=True).start()
            A = "http://localhost:8765/"
            c = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
            c.add_init_script("localStorage.setItem('tutor.token','fake-token');localStorage.setItem('tutor.device','speed');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
            fake3 = FakeGH(); c.route("https://api.github.com/**", fake3.route)
            slow = {"ms": 0, "off": False}; xcalls = []
            def xroute(r):
                xcalls.append(r.request.method + " " + r.request.url.split("/api/t/")[-1])
                if slow["off"]: return r.abort()
                if slow["ms"]: time.sleep(slow["ms"] / 1000)
                r.continue_()
            c.route(API + "/**", xroute)
            p = c.new_page(); p.goto(A + "#/exams"); p.wait_for_selector("[data-load], .exams a[href^='#/exams/']:not([href*=warmup])", timeout=60000); p.wait_for_timeout(800)
            if not p.locator(".exams a.btn[href^='#/exams/']:not([href*=warmup]):not([href$='/mark'])").count():
                p.locator("[data-load]").first.click(); p.wait_for_selector("#xt-btns", timeout=180000); p.wait_for_timeout(1500)
                p.goto(A + "#/exams"); p.wait_for_selector(".exams a.btn[href^='#/exams/']:not([href*=warmup])", timeout=30000); p.wait_for_timeout(800)
            xid = p.locator(".exams a.btn[href^='#/exams/']:not([href*=warmup]):not([href$='/mark'])").first.get_attribute("href").split("/")[2]
            p.goto(A + "#/exams/" + xid); p.wait_for_selector("#xt-btns", timeout=30000); p.wait_for_timeout(2500)        # first visit: from the server, pictures and all
            p.goto(A + "#/exams/" + xid + "/mark"); p.wait_for_function("!/^\\s*Loading/.test(document.querySelector('#app').innerText)", timeout=30000); p.wait_for_timeout(2500)
            # now the server is 2 s away
            slow["ms"] = 2000
            def shown(hash_, sel):
                # timed inside the page: this test's own pretend delay holds up the test's calls, not the page
                p.goto(A + "#/settings"); p.wait_for_selector("#setform"); xcalls.clear()
                ms = p.evaluate("""([h, sel]) => new Promise(res => { const t0 = performance.now(); location.hash = h;
                    const iv = setInterval(() => { if (document.querySelector(sel)) { clearInterval(iv); res(performance.now() - t0); } else if (performance.now() - t0 > 6000) { clearInterval(iv); res(99000); } }, 20); })""", [hash_, sel])
                return ms / 1000
            t = shown("#/exams", ".exams a.btn[href^='#/exams/']:not([href*=warmup])"); ok("Exams list shows from the saved copy before the server answers", t < 1.2, round(t, 2))
            t = shown("#/exams/" + xid, "#xt-btns"); ok("an exam page shows from the saved copy before the server answers", t < 1.2, round(t, 2))
            p.wait_for_timeout(3500); pics = [x for x in xcalls if x.startswith("GET") and "/questions/" in x]
            ok("question pictures come from the device, not the server again", not pics, pics[:3])
            ok("the fresh answer still arrives and the page is still there", p.locator("#xt-btns").count() == 1 and any(x.endswith("exams/" + xid) for x in xcalls), xcalls[:5])
            t = shown("#/exams/" + xid + "/mark", ".xmfoot, #xt-total"); ok("the marking page shows from the saved copy before the server answers", t < 1.2, round(t, 2))
            p.wait_for_timeout(3000)
            slow["off"] = True; t = shown("#/exams", ".exams a.btn[href^='#/exams/']:not([href*=warmup])"); p.wait_for_timeout(800)
            ok("server unreachable: the saved list stays on screen", t < 1.2 and p.locator(".exams a.btn[href^='#/exams/']").count() > 0, round(t, 2))
            c.close()
            if srv2: srv2.shutdown()
        b.close()
finally:
    srv.shutdown()
print("\n%d of %d passed" % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
