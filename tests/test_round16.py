"""Round 16 (2 Oct): Flip is the default Teach layout; the week strip shows a solid dot only for a lesson that was taught.
Exit code 1 on any FAIL."""
import os, sys, types, json
HERE_T = os.path.dirname(os.path.abspath(__file__))
R = types.SimpleNamespace(); _f = os.path.join(HERE_T, "test_bugs_round10.py")
_ns = {"__file__": _f}; exec(open(_f, encoding="utf-8").read().split("\ntry:\n")[0], _ns); R.__dict__.update(_ns)
from playwright.sync_api import sync_playwright
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge")
        c = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token', %s);" % json.dumps(R.TOK))
        c.route("https://api.github.com/**", lambda r: r.abort() if r.request.method != "GET" else r.continue_())
        p = R.page(c, "#/", ".home"); p.wait_for_timeout(3000)
        thu = p.evaluate("Array.from(document.querySelectorAll('.wd')).find(w => w.querySelector('.n').textContent === '1').querySelectorAll('.dots i').length")
        solid = p.evaluate("Array.from(document.querySelectorAll('.wd')).find(w => w.querySelector('.n').textContent === '1').querySelectorAll('.dots i.done').length")
        R.check("Thu 1 Oct: one solid dot (chemistry taught), maths shown as not taught", solid == 1 and thu == 2, (solid, thu))
        p.evaluate("location.hash = '#/lesson/%s/teach'" % R.MA); p.wait_for_selector(".teach3"); p.wait_for_timeout(800)
        p.evaluate("Array.from(document.querySelectorAll('.outline .oc')).find(x => x.textContent.indexOf('Set 5 Q6') >= 0).click()"); p.wait_for_timeout(1200)
        R.check("Flip is the default layout", p.locator(".chunk.cur.flip").count() == 1 and p.locator(".vstrip").count() == 1)
        c.close(); b.close()
finally:
    R.srv.kill()
print("\n%d FAIL" % len(R.fails) if R.fails else "\nall PASS")
sys.exit(1 if R.fails or R.errs else 0)
