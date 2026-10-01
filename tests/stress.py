import subprocess, sys, time, json, statistics as st
from playwright.sync_api import sync_playwright
TOK = subprocess.run([r"C:/Program Files/GitHub CLI/gh.exe", "auth", "token"], capture_output=True, text=True).stdout.strip()
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", r"Z:/Shared Neurons/tutor-app"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2); B = "http://localhost:8765/"; errs = []; puts = []; offline = {"on": False}
def route(r):
    if r.request.method != "GET": puts.append(r.request.url); return r.abort()
    if offline["on"]: return r.abort()
    r.continue_()
def ms(t0): return round((time.perf_counter() - t0) * 1000)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        c = b.new_context(viewport={"width": 1280, "height": 860}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token', %s); localStorage.setItem('tutor.device','stress');" % json.dumps(TOK))
        c.route("https://api.github.com/**", route)
        p = c.new_page(); p.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        p.on("console", lambda m: m.type == "error" and "ERR_FAILED" not in m.text and errs.append("console: " + m.text))
        t0 = time.perf_counter(); p.goto(B + "#/"); p.wait_for_selector(".tile", timeout=30000); print("home cold:", ms(t0), "ms")
        time.sleep(2); t0 = time.perf_counter(); p.reload(); p.wait_for_selector(".tile", timeout=30000); print("home warm (reload):", ms(t0), "ms")
        t0 = time.perf_counter(); p.goto(B + "#/lesson/2026-09-30-chem"); p.wait_for_selector(".modes", timeout=30000); print("chem plan open:", ms(t0), "ms")
        # every phase incl. system ones
        ph = p.evaluate("Array.from(document.querySelectorAll('.rail button[data-phase]')).map(b=>b.dataset.phase)")
        times = []
        for id in ph:
            t0 = time.perf_counter(); p.click('.rail button[data-phase="%s"]' % id); p.wait_for_timeout(30); times.append((id, ms(t0)))
        print("phase switches (ms):", times)
        # teach: 223 rapid Nexts
        p.goto(B + "#/lesson/2026-09-30-chem/teach"); p.wait_for_selector(".teach3", timeout=20000)
        p.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('tutor.tpos')==0).forEach(k=>localStorage.removeItem(k))"); p.reload(); p.wait_for_selector(".teach3", timeout=20000)
        n = p.evaluate("+document.querySelector('.tmini .num').textContent.split('/')[1]")
        steps = []
        for i in range(n + 3):
            t0 = time.perf_counter(); p.keyboard.press("ArrowRight"); steps.append(ms(t0))
        pos = p.locator(".tmini .num").inner_text()
        print("teach: %d steps, median %d ms, p95 %d ms, max %d ms; ended at %s" % (len(steps), st.median(steps), sorted(steps)[int(.95 * len(steps))], max(steps), pos))
        jsdraw = p.evaluate("""(()=>{const t=performance.now(); for(let i=0;i<20;i++){document.querySelector('.tfoot [data-tgo=\"-1\"]').click();} return (performance.now()-t)/20})()""")
        print("teach draw in-page avg: %.1f ms" % jsdraw)
        heap = p.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : -1"); print("JS heap MB:", heap)
        dom = p.evaluate("document.getElementsByTagName('*').length"); print("DOM nodes in teach:", dom)
        # verdict hammer on a quiz item
        p.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('tutor.tpos')==0).forEach(k=>localStorage.setItem(k,'5'))"); p.reload(); p.wait_for_selector(".teach3", timeout=20000)
        for i in range(30):
            p.locator('.chunk.cur .ctl [data-v="%s"]' % ["right", "wrong", "partly"][i % 3]).click()
        state = p.locator(".chunk.cur .ctl [aria-pressed=true]").all_inner_texts(); print("after 30 verdict taps pressed:", state)
        # typing in the note must not move the slide
        before = p.locator(".tmini .num").inner_text(); p.locator(".chunk.cur .addnote").click(); p.locator(".chunk.cur input[data-note]").click(); p.keyboard.type("he said the wrong thing"); p.keyboard.press("ArrowRight"); after = p.locator(".tmini .num").inner_text()
        print("arrow while typing moved slide:", before != after)
        # all routes
        for r in ["#/videos", "#/revise", "#/record", "#/settings", "#/new", "#/lesson/2026-09-30-maths", "#/lesson/2026-09-30-maths/teach", "#/"]:
            t0 = time.perf_counter(); p.goto(B + r); p.wait_for_timeout(1500); print("route", r, ms(t0) - 1500, "ms + settle")
        p.goto(B + "#/videos"); p.wait_for_selector("#vwrap .items", timeout=20000); p.locator("#vwrap .items a, #vwrap .items button").first.click(); p.wait_for_timeout(1500)
        print("video iframe present:", p.locator("iframe").count())
        # theme cycling + resize
        for i in range(3): p.click("#theme"); p.wait_for_timeout(100)
        for w in [1280, 1024, 820, 600, 390, 1280]:
            p.set_viewport_size({"width": w, "height": 860}); p.wait_for_timeout(150)
            sw = p.evaluate("document.documentElement.scrollWidth")
            if sw > w: errs.append("horizontal scroll at %d: %d" % (w, sw))
        # offline: cached lesson must still open
        offline["on"] = True
        t0 = time.perf_counter(); p.goto(B + "#/lesson/2026-09-30-chem/teach"); p.wait_for_selector(".teach3", timeout=20000); print("offline teach open:", ms(t0), "ms, save state:", p.locator("#save").inner_text())
        p.goto(B + "#/"); p.wait_for_timeout(2500); print("offline home tiles:", p.locator(".tile").count())
        offline["on"] = False
        b.close()
finally: srv.terminate()
print("blocked writes:", len(puts)); print("errors:", errs)
