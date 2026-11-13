"""Round 45 (13 Nov, app v75, exams v33): the second speed pass.
  1. What this device saves it already has: after a save, the file list (about 1 MB) and the saved file are NOT downloaded
     back. Another device's push still fetches the list, once. A save and a look at GitHub at the same moment end right.
  2. Home opens at once from the view kept on the device, then only what differs is changed (the same nodes stay).
  3. Teach: the outline stays on screen from step to step; only the part that changed is touched. It always matches an
     outline built new.
  4. Record is drawn once when GitHub has nothing new.
  5. morph(): the helper that changes only what differs.
  6. Exams (needs the local exam server on :8787, skipped without it): a button on the exam page makes one trip
     (the answer carries the exam), not two.
Run:  python tests/runtest.py tests/test_round45.py      (own server on :8766, pretend GitHub, nothing is written)"""
import http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8766), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = "http://localhost:8766/"; res = []; REPO = "alimuqaddasm/tutoring"
def ok(name, cond, extra=""):
    res.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra != "" and not cond else ""))

INIT = "localStorage.setItem('tutor.token','fake-token'); localStorage.setItem('tutor.device','speed'); localStorage.setItem('tutor.test','1');"
# when Home first shows, timed inside the page from the start of the load
WATCH = """(() => { const t0 = performance.now(); window.__home = null; window.__states = [];
  new MutationObserver(() => { const h = document.querySelector('#app .home'), now = Math.round(performance.now() - t0);
    const st = h ? 'home' : document.querySelector('#app .empty') ? 'loading' : 'other';
    if (!window.__states.length || window.__states[window.__states.length - 1][1] !== st) window.__states.push([now, st]);
    if (h && window.__home == null) window.__home = now; }).observe(document, { childList: true, subtree: true }); })();"""

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        fake = FakeGH()
        c = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
        c.add_init_script(INIT); c.add_init_script(WATCH)
        c.route("https://api.github.com/**", fake.route)
        c.route("**/*workers.dev/**", lambda r: r.abort())
        p = c.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        gets = lambda part: [pth for m, pth in fake.log if m == "GET" and part in pth]
        puts = lambda: [pth for m, pth in fake.log if m == "PUT"]
        T = lambda src: p.evaluate("s => __t(s)", src)
        ids = sorted(k.split("/")[3] for k in fake.files if k.startswith("students/UK-1/lessons/") and k.endswith("/script.json"))
        les = os.environ.get("LESSON", ids[-1]); sess = "students/UK-1/lessons/%s/session.json" % les

        # ---------- 1. own saves
        p.goto(B + "#/"); p.wait_for_selector(".home", timeout=60000); p.wait_for_timeout(2000)
        ok("first visit: the file list is downloaded once", len(gets("/git/trees/")) == 1, len(gets("/git/trees/")))
        p.goto(B + "#/lesson/" + les + "/teach"); p.wait_for_selector(".teach3", timeout=30000); p.wait_for_timeout(1500)
        fake.log.clear(); T("touch()"); p.wait_for_timeout(200)
        p.evaluate("location.hash = '#/'"); p.wait_for_selector(".home"); p.wait_for_timeout(2500)
        ok("leaving the lesson saved it", any(sess in x for x in puts()), puts()[:3])
        ok("back on Home after our own save: the file list is NOT downloaded again", not gets("/git/trees/"), gets("/git/trees/"))
        ok("  the saved file is not downloaded back", not gets("/git/blobs/" + fake.sha_of(sess)), gets("/git/blobs/")[:3])
        ok("  GitHub was still asked for the newest commit id", len(gets("/commits/HEAD")) >= 1)
        st = json.loads(T("JSON.stringify({ head: HEADSHA, sha: shaOf(%s) })" % json.dumps(sess)))
        ok("  the app is on the newest commit, with the new file id", st["head"] == fake.head() and st["sha"] == fake.sha_of(sess), (st, fake.head()))
        ok("  Home shows the lesson as it now is", "in progress" in p.inner_text("#app").lower())
        p.wait_for_timeout(1200)
        ft = p.evaluate("""r => { const o = JSON.parse(localStorage.getItem('tutor.ft.' + r) || 'null'); return o && { h: o.h, n: o.t.length, old: localStorage.getItem('tutor.tree.' + r), oldh: localStorage.getItem('tutor.head.' + r) }; }""", REPO)
        ok("the list and its commit id are kept as one item; the two old items are gone", ft and ft["h"] == fake.head() and ft["n"] > 100 and ft["old"] is None and ft["oldh"] is None, ft and {k: ft[k] for k in ("h", "n")})
        fake.log.clear(); p.reload(); p.wait_for_selector(".home"); p.wait_for_timeout(2000)
        ok("reload: no file list and no lesson file is downloaded", not gets("/git/trees/") and not gets("/git/blobs/"), (gets("/git/trees/"), gets("/git/blobs/")[:2]))

        # another device pushes: the list comes once, and a save of ours after that needs no list
        newid = "2031-01-06-maths"
        fake.extra["students/UK-1/lessons/%s/script.json" % newid] = json.dumps({"title": "Pushed from elsewhere", "subject": "maths", "date": "2031-01-06", "phases": [{"id": "a", "name": "Part one", "blocks": [{"type": "steps", "items": [{"html": "One step"}]}]}]}).encode()
        fake.log.clear(); p.evaluate("location.hash = '#/settings'"); p.wait_for_selector("#setform"); p.evaluate("location.hash = '#/'"); p.wait_for_selector(".home"); p.wait_for_timeout(2500)
        ok("another device's push: the file list is downloaded once", len(gets("/git/trees/")) == 1, len(gets("/git/trees/")))
        ok("  and its lesson shows on Home", "pushed from elsewhere" in p.inner_text("#app").lower())
        p.goto(B + "#/lesson/" + les + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(1200)
        fake.log.clear(); T("touch()"); p.wait_for_timeout(150); p.evaluate("location.hash = '#/'"); p.wait_for_selector(".home"); p.wait_for_timeout(2500)
        ok("a save of ours after that: saved, with no file list download", any(sess in x for x in puts()) and not gets("/git/trees/"), (puts()[:2], gets("/git/trees/")))

        # GitHub slow: the save and the look at GitHub cross each other
        p.goto(B + "#/lesson/" + les + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(1200)
        fake.log.clear(); fake.delay = 0.6; T("touch()"); p.evaluate("location.hash = '#/'"); p.wait_for_selector(".home", timeout=30000); p.wait_for_timeout(6000); fake.delay = 0
        st = json.loads(T("JSON.stringify({ head: HEADSHA, sha: shaOf(%s) })" % json.dumps(sess)))
        ok("slow GitHub, a save and Home at the same moment: the save went out", any(sess in x for x in puts()), puts()[:2])
        ok("  it ends on the newest commit with the right file", st["head"] == fake.head() and st["sha"] == fake.sha_of(sess), (st, fake.head()))

        # two devices: ours saved, then the other one saved the same lesson. The other one's copy must win the file list.
        other = json.loads(fake.extra[sess]); other["title"] = "Changed on the other device"
        fake.extra[sess] = json.dumps(other, indent=1).encode()
        fake.log.clear(); p.evaluate("location.hash = '#/settings'"); p.wait_for_selector("#setform"); p.evaluate("location.hash = '#/'"); p.wait_for_selector(".home"); p.wait_for_timeout(2500)
        ok("the other device's later save of the same lesson is the one in the list", T("shaOf(%s)" % json.dumps(sess)) == fake.sha_of(sess) and len(gets("/git/trees/")) == 1, len(gets("/git/trees/")))

        # ---------- 2. Home: at once from the kept view, then only what differs
        p.wait_for_timeout(1200)
        snap = p.evaluate("(() => { const o = JSON.parse(localStorage.getItem('tutor.home') || 'null'); return o && { k: o.k, n: o.h.length }; })()")
        ok("Home's view is kept on the device, for this student, filter and day", snap and snap["n"] > 2000 and snap["k"].startswith(REPO + "|UK-1|all|"), snap)
        fake.delay = 1.2; p.reload(); p.wait_for_selector(".home", timeout=30000)
        first = p.evaluate("window.__home"); states = p.evaluate("window.__states")
        p.wait_for_timeout(5000); fake.delay = 0
        ok("app start with a slow GitHub: Home is on screen within half a second", first is not None and first < 500, (first, states))
        ok("  it never goes back to 'Loading' after that", [s[1] for s in p.evaluate("window.__states")].count("home") == 1 and p.evaluate("window.__states")[-1][1] == "home", p.evaluate("window.__states"))
        # the same nodes stay when Home is drawn again
        p.evaluate("(() => { const r = document.querySelector('.home .lrow'), t = document.querySelector('.home .tile'), a = document.querySelector('#homerevq'); r.__mine = 1; t.__mine = 1; window.__keep = [r, t, a, a && a.textContent]; })()")
        T("lessonsView()"); p.wait_for_timeout(1500)
        kept = p.evaluate("(() => { const k = window.__keep; return [document.contains(k[0]) && k[0].__mine === 1, document.contains(k[1]) && k[1].__mine === 1, document.contains(k[2]), k[2] && k[2].textContent === k[3]]; })()")
        ok("Home drawn again: the lesson rows and tiles are the same nodes, not new ones", kept[0] and kept[1], kept)
        ok("  the warm-up box keeps its text while it is refreshed", kept[2] and kept[3], kept)
        same = p.evaluate("""(() => { const t = document.createElement('template'); t.innerHTML = __t('homeHTML(HOMEALL.filter(function(it){var sp=subjPick(),sj=subjOf(it);return sp==="all"||sj===sp}))');
            const live = document.querySelector('#app .home'), want = t.content.querySelector('.home');
            const strip = n => { n = n.cloneNode(true); n.querySelectorAll('[data-keep]').forEach(e => { e.textContent = ''; }); return n; };
            return strip(live).isEqualNode(strip(want)); })()""")
        ok("  and it is exactly what a new build would give", same)
        # a kept view from another day or filter is never used
        p.evaluate("(() => { const o = JSON.parse(localStorage.getItem('tutor.home')); o.k = o.k.replace(/\\d{4}-\\d\\d-\\d\\d$/, '2001-01-01'); localStorage.setItem('tutor.home', JSON.stringify(o)); })()")
        ok("a view kept on another day is not used", T("homeSnap()") == "")
        T("lessonsView()"); p.wait_for_timeout(1500)
        ok("  and today's view replaces it", T("homeSnap().length") > 2000)

        # ---------- 3. Teach: the outline stays, and always matches a new build
        big = "2026-09-30-chem" if "2026-09-30-chem" in ids else ids[0]
        p.goto(B + "#/lesson/" + big + "/teach"); p.wait_for_selector(".teach3", timeout=30000); p.wait_for_timeout(1500)
        p.evaluate("Object.keys(localStorage).filter(k => k.indexOf('tutor.tpos') == 0).forEach(k => localStorage.removeItem(k))"); p.reload(); p.wait_for_selector(".teach3"); p.wait_for_timeout(1500)
        EQ = """(() => { const t = document.createElement('template'); t.innerHTML = __t('runwayHTML(TCH.seq[TCH.pos])');
            const live = document.querySelector('.runway nav.outline'), want = t.content.querySelector('nav.outline'); if (live.isEqualNode(want)) return '';
            const norm = n => { n = n.cloneNode(true); [n, ...n.querySelectorAll('[class]')].forEach(e => { if (e.hasAttribute && e.hasAttribute('class')) e.setAttribute('class', [...e.classList].sort().join(' ')); }); return n; };   // the same classes in another order are the same
            const L2 = norm(live), W2 = norm(want); if (L2.isEqualNode(W2)) return '';
            const a = [...L2.querySelectorAll('*')], b = [...W2.querySelectorAll('*')]; for (let i = 0; i < Math.max(a.length, b.length); i++) if (!a[i] || !b[i] || a[i].cloneNode(false).outerHTML !== b[i].cloneNode(false).outerHTML) return (a[i] ? a[i].cloneNode(false).outerHTML : 'none') + ' / ' + (b[i] ? b[i].cloneNode(false).outerHTML : 'none'); return 'text differs'; })()"""
        p.evaluate("(() => { const ps = document.querySelectorAll('.runway .outline details'); window.__parts = [...ps]; ps.forEach((d, i) => { d.__n = i; }); window.__aside = document.querySelector('.runway'); window.__stage = document.querySelector('.stage'); })()")
        nparts = p.evaluate("window.__parts.length")
        bad = []
        for i in range(14):
            p.keyboard.press("ArrowRight"); p.wait_for_timeout(60)
            d = p.evaluate(EQ)
            if d: bad.append((i, d[:200]))
        ok("14 steps on: the outline on screen is exactly what a new build would give, at every step", not bad, bad[:2])
        kept = p.evaluate("(() => [document.contains(window.__aside), window.__parts.filter((d, i) => document.contains(d) && d.__n === i).length, document.contains(window.__stage)])()")
        ok("  the outline and its %d parts are the same nodes as 14 steps ago" % nparts, kept[0] and kept[1] == nparts, kept)
        ok("  the step itself is built new each time", kept[2] is False, kept)
        ok("  the marker is on the current step", p.evaluate("+document.querySelector('.outline .cur').getAttribute('data-tjump') === __t('TCH.pos')"))
        # a verdict, then on: the outline still matches
        q = p.evaluate("(() => { const b = [...document.querySelectorAll('.outline .oc')].find(b => b.querySelector('.ic') && b.querySelector('.ic').textContent == '?'); if (!b) return false; b.click(); return true; })()")
        p.wait_for_timeout(300)
        if q:
            ok("tapping an outline line: it does not keep the keyboard", p.evaluate("!document.querySelector('.runway').contains(document.activeElement)"))
            p.locator('.chunk.cur [data-v="wrong"]').click(); p.wait_for_timeout(200)
            cls = p.evaluate("[...document.querySelector('.outline .oc.cur').classList].sort().join(' ')")
            ok("a verdict shows on the outline line at once", "v-wrong" in cls.split(), cls)   # the part's count of right answers follows on the next step, as before
            p.keyboard.press("ArrowRight"); p.wait_for_timeout(100); p.keyboard.press("ArrowLeft"); p.wait_for_timeout(100)
            ok("  and still matches after moving on and back", p.evaluate(EQ) == "", p.evaluate(EQ)[:200])
        # a part he closes stays closed; opened again stays open
        p.evaluate("(() => { const d = document.querySelector('.outline details.now'); window.__now = d; d.querySelector('summary').click(); })()"); p.wait_for_timeout(250)
        ok("closing the current part in the outline closes it", p.evaluate("window.__now.open === false"))
        p.keyboard.press("ArrowRight"); p.wait_for_timeout(150)
        ok("  it stays closed on the next step (same part)", p.evaluate("document.contains(window.__now) && (window.__now.open === false || !window.__now.classList.contains('now'))"))
        ok("  the outline still matches a new build", p.evaluate(EQ) == "", p.evaluate(EQ)[:200])
        # Prepare and Teach of the same lesson share the screen: still right
        p.evaluate("h => { location.hash = h; }", "#/lesson/" + big); p.wait_for_selector(".teach3"); p.wait_for_timeout(700)
        ok("Prepare of the same lesson: the outline matches, with the Lessons link", p.evaluate(EQ) == "" and "Lessons" in p.inner_text(".runway .rhead"), (p.evaluate(EQ)[:160], p.inner_text(".runway .rhead")))
        p.evaluate("h => { location.hash = h; }", "#/lesson/" + big + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(700)
        ok("back in Teach: the outline matches, with the Prepare link", p.evaluate(EQ) == "" and "Prepare" in p.inner_text(".runway .rhead"), (p.evaluate(EQ)[:160], p.inner_text(".runway .rhead")))
        ok("no script error so far", not errs, errs[:3])

        # ---------- 4. Record drawn once
        p.goto(B + "#/"); p.wait_for_selector(".home"); p.wait_for_timeout(1200)
        p.evaluate("(() => { window.__rec = 0; new MutationObserver(ms => { ms.forEach(m => { [...m.addedNodes].forEach(n => { if (n.classList && n.classList.contains('record') && n.querySelector('.tbl')) window.__rec++; }); }); }).observe(document.querySelector('#app'), { childList: true }); })()")
        fake.log.clear(); p.evaluate("location.hash = '#/record'"); p.wait_for_selector(".record .tbl", timeout=30000); p.wait_for_timeout(2500)
        ok("Record with nothing new on GitHub: drawn once", p.evaluate("window.__rec") == 1, p.evaluate("window.__rec"))
        lesson_shas = set(fake.sha_of(k) for k in list(fake.files) + list(fake.extra) if "/lessons/" in k and k.endswith((".json",)))
        again = [x for x in gets("/git/blobs/") if x.rsplit("/", 1)[1] in lesson_shas]
        ok("  and no lesson file was fetched for it (they are already read)", not again, again[:2])

        # ---------- 5. morph()
        cases = [
            ['<p class="a">one</p><p>two</p>', '<p class="b" title="t">one!</p><p>two</p><p>three</p>'],
            ['<ul><li>1</li><li>2</li><li>3</li></ul>', '<ul><li>1</li><li>3</li></ul>'],
            ['<div id="x">a</div><span>b</span>', '<span>b</span><div id="y">a</div>'],
            ['text <b>bold</b> tail', '<i>new</i> text'],
            ['<details open><summary>s</summary><p>in</p></details>', '<details><summary>s2</summary><p>in</p></details>'],
            ['<svg viewBox="0 0 4 4"><path d="M0 0h4"></path></svg>', '<svg viewBox="0 0 8 8"><circle r="2"></circle><path d="M0 0h8"></path></svg>'],
            ['', '<a href="#/">x</a>'], ['<a href="#/">x</a>', ''],
        ]
        bad = p.evaluate("""cases => cases.map(c => { const el = document.createElement('div'); el.innerHTML = c[0]; const first = el.firstChild; __t('morph')(el, c[1]);
            const t = document.createElement('div'); t.innerHTML = c[1]; return el.isEqualNode(t) ? null : [c[0], el.innerHTML]; }).filter(Boolean)""", cases)
        ok("morph: %d cases end exactly as the new text says" % len(cases), not bad, bad[:2])
        keep = p.evaluate("""(() => { const el = document.createElement('div'); el.innerHTML = '<p>a</p><div id="k" data-keep>filled in later</div><p>z</p>'; const p0 = el.firstChild, k = el.querySelector('#k');
            __t('morph')(el, '<p>a</p><div id="k" data-keep></div><p>changed</p>'); return [el.firstChild === p0, el.querySelector('#k') === k, k.textContent, el.lastChild.textContent]; })()""")
        ok("morph: an unchanged node is the same node, and a data-keep box keeps what is in it", keep == [True, True, "filled in later", "changed"], keep)
        ok("no script error", not errs, errs[:3])
        c.close()

        # ---------- 6. Exams: one trip for a button (needs the local exam server on :8787, and the app on :8765 for its CORS rule)
        import urllib.request
        API = os.environ.get("EXAM_API", "http://localhost:8787"); PW = os.environ.get("EXAM_PW", "local-test")
        try: urllib.request.urlopen(API + "/api/health", timeout=3); up = True
        except Exception: up = False
        if not up:
            print("SKIP Exams checks (no exam server on :8787)")
        else:
            srv2 = None
            try: srv2 = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H); threading.Thread(target=srv2.serve_forever, daemon=True).start()
            except OSError: pass                                   # the app is already being served there
            A = "http://localhost:8765/"
            def tapi(method, path, body=None):
                req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers={"X-Exam-Password": PW, "Content-Type": "application/json"})
                with urllib.request.urlopen(req) as r: return json.loads(r.read())
            xid = tapi("POST", "/api/t/exams", {"title": "One trip (test %d)" % int(time.time()), "subject": "maths", "source_path": "", "base_minutes": 30,
                                              "questions": [{"id": "q1", "label": "Q1", "text_html": "<p>Question</p>", "marks": 3, "type": "short"}]})["id"]
            c = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
            c.add_init_script(INIT + "localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
            fake3 = FakeGH(); c.route("https://api.github.com/**", fake3.route)
            xcalls = []
            def xroute(r):
                xcalls.append(r.request.method + " " + r.request.url.split("/api/t/")[-1]); r.continue_()
            c.route(API + "/**", xroute)
            p = c.new_page(); p.on("dialog", lambda d: d.accept()); xerrs = []; p.on("pageerror", lambda e: xerrs.append(str(e)))
            p.goto(A + "#/exams/" + xid); p.wait_for_selector("#xt-btns", timeout=30000); p.wait_for_timeout(800)
            def press(sel, what):
                xcalls.clear(); p.click(sel); p.wait_for_timeout(1500)
                posts = [x for x in xcalls if x.startswith("POST")]; again = [x for x in xcalls if x == "GET exams/" + xid]
                ok("%s: one change sent, with ?full=1" % what, len(posts) == 1 and posts[0].endswith("?full=1"), xcalls[:5])
                ok("  the exam is not asked for a second time", not again, xcalls[:6])
            press("[data-newlink]", "Make the student link")
            ok("  the page shows the link", p.locator("#xt-link, .xt-link input, input[readonly]").count() >= 1 and "exam.html#t=" in p.content())
            press("[data-start]", "Start")
            ok("  the page shows the exam running", p.locator("[data-lock]").count() == 1 and p.locator("[data-start]").count() == 0, p.inner_text("#app")[:200])
            press("[data-ext]", "Add minutes")
            press("[data-lock]", "Lock")
            ok("  the page shows it locked", "locked" in p.inner_text("#app").lower(), p.inner_text("#app")[:200])
            ok("no script error on the exam page", not xerrs, xerrs[:3])
            tapi("DELETE", "/api/t/exams/" + xid)
            c.close()
            if srv2: srv2.shutdown()
        b.close()
finally:
    srv.shutdown()
print("\n%d of %d passed" % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
