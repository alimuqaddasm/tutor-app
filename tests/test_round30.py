"""Round 30 (14 Oct): a growing board builds line by line for Ali too, each new line writes in, the next line shows
faintly for Ali only, and every board starts with the question alone (Ali, 14 Oct: "replace sharing my tablet and
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
INK = """(sel)=>{var cv=document.querySelector(sel);if(!cv||!cv.width)return null;var x=cv.getContext('2d'),d=x.getImageData(0,0,cv.width,cv.height).data,n=0,lo=0,y0=Math.round(cv.height*0.3);
for(var y=0;y<cv.height;y+=2)for(var i=0;i<cv.width;i+=2){var k=(y*cv.width+i)*4,v=(d[k]+d[k+1]+d[k+2])/3;if(v<120){n++;if(y>y0)lo++;}}return [n,lo];}"""
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
    check("button now reads 'Next line (1 of 6)'", "Next line (1 of 6)" in pg.locator(".tfoot [data-line]").inner_text())
    inks = []
    for k in range(1, 7):
        pg.locator(".tfoot [data-line]").click(); pg.wait_for_timeout(700)
        inks.append(stu.evaluate(INK, ".stu canvas.bcv")[0])
    check("each tap adds ink on his screen", all(inks[k] > inks[k - 1] for k in range(1, 6)) and inks[0] > s0[0], [s0[0]] + inks)
    check("his screen keeps the board item (line 6)", stu.evaluate("__t('STU.items[STU.i].id')") == "s71-g6")
    a6 = pg.evaluate(INK, ".chunk.cur canvas.bcv")
    check("Ali's board matches his after the last line", a6 and abs(a6[0] - inks[-1]) <= max(3, inks[-1] * 0.02), (a6, inks[-1]))
    check("Ali's tag reads 'Line 6 of 6'", "Line 6 of 6" in pg.inner_text(".chunk.cur .growtag"))
    check("after the last line the button offers 'Start again'", "Start again" in pg.locator(".tfoot [data-line]").inner_text())
    pg.screenshot(path=os.path.join(SHOTS, "r30-teach-1440.png")); stu.screenshot(path=os.path.join(SHOTS, "r30-student.png"))
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(SHOTS, "r30-teach-390.png"))
    # Prepare (no clock, nothing sent) steps through the board too
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.evaluate("__t('PREP=true;LINES={};drawTeach()')"); pg.wait_for_timeout(400); pg.evaluate("p=>__t('TCH.pos='+p+';drawTeach()')", pos); pg.wait_for_timeout(600)
    bl = pg.locator(".tfoot [data-line]")
    check("Prepare has the line button too", bl.count() == 1 and "Line 1" in bl.inner_text(), bl.count())
    before = stu.evaluate("__t('STU.board.step')")
    bl.click(); pg.wait_for_timeout(500)
    check("Prepare sends nothing to his screen", stu.evaluate("__t('STU.board.step')") == before)
    c.close(); b.close()
check("no page errors", not errs, errs[:3])
print("%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
