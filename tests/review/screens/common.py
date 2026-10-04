"""Shared harness for the Tutor Desk QA scripts (non-Teach screens)."""
import sys, os, json, time, base64
HERE = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.path.dirname(HERE)
sys.path.insert(0, SCRATCH)
from fakegh import FakeGH  # noqa
from playwright.sync_api import sync_playwright  # noqa

B = "http://localhost:8765/"
CHROME = "/opt/pw-browsers/chromium"
MATHS = "2026-10-04-maths"; CHEM = "2026-10-04-chem"; CH3 = "2026-10-03-chem"; M1 = "2026-10-01-maths"; C1 = "2026-10-01-chem"
SESS = "students/UK-1/lessons/%s/session.json"
results = []


def check(name, ok, info=""):
    results.append((name, bool(ok), str(info)))
    print(("PASS " if ok else "FAIL ") + name + ("  [" + str(info)[:300] + "]" if info != "" else ""), flush=True)
    return ok


def launch(p):
    return p.chromium.launch(executable_path=CHROME)


def ctx(b, fake, w=1366, h=768, theme=None, dark=False, device="test", sw=False, extra_init="", token=True):
    kw = {"viewport": {"width": w, "height": h}}
    if not sw: kw["service_workers"] = "block"
    if dark: kw["color_scheme"] = "dark"
    c = b.new_context(**kw)
    init = "localStorage.setItem('tutor.device',%s);" % json.dumps(device)
    if token: init += "localStorage.setItem('tutor.token','test-token');"
    if theme: init += "localStorage.setItem('tutor.theme',%s);" % json.dumps(theme)
    c.add_init_script(init + extra_init)
    c.route("https://api.github.com/**", fake.route)
    c.errs = []
    c.console = []
    return c


def page(c, url, sel=None, timeout=30000):
    p = c.new_page()
    p.on("pageerror", lambda e: c.errs.append("PE " + str(e)[:300]))
    p.on("console", lambda m: c.console.append(m.type + ": " + m.text[:300]) if m.type in ("error", "warning") else None)
    p.goto(B + url)
    if sel: p.wait_for_selector(sel, timeout=timeout)
    return p


def sess(fake, lid=MATHS):
    b = fake.puts.get(SESS % lid)
    return json.loads(b) if b else None


def shot(p, name, full=True):
    path = os.path.join(HERE, name + ".png"); p.screenshot(path=path, full_page=full); return path


def wide(p): return p.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def saveline(p): return p.locator("#save").inner_text()


def summary():
    f = sum(1 for r in results if not r[1])
    print("\n%d checks, %d FAIL" % (len(results), f))
    for r in results:
        if not r[1]: print("  FAIL", r[0], r[2][:200])
    return results
