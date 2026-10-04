"""Builds the Tutor Desk review report (report.html) from findings.py + screenshots."""
import html, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from img import data_uri
from findings import SUMMARY, BUGS, DESIGN, CONTENT, BATCHES, TESTS, MAP, SPEED

TEACH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens") + "/"
EXAMS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens") + "/"
SCREENS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens") + "/"
e = html.escape
total_img = 0

def pic(path, cap="", w=760):
    global total_img
    if not path or not os.path.exists(path):
        return ""
    uri, n = data_uri(path, width=w); total_img += n
    return '<figure class="shot"><img src="%s" alt="%s" loading="lazy"><figcaption>%s</figcaption></figure>' % (uri, e(cap), e(cap))

SEV = {"Blocker": "sev-b", "High": "sev-h", "Medium": "sev-m", "Low": "sev-l"}
def bug(b, i):
    shots = "".join(pic(p, c) for p, c in b.get("shots", []))
    return '''<article class="bug" id="bug-%d"><div class="bug-head"><span class="sev %s">%s</span><h3>%d. %s</h3><span class="where">%s</span></div>
<dl><dt>What you see</dt><dd>%s</dd><dt>How to repeat it</dt><dd>%s</dd><dt>Why it matters for teaching</dt><dd>%s</dd><dt>Likely cause</dt><dd>%s</dd><dt>Proof</dt><dd>%s</dd></dl>%s</article>''' % (
        i, SEV[b["sev"]], b["sev"], i, e(b["title"]), e(b.get("where", "")), b["see"], b["repeat"], b["why"], b["cause"], b["proof"], shots)

def design(d, i):
    before = pic(d.get("before"), d.get("before_cap", "Now"), 560) if d.get("before") else ""
    return '''<article class="up" id="up-%d"><div class="bug-head"><span class="eff">%s effort</span><h3>%s. %s</h3></div><p>%s</p>
<div class="ba"><div class="ba-col"><div class="ba-lab">Now</div>%s</div><div class="ba-col"><div class="ba-lab">Proposed</div><div class="mock">%s</div><p class="mock-note">%s</p></div></div></article>''' % (
        i, d["effort"], i, e(d["title"]), d["why"], before, d["mock"], d.get("note", ""))

