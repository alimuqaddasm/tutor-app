# -*- coding: utf-8 -*-
import os
"""Content of the review report. Written in Ali's language: short, plain, no jargon."""
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens") + "/"
X = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens") + "/"
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens") + "/"

SUMMARY = """
<p><b>The good news.</b> The part you use every lesson, Teach in Flip, is solid. I hammered it with rapid taps, double taps, refreshes mid-lesson, going offline and back, GitHub failing, two tabs at once and a conflicting save from another device. Nothing was lost. Every tap reached the pretend GitHub, in order, once.</p>
<p><b>What needs fixing first.</b> Three things could hurt a real lesson:</p>
<ul class="plain">
<li><b>Notes you wrote for yourself are hidden in Flip.</b> A "Note for you" that sits before a question goes on the back of the card, so you only see it after pressing Show answer. Today's maths script has the "Toolkit before he starts" note in exactly that spot.</li>
<li><b>The whole app leans on an outside server (cdnjs) at start.</b> If it is slow, the app waits for it. If it is unreachable, every lesson shows raw code instead of text and maths. Two small files should live in your own repo instead.</li>
<li><b>Preview still records verdicts.</b> The yellow bar says nothing is recorded until you press Start lesson, but a verdict tap in preview is saved and the lesson flips to In progress.</li>
</ul>
<p><b>The design story.</b> Your own complaint is right: Flip puts a one-line question in a big empty card and hides a one-line answer. The fix is not a new layout. It is a rule: short answer, show it under the question; long answer or a picture, keep Flip. Exam question pictures and mark schemes are also drawn too small for the space.</p>
<p><b>Your real set-up has a gap.</b> You teach from the laptop and share the tablet's Student view over Meet. The tablet cannot follow what you are showing, because the link between Teach and Student view only works inside one browser. A "follow" mode across devices would remove a lot of tapping on the tablet.</p>
<p><b>Speed.</b> The lesson side is not slow by design: with a typical GitHub delay the home page is up in about 1.6 seconds and all of today's pictures are cached about 3.5 seconds after Teach opens. The slow feeling comes from first visits (every picture is a separate GitHub call) and from the Exams tab, which waits for several server round trips before it draws anything. Both have cheap fixes.</p>
<p><b>Exams</b> were tested end to end against a local copy of the exam server: 251 checks. The server logic held up (timer across refresh and clock drift, extensions, late answers, uploads, hand in, lock and reopen). Two things must be fixed before the first real exam: a rejected save is thrown away while the page says "Saved", and one hung request can stop saving for the rest of the exam. Both are in the bug list.</p>
<div class="tiles"><div class="tile"><b>625</b><span>checks run across Teach, screens and exams</span></div><div class="tile"><b>20</b><span>bugs, 4 High, 11 Medium</span></div><div class="tile"><b>12</b><span>design upgrades with sketches</span></div><div class="tile"><b>0</b><span>lost taps in the Teach stress run</span></div></div>
"""

MAP = """
<p>Everything starts in the tutoring repo on GitHub: Claude writes <code>script.json</code>, the app writes <code>session.json</code>, photos and results next to it. The app keeps no data of its own, only a cache on each device.</p>
<div class="map">
<div class="node"><b>Lessons (home)</b>Today's date, the week strip, "up next" for each subject, the warm-up card, make-up time, recent lessons.<div class="goes">Goes to: Teach, Plan, Revise, Log without a script</div></div>
<div class="node"><b>Plan</b>The whole script as one page: parts on the left rail, clock at the top. Also holds Mistakes warm-up, Extra questions, His work (photos), Times, After the lesson.<div class="goes">Goes to: Teach, Student view, After the lesson</div></div>
<div class="node"><b>Teach</b>The script one screen at a time. Outline on the left, clock and position at the top, Taught / Skip / Next at the bottom. Question screens use the layout you picked: Flip (default), Side panel, Floating card or Classic.<div class="goes">Goes to: Student view (new tab), warm-up overlay, Show him, After the lesson</div></div>
<div class="node"><b>Student view</b>Questions only, no answers. Exam questions as pictures, quick questions as text. Follows "Show him" only inside the same browser.<div class="goes">You open it on the tablet and share it over Meet</div></div>
<div class="node"><b>Revise</b>His logged mistakes on a day 1, 3, 7, 14, 30 schedule. The same thing appears as a card on the home page, a part in Plan, and the Warm-up button in Teach.</div>
<div class="node"><b>Record</b>Hours taught, answers right, the mistakes list, test results, his profile.</div>
<div class="node"><b>Videos</b>The lecture list from <code>videos.json</code>, played in the app, with transcripts where downloaded.</div>
<div class="node"><b>Exams</b>Teacher side: load an exam Claude wrote to the exam server, set the time, make the student link, Start, + minutes, Lock, then Mark and save results back to the repo. Student side: <code>exam.html</code> with the timer, answer boxes, pictures, drawing, phone upload. Phone page: one question, camera only.</div>
<div class="node"><b>Settings</b>GitHub key, repo, device name, student, exam server and password, text style, Teach layout, hint folding, install, clear cache.</div>
<div class="node"><b>Everywhere</b>Suggest a change (saves a note for Claude), Try-out (a tab that saves nothing), light/dark switch, the save status in the corner.</div>
</div>
<p><b>Your lesson in the app, as it is today:</b> Meet on, open the app on the laptop, Teach ▶ on the up-next tile, pick the quiz set, Start lesson, move with Next / Taught / Skip, tap a verdict on each question, Show answer when needed, Show him for a picture, upload his WhatsApp photos under His work, then End of the script, After the lesson, Finish and save. On the tablet: Student view open and shared, moved by hand.</p>
"""

