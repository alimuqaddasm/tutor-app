"""Scenario 6: screen sizes and themes. Screenshots of every student state and the teacher pages; overflow, tap targets, small text, timer under keyboard."""
import time, json
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
SIZES = [("laptop", 1366, 768), ("tab-land", 1280, 800), ("tab-port", 800, 1280), ("phone", 390, 844)]
LONGQ = [{"id": "q1", "label": "1(a)(i)", "text_html": "<p>A curve has equation \\( y = 2\\operatorname{cosec} 2\\theta \\) for \\( 0 \\le \\theta \\le 2\\pi \\). Sketch the curve, showing the asymptotes and the coordinates of any turning points, and state the range of values of \\( \\theta \\) for which the curve is decreasing. Hence or otherwise solve \\( 2\\operatorname{cosec} 2\\theta = 4 \\) giving your answers to 3 significant figures where appropriate.</p>", "marks": 10, "type": "upload_required"},
         {"id": "q2", "label": "1(b)", "text_html": "<p>State the exact value of \\( \\sin\\dfrac{\\pi}{3} \\).</p>", "marks": 2, "type": "short"},
         {"id": "q3", "label": "2", "text_html": "<p>Prove the identity.</p>", "marks": 4, "type": "long"},
         {"id": "q4", "label": "3", "text_html": "<p>Q4</p>", "marks": 1, "type": "long"}, {"id": "q5", "label": "4", "text_html": "<p>Q5</p>", "marks": 1, "type": "long"},
         {"id": "q6", "label": "5", "text_html": "<p>Q6</p>", "marks": 1, "type": "long"}, {"id": "q7", "label": "6", "text_html": "<p>Q7</p>", "marks": 1, "type": "long"},
         {"id": "q8", "label": "7(a)", "text_html": "<p>Q8</p>", "marks": 1, "type": "long"}, {"id": "q9", "label": "7(b)", "text_html": "<p>Q9</p>", "marks": 1, "type": "long"},
         {"id": "q10", "label": "8", "text_html": "<p>Q10</p>", "marks": 1, "type": "long"}, {"id": "q11", "label": "9", "text_html": "<p>Q11</p>", "marks": 1, "type": "long"},
         {"id": "q12", "label": "10", "text_html": "<p>Q12</p>", "marks": 1, "type": "long"}]

AUDIT = """(function(){
  var out={hscroll:document.documentElement.scrollWidth>window.innerWidth+1, small:[], tiny:[]};
  var els=document.querySelectorAll('button, a.btn, label.btn, input[type=text], textarea, .ex-dot, [data-rm]');
  els.forEach(function(e){ if(!e.offsetParent && getComputedStyle(e).position!=='fixed') return; var r=e.getBoundingClientRect(); if(r.width===0||r.height===0) return;
    if(r.height<44||r.width<44){ out.small.push((e.textContent.trim()||e.getAttribute('aria-label')||e.className).slice(0,20)+' '+Math.round(r.width)+'x'+Math.round(r.height)); } });
  var all=document.querySelectorAll('#ex *, #app *'); var seen={};
  all.forEach(function(e){ if(!e.children.length && e.textContent.trim()){ var fs=parseFloat(getComputedStyle(e).fontSize); if(fs<13){ var k=e.className+'@'+fs; if(!seen[k]){seen[k]=1; out.tiny.push(k);} } } });
  return out; })()"""


def shot_state(pg, name, full=False):
    return shot(pg, name, full)


