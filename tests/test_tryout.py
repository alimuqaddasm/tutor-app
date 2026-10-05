"""(Waits use page.wait_for_timeout: a plain sleep stops Playwright from seeing requests.)
Try-out mode saves nothing; a suggestion is the only write. Writes are intercepted and counted, never sent."""
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright
TOK = subprocess.run([r"C:/Program Files/GitHub CLI/gh.exe", "auth", "token"], capture_output=True, text=True).stdout.strip()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", HERE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2); errs = []; writes = []; B = "http://localhost:8765/"; L = "2026-10-01-chem"


def route(r):
    if r.request.method != "GET":
        writes.append(r.request.url.split("/contents/")[-1]); return r.abort()
    r.continue_()


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        c = b.new_context(viewport={"width": 1400, "height": 900}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.layout', 'classic'); localStorage.setItem('tutor.token', %s); localStorage.setItem('tutor.device','test');" % json.dumps(TOK))
        c.route("https://api.github.com/**", route)
        p = c.new_page(); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(B + "?try#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3", timeout=60000); p.wait_for_timeout(500)
        print("try bar:", p.locator(".trybar").count())
        p.click("#clkgo"); p.wait_for_timeout(400)
        for i in range(8): p.click(".tfoot .btn.next"); p.wait_for_timeout(150)
        p.evaluate("Array.from(document.querySelectorAll('.outline .oc')).find(b => b.querySelector('.ic').textContent == '?').click()"); p.wait_for_timeout(400)
        p.locator('.chunk.cur [data-v="wrong"]').click(); p.locator(".chunk.cur .addnote").click() if p.locator(".chunk.cur .addnote").count() else None; p.locator(".chunk.cur input[data-note]").fill("test note"); p.wait_for_timeout(6000)
        keys = p.evaluate("Object.keys(localStorage).filter(k => /^tutor\\.(s|review)\\./.test(k))")
        print("after clock, 8 Taught, a verdict and a note: writes", writes, "| device copies", keys, "| save label:", p.locator("#save").inner_text() if p.locator("#save").is_visible() else "(sidebar hidden in Teach)")
        p.goto(B + "?try#/revise"); p.wait_for_timeout(3000)
        if p.locator("text=Got it").count(): p.locator("text=Got it").first.click(); p.wait_for_timeout(3500)
        print("after a warm-up answer: writes", writes)
        # suggestion with point-at
        p.goto(B + "?try#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(500)
        p.click("[data-tmore]"); p.locator(".tmini [data-suggest]").click(); p.wait_for_timeout(1000)
        print("suggest where:", p.locator("#sug-w").inner_text())
        p.click("#sug-point"); p.wait_for_timeout(300); p.locator(".tfoot .btn.next").click(); p.wait_for_timeout(500)
        print("pointed at:", p.locator(".sug-t").inner_text(), "| slide did not move:", p.locator(".tmini .num").inner_text())
        p.locator('[data-sugtag="Layout"]').click(); p.fill("#sug-text", "TEST ONLY: ignore"); p.click("#sug-save"); p.wait_for_timeout(2000)
        print("writes after Save suggestion:", writes, "| status:", p.locator("#sug-st").inner_text()[:80] if p.locator("#sug-st").count() else "closed")
        p.keyboard.press("Escape"); p.wait_for_timeout(300); p.click("#trydot"); p.wait_for_timeout(200); p.locator("#tryleave").click(); p.wait_for_timeout(1500); print("left try-out, bar:", p.locator(".trybar").count(), "url:", p.url)
        # normal mode still saves
        writes.clear(); p.goto(B + "#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3"); p.wait_for_timeout(500)
        p.evaluate("Array.from(document.querySelectorAll('.outline .oc')).find(b => b.querySelector('.ic').textContent == '?').click()"); p.wait_for_timeout(400)
        p.locator('.chunk.cur [data-v="right"]').click(); p.wait_for_timeout(5500)
        print("normal mode writes:", writes)
        b.close()
finally:
    srv.terminate()
print("errors:", errs)
