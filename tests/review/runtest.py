"""Run one of the repo's browser tests on Linux against the pretend GitHub.
   python runtest.py tests/test_teach.py
Patches: gh.exe -> a fake token; chromium.launch(channel="msedge") -> the Chromium at /opt/pw-browsers;
         every api.github.com route -> fakegh (reads from the local clone, writes recorded, never sent)."""
import os, runpy, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CHROMIUM_PATH", "/opt/pw-browsers/chromium")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
import fakegh  # noqa: patches BrowserContext.route
from playwright.sync_api import BrowserType

_run = subprocess.run
class _R:
    stdout = "fake-token\n"; stderr = ""; returncode = 0
def run(cmd, *a, **kw):
    if cmd and "gh" in os.path.basename(str(cmd[0])).lower():
        return _R()
    return _run(cmd, *a, **kw)
subprocess.run = run

_launch = BrowserType.launch
def launch(self, **kw):
    kw.pop("channel", None)
    kw.setdefault("executable_path", os.environ["CHROMIUM_PATH"])
    return _launch(self, **kw)
BrowserType.launch = launch

test = sys.argv[1]
sys.argv = [test] + sys.argv[2:]
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(test))))
t0 = time.time()
code = 0
try:
    runpy.run_path(test, run_name="__main__")
except SystemExit as e:
    code = e.code or 0
print("\n== %s finished in %.0fs, exit %s, writes recorded (never sent): %d" % (os.path.basename(test), time.time() - t0, code, len(fakegh.SHARED.puts)))
sys.exit(code if isinstance(code, int) else 1)
