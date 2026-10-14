"""Round 30 (14 Oct): a growing board builds piece by piece for Ali too, each piece writes in, the next piece shows
faintly for Ali only, every board starts with the question alone, step labels sit beside the lines, and a his-turn
answer can go to him one line at a time (Ali, 14 Oct: "replace sharing my tablet and
writing with the S pen").  Run: python tests/runtest.py tests/test_round30.py   (uses the 12 Oct maths lesson)"""
import json, os, sys
from playwright.sync_api import sync_playwright
from fakegh import FakeGH

APP = os.environ.get("APP", "http://localhost:8765/")
LID = "2026-10-12-maths"
SHOTS = os.path.join(os.path.dirname(__file__), "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def check(name, ok, info=""):
    results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (" | " + str(info) if info and not ok else ""))
# ink in the canvas: share of dark pixels in the lower 70% and in the whole board
INK = """(sel)=>{var cv=document.querySelector(sel);if(!cv||!cv.width)return null;var x=cv.getContext('2d'),d=x.getImageData(0,0,cv.width,cv.height).data,n=0,lo=0,y0=Math.round(cv.height*0.3),bg=(d[0]+d[1]+d[2])/3;
for(var y=0;y<cv.height;y+=2)for(var i=0;i<cv.width;i+=2){var k=(y*cv.width+i)*4,v=(d[k]+d[k+1]+d[k+2])/3;if(Math.abs(v-bg)>60){n++;if(y>y0)lo++;}}return [n,lo];}"""
errs = []
with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)
    fake = FakeGH()
    c = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block", reduced_motion="reduce")
    c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');localStorage.setItem('tutor.flow','quick');localStorage.setItem('tutor.test','1')")
    c.route("https://api.github.com/**", fake.route)
    pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(APP + "#/lesson/" + LID + "/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    stu = c.new_page(); stu.on("pageerror", lambda e: errs.append(str(e)))
    stu.goto(APP + "#/lesson/" + LID + "/student"); stu.wait_for_timeout(2500)
    pos = pg.evaluate("__t(\"TCH.seq.findIndex(function(c){return c.lines&&c.lines.length===6})\")")
    pg.evaluate("p=>__t('TCH.pos='+p+';drawTeach()')", pos)
    pg.wait_for_function("()=>{var c=document.querySelector('.chunk.cur canvas.bcv');return c&&c.width>0}", timeout=20000)
    check("Ali's board is a canvas, not the full picture", pg.locator(".chunk.cur .qbody img").count() == 0)
    tags = pg.inner_text(".chunk.cur .growtag")
    check("tags: question only, faint next line, not on his screen yet", "Question only" in tags and "Faint" in tags and "Not on his screen yet" in tags, tags)
    i0 = pg.evaluate(INK, ".chunk.cur canvas.bcv")
    btn = pg.locator(".tfoot [data-line]")
    check("first button reads 'Show him the question'", btn.inner_text().strip() == "Show him the question", btn.inner_text())
    pg.wait_for_function("()=>__t(\"studentSeen['%s']\")" % LID, timeout=10000)
    btn.click(); pg.wait_for_timeout(800)
    stu.wait_for_function("()=>{var c=document.querySelector('.stu canvas.bcv');return c&&c.width>0}", timeout=20000)
    s0 = stu.evaluate(INK, ".stu canvas.bcv")
    check("his screen: the question alone (no ink lower down)", s0 and s0[1] == 0, s0)
    check("his screen: the heading is there", s0 and s0[0] > 0, s0)
    check("Ali sees a little more than him (the faint next line)", i0 and s0 and i0[0] >= s0[0], (i0, s0))
    bt = pg.locator(".tfoot [data-line]").inner_text()
    N = int(bt.split(" of ")[1].rstrip(")")) if " of " in bt else 0
    check("button now reads 'Next (1 of N)', more steps than the 6 pictures (lines come in pieces)", bt.startswith("Next (1 of") and N > 6, bt)
    inks, ids = [], []
    for k in range(N):
        pg.locator(".tfoot [data-line]").click(); pg.wait_for_timeout(450)
        inks.append(stu.evaluate(INK, ".stu canvas.bcv")[0]); ids.append(stu.evaluate("__t('STU.items[STU.i].id')"))
    check("each tap adds ink on his screen", all(inks[k] >= inks[k - 1] for k in range(1, N)) and inks[-1] > inks[0] > s0[0], [s0[0]] + inks)
    seen = [i for k, i in enumerate(ids) if k == 0 or ids[k - 1] != i]
    check("his screen moves through the six clicks in order", seen == ["s71-g%d" % k for k in range(1, 7)], seen)
    why = pg.inner_text(".chunk.cur .bwhy")
    check("step labels sit beside the lines", "sin of a sum" in why and "tan of a difference" in why, why)
    check("his screen keeps the board item (line 6)", stu.evaluate("__t('STU.items[STU.i].id')") == "s71-g6")
    a6 = pg.evaluate(INK, ".chunk.cur canvas.bcv")
    check("Ali's board matches his after the last line", a6 and abs(a6[0] - inks[-1]) <= max(3, inks[-1] * 0.02), (a6, inks[-1]))
    check("Ali's tag reads 'Step N of N'", ("Step %d of %d" % (N, N)) in pg.inner_text(".chunk.cur .growtag"))
    check("after the last line the button offers 'Start again'", "Start again" in pg.locator(".tfoot [data-line]").inner_text())
    pg.screenshot(path=os.path.join(SHOTS, "r30-teach-1440.png")); stu.screenshot(path=os.path.join(SHOTS, "r30-student.png"))
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(SHOTS, "r30-teach-390.png"))
    # Prepare (no clock, nothing sent) steps through the board too
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.evaluate("__t('PREP=true;LINES={};drawTeach()')"); pg.wait_for_timeout(400); pg.evaluate("p=>__t('TCH.pos='+p+';drawTeach()')", pos); pg.wait_for_timeout(600)
    bl = pg.locator(".tfoot [data-line]")
    check("Prepare has the step button too", bl.count() == 1 and "Start the board" in bl.inner_text(), bl.count())
    before = stu.evaluate("__t('STU.board.step')")
    bl.click(); pg.wait_for_timeout(500)
    check("Prepare sends nothing to his screen", stu.evaluate("__t('STU.board.step')") == before)
    # his turn: the worked answer goes to him one line at a time (14 Oct draft, 7.2 board 2, question 2a)
    pg.evaluate("__t('PREP=false')")
    pg.goto(APP + "#/lesson/2026-10-14-maths/teach"); pg.wait_for_selector(".chunk.cur", timeout=30000); pg.wait_for_timeout(800)
    stu.goto(APP + "#/lesson/2026-10-14-maths/student"); stu.wait_for_timeout(2500)
    hk = pg.evaluate("""__t("(function(){var k=null;TCH.seq.forEach(function(c,i){(c.t==='board'?c.items:[c]).forEach(function(it){if(!k&&it.t==='drill'&&it.bd)k=[i,it.key];});});return k})()")""")
    check("a his-turn drill carries a hint board", bool(hk), hk)
    if hk:
        pg.evaluate("a=>__t('TCH.pos='+a[0]+';BOARD.open=\"'+a[1]+'\";drawTeach()')", hk); pg.wait_for_timeout(800)
        hb = pg.locator('[data-hint="%s"]' % hk[1])
        check("the open question offers 'Give him a hint: line 1'", hb.count() == 1 and "line 1" in hb.inner_text(), hb.count())
        pg.wait_for_function("()=>__t(\"studentSeen['2026-10-14-maths']\")", timeout=10000)
        # a Student view behind other windows checks in rarely: Teach still sends (Ali, 14 Oct)
        pg.evaluate("__t(\"studentSeen['2026-10-14-maths']=Date.now()-60000\")")
        hb.click(); pg.wait_for_timeout(1500)
        stu.wait_for_function("()=>{var c=document.querySelector('.stu-hint canvas.bcv');return c&&c.width>0}", timeout=20000)
        h1 = stu.evaluate(INK, ".stu-hint canvas.bcv")
        pg.locator('[data-hint="%s"]' % hk[1]).click(); pg.wait_for_timeout(1500)
        h2 = stu.evaluate(INK, ".stu-hint canvas.bcv")
        check("his screen follows even when it has not checked in for a minute", stu.evaluate("__t('STU.board&&STU.board.step')") == 2)
        check("his screen gets the answer one line at a time", h1 and h2 and 0 < h1[0] < h2[0], (h1, h2))
        pg.screenshot(path=os.path.join(SHOTS, "r30-hint-teach.png")); stu.screenshot(path=os.path.join(SHOTS, "r30-hint-student.png"))
    c.close(); b.close()
check("no page errors", not errs, errs[:3])
print("%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