TESTS = """
<p>I ran every existing test on a copy of your data. Three environment limits applied here: this sandbox cannot reach cdnjs (so I served DOMPurify, KaTeX and the QR library from local copies), cannot reach YouTube, and four checks were written against the data as it was on 2 October, which has since changed. Those are marked "env", not bugs.</p>
<div class="tablewrap"><table><thead><tr><th>Test</th><th>Result</th><th>Note</th></tr></thead><tbody>
<tr><td>worker: npx vitest run</td><td class="ok">34 of 34 pass</td><td>timer, extensions, time up, autosave, uploads, access</td></tr>
<tr><td>test_exam.py (student + phone page)</td><td class="ok">32 of 32 pass</td><td>maths and QR pass once the libraries are reachable</td></tr>
<tr><td>test_exams_tab.py (teacher side)</td><td class="ok">33 of 33 pass</td><td></td></tr>
<tr><td>test_exams_tryout.py</td><td class="ok">26 of 26 pass</td><td></td></tr>
<tr><td>test_teach.py, test_tryout.py, test_suggestions_1oct.py</td><td class="ok">pass</td><td>no failures, no script errors</td></tr>
<tr><td>test_bugs_round10.py</td><td class="ok">24 of 24 pass</td><td>exit code 1 only because of font certificate warnings in this sandbox</td></tr>
<tr><td>test_round12 to round15</td><td class="ok">all pass</td><td>13, 6, 15, 8 checks</td></tr>
<tr><td>test_round11.py</td><td class="env">18 pass, 2 env</td><td>the two failing checks expect the data of 2 October (1 Oct maths still untaught, make-up at 170)</td></tr>
<tr><td>test_round16.py</td><td class="env">1 pass, 1 env</td><td>same: expects the week strip of 2 October</td></tr>
<tr><td>stress.py</td><td class="env">could not finish</td><td>written for the Classic layout; it waits for a verdict button that Flip puts in the bottom bar</td></tr>
</tbody></table></div>
<p>My own new checks: 71 on Teach and the Student view, plus the exam and screen checks in the sections below. A test harness that serves your local clone as a pretend GitHub now exists; I propose adding it to <code>tests/</code> so the suite runs anywhere without a GitHub token.</p>
"""

SPEED = """
<h3 style="margin-top:20px">Speed, measured</h3>
<div class="tablewrap"><table><thead><tr><th>What</th><th>No delay</th><th>350 ms per GitHub call (typical)</th></tr></thead><tbody>
<tr><td>Home page, cold cache</td><td>0.5 s, 16 requests</td><td>1.6 s</td></tr>
<tr><td>Teach first screen (after home)</td><td>0.1 s</td><td>0.1 s</td></tr>
<tr><td>All 43 pictures of today's maths lesson cached</td><td>+1.0 s</td><td>+3.5 s</td></tr>
<tr><td>Teach reload, warm cache</td><td>0.3 s</td><td>0.3 s</td></tr>
</tbody></table></div>
<p>So the lesson side is quick once the device has seen the lesson. The slow moments are: the first open of a new script on a device (one GitHub call per picture, four at a time), the first maths screen (KaTeX comes from cdnjs, about 300 KB), and the Exams tab (see the exam bugs). The home page also downloads the whole file list of the repo (about 1,300 files) on every visit.</p>
"""

