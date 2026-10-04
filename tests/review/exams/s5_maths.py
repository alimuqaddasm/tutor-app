"""Scenario 5: maths rendering (KaTeX from the local cdnjs stand-in) on the student and marking pages; and what happens when the CDN is unreachable."""
import time
from playwright.sync_api import sync_playwright
from common import *

el = ErrLog()
QS = [{"id": "q1", "label": "1", "text_html": "<p>Show that \\( \\dfrac{1}{2} \\) is the value of \\[ \\int_0^1 x\\,dx \\] and explain.</p>", "marks": 3, "type": "long"},
      {"id": "q2", "label": "2", "text_html": "<p>Plain text question with a <b>bold</b> word and an inline \\(x^2\\).</p><ul><li>part a</li><li>part b</li></ul>", "marks": 2, "type": "short"},
      {"id": "q3", "label": "3", "text_html": "<p>Broken maths \\( \\frac{1}{ \\) and a script <script>alert(1)</script> and <img src=x onerror=alert(2)>.</p>", "marks": 1, "type": "short"}]
with sync_playwright() as p:
    b = launch(p)
    eid, tok = make_exam(minutes=30, title="Maths test", questions=QS, start=True)
    ctx = context(b)
    pg = ctx.new_page(); el.attach(pg, "5 ")
    alerts = []
    pg.on("dialog", lambda d: (alerts.append(d.message), d.dismiss()))
    pg.goto(link(tok))
    wait_for(lambda: pg.locator("#ans").count() > 0, 10)
    ok = wait_for(lambda: pg.locator(".ex-qtext .katex").count() >= 2, 20)
    check("5 student page: KaTeX renders \\( \\dfrac \\) and \\[ \\int \\]", ok is not None, pg.locator(".ex-qtext .katex").count())
    check("5 student page: display maths is on its own line", pg.locator(".ex-qtext .katex-display").count() == 1, pg.locator(".ex-qtext .katex-display").count())
    check("5 student page: no raw backslashes left", "\\(" not in pg.inner_text(".ex-qtext") and "\\[" not in pg.inner_text(".ex-qtext"), pg.inner_text(".ex-qtext"))
    shot(pg, "s5-student-maths")
    pg.click('[data-go="1"]')
    wait_for(lambda: pg.locator(".ex-qtext .katex").count() >= 1, 10)
    check("5 student page: HTML lists and bold survive DOMPurify", pg.locator(".ex-qtext li").count() == 2 and pg.locator(".ex-qtext b").count() == 1)
    pg.click('[data-go="2"]')
    time.sleep(1.5)
    check("5 student page: script and onerror in question HTML are stripped (no alert)", not alerts and pg.locator(".ex-qtext script").count() == 0, alerts)
    check("5 student page: broken maths does not blank the question", "Broken maths" in pg.inner_text(".ex-qtext"), pg.inner_text(".ex-qtext"))
    shot(pg, "s5-student-broken")
    # teacher marking page
    tctx = context(b, teacher=True)
    tp = tctx.new_page(); el.attach(tp, "5-teacher ")
    tp.goto(APP + "#/exams/" + eid + "/mark")
    ok = wait_for(lambda: tp.locator('[data-mq="q1"] .katex').count() >= 2, 20)
    check("5 marking page: KaTeX renders", ok is not None, tp.locator('[data-mq="q1"] .katex').count())
    shot(tp, "s5-mark-maths", full=True)
    # teacher exam page: only labels in the table
    tp.goto(APP + "#/exams/" + eid)
    wait_for(lambda: tp.locator("#xt-btns").count() > 0, 10)
    note("5 teacher exam page question column shows: %r" % tp.inner_text("table.xt-qs tbody tr:first-child td:nth-child(2)"))
    tctx.close()
    ctx.close()

    # ---- the CDN is unreachable: what does the student see? ----
    ctx2 = context(b)
    ctx2.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())
    pg2 = ctx2.new_page(); el.attach(pg2, "5-nocdn ")
    pg2.goto(link(tok))
    wait_for(lambda: pg2.locator("#ans").count() > 0, 10)
    time.sleep(2)
    txt = pg2.inner_text(".ex-qtext")
    check("5 without the CDN the question text is still readable (no raw <p> tags)", "<p>" not in txt and "&lt;" not in pg2.inner_html(".ex-qtext")[:20], txt[:120])
    shot(pg2, "s5-no-cdn")
    pg2.click('[data-go="1"]')
    time.sleep(0.5)
    note("5 without the CDN q2 reads: %r" % pg2.inner_text(".ex-qtext")[:160])
    pg2.click("[data-phone]")
    time.sleep(2)
    note("5 without the CDN the phone dialog says: %r" % (pg2.inner_text(".ex-box") if pg2.locator(".ex-box").count() else "no dialog"))
    shot(pg2, "s5-no-cdn-qr")
    ctx2.close()
    b.close()

check("5 no script errors", not el.errors, el.errors)
finish("s5_maths")
