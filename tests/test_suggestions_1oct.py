"""Ali's 12 suggestions of 1 Oct, checked in the browser. Writes to GitHub are blocked.
(Waits use page.wait_for_timeout: a plain sleep stops Playwright from seeing requests.)"""
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
TOK = subprocess.run([r"C:/Program Files/GitHub CLI/gh.exe", "auth", "token"], capture_output=True, text=True).stdout.strip()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "tests", "shots"); os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", HERE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2); errs = []; B = "http://localhost:8765/"


def ctx_(b, w, h):
    c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.layout', 'classic'); localStorage.setItem('tutor.token', %s); localStorage.setItem('tutor.device','test'); Object.keys(localStorage).filter(k=>k.indexOf('tutor.tpos')==0).forEach(k=>localStorage.removeItem(k));" % json.dumps(TOK))
    c.route("https://api.github.com/**", lambda r: r.abort() if r.request.method != "GET" else r.continue_())
    return c


def jump(p, f):
    p.evaluate("f => { const b = Array.from(document.querySelectorAll('.outline .oc')).find(x => (x.querySelector('.tx').textContent).indexOf(f) >= 0); b.click(); }", f)
    p.wait_for_timeout(700)


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge"); c = ctx_(b, 1440, 765); p = c.new_page()
        p.on("pageerror", lambda e: errs.append("PE " + str(e)))
        p.goto(B + "#/lesson/2026-10-01-chem/teach"); p.wait_for_selector(".teach3", timeout=60000); p.wait_for_timeout(800)
        print("3 page tags on part 1:", p.locator(".chunk.cur .ptag").all_inner_texts()[:4])
        p.screenshot(path=os.path.join(OUT, "s3-pages.png"))
        p.keyboard.press("ArrowRight"); p.wait_for_timeout(500)
        print("4/11 note on first step:", p.locator(".chunk.cur .tnote").count(), "| open:", p.locator(".chunk.cur .tnote[open]").count(), "| text screens in outline:", p.evaluate("document.querySelectorAll('.outline .oc .ic').length"))
        print("5 warm-up button in step:", p.locator(".chunk.cur [data-warmup]").count())
        p.screenshot(path=os.path.join(OUT, "s4-note.png"))
        p.locator(".chunk.cur [data-warmup]").click(); p.wait_for_timeout(1500)
        print("  warm-up opens here:", p.locator("#wuov").count(), "|", p.locator("#wubox").inner_text()[:80].replace("\n", " "))
        p.screenshot(path=os.path.join(OUT, "s5-warmup.png")); p.keyboard.press("Escape"); p.wait_for_timeout(300)
        jump(p, "Choose the quiz"); p.keyboard.press("ArrowRight"); p.wait_for_timeout(600)
        print("6/7 big verdicts:", p.locator(".chunk.cur .ctl.big .vb").count(), "small:", p.locator(".chunk.cur .ctl.big .vs").count(), "| tags:", p.locator(".chunk.cur .qt").all_inner_texts())
        p.locator(".chunk.cur .ans summary").click(); p.wait_for_timeout(300)
        print("9 answer source line:", p.locator(".chunk.cur .ansbody .src").inner_text())
        p.keyboard.press("2"); p.wait_for_timeout(300); print("  key 2 ->", p.locator(".chunk.cur .ctl.big [aria-pressed=true]").all_inner_texts())
        p.screenshot(path=os.path.join(OUT, "s6-quiz.png"))
        jump(p, "Bromoethane to ethanol"); print("8 tag instead of prefix:", p.locator(".chunk.cur .qt.tag").all_inner_texts(), "|", p.locator(".chunk.cur .qtext").inner_text())
        jump(p, "Crude oil") if False else None
        p.evaluate("Array.from(document.querySelectorAll('.outline .oc')).find(b => b.querySelector('.ic').textContent == '\u25a7').click()"); p.wait_for_timeout(1500)
        r = p.evaluate("(() => { const i = document.querySelector('.chunk.cur .tfig img'), f = document.querySelector('.tfoot'); const a = i.getBoundingClientRect(); return [Math.round(a.bottom), Math.round(f.getBoundingClientRect().top), window.scrollY]; })()")
        print("10 board bottom", r[0], "<= buttons top", r[1], "| scrolled", r[2])
        p.screenshot(path=os.path.join(OUT, "s10-board.png"))
        # 12 maths: video examples during 7.1
        p.goto(B + "#/lesson/2026-10-01-maths/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(800)
        jump(p, "Write cos(x + 30)"); print("12 maths video example:", p.locator(".chunk.cur .tlabel").first.inner_text().replace("\n", " "))
        p.screenshot(path=os.path.join(OUT, "s12-maths.png"))
        print("   Set 7 inside 7.1 part:", p.evaluate("Array.from(document.querySelectorAll('.opart')).filter(d => d.querySelector('summary .nm').textContent.indexOf('7.1') >= 0).map(d => Array.from(d.querySelectorAll('.tx')).filter(t => t.textContent.indexOf('Set 7') >= 0).length)"))
        # 1, 2 student view
        s = c.new_page(); s.goto(B + "#/lesson/2026-10-01-chem/student"); s.wait_for_selector(".stu.clean", timeout=60000); s.wait_for_timeout(2000)
        s.keyboard.press("ArrowRight"); s.wait_for_timeout(1200)
        box = s.evaluate("(() => { const i = document.querySelector('.stu-fit img'); const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), i.naturalWidth]; })()")
        print("1 student image box", box[0], "x", box[1], "(natural width", box[2], ") | 2 heading or list visible:", s.locator(".stu-top, .stu-drawer:not([hidden])").count())
        s.screenshot(path=os.path.join(OUT, "s1-student.png"))
        s.click("#stumenu"); s.wait_for_timeout(500); print("  drawer opens:", s.locator(".stu-drawer:not([hidden])").count(), "items", s.locator(".stu-item").count())
        s.screenshot(path=os.path.join(OUT, "s2-drawer.png"))
        s.locator(".stu-item").nth(4).click(); s.wait_for_timeout(600); print("  pick 5 -> drawer closed:", s.locator(".stu-drawer:not([hidden])").count() == 0)
        # plan still fine
        p.goto(B + "#/lesson/2026-10-01-chem"); p.wait_for_selector(".rail"); p.click('.rail button[data-phase="c1"]'); p.wait_for_timeout(800)
        print("plan quiz page tags:", p.locator("#phasebox .ptag").count())
        b.close()
finally:
    srv.terminate()
print("errors:", errs)
