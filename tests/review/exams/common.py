"""Shared helpers for the exam stress tests. Nothing here touches GitHub or the live server."""
import json, os, struct, sys, time, urllib.request, urllib.error, zlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fakegh import FakeGH  # noqa: also patches BrowserContext.route for api.github.com

API = "http://localhost:8787"
APP = "http://localhost:8765/"
PW = "local-test"
CHROME = "/opt/pw-browsers/chromium"
OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, info=""):
    results.append((name, bool(ok), str(info)))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(info)) if info else ""), flush=True)


def note(msg):
    print("NOTE " + msg, flush=True)


def shot(pg, name, full=False):
    p = os.path.join(OUT, name + ".png")
    pg.screenshot(path=p, full_page=full)
    return p


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__("%s %s" % (status, body))
        self.status = status
        self.body = body


def _req(method, path, body, headers, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = dict(headers)
    if raw is None:
        h["Content-Type"] = "application/json"
    h["Origin"] = "http://localhost:8765"
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            ct = r.headers.get("Content-Type", "")
            b = r.read()
            return json.loads(b) if "json" in ct else b
    except urllib.error.HTTPError as e:
        b = e.read()
        try:
            b = json.loads(b)
        except Exception:
            pass
        raise ApiError(e.code, b)


def api(method, path, body=None, raw=None, headers=None):
    h = {"X-Exam-Password": PW}
    h.update(headers or {})
    return _req(method, path, body, h, raw)


def sapi(method, path, token, body=None, raw=None, headers=None):
    h = {"X-Exam-Token": token}
    h.update(headers or {})
    return _req(method, path, body, h, raw)


def papi(method, path, token, body=None, raw=None, headers=None):
    h = {"X-Phone-Token": token}
    h.update(headers or {})
    return _req(method, path, body, h, raw)


def png(w=300, h=200, rgb=(30, 90, 200)):
    row = b"\x00" + bytes(rgb) * w
    raw = row * h
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def gif():
    # 1x1 GIF
    return b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"


def webp():
    # smallest valid lossy WebP (1x1), VP8 keyframe header
    vp8 = bytes([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00]) + b"\x00" * 14
    riff = b"VP8 " + struct.pack("<I", len(vp8)) + vp8
    return b"RIFF" + struct.pack("<I", 4 + len(riff)) + b"WEBP" + riff


QUESTIONS = [
    {"id": "q1", "label": "1(a)", "text_html": "<p>Convert <b>30°</b> to radians.</p>", "marks": 2, "type": "short"},
    {"id": "q2", "label": "1(b)", "text_html": "<p>Sketch y = sin x for 0 to 2π.</p>", "marks": 4, "type": "upload_optional"},
    {"id": "q3", "label": "2", "text_html": "<p>Explain why the arc length is rθ.</p>", "marks": 3, "type": "long"},
    {"id": "q4", "label": "3", "text_html": "<p>Show your working on paper.</p>", "marks": 5, "type": "upload_required"},
]


def make_exam(minutes=30, title="Stress test", questions=None, start=False, practice=False, extra=None):
    body = {"title": title, "subject": "maths", "base_minutes": minutes, "practice": practice, "questions": questions or QUESTIONS}
    body.update(extra or {})
    e = api("POST", "/api/t/exams", body)
    tok = api("POST", "/api/t/exams/%s/link" % e["id"])["token"]
    if start:
        api("POST", "/api/t/exams/%s/start" % e["id"])
    return e["id"], tok


def link(token):
    return APP + "exam.html#t=" + token + "&api=" + API


def plink(token):
    return APP + "exam.html#p=" + token + "&api=" + API


def review(eid):
    return api("GET", "/api/t/exams/%s/review" % eid)


def live(eid):
    return api("GET", "/api/t/exams/%s/live" % eid)


def wait_for(fn, timeout=8.0, step=0.2):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step)
    return None


def launch(p):
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    kw = {"executable_path": CHROME}
    if proxy:
        kw["proxy"] = {"server": proxy, "bypass": "localhost,127.0.0.1"}
    return p.chromium.launch(**kw)


def context(b, fake=None, teacher=False, **kw):
    """Every context routes api.github.com to the pretend GitHub, blocks service workers."""
    opts = {"viewport": {"width": 1366, "height": 768}, "service_workers": "block", "ignore_https_errors": True}
    opts.update(kw)
    ctx = b.new_context(**opts)
    fake = fake or FakeGH()
    ctx.route("https://api.github.com/**", fake.route)
    if teacher:
        ctx.add_init_script("localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);" % (json.dumps(API), json.dumps(PW)))
    ctx._fake = fake
    return ctx


class ErrLog:
    def __init__(self):
        self.errors = []
        self.console = []
        self.failed = []

    def attach(self, pg, tag=""):
        pg.on("pageerror", lambda e: self.errors.append(tag + str(e)))
        pg.on("console", lambda m: self.console.append(tag + m.type + ": " + m.text) if m.type in ("error", "warning") else None)
        pg.on("requestfailed", lambda r: self.failed.append(tag + r.url + " " + str(r.failure)))

    def summary(self):
        return {"pageerrors": self.errors, "console": [c for c in self.console if "cdnjs" not in c and "fonts.g" not in c][:30]}


def finish(name):
    ok = sum(1 for r in results if r[1])
    print("\n%s: %d/%d checks passed" % (name, ok, len(results)))
    with open(os.path.join(OUT, name + ".results.json"), "w") as f:
        json.dump(results, f, indent=1)