BUGS = [
 dict(sev="High", title="Flip hides 'Note for you' on the back of the card", where="Teach, Flip layout",
  see="A note that comes just before a question (for example today's \"Toolkit before he starts\" box in Set 6 Q15 to Q18) does not show on the question screen. It appears only after you press Show answer, folded shut under the heading.",
  repeat="Open 2026-10-04-maths in Teach, go to the Solomon C3 starter question (or Q15). The screen shows the question only. Press Show answer: a collapsed \"Note for you\" is on the back.",
  why="Your own teaching cues disappear exactly when you need them, before he starts. In Side panel and Floating card the note is also moved into the answer panel, folded.",
  cause="<code>applyFlip()</code> in app.js moves every <code>.tnote</code> into the answer side and closes it (line ~1234: <code>$$('.tnote', cur).forEach(n => { n.open = false; ans.appendChild(n); })</code>). <code>applyFit()</code> does the same for the other layouts.",
  proof="Screenshot below: the note is on the answer side. The script check found two such notes in today's maths script.",
  shots=[(T + "maths-examq.png", "Question side: no note"), (T + "maths-examq-answer.png", "Answer side: the note is here, folded")]),
 dict(sev="High", title="The app depends on cdnjs to show any lesson text", where="Start-up, every screen",
  see="If cdnjs.cloudflare.com is slow, the app waits for it before it draws anything. If it cannot be reached (blocked network, outage, first visit offline), every answer and note shows as raw code with angle brackets, and maths shows as backslash text.",
  repeat="Block cdnjs.cloudflare.com (or open the app on a network that blocks it) and open any lesson in Teach. Press Show answer.",
  why="One outside server can make a whole lesson unreadable. Your service worker caches the library after the first successful load, so it bites on a fresh device, after Clear cache, or when the cache was evicted.",
  cause="index.html loads <code>purify.min.js</code> from cdnjs as a deferred script before app.js, so app.js waits for it. <code>clean()</code> in app.js falls back to <code>esc()</code> when DOMPurify is missing, which prints the HTML as text. KaTeX and the QR library come from the same host.",
  proof="Screenshot taken in this sandbox before I served the libraries locally.",
  shots=[(T + "teach-03-answer-side-nocdn.png", "Answer side with cdnjs unreachable: raw code instead of the worked answer")]),
 dict(sev="Medium", title="Preview records verdicts and marks the lesson In progress", where="Teach, before Start lesson",
  see="The yellow bar says nothing is ticked until you press Start lesson. Tap a verdict while rehearsing and it is saved to GitHub, the lesson becomes In progress, and the home page shows it that way.",
  repeat="Open a lesson in Teach without starting the clock, go to any question, tap Right. Watch the corner: Kept on device, then Saved. Reload the home page: the lesson says In progress.",
  why="Rehearsing a script before the lesson pollutes his record. Try-out mode avoids it, but the bar promises something it does not do.",
  cause="The verdict handler (<code>data-v</code> click in app.js) calls <code>save()</code> and <code>touch()</code> without checking <code>live()</code>; <code>touch()</code> moves status to in-progress on any change. Only step ticks are gated on the clock.",
  proof="Check \"preview mode: a verdict tap is saved\" in hunt_teach.py passed, and the saved session.json held the verdict with status in-progress.",
  shots=[(T + "teach-02-question-flip.png", "The preview bar while a verdict is being recorded")]),
 dict(sev="Medium", title="Question pictures and mark schemes are drawn small", where="Teach (Flip), Show him",
  see="An exam question picture sits in a box about 560 px wide inside an 850 px stage, with empty space around it. On the back, the mark scheme picture is about 320 px wide. Show him puts the picture at its natural size in the middle of a black screen, about half the width.",
  repeat="Open 2026-10-04-maths in Teach, Solomon C3 starter. Compare the picture width with the card. Press Show answer. Press Show him.",
  why="You and he read these over Meet. Small crops are hard to read; the space is there.",
  cause="Images are <code>width:auto; max-width:100%</code> so a small crop never grows. In Flip, <code>.qcard</code> adds a nested card and padding, and <code>fitQ()</code> only shrinks, never grows. The answer side splits text and picture 50/50 even when the text is one line (<code>.two</code> class).",
  proof="Screenshots below.",
  shots=[(T + "q14-answer-tablet.png", "Tablet, 1 Oct maths, Set 6 Q14: two mark-scheme pages as 150 px thumbnails beside a squeezed column of text (this screen also scrolls by 10 px, found by test_round15)"), (T + "maths-examq.png", "Question picture uses about half the stage"), (T + "chem-04-showhim.png", "Show him: natural size in a 1366 px screen")]),
 dict(sev="Medium", title="Student view on the tablet cannot follow your Teach screen", where="Student view on a second device",
  see="\"Show him\" reaches a Student view tab only in the same browser. Your tablet is another device, so the tablet never changes; you walk over and swipe it yourself.",
  repeat="Open Teach on the laptop and Student view on the tablet. Press Show him on the laptop: the tablet stays where it was.",
  why="This is your real set-up every lesson. It costs taps and attention at the moment you are asking a question.",
  cause="<code>showHim()</code> uses a BroadcastChannel, which only reaches tabs of the same browser profile on the same device. There is no shared pointer for \"what is on screen now\".",
  proof="Check \"Student view on another device does not follow Show him\" in hunt_teach.py: the second browser context stayed at question 1 of 10.",
  shots=[(T + "student-03-tablet-landscape.png", "The tablet Student view, waiting to be swiped")]),
 dict(sev="Low", title="The verdict strip overflows at phone width", where="Teach on a phone (390 px)",
  see="Partly and the ⋯ button are cut off on the right; the page scrolls sideways.",
  repeat="Open any question in Teach on a 390 px wide screen.",
  why="You do not teach from the phone, so this is cosmetic, but it also hides the marks and note fields.",
  cause="<code>.vstrip</code> does not wrap; <code>.ctl.big .vmain</code> is a fixed three-column grid.",
  proof="Horizontal scroll check failed at 390 px in all four layouts; overflowing elements were <code>.ctl.big</code> and <code>.vmorebtn</code>.",
  shots=[(T + "teach-lay-flip-phone.png", "Phone width: Partly and ⋯ are cut off")]),
 dict(sev="Low", title="The ⋯ panel repeats the three verdict buttons", where="Teach, Flip",
  see="Opening ⋯ shows Right, Wrong, Partly again, then Wording, Terminology, He didn't answer and the note field. Two rows of the same buttons.",
  repeat="Open any question in Flip and press ⋯.",
  why="Confusing for a split second, and the panel takes more height than it needs, shrinking the question.",
  cause="<code>applyFlip()</code> moves the whole <code>.ctl.big</code> (with <code>.vmain</code>) into the strip, and the \"more\" state shows <code>.vmore</code> under it; the CSS hides <code>.vmain</code> only in the folded state.",
  proof="Screenshot below.",
  shots=[(T + "chem-03-vmore.png", "The ⋯ panel")]),
]