with sync_playwright() as p:
    b = launch(p)
    # exams in each state
    eid_wait, tok_wait = make_exam(minutes=35, title="Chapters 1 to 6 (trig functions focus)", questions=LONGQ)
    eid_run, tok_run = make_exam(minutes=35, title="Chapters 1 to 6 (trig functions focus)", questions=LONGQ)
    api("PUT", "/api/t/exams/%s/questions/q1/image" % eid_run, raw=png(2048, 389, (245, 245, 245)), headers={"Content-Type": "image/png"})
    api("POST", "/api/t/exams/%s/start" % eid_run)
    sapi("PUT", "/api/s/answers/q1", tok_run, {"text": "My working is attached. First I found the asymptotes at theta = 0, pi/2, pi...", "seq": 1})
    for i in range(3):
        sapi("POST", "/api/s/uploads/q1", tok_run, raw=png(800, 600, (230 - i * 40, 230, 250)), headers={"Content-Type": "image/png"})
    api("PUT", "/api/t/exams/%s/questions/q1/image" % eid_wait, raw=png(2048, 389, (245, 245, 245)), headers={"Content-Type": "image/png"})
    eid_up, tok_up = make_exam(minutes=0.05, title="Chapters 1 to 6 (trig functions focus)", questions=LONGQ, start=True)
    eid_sub, tok_sub = make_exam(minutes=35, title="Chapters 1 to 6 (trig functions focus)", questions=LONGQ, start=True)
    sapi("POST", "/api/s/submit", tok_sub)
    eid_lock, tok_lock = make_exam(minutes=35, title="Chapters 1 to 6 (trig functions focus)", questions=LONGQ, start=True)
    api("POST", "/api/t/exams/%s/lock" % eid_lock)
    ptok = sapi("POST", "/api/s/phone-token/q1", tok_run)["token"]
    time.sleep(4)
    audits = {}
    for scheme in ("light", "dark"):
        for name, w, h in SIZES:
            ctx = context(b, viewport={"width": w, "height": h}, color_scheme=scheme, is_mobile=(w < 900), has_touch=(w < 900))
            pg = ctx.new_page(); el.attach(pg, "6 %s %s " % (scheme, name))
            tag = "s6-%s-%s" % (scheme, name)
            # waiting
            pg.goto(link(tok_wait)); wait_for(lambda: "will start" in pg.inner_text("#ex"), 8); shot_state(pg, tag + "-waiting")
            # running
            pg.goto(link(tok_run)); wait_for(lambda: pg.locator("#ans").count() > 0, 8); wait_for(lambda: pg.locator(".ex-pic img").count() >= 3, 6); time.sleep(1.2)
            shot_state(pg, tag + "-running"); shot_state(pg, tag + "-running-full", True)
            a = pg.evaluate(AUDIT); audits[tag + "-running"] = a
            check("6 %s %s running: no sideways scroll" % (scheme, name), not a["hscroll"])
            check("6 %s %s running: tap targets >= 44 px" % (scheme, name), not a["small"], a["small"])
            if a["tiny"]: note("6 %s %s running: text under 13 px: %s" % (scheme, name, a["tiny"]))
            # timer visible with the keyboard open (phone/tablet portrait): the viewport shrinks by ~300 px
            if w < 900:
                pg.focus("#ans"); pg.set_viewport_size({"width": w, "height": h - 320}); time.sleep(0.4)
                pg.evaluate("document.querySelector('#ans').scrollIntoView({block:'center'})"); time.sleep(0.3)
                tb = pg.locator(".ex-timer").bounding_box(); vis = tb and tb["y"] >= 0 and tb["y"] + tb["height"] <= h - 320
                check("6 %s %s: timer still on screen with the keyboard open" % (scheme, name), bool(vis), tb)
                nb = pg.locator(".ex-nav").bounding_box(); ans = pg.locator("#ans").bounding_box()
                covered = nb and ans and ans["y"] + ans["height"] > nb["y"] and ans["y"] < nb["y"]
                note("6 %s %s keyboard open: nav bar at y=%s, answer box %s, bar covers box bottom=%s" % (scheme, name, nb and round(nb["y"]), ans and (round(ans["y"]), round(ans["height"])), covered))
                shot_state(pg, tag + "-keyboard")
                pg.set_viewport_size({"width": w, "height": h})
            # hand in dialog
            pg.click("[data-handin]"); wait_for(lambda: pg.locator(".ex-box").count() == 1, 4); shot_state(pg, tag + "-handin")
            a = pg.evaluate(AUDIT); check("6 %s %s hand-in dialog: no sideways scroll" % (scheme, name), not a["hscroll"])
            pg.keyboard.press("Escape")
            # drawing dialog
            pg.click("[data-draw]"); wait_for(lambda: pg.locator(".ex-draw canvas").count() == 1, 4); time.sleep(0.4)
            cv = pg.locator(".ex-draw canvas").bounding_box()
            pg.mouse.move(cv["x"] + 30, cv["y"] + 30); pg.mouse.down(); pg.mouse.move(cv["x"] + 200, cv["y"] + 120); pg.mouse.up()
            shot_state(pg, tag + "-drawing")
            a = pg.evaluate(AUDIT); check("6 %s %s drawing: tap targets >= 44 px" % (scheme, name), not a["small"], a["small"]); check("6 %s %s drawing: no sideways scroll" % (scheme, name), not a["hscroll"])
            note("6 %s %s drawing canvas %dx%d" % (scheme, name, cv["width"], cv["height"]))
            pg.on("dialog", lambda d: d.accept()); pg.click("[data-x]"); time.sleep(0.3)
            # phone-QR dialog
            pg.click("[data-phone]"); wait_for(lambda: pg.locator(".ex-qr svg").count() == 1, 6); shot_state(pg, tag + "-qr"); pg.keyboard.press("Escape")
            # zoom a picture
            pg.locator(".ex-pic img").first.click(); time.sleep(0.4); shot_state(pg, tag + "-zoom"); pg.keyboard.press("Escape")
            # time up
            pg.goto(link(tok_up)); wait_for(lambda: "Time is up" in pg.inner_text(".ex-timer"), 10); time.sleep(0.5); shot_state(pg, tag + "-timeup")
            a = pg.evaluate(AUDIT); check("6 %s %s timeup: no sideways scroll" % (scheme, name), not a["hscroll"])
            # submitted
            pg.goto(link(tok_sub)); wait_for(lambda: "Handed in" in pg.inner_text(".ex-timer"), 10); time.sleep(0.5); shot_state(pg, tag + "-submitted")
            # locked
            pg.goto(link(tok_lock)); wait_for(lambda: "ended" in pg.inner_text("#ex"), 10); shot_state(pg, tag + "-locked")
            # phone page (only at phone size, plus tablet portrait)
            if w < 900:
                pg.goto(plink(ptok)); wait_for(lambda: "Take a photo" in pg.inner_text("#ex"), 8); time.sleep(1); shot_state(pg, tag + "-phonepage", True)
                a = pg.evaluate(AUDIT); check("6 %s %s phone page: no sideways scroll, tap targets ok" % (scheme, name), not a["hscroll"] and not a["small"], a)
            ctx.close()
            # teacher pages
            tctx = context(b, teacher=True, viewport={"width": w, "height": h}, color_scheme=scheme)
            tp = tctx.new_page(); el.attach(tp, "6 teacher %s %s " % (scheme, name))
            tp.goto(APP + "#/exams"); wait_for(lambda: "On the exam server" in tp.inner_text("#app"), 15); time.sleep(0.5); shot_state(tp, "s6t-%s-%s-list" % (scheme, name))
            a = tp.evaluate(AUDIT); check("6 teacher %s %s list: no sideways scroll" % (scheme, name), not a["hscroll"])
            tp.goto(APP + "#/exams/" + eid_run); wait_for(lambda: tp.locator("#xt-btns button").count() > 0, 15); time.sleep(1); shot_state(tp, "s6t-%s-%s-exam" % (scheme, name), True)
            a = tp.evaluate(AUDIT); check("6 teacher %s %s exam page: no sideways scroll" % (scheme, name), not a["hscroll"])
            if a["small"]: note("6 teacher %s %s exam page small targets: %s" % (scheme, name, a["small"][:12]))
            tp.goto(APP + "#/exams/" + eid_wait); wait_for(lambda: tp.locator("#xt-dur").count() > 0, 15); time.sleep(0.8); shot_state(tp, "s6t-%s-%s-setup" % (scheme, name), True)
            a = tp.evaluate(AUDIT); check("6 teacher %s %s setup page: no sideways scroll" % (scheme, name), not a["hscroll"])
            tp.goto(APP + "#/exams/" + eid_run + "/mark"); wait_for(lambda: tp.locator("section.xt-mq").count() == 12, 15); wait_for(lambda: tp.locator('[data-mq="q1"] .xt-pics img').first.evaluate("i=>i.naturalWidth>0"), 8); time.sleep(0.8)
            shot_state(tp, "s6t-%s-%s-mark" % (scheme, name)); shot_state(tp, "s6t-%s-%s-mark-full" % (scheme, name), True)
            a = tp.evaluate(AUDIT); check("6 teacher %s %s marking: no sideways scroll" % (scheme, name), not a["hscroll"])
            tctx.close()
    json.dump(audits, open(OUT + "/s6_audits.json", "w"), indent=1)
    b.close()

check("6 no script errors", not el.errors, el.errors)
finish("s6_screens")
