"""v37 (6 Oct): lesson videos stored in the data repo (Manim explainers, {"type":"video","src":"videos/manim/x.mp4"})
   play in Plan and Teach and have their own Video tab in the Student view; and a question in parts now fills the
   Student view (it had shrunk to a 48px column because the paper text measures itself from its box).
   Pretend GitHub (tests/fakegh.py) over a clone of the tutoring repo. Headless Chromium has no H.264, so the test
   serves a VP9 copy under the same .mp4 name (made with ffmpeg); Chrome, Edge and Safari play the real MP4.

    python tests/test_video_v37.py
"""
import os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fakegh import FakeGH, REPO
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://localhost:8765/")
res = []


def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else " | " + str(info)))


def vp9(path):
    out = os.path.join(tempfile.mkdtemp(), "v.webm")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", "20", "-i", path, "-c:v", "libvpx-vp9", "-b:v", "200k",
                    "-deadline", "realtime", "-cpu-used", "8", "-an", out], check=True)
    return open(out, "rb").read()


fake = FakeGH()
LID, CH = "2026-10-05-maths", "2026-09-30-chem"
VID = "videos/manim/reciprocal-trig-graphs.mp4"
S = {"type": "video", "src": VID, "title": "sec x, cosec x and cot x in six steps", "channel": "Explainer video",
     "moments": [{"t": "0:07", "label": "sec x"}, {"t": "0:12", "label": "later"}]}
import json
s = json.loads(fake.blob(fake.sha_of("students/UK-1/lessons/%s/script.json" % LID)))
if VID not in json.dumps(s):
    s["phases"][0]["blocks"].insert(1, S)
fake.extra["students/UK-1/lessons/%s/script.json" % LID] = json.dumps(s).encode()
fake.extra[VID] = vp9(os.path.join(REPO, VID))

with sync_playwright() as p:
    launch = {"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}
    b = p.chromium.launch(**launch)

    def page(w=1280, h=800):
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
        c.add_init_script("localStorage.setItem('tutor.token','t');localStorage.setItem('tutor.device','test');")
        c.route("https://api.github.com/**", fake.route)
        pg = c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        return pg, errs

    pg, errs = page()
    pg.goto(APP + "#/lesson/" + LID); pg.wait_for_selector(".vid video", timeout=30000)
    pg.evaluate("document.querySelector('.vid video').scrollIntoView()"); pg.wait_for_timeout(3000)
    st = pg.evaluate("(()=>{const v=document.querySelector('.vid video');return {ready:v.readyState,dur:v.duration}})()")
    check("Plan: a repo video loads and can play", st["ready"] >= 1 and st["dur"] > 5, st)
    pg.click(".vid [data-lseek]:nth-child(2)"); pg.wait_for_timeout(1000)
    t = pg.evaluate("document.querySelector('.vid video').currentTime")
    check("Plan: a moment button jumps inside the video", 11.5 <= t <= 14, t)

    pg.goto(APP + "#/lesson/" + LID + "/student"); pg.wait_for_selector(".stu-view", timeout=30000); pg.wait_for_timeout(800)
    pg.click("#stumenu"); pg.wait_for_timeout(300)
    check("Student: a Video tab", pg.locator("[data-stab=video]").count() == 1)
    pg.click("[data-stab=video]"); pg.wait_for_timeout(300); pg.click("#stux"); pg.wait_for_timeout(2500)
    st = pg.evaluate("(()=>{const v=document.querySelector('.stu-vid video');const r=v.getBoundingClientRect();return {ready:v.readyState,w:r.width}})()")
    check("Student: the video fills the screen and loads", st["ready"] >= 1 and st["w"] > 1000, st)
    check("no page errors", not errs, errs)

    pg, errs = page()
    pg.goto(APP + "#/lesson/2026-10-05-chem/student"); pg.wait_for_selector(".stu-view", timeout=30000); pg.wait_for_timeout(1200)
    for k in range(40):
        if pg.locator(".stu-twin").count(): break
        pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(400)
    w = pg.evaluate("(()=>{const t=document.querySelector('.stu-twin');return t?t.getBoundingClientRect().width:0})()")
    check("Student: a question in parts is full width (was 48px)", w > 900, w)
    fs = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.stu-twin .tw')).fontSize)")
    check("  and its text is large (24px or more on a laptop)", fs >= 24, fs)
    check("no page errors", not errs, errs)

print("%d/%d checks passed" % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