DESIGN = [
 dict(effort="small", title="Short answers under the question, Flip only for long ones", before=T + "teach-lay-flip-laptop.png", before_cap="A one-line question alone in a big card",
  why="Your words: Flip makes sense for long questions, not for a one-line question with a one-line answer. Rule: if the question has no picture and the answer is under about 300 characters with no picture, show the answer in a tinted band under the question, revealed by the same Show answer key. Everything else keeps Flip.",
  mock='''<div class="wf"><div class="bar"><span class="chip">? Video question 1 of 9</span></div><div class="q">Write cos(x + 30) in the form a cos x + b sin x</div><div class="ans">cos(x+30) = (√3/2) cos x − ½ sin x <span class="muted">· board thumbnail →</span></div><div class="box img">board, tap to enlarge</div><div class="bar"><span class="chip acc">Hide answer A</span><span class="chip">✓ Right</span><span class="chip">✗ Wrong</span><span class="chip">½ Partly</span></div></div>''',
  note="Same keys, same strip. The board sits beside the answer as a thumbnail that enlarges on tap, so you no longer lose the question when checking the answer."),
 dict(effort="medium", title="Picture-first exam questions", before=T + "maths-examq.png", before_cap="Exam question with the crop at half size and hints taking a row",
  why="On an exam-question screen the picture is the question. It should fill the stage edge to edge, scaled up if the crop is small, with the label and source in a thin line above and hints as a small button in the strip rather than a box under the picture.",
  mock='''<div class="wf"><div class="bar"><span class="chip">Q Solomon C3 Trig A Q9</span><span class="muted">Maths Genie old site</span><span class="grow"></span><span class="chip">Hints 4</span><span class="chip">Show him</span></div><div class="box img" style="min-height:130px">question crop fills the width</div><div class="bar"><span class="chip acc">Mark scheme A</span><span class="chip">✓ Right</span><span class="chip">✗ Wrong</span><span class="chip">½ Partly</span><span class="chip">Marks __/6</span></div></div>''',
  note="The back of the card gets the same treatment: the mark scheme picture at full width, the text answer above it, the note folded under a small i."),
 dict(effort="large", title="Follow mode: the tablet shows what you are showing", before=T + "student-03-tablet-landscape.png", before_cap="Student view today: moved by hand on the tablet",
  why="Your real set-up is laptop for Teach, tablet for the student's screen over Meet. A small \"now showing\" pointer, kept on the exam server you already run (fast) or in session.json (slower), lets the tablet follow every Show him and every question screen you land on, with a Follow / Free toggle on the tablet so you can still swipe ahead.",
  mock='''<div class="wf"><div class="bar"><span class="chip dark">Following la57</span><span class="chip">Free</span><span class="grow"></span><span class="muted">Q 3 of 10</span></div><div class="box img" style="min-height:120px">whatever you Show him, or the current question</div><div class="bar"><span class="muted">Laptop: Teach · "Show him" or Next updates this screen within 2 s</span></div></div>''',
  note="Exam questions as pictures, quick questions as text, as now. The pointer carries lesson id, item id and a timestamp; the tablet polls every 2 seconds while following."),
 dict(effort="small", title="Make Preview honest", before=T + "teach-02-question-flip.png", before_cap="Preview bar while verdicts are still being saved",
  why="Either verdicts wait for Start lesson like ticks do, or the bar says so. I propose: in preview, verdict taps show a toast \"Press Start lesson to record verdicts\" and are not saved; the lesson only becomes In progress when the clock starts or you add an extra question or photo.",
  mock='''<div class="wf"><div class="pin">PREVIEW · nothing is recorded until you press Start lesson. Rehearse freely.</div><div class="q">Which reducing agent turns aldehydes and ketones into alcohols?</div><div class="bar"><span class="chip">✓ Right</span><span class="chip">✗ Wrong</span><span class="chip">½ Partly</span><span class="muted">(tap shows: Press Start lesson to record)</span></div></div>''',
  note="Try-out stays as the sandbox for playing with the app itself."),
 dict(effort="small", title="A calmer Teach top bar", before=T + "chem-kind-q.png", before_cap="Seven controls in the top bar during a lesson",
  why="During a lesson you need the clock, the position and Student view. Warm-up, Suggest and Try-out are start-of-lesson or after-lesson jobs. Group them under one ⋯ at the top right; keep the clock big, and show the part name and the \"minute 12, 3 min behind\" line next to it instead of only in the outline.",
  mock='''<div class="wf"><div class="bar"><span class="muted">← Plan · Oral quiz · 6 / 107</span><span class="grow"></span><span class="chip dark">● 12:04 · 3 min behind</span><span class="chip">Pause</span><span class="chip">Student view ↗</span><span class="chip">⋯</span></div><div class="box"><div class="q">Question text at full size</div></div></div>''',
  note="⋯ opens Warm-up (with its badge), Suggest a change, Try-out, layout switch."),
 dict(effort="small", title="One verdict strip, no duplicates, bigger taps", before=T + "chem-03-vmore.png", before_cap="⋯ opens a second row that repeats Right, Wrong, Partly",
  why="⋯ should add only what is missing: Wording, Terminology, He didn't answer, Marks and the note. Outline rows are 32 px tall; on the tablet they should be 44 px. The three main verdicts stay 64 px.",
  mock='''<div class="wf"><div class="bar"><span class="chip acc">Show answer A</span><span class="chip">✓ Right</span><span class="chip">✗ Wrong</span><span class="chip">½ Partly</span><span class="grow"></span><span class="chip">⋯</span></div><div class="bar"><span class="chip">Wording</span><span class="chip">Terminology</span><span class="chip">He didn't answer</span><span class="chip">Marks __/4</span><span class="chip">+ Note</span></div></div>''',
  note="Same keys 1 to 6 and 0 as today."),
 dict(effort="medium", title="Show him at full width, with a pointer", before=T + "chem-04-showhim.png", before_cap="Show him: the crop at natural size on a black screen",
  why="Scale the picture to the width of the screen (or the height, whichever fits), and let you tap or drag to leave a highlight ring the student sees on the tablet in follow mode. Dark background is right for Meet; the picture should fill it.",
  mock='''<div class="wf" style="background:#1a1d26;color:#ddd"><div class="bar"><span class="muted">1 / 2</span><span class="grow"></span><span class="chip" style="color:#ddd">×</span></div><div class="box img" style="min-height:150px;background:#fff;color:#333">question crop scaled to fit the screen · tap to drop a ring</div></div>''',
  note=""),
 dict(effort="small", title="Warm the cache for today's lessons from the home page", before=T + "teach-01-first.png", before_cap="First open of a lesson: pictures arrive one GitHub call at a time",
  why="When the home page finds today's lessons, start fetching their pictures in the background (four at a time, as Teach does) and show a small \"ready to teach offline\" tick on the tile. By the time you press Teach the pictures are already on the device. Also serve DOMPurify and KaTeX from your own repo so the first maths screen does not wait for cdnjs.",
  mock='''<div class="wf"><div class="bar"><span class="chip acc">Maths · up next</span><span class="muted">Sun 4 Oct · Draft script</span><span class="grow"></span><span class="chip">✓ pictures ready</span></div><div class="q">Stretched reciprocal graphs, Set 6 Q15 to 18, then 7.1</div><div class="bar"><span class="chip dark">Teach ▶</span><span class="chip">Open the plan</span></div></div>''',
  note=""),
]