def main():
    out = []
    out.append('''<title>Tutor Desk Review</title>
<meta name="description" content="Bugs, design upgrades and a content plan for the Tutor Desk teaching app, October 2026">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
/* layout: one reading column, 720px, with wide before/after rows that break out to 1100px */
:root{--bg:#f7f6f2;--paper:#ffffff;--ink:#1d2330;--ink-2:#4a5366;--ink-3:#7a8296;--line:#e2e0d8;--line-2:#cfccc2;--accent:#1f6f5f;--accent-wash:#e3f0ec;--warn:#9a5b00;--warn-wash:#fbf0dc;--bad:#a52a2a;--bad-wash:#f9e4e4;--mid:#5b4b9a;--mid-wash:#ece7f7;--low:#4b6a8a;--low-wash:#e4ecf3;
--display:"Fraunces",Georgia,serif;--body:"Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif;--mono:"JetBrains Mono",Consolas,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15181f;--paper:#1d2129;--ink:#eceef2;--ink-2:#b9bfcc;--ink-3:#858da0;--line:#2b303b;--line-2:#3b4250;--accent:#6fc4ad;--accent-wash:#1d3430;--warn:#f0b35a;--warn-wash:#3a2d14;--bad:#f08a8a;--bad-wash:#3d1f1f;--mid:#b9a9f0;--mid-wash:#2b2540;--low:#9ab7d6;--low-wash:#1f2a36;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15181f;--paper:#1d2129;--ink:#eceef2;--ink-2:#b9bfcc;--ink-3:#858da0;--line:#2b303b;--line-2:#3b4250;--accent:#6fc4ad;--accent-wash:#1d3430;--warn:#f0b35a;--warn-wash:#3a2d14;--bad:#f08a8a;--bad-wash:#3d1f1f;--mid:#b9a9f0;--mid-wash:#2b2540;--low:#9ab7d6;--low-wash:#1f2a36;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--body);padding-block:0 80px;padding-inline:16px}
.wrap{max-width:720px;margin:0 auto}
.wide{max-width:1100px;margin:0 auto}
h1,h2,h3{font-family:var(--display);text-wrap:balance;line-height:1.15;margin:0}
h1{font-size:clamp(2rem,5vw,3rem);font-weight:700}
h2{font-size:1.75rem;margin:56px 0 16px;padding-top:24px;border-top:1px solid var(--line)}
h3{font-size:1.2rem}
p{margin:0 0 12px}
.lede{font-size:1.15rem;color:var(--ink-2);max-width:60ch}
.eyebrow{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:700}
header.top{padding:48px 0 8px}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 8px}
nav.toc a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line-2);color:var(--ink);text-decoration:none;font-size:.95rem;background:var(--paper)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.tile{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.tile b{display:block;font-family:var(--display);font-size:1.7rem;font-variant-numeric:tabular-nums}
.tile span{font-size:.9rem;color:var(--ink-2)}
ul.plain{padding-left:20px;margin:0 0 12px}
ul.plain li{margin-bottom:6px}
table{border-collapse:collapse;width:100%;min-width:0;font-size:.95rem;margin:12px 0 20px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.tablewrap{overflow-x:auto;max-width:100%}
.wrap,.wide{min-width:0}
@media (max-width:700px){table{font-size:.85rem}th,td{padding:6px 6px}}
.ok{color:var(--accent);font-weight:700}.ko{color:var(--bad);font-weight:700}.env{color:var(--warn);font-weight:700}
.bug,.up{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:0 0 18px}
.bug-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}
.where{font-size:.85rem;color:var(--ink-3);margin-left:auto}
.sev,.eff{font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.sev-b{background:var(--bad);color:#fff}.sev-h{background:var(--bad-wash);color:var(--bad)}.sev-m{background:var(--warn-wash);color:var(--warn)}.sev-l{background:var(--low-wash);color:var(--low)}
.eff{background:var(--mid-wash);color:var(--mid)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 10px;font-size:.98rem}
dt{color:var(--ink-3);font-size:.82rem;text-transform:uppercase;letter-spacing:.05em;font-weight:700;padding-top:3px}
dd{margin:0;min-width:0}
code{font-family:var(--mono);font-size:.85em;background:var(--accent-wash);padding:1px 5px;border-radius:5px}
.shot{margin:12px 0 0}
.shot img{display:block;max-width:100%;border:1px solid var(--line-2);border-radius:8px}
.shot figcaption{font-size:.85rem;color:var(--ink-3);margin-top:6px}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}
.ba-col{min-width:0}
.ba-lab{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:700;margin-bottom:6px}
.mock{border:1px dashed var(--line-2);border-radius:8px;background:var(--bg);padding:10px;font-size:.8rem;line-height:1.3;color:var(--ink-2)}
.mock-note{font-size:.9rem;color:var(--ink-2);margin-top:8px}
/* wireframe pieces */
.wf{background:var(--paper);border:1px solid var(--line-2);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;min-height:150px}
.wf .bar{display:flex;gap:4px;align-items:center}
.wf .chip{border:1px solid var(--line-2);border-radius:999px;padding:2px 8px;font-size:.72rem;white-space:nowrap}
.wf .chip.dark{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.wf .chip.acc{background:var(--accent-wash);color:var(--accent);border-color:var(--accent)}
.wf .box{border:1px solid var(--line-2);border-radius:6px;padding:8px;background:var(--bg)}
.wf .box.img{background:repeating-linear-gradient(45deg,var(--line) 0 6px,transparent 6px 12px);min-height:70px;display:grid;place-items:center;color:var(--ink-3)}
.wf .q{font-family:Georgia,serif;font-size:1rem;color:var(--ink)}
.wf .ans{border-left:3px solid var(--accent);padding-left:8px;color:var(--ink)}
.wf .row{display:flex;gap:6px}
.wf .grow{flex:1}
.wf .side{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.wf .nav{display:flex;flex-direction:column;gap:3px}
.wf .nav span{padding:3px 6px;border-radius:4px}
.wf .nav span.cur{background:var(--accent-wash);color:var(--accent);font-weight:700}
.wf .muted{color:var(--ink-3)}
.wf .pin{background:var(--warn-wash);color:var(--warn);border-radius:6px;padding:4px 8px}
.batch{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:12px}
.batch b.n{font-family:var(--display);font-size:1.4rem;color:var(--accent)}
.batch ul{margin:0;padding-left:18px}
.callout{background:var(--accent-wash);border-radius:12px;padding:14px 18px;margin:14px 0}
.map{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:14px 0}
.map .node{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:.92rem}
.map .node b{display:block;font-family:var(--display);font-size:1.05rem;margin-bottom:4px}
.map .node .goes{color:var(--ink-3);font-size:.82rem}
@media (max-width:700px){.ba{grid-template-columns:1fr}dl{grid-template-columns:1fr;gap:2px}dt{padding-top:8px}.where{margin-left:0}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
<div class="wrap">
<header class="top"><div class="eyebrow">Tutor Desk · review of 4 October 2026</div><h1>Tutor Desk Review</h1>
<p class="lede">Bugs found under stress, design upgrades, and a clearer way to organise the content. Everything here was tested on a copy of your data with a pretend GitHub and a local exam server. Nothing real was touched.</p>
<nav class="toc"><a href="#summary">Summary</a><a href="#map">How the app fits together</a><a href="#tests">Test results</a><a href="#bugs">Bugs</a><a href="#design">Design upgrades</a><a href="#content">Content organisation</a><a href="#batches">Order of work</a><a href="#decide">Your decisions</a></nav></header>
''')
    out.append('<h2 id="summary">Two-minute summary</h2>' + SUMMARY)
    out.append('<h2 id="map">How the app fits together</h2>' + MAP)
    out.append('<h2 id="tests">What the existing tests say</h2>' + TESTS + SPEED)
    out.append('<h2 id="bugs">Bugs, worst first</h2><p>Severity is about your teaching: Blocker stops a lesson, High loses work or misleads you in a live lesson, Medium costs time or trust, Low is cosmetic.</p>')
    order = {"Blocker": 0, "High": 1, "Medium": 2, "Low": 3}
    bugs = sorted(BUGS, key=lambda b: order[b["sev"]])
    out.extend(bug(b, i + 1) for i, b in enumerate(bugs))
    out.append('</div><div class="wide"><h2 id="design">Design and UX upgrades</h2><p class="lede">Each one shows the screen as it is now and a sketch of the proposal. Effort: small is under a day, medium is a few days, large is a week or more.</p>')
    out.extend(design(d, i + 1) for i, d in enumerate(DESIGN))
    out.append('</div><div class="wrap"><h2 id="content">Content organisation</h2>' + CONTENT)
    out.append('<h2 id="batches">Suggested order of work</h2>' + BATCHES)
    out.append('''<h2 id="decide">Your decisions</h2><div class="callout"><p><b>Tell me which numbers to do.</b> For example: "bugs 1 to 5, upgrades 1, 2 and 4, batch 1 and 2". I will fix them in small batches, each with tests, and open a pull request for you to merge. I will not deploy the exam server or touch the live database without asking first.</p></div></div>''')
    html_out = "\n".join(out)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report.html")
    open(path, "w").write(html_out)
    print("wrote", path, len(html_out) // 1024, "KB, images", total_img // 1024, "KB")

if __name__ == "__main__":
    main()
