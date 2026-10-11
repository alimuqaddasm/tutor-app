import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
TOK = subprocess.run([r"C:/Program Files/GitHub CLI/gh.exe", "auth", "token"], capture_output=True, text=True).stdout.strip()
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", r"Z:/Shared Neurons/tutor-app"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2); errs = []; B = "http://localhost:8765/"; O = "v4shots/"; L = "2026-10-01-chem"
FIG = "\u25a7"


def ctx_(b, w, h):
    c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
    c.add_init_script("localStorage.setItem('tutor.token', %s); localStorage.setItem('tutor.device','test');" % json.dumps(TOK))
    c.route("https://api.github.com/**", lambda r: r.abort() if r.request.method != "GET" else r.continue_())
    return c


def watch(p):
    p.on("pageerror", lambda e: errs.append("PE " + str(e)))
    p.on("console", lambda m: m.type == "error" and "ERR_FAILED" not in m.text and "429" not in m.text and errs.append(m.text[:200]))


def pos(p): return "/".join(__import__("re").findall(r"\d+", p.locator(".tmini .num").inner_text()))   # "Step 21 of 144" reads as "21/144"
def ticks(p): return p.evaluate("document.querySelectorAll('.outline .oc.done, .outline .om.done').length")
def click_icon(p, ic): p.evaluate("ic => Array.from(document.querySelectorAll('.outline .oc')).find(b => b.querySelector('.ic').textContent == ic).click()", ic)


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge"); c = ctx_(b, 1400, 900); p = c.new_page(); watch(p)
        # 1. Prepare (11 Oct, replaced the Plan page): the Teach screens, nothing to record
        p.goto(B); p.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('tutor.tpos')==0).forEach(k=>localStorage.removeItem(k))")
        p.goto(B + "#/lesson/" + L); p.wait_for_selector(".teach3, .crumb button[data-phase]", timeout=60000)
        if p.locator(".teach3").count() == 0: p.click(".crumb button[data-phase]")   # a finished lesson opens on After the lesson; the crumb goes to its screens
        p.wait_for_selector(".teach3", timeout=60000); time.sleep(1)
        print("1 Prepare:", p.evaluate("document.body.classList.contains('prep')"), "| clock buttons:", p.locator("#clkgo").count(), "| Show him buttons:", p.locator(".tfoot [data-show]").count())
        p.screenshot(path=O + "1-prepare.png")
        # 2. going through it before the lesson: Prepare, so nothing is ticked
        print("2 preview banner:", p.locator(".preview").count(), "| ticks before:", ticks(p))
        for i in range(6): p.keyboard.press("ArrowRight"); time.sleep(.15)
        print("  after 6 Next in preview, ticks:", ticks(p), "| at", pos(p))
        p.locator(".outline .oc").filter(has_text="Choose the quiz").first.click(); time.sleep(.4)
        chips = p.locator(".chunk.cur .chip"); print("  quiz picker chips:", [chips.nth(i).inner_text().replace("\n", " ") for i in range(chips.count())], "| total", pos(p))
        p.locator(".chunk.cur .chip").filter(has_text="All").first.click(); time.sleep(.4); print("  after All:", pos(p))
        p.locator(".chunk.cur .chip").first.click(); time.sleep(.4); print("  back to first set:", pos(p)); p.screenshot(path=O + "2-quizpick.png")
        p.keyboard.press("ArrowRight"); time.sleep(.3); print("  quiz chunk:", p.locator(".chunk.cur .tlabel").first.inner_text(), "| set line:", p.locator(".qset").inner_text())
        # 3. one figure per chunk, reachable from the outline
        print("3 figure chunks in outline:", p.evaluate("ic => Array.from(document.querySelectorAll('.outline .oc .ic')).filter(x => x.textContent == ic).length", FIG))
        click_icon(p, FIG); time.sleep(1.2)
        print("  figure chunk imgs:", p.locator(".chunk.cur .tfig img").count(), "| current top px:", round(p.evaluate("document.querySelector('.chunk.cur').getBoundingClientRect().top")))
        p.screenshot(path=O + "3-figure.png")
        print("4 'End of' chunks:", p.evaluate("Array.from(document.querySelectorAll('.outline .tx')).filter(x => x.textContent.startsWith('End of')).length"))
        # 5. live (Teach): start the clock, Taught ticks, Skip does not
        p.goto(B + "#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3", timeout=60000); time.sleep(.5)
        p.evaluate("Array.from(document.querySelectorAll('.outline .om')).find(b => b.textContent.indexOf('3b') == 0).click()"); time.sleep(.4); p.keyboard.press("ArrowRight"); time.sleep(.3)
        p.click("#clkgo"); time.sleep(.6); print("5 preview banner after start:", p.locator(".preview").count(), "| buttons:", p.locator(".tfoot .btn").all_inner_texts())
        t0 = ticks(p); p.click(".tfoot .btn.next"); time.sleep(.3); t1 = ticks(p); p.click(".tfoot .btn.skip"); time.sleep(.3); t2 = ticks(p)
        print("  ticks: start", t0, "after Taught", t1, "after Skip", t2)
        bad = 0
        for i in range(25):
            p.keyboard.press("ArrowRight"); time.sleep(.12)
            top = p.evaluate("document.querySelector('.chunk.cur').getBoundingClientRect().top")
            if top > 500 or top < 0: bad += 1
        print("6 steps with the current chunk off screen:", bad); p.screenshot(path=O + "5-live.png")
        # 7. student view
        s = c.new_page(); watch(s); s.goto(B + "#/lesson/" + L + "/student"); s.wait_for_selector(".stu", timeout=60000); time.sleep(2)
        s.click("#stumenu"); time.sleep(.4); print("7 student exam items:", s.locator(".stu-item").count(), "| 'Mark scheme' visible:", s.locator("text=Mark scheme").count()); s.screenshot(path=O + "7-student.png")
        s.locator(".stu-item").nth(2).click(); time.sleep(1); print("  click item 3 ->", s.locator(".stu-view").get_attribute("data-pos"))
        s.click("#stumenu"); time.sleep(.3); s.click('[data-stab="quick"]'); time.sleep(.5); print("  quick items:", s.locator(".stu-item").count(), "|", s.locator(".stu-q").inner_text()[:60]); s.screenshot(path=O + "7b-student-quick.png")
        time.sleep(4.5)
        click_icon(p, "Q"); time.sleep(.6)
        p.click(".tfoot [data-show]"); time.sleep(1)
        print("8 Show him went to the student tab:", p.locator(".showov").count() == 0, "| student tab:", s.locator(".stu-view").get_attribute("data-pos"))
        c.close()
        # 9. phone outline drawer
        c = ctx_(b, 390, 844); p = c.new_page(); watch(p); p.goto(B + "#/lesson/" + L + "/teach"); p.wait_for_selector(".teach3", timeout=60000); time.sleep(1)
        p.click("#toc"); time.sleep(.4); print("9 phone outline:", p.evaluate("getComputedStyle(document.querySelector('.runway')).display")); p.screenshot(path=O + "9-phone-outline.png")
        p.locator(".opart").nth(2).locator("summary").click(); time.sleep(.2); p.locator(".opart").nth(2).locator(".oc").nth(3).click(); time.sleep(.5)
        print("  after jump, drawer open:", p.evaluate("document.body.classList.contains('toc-open')"), pos(p), "| scrollWidth", p.evaluate("document.documentElement.scrollWidth"))
        p.screenshot(path=O + "9b-phone-teach.png")
        p.goto(B + "#/lesson/2026-09-30-maths"); p.wait_for_selector(".teach3, .crumb button[data-phase]", timeout=60000)
        if p.locator(".teach3").count() == 0: p.click(".crumb button[data-phase]")
        p.wait_for_selector(".teach3", timeout=60000); time.sleep(1)
        p.click("#toc"); time.sleep(.4); print("10 30-Sep maths in Prepare, outline:", p.locator(".outline").inner_text().replace("\n", " | ")[:220])
        b.close()
finally:
    srv.terminate()
print("errors:", errs)