CONTENT = """
<p>The app has grown by rounds of suggestions, and it shows in the grouping: the same thing lives in several places, some names are technical, and the tablet has no obvious home.</p>
<h3>What I would change</h3>
<ul class="plain">
<li><b>Home becomes "Today".</b> One list in lesson order: Chemistry then Maths (or whichever is first), each with Teach ▶, the warm-up count and the script status. The week strip and the make-up card stay. Recent lessons move to a "Lessons" page with a search box.</li>
<li><b>Revise folds into the lesson.</b> The mistakes warm-up appears in four places today (home card, Revise tab, a Plan part, the Warm-up button in Teach). Keep two: the Warm-up step at the start of every Teach script, and a "Mistakes" section inside UK-1's record. Drop the Revise tab.</li>
<li><b>"Record" becomes "UK-1".</b> One page per student with tabs: Lessons, Mistakes, Tests, Profile, Make-up time. When a second student arrives, the sidebar gains a student switcher instead of more tabs.</li>
<li><b>Videos becomes "Library".</b> Videos today; the CGP book pages and the board library later. You said it is storage; name it that way.</li>
<li><b>Exams: plainer labels.</b> "From Claude" and "On the exam server" are how it is built, not what you do. Use "Ready to run", "Running now", "To mark", "Marked". One row per exam that moves between these states, instead of the same exam listed in two sections.</li>
<li><b>Student view gets a front door on the tablet.</b> Open the app on the tablet and the first thing offered is "Student screen for today's lesson", with follow mode on. Today you have to find the lesson, open Plan, then Student ↗.</li>
<li><b>Settings splits into "This device" and "Teaching".</b> Key, repo, device name, exam server and password, cache, install are device things. Text style, layout, hint folding and the lesson length (45 min) are teaching things.</li>
<li><b>Names inside a lesson.</b> "Plan" is the whole script; call it "Script". "After the lesson" is where you finish; call it "Finish and notes". "His work" becomes "Photos". "I skipped it" and "Skip" sit next to each other with different meanings; rename the question one to "Not asked".</li>
</ul>
<h3>Proposed sidebar</h3>
<div class="map">
<div class="node"><b>Today</b>Up next per subject, warm-up count, make-up time, week strip</div>
<div class="node"><b>Lessons</b>Every script and log, newest first, with search and the subject switch</div>
<div class="node"><b>UK-1</b>Lessons · Mistakes · Tests · Profile · Make-up</div>
<div class="node"><b>Exams</b>Ready to run · Running · To mark · Marked</div>
<div class="node"><b>Library</b>Videos (and later books and boards)</div>
<div class="node"><b>Settings</b>This device · Teaching</div>
</div>
<p><b>What is missing:</b> a homework tracker (what was set, was it done, from the After notes); a "last time" strip at the top of every script (last verdicts, last stuck point) so you do not need to open the old lesson; and an "in lesson" log of the WhatsApp photos tied to the question they answer, which you already do by hand under His work.</p>
"""

