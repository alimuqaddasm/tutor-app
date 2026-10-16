"""Round 28 (11 Oct night): Ali's suggestions of 11 Oct, 23:14 to 23:51.
- An exam going on: no "Still teaching?" about the lesson clock; a lesson clock never started counts from the exam's start.
- "Your taps show 20:03 to 23:49 (226 min)": a stray tap hours before the lesson no longer counts.
- Save to tutoring repo: his pictures and the results in one commit, pictures fetched a few at a time.
- Claude's marks as a table: mark scheme line, Claude's tick or cross, Claude's reason, his own tick.
- Side by side: his work in the middle, the question from the left, the mark scheme from the right, part buttons.
- Teach: the tick and cross rail clear of the top and bottom bars on a 765 px tall screen.
Needs the local exam server (see tests/README.md).  Run: python tests/runtest.py tests/test_round28.py
"""
import json, os, re, struct, sys, time, urllib.request, zlib
from playwright.sync_api import sync_playwright
import fakegh
from fakegh import FakeGH

API = os.environ.get("EXAM_API", "http://localhost:8787")
APP = os.environ.get("APP", "http://localhost:8765/")
PW = os.environ.get("EXAM_PW", "local-test")
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))


def wait_for(pg, fn, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        pg.wait_for_timeout(200)
    return None


def png(w=600, h=160, rgb=(240, 240, 255)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def sapi(method, path, token, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(API + path, data=data, method=method, headers={"X-Exam-Token": token, "Content-Type": ctype})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


fake = FakeGH()
FOLDER = "students/UK-1/exams/2026-10-11-maths-t%d/" % int(time.time())
exam = {"id": "r28", "title": "Round 28 check (test)", "subject": "maths", "date": "2026-10-11", "status": "ready",
        "questions": [{"id": "q1", "label": "Q1", "source": "Maths Genie Y2 Set 6 Q16", "marks": 4, "type": "upload_optional",
                       "text": "<h4>16.</h4><h5>(a)</h5><p>Show that the equation can be written as a quadratic in sec x.</p><p class=\"mk\">(2)</p><h5>(b)</h5><p>Hence find tan x.</p><p class=\"mk\">(2)</p>",
                       "img": [], "msImg": ["assets/q1-ms.png"],
                       "scheme": [{"part": "(a)", "code": "M1", "text": "Uses tan squared = sec squared - 1"}, {"part": "(a)", "code": "A1", "text": "Correct quadratic"},
                                  {"part": "(b)", "code": "M1", "text": "Solves for sec x"}, {"part": "(b)", "code": "A1", "text": "tan x = -sqrt 3"}]}]}
fake.extra[FOLDER + "exam.json"] = json.dumps(exam).encode()
fake.extra[FOLDER + "assets/q1-ms.png"] = png(500, 120, (255, 240, 220))
fake.extra[FOLDER + "claude-marks.json"] = json.dumps({"markedAt": "2026-10-11T21:00:00Z", "summary": "Part (b) sign slip.",
    "questions": {"q1": {"score": 3, "ticks": [1, 1, 1, 0], "comment": "Sign slip at the end", "unsure": "", "why": ["", "", "", "takes tan x positive, x is obtuse"]}}}).encode()

fake.extra[FOLDER + "parts.json"] = json.dumps({"questions": {"q1": [{"part": "(a)", "pic": 0, "box": [0, 0, 1, .5]}, {"part": "(b)", "pic": 0, "box": [0, .5, 1, 1]}]}}).encode()
TODAY = time.strftime("%Y-%m-%d")
MA = TODAY + "-maths"
sc = json.load(open(os.path.join(fake.clone, "students/UK-1/lessons/2026-10-10-maths/script.json")))
sc.update({"id": MA, "date": TODAY, "status": "ready"})
fake.extra["students/UK-1/lessons/%s/script.json" % MA] = json.dumps(sc).encode()
for k in list(fake.files):
    if k.startswith("students/UK-1/lessons/%s-" % TODAY) and not k.endswith("script.json"):
        del fake.files[k]

errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium"))
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');localStorage.setItem('tutor.examApi',%s);localStorage.setItem('tutor.examPw',%s);}catch(e){}" % (json.dumps(API), json.dumps(PW)))
    ctx.route("https://api.github.com/**", fake.route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    # ---------- the taps: a stray tap hours before the lesson does not count ----------
    pg.goto(APP + "#/lesson/" + MA + "/teach")
    wait_for(pg, lambda: pg.locator(".tfoot").count() == 1, 25)
    span = pg.evaluate("""__t("tapRun({first:'2026-10-11T15:03:00Z',last:'2026-10-11T18:49:00Z',ts:['2026-10-11T15:03:00Z','2026-10-11T18:07:00Z','2026-10-11T18:20:00Z','2026-10-11T18:49:00Z']})")""")
    check("taps: a lone tap at 20:03 is left out, the run starts at 23:07", span == {"first": "2026-10-11T18:07:00Z", "last": "2026-10-11T18:49:00Z"}, span)
    old = pg.evaluate("""__t("tapRun({first:'2026-10-11T15:03:00Z',last:'2026-10-11T18:49:00Z'})")""")
    check("  ...taps saved before this version still work", old["first"] == "2026-10-11T15:03:00Z", old)

    # ---------- an exam going on ----------
    st = time.time() * 1000 - 20 * 60000
    pg.evaluate("v => localStorage.setItem('tutor.examlive', JSON.stringify(v))", {"id": "x", "subject": "maths", "startedAt": st, "endAt": st + 45 * 60000})
    check("an exam today in this subject: the lesson clock starts from the exam start", wait_for(pg, lambda: pg.evaluate("__t(\"L.session.time.log.length\")") > 0, 8) is not None)
    log = pg.evaluate("__t(\"L.session.time.log\")")
    check("  ...back-dated to the exam start", log and log[0]["e"] == "start" and abs(pg.evaluate("t => Date.parse(t)", log[0]["t"]) - st) < 2000, log)
    check("  ...said in a toast", "exam start" in (pg.inner_text("#toast") if pg.locator("#toast").count() else pg.inner_text("body")))
    pg.evaluate("__t(\"(function(){var tp=taps();tp.last=new Date(Date.now()-40*60000).toISOString();ckJSON(tapsKey(L.id),tp);var r=ckJSON('tutor.running');r.at=tp.last;ckJSON('tutor.running',r)})()\")")
    pg.wait_for_timeout(6500)
    check("  ...no 'Still teaching?' while the exam runs", pg.locator("#ckask").count() == 0)
    pg.evaluate("localStorage.removeItem('tutor.examlive')")
    check("  ...after the exam, an idle clock is asked about again", wait_for(pg, lambda: "Still teaching?" in pg.inner_text("#ckask"), 8) is not None)
    pg.click("#ckask [data-ck='going']")

    # ---------- the rail on a short screen ----------
    pg.set_viewport_size({"width": 1440, "height": 765})
    q = pg.evaluate("__t(\"TCH.seq.findIndex(function(c){return c.t==='drill'||c.t==='question'||c.t==='board'})\")")
    if q >= 0:
        pg.evaluate("i => __t('tmove(' + i + ' - TCH.pos, \\'jump\\')')", q)
        pg.wait_for_timeout(500)
        gap = pg.evaluate("""(() => { const v = document.querySelector('.chunk.cur .vrail'); if (!v) return null; const r = v.getBoundingClientRect();
          const top = document.querySelector('.tbar').getBoundingClientRect(), foot = document.querySelector('.tfoot').getBoundingClientRect();
          return [r.top - top.bottom, foot.top - r.bottom]; })()""")
        check("Teach 1440 x 765: the rail is clear of the top bar and the bottom bar", gap and gap[0] >= 0 and gap[1] >= 0, gap)
        pg.screenshot(path=os.path.join(SHOTS, "r28-rail-1440x765.png"))

    # ---------- an exam: load, start, a picture, lock ----------
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.goto(APP + "#/exams")
    wait_for(pg, lambda: pg.locator('[data-load="%sexam.json"]' % FOLDER).count() == 1, 20)
    pg.click('[data-load="%sexam.json"]' % FOLDER)
    wait_for(pg, lambda: pg.locator("#xt-btns").count() == 1, 15)
    eid = pg.evaluate("location.hash").split("/")[2]
    pg.fill("#xt-dur", "30"); pg.click("[data-savesetup]")
    wait_for(pg, lambda: "30 min" in pg.inner_text("#xt-left"), 8)
    pg.click("[data-newlink]")
    wait_for(pg, lambda: "#t=" in pg.input_value("#xt-link"), 8)
    token = re.search(r"#t=([A-Za-z0-9_-]+)", pg.input_value("#xt-link")).group(1)
    sapi("GET", "/api/s/state", token)
    wait_for(pg, lambda: "waiting" in pg.inner_text("#xt-btns").lower(), 8)
    pg.click("[data-start]")
    wait_for(pg, lambda: re.match(r"^\d+:\d\d$", pg.inner_text("#xt-left")), 8)
    check("starting an exam: this device knows it is going on", wait_for(pg, lambda: (json.loads(pg.evaluate("localStorage.getItem('tutor.examlive')") or "{}").get("id") == eid), 8) is not None)
    for k in range(3):
        sapi("POST", "/api/s/uploads/q1", token, raw=png(300, 200, (200 + k * 10, 230, 240)), ctype="image/png")
    pg.click("[data-lock]")
    wait_for(pg, lambda: "Locked" in pg.inner_text("#xt-st"), 8)
    check("  ...locked: no longer going on", wait_for(pg, lambda: (json.loads(pg.evaluate("localStorage.getItem('tutor.examlive')") or "{}").get("doneAt")), 8) is not None)

    # ---------- the Mark page: Claude's marks as a table ----------
    pg.goto(APP + "#/exams/" + eid + "/mark")
    wait_for(pg, lambda: pg.locator("section.xt-mq").count() == 1, 15)
    check("Mark page: Claude's marks in a table", wait_for(pg, lambda: pg.locator('[data-mq="q1"] table.xt-mtbl tr.xt-mrow').count() == 4, 10) is not None)
    hd = pg.inner_text('[data-mq="q1"] table.xt-mtbl thead')
    check("  ...columns: mark scheme, Claude, Claude's reason, You", all(w in hd for w in ["Mark scheme", "Auto-checker", "Reason", "You"]), hd)
    last = pg.inner_text('[data-mq="q1"] table.xt-mtbl tr.xt-mrow >> nth=3')
    check("  ...a cross with Claude's reason", "✕" in last and "obtuse" in last, last)
    check("  ...no paragraph of ticks above it", "Auto-checker: 3 / 4" in pg.inner_text('[data-mq="q1"] .xt-cmark') and "M1, A1" not in pg.inner_text('[data-mq="q1"] .xt-cmark'))
    pg.screenshot(path=os.path.join(SHOTS, "r28-mark-1440.png"), full_page=True)

    # ---------- side by side ----------
    pg.evaluate("localStorage.removeItem('tutor.cmpSide')")
    pg.click('[data-compare="0"]')
    wait_for(pg, lambda: pg.locator(".xt-cmp3").count() == 1, 5)
    check("Side by side: his work alone at first", not pg.locator(".xt-qside .xt-sbody").is_visible() and not pg.locator(".xt-msside .xt-sbody").is_visible() and pg.locator(".xt-work img").count() == 3)
    wide = pg.evaluate("document.querySelector('.xt-work').getBoundingClientRect().width")
    check("  ...his work takes most of the width", wide > 1100, wide)
    pg.screenshot(path=os.path.join(SHOTS, "r28-side-work-1440.png"))
    pg.click("[data-cmpside='q']")
    check("  ...Question opens from the left, in the paper layout", pg.locator(".xt-qside .xt-sbody").is_visible() and pg.locator(".xt-qside .pp").count() == 1)
    pg.click("[data-cmpside='ms']")
    check("  ...Mark scheme opens from the right with the tick table", pg.locator(".xt-msside .xt-sbody").is_visible() and pg.locator(".xt-msside table.xt-mtbl").count() == 1)
    pg.screenshot(path=os.path.join(SHOTS, "r28-side-both-1440.png"))
    pg.click("[data-cmpside='q']")
    check("  ...and closes again", not pg.locator(".xt-qside .xt-sbody").is_visible())
    pg.click("[data-cmppart='b']")
    check("Part (b): both open, the part lit on each side", pg.locator(".xt-qside .xt-sbody").is_visible() and pg.locator(".xt-qside .xt-lit[data-part='b']").count() == 1 and pg.locator(".xt-msside tr.xt-lit").count() == 2,
          [pg.locator(".xt-qside .xt-lit").count(), pg.locator(".xt-msside tr.xt-lit").count()])
    pg.screenshot(path=os.path.join(SHOTS, "r28-side-part-1440.png"))
    pg.click("[data-cmppart='']")
    pg.evaluate("localStorage.setItem('tutor.cmpSide', JSON.stringify({q:false,ms:false}))")
    pg.click('[data-cmpgo="0"]'); pg.wait_for_timeout(300)
    check("parts.json: his first picture has a zone per part", pg.locator(".xt-work .xt-pzone").count() == 2)
    pg.click(".xt-work .xt-pzone[data-cmppart='a']")
    check("  ...a tap on part (a) of his work opens (a) on both sides", pg.locator(".xt-qside .xt-sbody").is_visible() and pg.locator(".xt-qside .xt-lit[data-part='a']").count() == 1 and pg.locator(".xt-msside tr.xt-lit").count() == 2)
    pg.screenshot(path=os.path.join(SHOTS, "r28-side-zone-1440.png"))
    pg.click("[data-cmppart='']")
    check("  ...Whole clears it", pg.locator(".xt-cmp .xt-lit").count() == 0)
    check("  ...before you mark, no row says Yours", pg.locator(".xt-msside tr.xt-mrow.over").count() == 0)
    # accept Claude's marks, then overrule one line
    pg.click(".xt-msside [data-accept='q1']")
    wait_for(pg, lambda: pg.input_value("[data-cscore='q1']") == "3", 6)
    pg.click(".xt-msside [data-tick='3']")
    check("your tick overrules: row marked Yours, mark 4", wait_for(pg, lambda: pg.locator(".xt-msside tr.xt-mrow.over").count() == 1 and pg.input_value("[data-cscore='q1']") == "4", 4) is not None)
    check("  ...the open panels are remembered", json.loads(pg.evaluate("localStorage.getItem('tutor.cmpSide')")) == {"q": True, "ms": True})
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(SHOTS, "r28-side-390.png"))
    pg.evaluate("document.querySelector('.xt-cmp3').scrollTop = 900"); pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(SHOTS, "r28-side-390-scrolled.png"))
    check("Side by side fits a phone", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1") and pg.evaluate("document.querySelector('.xt-cmp').scrollWidth <= innerWidth + 1"))
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.click("[data-cmpx]")
    pg.wait_for_timeout(1500)

    # ---------- save: one commit ----------
    n0 = sum(1 for m, pth in fake.log if m == "PUT")
    pg.click("[data-torepo]")
    check("Save to repo: result.json and his 3 pictures saved", wait_for(pg, lambda: FOLDER + "result.json" in fake.puts and sum(1 for k in fake.puts if k.startswith(FOLDER + "work/")) == 3, 20) is not None, pg.inner_text("#xt-repomsg"))
    check("  ...in one commit, not one per file", len(getattr(fake, "commits", [])) == 1 and sum(1 for m, pth in fake.log if m == "PUT") == n0, [getattr(fake, "commits", []), sum(1 for m, pth in fake.log if m == "PUT") - n0])
    res = json.loads(fake.puts.get(FOLDER + "result.json", b"{}"))
    check("  ...result.json has the mark and the ticks", res.get("questions", [{}])[0].get("score") == 4, res.get("questions"))
    check("  ...the page says it saved", "Saved to" in pg.inner_text("#xt-repomsg"), pg.inner_text("#xt-repomsg"))

    check("no script errors", not errs, errs)
    b.close()

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
