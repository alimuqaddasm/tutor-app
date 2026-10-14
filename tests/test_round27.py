"""Round 27 (11 Oct): Ali's suggestions of 11 Oct afternoon.
- Titles in Title Case, a trailing qualifier in brackets: "Practice: Reciprocal Graphs (left over)".
- Prepare: "Open" shows the Teach screens with nothing to record (no clock, ticks, verdicts, Show him).
- The clock: taps are kept; clock off and teaching: chime, edge flash, then "Lesson started? Start from <first tap>";
  Pause is a 5 minute break with a reminder; chemistry ending counts down to maths; idle clock asks "Still teaching?";
  After the lesson offers the taps as the times.
- Warm-up: shuffled each day, Shuffle button.
- Student view: 1, 2 or 3 questions together.
- Add from store: sections from the chapter store added after the current part in Teach.
Run: python tests/runtest.py tests/test_round27.py  (no exam server needed)
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
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


def shot(pg, name, full=False):
    pg.screenshot(path=os.path.join(SHOTS, "r27-" + name + ".png"), full_page=full)


fake = FakeGH()
TODAY = time.strftime("%Y-%m-%d")
# today's chemistry and maths, never started (copies of real scripts)
chem = json.load(open(os.path.join(fake.clone, "students/UK-1/lessons/2026-10-10-chem/script.json")))
chem.update({"id": TODAY + "-chem", "date": TODAY, "status": "ready"})
maths = json.load(open(os.path.join(fake.clone, "students/UK-1/lessons/2026-10-10-maths/script.json")))
maths.update({"id": TODAY + "-maths", "date": TODAY, "status": "ready"})
fake.extra["students/UK-1/lessons/%s-chem/script.json" % TODAY] = json.dumps(chem).encode()
fake.extra["students/UK-1/lessons/%s-maths/script.json" % TODAY] = json.dumps(maths).encode()
CH, MA = TODAY + "-chem", TODAY + "-maths"
# the real 11 Oct maths script (click-by-click boards) under its own id, as today's copy above may share its date
g = json.load(open(os.path.join(fake.clone, "students/UK-1/lessons/2026-10-11-maths/script.json"))); g.update({"id": "2099-01-03-maths", "date": "2099-01-03"})
fake.extra["students/UK-1/lessons/2099-01-03-maths/script.json"] = json.dumps(g).encode()
# a small maths store with two sections
STORE = "students/UK-1/store/maths-test/store.json"
fake.extra[STORE] = json.dumps({"subject": "maths", "topic": {"code": "Y2 · 7", "name": "Trigonometry and modelling"}, "title": "Chapter 7", "parts": [
    {"id": "s72", "code": "7.2", "name": "New: double angle formulae", "minutes": 15, "blocks": [
        {"type": "steps", "items": [{"kind": "say", "html": "Double angle: put \\(B = A\\) in the addition formulae."}]},
        {"type": "drill", "title": "Video question 1 of 5 (1:10)", "items": [["Show that \\(\\sin 2A = 2\\sin A\\cos A\\)", "Put B = A."]]}]},
    {"id": "s73", "code": "7.3", "name": "New: solving trigonometric equations", "minutes": 15, "blocks": [
        {"type": "drill", "title": "Video question 1 of 4", "items": [["Solve \\(\\sin 2x = \\cos x\\)", "x = 30, 90, 150, 270"]]}]}]}).encode()
for k in list(fake.files):   # today's real lessons may have a session already: start from none
    if k.startswith("students/UK-1/lessons/%s-" % TODAY) and not k.endswith("script.json"):
        del fake.files[k]

errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium"))
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    ctx.add_init_script("try{localStorage.setItem('tutor.token','test-token');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.test','1');}catch(e){}")
    ctx.route("https://api.github.com/**", fake.route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())

    # ---------- titles ----------
    tc = pg.goto(APP) and wait_for(pg, lambda: pg.evaluate("typeof titleCase") == "function", 20)
    cases = {"reciprocal graphs left over": "Reciprocal Graphs (left over)", "All organic so far": "All Organic (so far)",
             "Keep it fresh: earlier chapters": "Keep it Fresh: Earlier Chapters", "Trigonometry and modelling": "Trigonometry and Modelling",
             "Simplifying a cos x + b sin x": "Simplifying a cos x + b sin x", "pH and NaBH4 reduction": "pH and NaBH4 Reduction"}
    got = {k: pg.evaluate("t => titleCase(t)", k) for k in cases}
    check("titleCase: Ali's examples and maths stay right", all(got[k] == v for k, v in cases.items()), got)

    # ---------- Prepare ----------
    pg.goto(APP + "#/lesson/" + MA)
    wait_for(pg, lambda: pg.locator(".tfoot").count() == 1, 25)
    check("Open shows the Teach screens (Prepare)", pg.locator(".teach3").count() == 1 and pg.locator("body.prep").count() == 1)
    check("  ...a Prepare tag and a Teach button, no clock", "Prepare" in pg.inner_text(".tbar") and pg.locator(".tmini > a[href$='/teach']").count() == 1 and pg.locator("#clkgo").count() == 0)
    lt = pg.inner_text(".runway .ttl")
    check("  ...the lesson title in Title Case", lt == pg.evaluate("t => titleCase(t)", lt) and lt[:1].isupper(), lt)
    for i in range(6):
        pg.click('.tfoot [data-tgo="+1"]')
    check("  ...moving never asks about the clock", pg.locator(".clocknag").count() == 0 and pg.locator("#ckask").count() == 0)
    # a question screen: no verdict buttons, the mark scheme still turns
    q = pg.evaluate("__t(\"TCH.seq.findIndex(function(c){return c.t==='drill'||c.t==='question'||c.t==='board'})\")")
    if q >= 0:
        pg.evaluate("i => __t('tmove(' + i + ' - TCH.pos, \\'jump\\')')", q)
        pg.wait_for_timeout(300)
        vis = pg.evaluate("Array.from(document.querySelectorAll('.chunk.cur [data-v], .tfoot [data-v]')).filter(function(b){return b.offsetParent}).length")
        check("  ...a question has no verdict buttons", vis == 0, vis)
    check("  ...no Taught or Skip buttons", pg.locator(".tfoot [data-tgo='skip']").count() == 0)
    sess = fake.puts.get("students/UK-1/lessons/%s/session.json" % MA)
    check("  ...nothing saved", sess is None)
    shot(pg, "prepare-1440")
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    shot(pg, "prepare-390")
    check("  ...fits a phone", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.click("[data-tmore]")
    check("  ...the menu has the lesson pages", pg.locator(".tmenu [data-phase='_after']").count() == 1)
    pg.click(".tmenu [data-phase='_time']")
    check("  ...Times opens", wait_for(pg, lambda: "Part Times" in pg.inner_text("h1.t-title")) is not None)
    pg.click(".crumb button[data-phase]")
    check("  ...and the crumb goes back to Prepare", wait_for(pg, lambda: pg.locator("body.prep .teach3").count() == 1) is not None)

    # ---------- the clock: forgot to start ----------
    pg.goto(APP + "#/lesson/" + CH + "/teach")
    wait_for(pg, lambda: pg.locator(".tfoot").count() == 1, 25)
    check("Teach: no Prepare class", pg.locator("body.prep").count() == 0)
    pg.click('.tfoot [data-tgo="+1"]')
    check("  ...first move with the clock off: the edge flashes", wait_for(pg, lambda: pg.locator("body.edgeflash").count() == 1, 3) is not None)
    check("  ...no full screen yet", pg.locator("#ckask").count() == 0)
    first = pg.evaluate("__t(\"taps().first\")")
    pg.click('.tfoot [data-tgo="+1"]'); pg.click('.tfoot [data-tgo="+1"]')
    check("  ...3 screens on: 'Lesson started?' full screen", wait_for(pg, lambda: "Lesson started?" in pg.inner_text("#ckask"), 3) is not None)
    shot(pg, "clock-start-1440")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(200); shot(pg, "clock-start-390")
    check("  ...the question fits a phone", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.click("#ckask [data-ck='startfrom']")
    log = pg.evaluate("__t(\"L.session.time.log\")")
    check("  ...Start from the first tap back-dates the start", log and log[0]["e"] == "start" and log[0]["t"] == first, [log, first])
    check("  ...the clock runs", pg.locator(".clockpill.live").count() == 1)
    check("  ...this device knows chemistry runs", pg.evaluate("__t(\"ckJSON('tutor.running').id\")") == CH)

    # ---------- a break ----------
    pg.click("#clkgo")
    check("Pause: a break bar with Resume", wait_for(pg, lambda: "On a break" in pg.inner_text(".clocknag.brk"), 3) is not None)
    pg.evaluate("__t(\"var b = ckJSON('tutor.break'); b.until = Date.now() - 1000; ckJSON('tutor.break', b); clockWatch()\")")
    check("  ...when the 5 minutes are up: 'Break over?'", wait_for(pg, lambda: "Break over?" in pg.inner_text("#ckask"), 3) is not None)
    shot(pg, "clock-break-1440")
    pg.click("#ckask [data-ck='more']")
    check("  ...5 more min closes it and moves the reminder", pg.locator("#ckask").count() == 0 and pg.evaluate("__t(\"ckJSON('tutor.break').until > Date.now() + 200000\")"))
    pg.click('.tfoot [data-tgo="+1"]'); pg.click('.tfoot [data-tgo="+1"]'); pg.click('.tfoot [data-tgo="+1"]')
    check("  ...teaching again while paused: 'Back from the break?'", wait_for(pg, lambda: "Back from the break?" in pg.inner_text("#ckask"), 3) is not None)
    pg.click("#ckask [data-ck='startfrom']")
    check("  ...Resume from the first tap after the pause", pg.evaluate("__t(\"L.session.time.log.slice(-1)[0].e\")") == "resume" and pg.locator(".clockpill.live").count() == 1)

    # ---------- idle: forgot to stop ----------
    pg.evaluate("__t(\"var t = taps(); t.last = new Date(Date.now() - 11*60000).toISOString(); ckJSON(tapsKey(L.id), t); var r = ckJSON('tutor.running'); r.at = t.last; ckJSON('tutor.running', r); clockWatch()\")")
    check("No taps for 10 min: 'Still teaching?'", wait_for(pg, lambda: "Still teaching?" in pg.inner_text("#ckask"), 3) is not None)
    shot(pg, "clock-idle-1440")
    pg.click("#ckask [data-ck^='endat:']")
    lg = pg.evaluate("__t(\"L.session.time.log\")")
    check("  ...End at the last tap ends the lesson then", lg[-1]["e"] == "end" and pg.locator(".clockpill.live").count() == 0, lg[-3:])
    nx = pg.evaluate("__t(\"ckJSON('tutor.next')\")")
    check("  ...chemistry over: maths is due 15 min after", nx and nx["id"] == MA, nx)
    check("  ...a countdown shows at the bottom", wait_for(pg, lambda: "Maths at" in pg.inner_text("#nextbar"), 7) is not None)
    shot(pg, "clock-nextbar-1440")
    pg.evaluate("__t(\"var n = ckJSON('tutor.next'); n.at = Date.now() - 1000; ckJSON('tutor.next', n); clockWatch()\")")
    check("  ...at zero: 'Maths time'", wait_for(pg, lambda: "Maths time" in pg.inner_text("#ckask"), 3) is not None)
    shot(pg, "clock-next-1440")
    pg.click("#ckask [data-ck='opennext']")
    check("  ...Open maths and start: maths Teach with the clock running", wait_for(pg, lambda: pg.evaluate("__t(\"L && L.id\")") == MA and pg.locator(".clockpill.live").count() == 1, 20) is not None)
    check("  ...the countdown is gone", pg.evaluate("__t(\"ckJSON('tutor.next')\")") is None)

    # ---------- another lesson's clock still on ----------
    pg.evaluate("s => __t(s)", "var k = localKey('%s'), o = ckJSON(k); o.session.time.log.push({t: new Date().toISOString(), e: 'resume', d: 'test'}); o.session.status = 'in-progress'; ckJSON(k, o); ckJSON('tutor.running', {id: '%s', at: new Date(Date.now()-3600000).toISOString()})" % (CH, CH))
    pg.goto(APP + "#/lesson/" + MA + "/teach"); pg.reload()
    check("Opening maths with chemistry's clock on: it asks", wait_for(pg, lambda: "Chemistry clock still on" in pg.inner_text("#ckask"), 20) is not None)
    pg.click("#ckask [data-ck='keep']")

    # ---------- After the lesson: the taps as the times ----------
    pg.evaluate("__t(\"ckJSON(tapsKey('%s'), {first: new Date(Date.now()-50*60000).toISOString(), last: new Date(Date.now()-5*60000).toISOString(), n: 40})\")" % MA)
    pg.evaluate("__t(\"L.session.time.log = []; L.session.time.edit = {}; finalizeTime(L.session); L.phase = '_after'; location.hash = '#/lesson/%s'\")" % MA)
    check("After the lesson offers the taps as the times", wait_for(pg, lambda: "Your taps show" in pg.inner_text(".tapfix"), 10) is not None)
    shot(pg, "after-taps-1440", True)
    pg.click("[data-usetaps]")
    check("  ...one tap sets the times", wait_for(pg, lambda: pg.evaluate("__t(\"Math.round(L.session.time.minutes)\")") == 45, 5) is not None, pg.evaluate("__t(\"L.session.time\")"))

    # ---------- Settings: the chime switch ----------
    pg.goto(APP + "#/settings")
    wait_for(pg, lambda: pg.locator("#s-chime").count() == 1, 10)
    pg.uncheck("#s-chime")
    check("Settings: the chime can be turned off", pg.evaluate("localStorage.getItem('tutor.chime')") == "off")
    pg.check("#s-chime")

    # ---------- the store ----------
    pg.goto(APP + "#/lesson/" + MA + "/teach")
    wait_for(pg, lambda: pg.locator(".tfoot").count() == 1, 25)
    pg.wait_for_timeout(600)
    for _ in range(3):   # the clock may ask something first (the earlier checks leave lessons running): the quiet answer
        if pg.locator("#ckask").count(): pg.locator("#ckask [data-ck]").last.click(); pg.wait_for_timeout(300)
    pg.evaluate("s => __t(s)", "CK.quietUntil = Date.now() + 3600000; CK.keep = (ckJSON('tutor.running') || {}).id; ckJSON('tutor.next', null)")
    pg.click("[data-tmore]"); pg.click(".tmenu [data-store]")
    check("Teach: Add from the Store lists the sections", wait_for(pg, lambda: pg.locator(".storerow [data-stadd^='students/UK-1/store/maths-test/']").count() == 2, 10) is not None, pg.inner_text("#stobox") if pg.locator("#stobox").count() else "no panel")
    check("  ...the real chapter 7 store is there too, 7 sections or more (leftovers join it)", pg.locator(".storerow [data-stadd^='students/UK-1/store/maths-y2-7/']").count() >= 7 or "maths-y2-7" not in str(fake.files.keys()))
    shot(pg, "store-1440")
    pg.click(".storerow [data-stadd='students/UK-1/store/maths-test/store.json#s72']")
    check("  ...adding jumps to the new section", wait_for(pg, lambda: "Double Angle Formulae" in pg.inner_text(".tbar"), 5) is not None, pg.inner_text(".tbar") if pg.locator(".tbar").count() else "")
    check("  ...it is recorded in the lesson", pg.evaluate("__t('L.session.added.map(function(a){return a.part}).join()')") == "s72")
    check("  ...it shows in the outline", "Double Angle Formulae" in pg.inner_text(".runway"))
    pg.click("[data-tmore]"); pg.click(".tmenu [data-store]")
    wait_for(pg, lambda: pg.locator(".storerow.on").count() == 1, 10)
    check("  ...the store marks it Added", "Added" in pg.inner_text(".storerow.on"))
    pg.click("#stox")
    pg.evaluate("__t('flush()')"); pg.wait_for_timeout(1500)
    sess = json.loads(fake.puts.get("students/UK-1/lessons/%s/session.json" % MA, b"{}") or b"{}")
    check("  ...saved to session.json as added", any(a.get("part") == "s72" for a in sess.get("added", [])), sess.get("added"))
    sv = ctx.new_page(); sv.on("pageerror", lambda e: errs.append("student: " + str(e)))
    sv.goto(APP + "#/lesson/" + MA + "/student")
    wait_for(sv, lambda: sv.locator(".stu").count() == 1, 25)
    check("  ...Student view has the added question", sv.evaluate("__t('STU.items.some(function(q){return /sin 2A/.test(q.text||\"\")})')"))

    # ---------- Student view: 2 or 3 together ----------
    sv.click("[data-stun='2']")
    check("Student view: 2 together shows two questions", wait_for(sv, lambda: sv.locator(".stu-many .stu-cell").count() == 2, 5) is not None)
    shot(sv, "student-2-1440")
    sv.click("[data-stun='3']")
    n3 = sv.locator(".stu-many .stu-cell").count()
    check("  ...3 together shows up to three", n3 in (2, 3), n3)
    i0 = sv.evaluate("__t('STU.i')"); sv.keyboard.press("ArrowRight")
    check("  ...the arrow moves past the whole group", sv.evaluate("__t('STU.i')") > i0 + n3 - 1, [i0, sv.evaluate("__t('STU.i')")])
    sv.set_viewport_size({"width": 390, "height": 844}); sv.wait_for_timeout(200); shot(sv, "student-3-390")
    check("  ...fits a phone", sv.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    sv.click("[data-stun='1']")
    check("  ...1 is back to one at a time", sv.locator(".stu-many").count() == 0)
    sv.close()

    # ---------- growing boards ----------
    pg.goto(APP + "#/lesson/2099-01-03-maths")
    wait_for(pg, lambda: pg.evaluate("__t('L && TCH.id')") == "2099-01-03-maths|prep" and pg.locator(".tfoot").count() == 1, 25)
    j = pg.evaluate("__t('TCH.seq.findIndex(function(c){return c.full})')")
    check("Growing board: found in the 11 Oct script", j >= 0, pg.evaluate("s => __t(s)", "TCH.id + ' ' + flowQuick() + ' ' + TCH.seq.filter(function(c){return c.t==='question'}).map(function(c){return c.b.label}).slice(0,6).join('|')"))
    if j >= 0:
        pg.evaluate("__t('tmove(%d - TCH.pos, \"jump\")')" % j)
        wait_for(pg, lambda: pg.locator(".growtag").count() == 1, 5)
        src = pg.evaluate("__t('TCH.seq[TCH.pos].full[0]')")
        check("  ...Ali's board starts with the question alone (round 30)", (src.endswith("f6.png") or src.endswith("g5.png")) and "Question only" in pg.inner_text(".growtag"), src)
        shot(pg, "growboard-1440")

    # ---------- warm-up shuffle ----------
    pg.goto(APP + "#/revise")
    ok = wait_for(pg, lambda: pg.locator("[data-rev='shuffle']").count() == 1 or "Nothing due" in pg.inner_text("#revbox"), 20)
    if pg.locator("[data-rev='shuffle']").count():
        before = pg.evaluate("__t('dueList(revState.subj).map(function(m){return m.key}).join()')")
        pg.click("[data-rev='shuffle']")
        after = pg.evaluate("__t('dueList(revState.subj).map(function(m){return m.key}).join()')")
        check("Warm-up: Shuffle brings up a different first card", before.split(",")[0] != after.split(",")[0] or before.count(",") < 1, [before, after])
        check("  ...same cards, new order", sorted(before.split(",")) == sorted(after.split(",")))
        shot(pg, "warmup-1440")
    else:
        check("Warm-up: page loads", ok is not None)

    b.close()

print("\nerrors:", errs[:5])
print("%d of %d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) and not errs else 1)