BATCHES = """
<p>Small batches, each with tests, each a pull request you merge. Nothing goes to the exam server or the live database without your say.</p>
<div class="batch"><b class="n">1</b><div><b>Safety first (small, one day)</b><ul><li>Bug 1: notes stay on the question side in every layout</li><li>Bug 2: DOMPurify and KaTeX served from the repo, listed in the service worker</li><li>Bug 3: preview does not record verdicts</li><li>Bug 6: verdict strip wraps on narrow screens</li><li>Add the pretend-GitHub harness to tests/ so the suite runs anywhere</li></ul></div></div>
<div class="batch"><b class="n">2</b><div><b>Flip done right (small to medium, two to three days)</b><ul><li>Upgrade 1: short answers under the question</li><li>Upgrade 2: picture-first exam questions and full-size mark schemes</li><li>Upgrade 6: one verdict strip, 44 px outline rows</li><li>Upgrade 7: Show him scaled to the screen</li></ul></div></div>
<div class="batch"><b class="n">3</b><div><b>Speed (small, one to two days)</b><ul><li>Upgrade 8: warm the cache for today's lessons from the home page</li><li>Exams tab: draw the list from the repo at once and fill the server part when it answers; fewer round trips on the exam page</li><li>Home page: ask GitHub only for the folders that changed instead of the whole file list</li></ul></div></div>
<div class="batch"><b class="n">4</b><div><b>Follow mode for the tablet (large, about a week)</b><ul><li>Upgrade 3: the tablet follows your Teach screen and Show him</li><li>Tablet front door: open straight into today's student screen</li></ul></div></div>
<div class="batch"><b class="n">5</b><div><b>Exam fixes before the first real exam (small to medium, two to three days)</b><ul><li>Rejected saves keep the text and show "Not saved"; a character count near the limit</li><li>Timeouts and retries on every exam request, student and teacher side</li><li>Two tabs: the box follows the newest text; locked screen tells the truth about unsent text</li><li>Fonts and libraries served from the repo so the student page paints at once</li><li>Upgrade 11: Hand in moved, bigger picture buttons, sticky time-up strip</li><li>Upgrade 12: one exam list with plain states; the marking page refreshes while the exam runs</li></ul></div></div>
<div class="batch"><b class="n">6</b><div><b>Content organisation (medium, three to four days)</b><ul><li>Today, Lessons, UK-1, Exams, Library, Settings</li><li>Renames inside the lesson</li><li>Homework tracker and the "last time" strip</li></ul></div></div>
"""

# ---- found by the screens pass (home, Plan, Record, Revise, Videos, Settings, make-up, suggest) ----
BUGS += [
 dict(sev="Medium", title="A mistyped lesson address creates a real lesson in his record", where="Any #/lesson/… address",
  see="Open #/lesson/does-not-exist (or an empty id) and you get a full Plan page called \"Lesson\". One tap saves students/UK-1/lessons/does-not-exist/session.json with no subject and no date, and it then shows in Record and on the home page.",
  repeat="Type #/lesson/typo at the end of the address, tap a verdict or Start lesson, wait 4 s.",
  why="A stray tap from an old bookmark or a mistyped link quietly adds a lesson with empty fields to his record.",
  cause="<code>lessonView()</code> builds a new session for any id that has no script or session; <code>parseId()</code> returns empty subject and date without complaint.",
  proof="Screenshot below; the pretend GitHub received the write.",
  shots=[(S + "lesson-does-not-exist-1366-light.png", "A Plan page for a lesson that does not exist")]),
 dict(sev="Medium", title="\"Log without a script\" for an existing date and subject merges into the scripted lesson", where="#/new",
  see="Log a lesson for 4 Oct maths when a 4 Oct maths script exists: your typed title lands in that script's session.json, the screen shows the script's title, and the make-up tick you set applies to the scripted lesson.",
  repeat="Lessons, Log without a script, today's date, Maths, any title, Start logging.",
  why="Silent mixing of two lessons' records and a wrong make-up counter.",
  cause="The new-lesson form stores a dirty local copy under the same key as the scripted lesson (date-subject) and <code>lessonView()</code> merges it.",
  proof="s12_misc.log in the screens folder: the typed title appears in the scripted lesson's session.json.", shots=[]),
 dict(sev="Medium", title="\"Yes: finish logging it\" can loop back to the same question", where="Home page, make-up asks",
  see="On \"Was Sat 3 Oct's lesson taught?\" you press Yes, land on the first part of the plan (not on Times or After the lesson), press Finish without minutes, and back home the same question is asked again with no explanation. The natural next tap is \"No, I missed it\", which wrongly adds 45 minutes.",
  repeat="Any past lesson without minutes: Yes, finish logging it, then Finish and save, then back to home.",
  why="Wrong make-up time, and confusion about what the app wants.",
  cause="A lesson counts as taught only with minutes above zero (<code>taughtOK()</code>), but Finish never asks for minutes and the Yes button opens the plan's first part.",
  proof="Screenshot below.", shots=[(S + "home-ask-after-finish-no-minutes-1366-light.png", "The same ask returns after Finish")]),
 dict(sev="Medium", title="On the tablet held upright, five parts of the Plan are off screen with no hint", where="Plan on 800 px wide",
  see="The parts strip shows parts 1 to 3; Mistakes warm-up, Extra questions, His work, Times and After the lesson (where Finish lives) are off to the right with no arrow or scrollbar.",
  repeat="Open any Plan at 800x1280 (portrait tablet) or on the phone.",
  why="Finishing a lesson on the tablet means knowing to swipe a strip that does not look swipeable.",
  cause="<code>@media (max-width:900px)</code> turns the rail into a horizontally scrolling strip with no affordance (app.css).",
  proof="Screenshot below.", shots=[(S + "plan-800x1280-light.png", "Portrait tablet: parts 4 onwards are hidden to the right")]),
 dict(sev="Medium", title="After a two-device merge the tablet keeps showing its old verdict", where="Plan on two devices",
  see="Tablet taps Right on a question. Laptop later taps Wrong and saves. The tablet's next save merges correctly (file says Wrong) but the tablet screen still shows Right until you navigate. One more tap on Right there would clear the verdict to nothing.",
  repeat="Two browsers on the same lesson; tap different verdicts on the same item; tick a step on the first.",
  why="Rare in your set-up (the tablet shows the Student view, which does not write), but it is the one path that can undo a verdict.",
  cause="After a 409 merge, <code>flush()</code> calls <code>tick()</code> but not <code>drawLesson()</code>; the same-browser storage path does redraw.",
  proof="s1b_sync.log E and plan-tablet-after-merge-1366-light.png in the screens folder.", shots=[]),
 dict(sev="Medium", title="Revise and the warm-up fail offline even when everything is cached", where="Revise, home card, Plan warm-up, Teach warm-up",
  see="Offline, the home page and lessons work from the device cache, but the warm-up says \"Couldn't load his mistakes\".",
  repeat="Open the app, go offline, open Revise.",
  why="The warm-up is the first two minutes of your lesson. A blip in the connection removes it.",
  cause="<code>loadRevise()</code> always refreshes the file list from GitHub when it is older than 20 s and gives up when that fails, instead of using the cached list.",
  proof="s13_more.log in the screens folder.", shots=[]),
 dict(sev="Low", title="Small things", where="Various",
  see="(a) Pause and Resume within the same second logs a second \"start\". (b) The Revise badge in the sidebar appears only after the home page has drawn. (c) A broken session.json counts as a 0-minute lesson on Record, silently. (d) Suggestions are stamped app \"v23\" while the app is v25. (e) In dark mode the word TODAY on the week strip is amber on near-white, contrast 1.55 to 1. (f) The merged session lists only the other device under \"devices\". (g) A question with marks written as \"4 + 4\" gets an invalid marks box that accepts 12.",
  repeat="See the screens report for each.", why="Cosmetic or bookkeeping.", cause="app.js clkgo handler; revBadge() only in fillHomeRevise(); recordView() catch; APP_VERSION constant; app.css week strip; merge(); ctl() max attribute.",
  proof="Screenshot of the week strip below.", shots=[(S + "week-strip-dark.png", "Dark mode: TODAY is hard to read")]),
]

DESIGN += [
 dict(effort="small", title="Home page: one make-up number, bigger week strip, phone nav that does not cover content", before=S + "home-1366x768-light.png", before_cap="Make-up owed appears three times; the week strip dots are 8 px with no legend",
  why="The home page is clear and one tap from Teach, which is right. It repeats the make-up figure three times at laptop width and twice on the phone. The week strip is the best summary of the week but its dots are tiny and unlabelled. On the phone the sidebar block pushes the content down 250 px and the bottom bar covers the last 70 px of every page.",
  mock='''<div class="wf"><div class="bar"><span class="q">Sunday 4 October</span><span class="grow"></span><span class="chip">Make-up 167 min</span></div><div class="row"><span class="box grow">Mon 28</span><span class="box grow muted">Tue off</span><span class="box grow">Wed 30 <b style="color:#5b4b9a">●</b> <b style="color:#1f6f5f">●</b></span><span class="box grow">Thu 1 ● ●</span><span class="box grow muted">Fri off</span><span class="box grow">Sat 3 ●</span><span class="box grow" style="border-color:#1f6f5f">Sun 4 today</span></div><div class="muted">● taught  ○ planned  ◌ missed</div></div>''',
  note="One make-up figure in the header, a legend under the strip, 12 px dots. On the phone, the sidebar becomes a single top row."),
 dict(effort="small", title="A verdict that is removed should say so", before=T + "chem-kind-q.png", before_cap="Tapping the pressed verdict again clears it silently",
  why="Tap Right twice on a tablet and the verdict is gone, with the only sign a small colour change. Show a toast \"Right removed\" and ignore a second tap within 400 ms, so a nervous double tap does not undo your mark.",
  mock='''<div class="wf"><div class="bar"><span class="chip acc">✓ Right</span><span class="chip">✗ Wrong</span><span class="chip">½ Partly</span></div><div class="pin" style="align-self:center">Right removed · tap again to restore</div></div>''', note=""),
]

# ---- found by the exam pass (student page, phone page, teacher pages) ----
BUGS += [
 dict(sev="High", title="Exam: a rejected save is thrown away and the page still says \"Saved\"", where="Student exam page",
  see="He types a very long answer (over 50,000 characters) or one save gets any 4xx answer other than 409 or 429. A toast flashes for 3 seconds, then the label goes back to \"Saved 4:06 pm\". If the page reloads (phone sleep, accidental refresh) the box comes back with the older server copy and everything since is gone.",
  repeat="Start an exam, paste 55,000 characters into a long answer, wait 3 s, read the label, reload.",
  why="He is told his work is safe when it is not. Rare, but exam work is the worst thing to lose.",
  cause="exam.js line ~209 marks the draft clean on any 4xx; the save label has no \"not saved\" state; the next load overwrites the clean draft with the server copy. There is no character count or limit hint on the box.",
  proof="Screenshot below; checks 2b and 2j in the exam results.", shots=[(X + "s2-413-label.png", "\"Saved\" under the toast \"This answer is too long.\"")]),
 dict(sev="High", title="Exam: one request that never answers stops saving or polling for the rest of the exam", where="Student exam page, also the teacher page",
  see="On a flaky connection one request hangs with no reply. From then on the label says \"Saving\" for ever and nothing new reaches the server, though the page looks alive. If it was the clock poll that hung, +5 min, lock and hand-in never arrive; the timer keeps counting on its own.",
  repeat="Hold one save request open with a proxy (faultproxy.py in the exams folder), let the rest through, type more, wait 45 s.",
  why="Mobile black holes and captive portals do exactly this. A reload fixes it, but he does not know he needs one.",
  cause="fetch has no timeout; <code>flushing</code> and <code>sending</code> flags are cleared only when the request settles; <code>poll()</code> reschedules itself only after a reply. Same pattern in exams.js poll().",
  proof="Checks 2k in s2c_saving.results.json; s2-hung.png.", shots=[(X + "s2-hung.png", "\"Saving\" that never ends")]),
 dict(sev="Medium", title="Exam: two tabs of the same link overwrite each other silently", where="Student exam page",
  see="He opens the link twice. Typing in tab 2 never updates tab 1's box. One keystroke in tab 1 later sends tab 1's old text and tab 2's answer is gone from the server, while tab 2 still shows it.",
  repeat="Open the link in two tabs, type different text, wait 4 s, press one key in the first tab, read the marking page.",
  why="Silent loss of a whole answer; easy to do on a tablet by tapping the link twice.",
  cause="<code>mergeAnswers()</code> updates the drafts but never the box on screen; the next keystroke sends the stale box with a higher sequence number, which the server accepts.",
  proof="s2-twotabs-tab1.png and checks 2d.", shots=[]),
 dict(sev="Medium", title="Exam: locked while text was unsent, the student is told \"Your answers are saved\"", where="Student exam page",
  see="He loses connection, keeps typing, you lock. When he is back online the page says the exam has ended and his answers are saved. The last text never arrived.",
  repeat="Go offline, type, lock from the teacher page, go online.",
  why="He will not tell you he lost work because the page told him he did not.",
  cause="The locked screen is static text; a 409 on save only re-polls; the unsent draft stays on the device with no message.",
  proof="Check 4 in s4_handin.results.json; s4-locked.png.", shots=[]),
 dict(sev="Medium", title="Exam: the student page waits on Google Fonts and cdnjs before it paints", where="Student exam page",
  see="When fonts.googleapis.com hangs the page paints nothing for 40 s. When cdnjs is blocked, questions show raw tags and raw maths and the QR dialog fails.",
  repeat="Block or throttle those hosts and open the student link.",
  why="Exam day, student's home network: two outside services can blank the page.",
  cause="exam.html loads the fonts stylesheet render-blocking and the three libraries only from cdnjs; <code>clean()</code> falls back to escaped text.",
  proof="s5-no-cdn.png; first paint numbers in the exam speed table.", shots=[(X + "s5-no-cdn.png", "Student page with cdnjs blocked")]),
 dict(sev="Low", title="Exam: small things", where="Student, phone and teacher pages",
  see="(a) After leaving the marking page with a comment just typed, a script error fires 1.2 s later (the comment is saved). (b) Closing the phone-QR dialog with Escape leaves the fast 2 s poll running. (c) The phone page never re-checks the exam state, so after a lock it still offers \"Take a photo\" and the upload then fails. (d) The open marking page never refreshes during a running exam, and \"Save to tutoring repo\" from it saves stale answers. (e) The waiting page says \"He hasn't opened the link yet\" next to \"Last seen 12 s ago\". (f) Duration 0 or empty on the setup page is silently ignored. (g) \"Failed to fetch\" reaches the student and you as a message.",
  repeat="See the exam report for each.", why="Polish before the first real exam.",
  cause="exams.js saveMark debounce; exam.js phone dialog close path; phonePoll() runs once; markView() fetches once; exams.js:238 10 s window; exams.js:300; raw error messages.",
  proof="Checks 7, 9 and 3 in the exam results.", shots=[(X + "s9-seen-contradiction.png", "Two sentences that disagree")]),
]

DESIGN += [
 dict(effort="small", title="Student exam page: Hand in away from Next, bigger picture buttons, a visible time-up strip", before=X + "s4-390-bottombar.png", before_cap="Hand in sits 10 px from Next, the button he taps most",
  why="Under pressure he taps Next every minute. Hand in should not be its neighbour. Move Hand in to the top bar next to the save label, make the confirm dialog's Hand in the plain button and Keep working the accent one, lift Choose picture / Draw / Use phone to 48 px, and keep the time-up message in the sticky header so it never scrolls away. Add a small \"characters left\" hint near the 50,000 limit.",
  mock='''<div class="wf"><div class="bar"><span class="q">Practice exam</span><span class="grow"></span><span class="chip dark">12:31</span><span class="muted">Saved 4:06</span><span class="chip">Hand in</span></div><div class="box"><div class="q">Question 2 of 4 · 4 marks</div><div class="muted">answer box</div></div><div class="bar"><span class="chip">Choose picture</span><span class="chip">Draw</span><span class="chip">Use phone</span></div><div class="bar"><span class="chip">Previous</span><span class="grow"></span><span class="chip dark">Next</span></div></div>''',
  note="What already reads well stays: the waiting screen, the offline label, \"Working or notes (optional)\"."),
 dict(effort="medium", title="Exams tab: one list, plain states, instant first paint", before=X + "s7-list.png", before_cap="Exams split into \"From Claude\" and \"On the exam server\"",
  why="Show one row per exam with a state chip (Ready to run, Waiting, Running, To mark, Marked) and draw the list from the repo at once, then fill the server part when it answers. The exam page should keep polling after a hung request (timeout and retry), and the marking page should refresh while the exam is open.",
  mock='''<div class="wf"><div class="bar"><span class="q">Exams</span><span class="grow"></span><span class="chip">Make a practice exam</span></div><div class="box"><div class="row"><span class="grow">Chapters 1 to 6 (trig functions focus) · 29 marks · 35 min</span><span class="chip acc">Ready to run</span></div></div><div class="box"><div class="row"><span class="grow">Radians check · 8 marks</span><span class="chip">To mark</span></div></div></div>''',
  note=""),
]
