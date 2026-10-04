# Tutor Desk review, 4 October 2026

Full page with pictures and sketches: `report.html` in this folder (open it in a browser). Helper reports: `exams-REPORT.md`, `screens-REPORT.md`. Test scripts: `tests/review/`. Work plan: `NEXT-STEPS.md`.

## Summary
**The good news.** The part you use every lesson, Teach in Flip, is solid. I hammered it with rapid taps, double taps, refreshes mid-lesson, going offline and back, GitHub failing, two tabs at once and a conflicting save from another device. Nothing was lost. Every tap reached the pretend GitHub, in order, once.

**What needs fixing first.** Three things could hurt a real lesson:

- **Notes you wrote for yourself are hidden in Flip.** A "Note for you" that sits before a question goes on the back of the card, so you only see it after pressing Show answer. Today's maths script has the "Toolkit before he starts" note in exactly that spot.

- **The whole app leans on an outside server (cdnjs) at start.** If it is slow, the app waits for it. If it is unreachable, every lesson shows raw code instead of text and maths. Two small files should live in your own repo instead.

- **Preview still records verdicts.** The yellow bar says nothing is recorded until you press Start lesson, but a verdict tap in preview is saved and the lesson flips to In progress.

**The design story.** Your own complaint is right: Flip puts a one-line question in a big empty card and hides a one-line answer. The fix is not a new layout. It is a rule: short answer, show it under the question; long answer or a picture, keep Flip. Exam question pictures and mark schemes are also drawn too small for the space.

**Your real set-up has a gap.** You teach from the laptop and share the tablet's Student view over Meet. The tablet cannot follow what you are showing, because the link between Teach and Student view only works inside one browser. A "follow" mode across devices would remove a lot of tapping on the tablet.

**Speed.** The lesson side is not slow by design: with a typical GitHub delay the home page is up in about 1.6 seconds and all of today's pictures are cached about 3.5 seconds after Teach opens. The slow feeling comes from first visits (every picture is a separate GitHub call) and from the Exams tab, which waits for several server round trips before it draws anything. Both have cheap fixes.

**Exams** were tested end to end against a local copy of the exam server: 251 checks. The server logic held up (timer across refresh and clock drift, extensions, late answers, uploads, hand in, lock and reopen). Two things must be fixed before the first real exam: a rejected save is thrown away while the page says "Saved", and one hung request can stop saving for the rest of the exam. Both are in the bug list.

## How the app fits together
Everything starts in the tutoring repo on GitHub: Claude writes `script.json`, the app writes `session.json`, photos and results next to it. The app keeps no data of its own, only a cache on each device.

**Lessons (home)** Today's date, the week strip, "up next" for each subject, the warm-up card, make-up time, recent lessons.Goes to: Teach, Plan, Revise, Log without a script

**Plan** The whole script as one page: parts on the left rail, clock at the top. Also holds Mistakes warm-up, Extra questions, His work (photos), Times, After the lesson.Goes to: Teach, Student view, After the lesson

**Teach** The script one screen at a time. Outline on the left, clock and position at the top, Taught / Skip / Next at the bottom. Question screens use the layout you picked: Flip (default), Side panel, Floating card or Classic.Goes to: Student view (new tab), warm-up overlay, Show him, After the lesson

**Student view** Questions only, no answers. Exam questions as pictures, quick questions as text. Follows "Show him" only inside the same browser.You open it on the tablet and share it over Meet

**Revise** His logged mistakes on a day 1, 3, 7, 14, 30 schedule. The same thing appears as a card on the home page, a part in Plan, and the Warm-up button in Teach.

**Record** Hours taught, answers right, the mistakes list, test results, his profile.

**Videos** The lecture list from `videos.json`, played in the app, with transcripts where downloaded.

**Exams** Teacher side: load an exam Claude wrote to the exam server, set the time, make the student link, Start, + minutes, Lock, then Mark and save results back to the repo. Student side: `exam.html` with the timer, answer boxes, pictures, drawing, phone upload. Phone page: one question, camera only.

**Settings** GitHub key, repo, device name, student, exam server and password, text style, Teach layout, hint folding, install, clear cache.

**Everywhere** Suggest a change (saves a note for Claude), Try-out (a tab that saves nothing), light/dark switch, the save status in the corner.

**Your lesson in the app, as it is today:** Meet on, open the app on the laptop, Teach ▶ on the up-next tile, pick the quiz set, Start lesson, move with Next / Taught / Skip, tap a verdict on each question, Show answer when needed, Show him for a picture, upload his WhatsApp photos under His work, then End of the script, After the lesson, Finish and save. On the tablet: Student view open and shared, moved by hand.

## Test results
I ran every existing test on a copy of your data. Three environment limits applied here: this sandbox cannot reach cdnjs (so I served DOMPurify, KaTeX and the QR library from local copies), cannot reach YouTube, and four checks were written against the data as it was on 2 October, which has since changed. Those are marked "env", not bugs.

| Test | Result | Note |
|---|---|---|

| worker: npx vitest run | 34 of 34 pass | timer, extensions, time up, autosave, uploads, access |

| test_exam.py (student + phone page) | 32 of 32 pass | maths and QR pass once the libraries are reachable |

| test_exams_tab.py (teacher side) | 33 of 33 pass |  |

| test_exams_tryout.py | 26 of 26 pass |  |

| test_teach.py, test_tryout.py, test_suggestions_1oct.py | pass | no failures, no script errors |

| test_bugs_round10.py | 24 of 24 pass | exit code 1 only because of font certificate warnings in this sandbox |

| test_round12 to round15 | all pass | 13, 6, 15, 8 checks |

| test_round11.py | 18 pass, 2 env | the two failing checks expect the data of 2 October (1 Oct maths still untaught, make-up at 170) |

| test_round16.py | 1 pass, 1 env | same: expects the week strip of 2 October |

| stress.py | could not finish | written for the Classic layout; it waits for a verdict button that Flip puts in the bottom bar |

My own new checks: 71 on Teach and the Student view, plus the exam and screen checks in the sections below. A test harness that serves your local clone as a pretend GitHub now exists; I propose adding it to `tests/` so the suite runs anywhere without a GitHub token.
### Speed, measured

| What | No delay | 350 ms per GitHub call (typical) |
|---|---|---|

| Home page, cold cache | 0.5 s, 16 requests | 1.6 s |

| Teach first screen (after home) | 0.1 s | 0.1 s |

| All 43 pictures of today's maths lesson cached | +1.0 s | +3.5 s |

| Teach reload, warm cache | 0.3 s | 0.3 s |

So the lesson side is quick once the device has seen the lesson. The slow moments are: the first open of a new script on a device (one GitHub call per picture, four at a time), the first maths screen (KaTeX comes from cdnjs, about 300 KB), and the Exams tab (see the exam bugs). The home page also downloads the whole file list of the repo (about 1,300 files) on every visit.

## Bugs, worst first

### Bug 1. Flip hides 'Note for you' on the back of the card (High)
Where: Teach, Flip layout

**What you see.** A note that comes just before a question (for example today's "Toolkit before he starts" box in Set 6 Q15 to Q18) does not show on the question screen. It appears only after you press Show answer, folded shut under the heading.

**How to repeat it.** Open 2026-10-04-maths in Teach, go to the Solomon C3 starter question (or Q15). The screen shows the question only. Press Show answer: a collapsed "Note for you" is on the back.

**Why it matters.** Your own teaching cues disappear exactly when you need them, before he starts. In Side panel and Floating card the note is also moved into the answer panel, folded.

**Likely cause.** `applyFlip()` in app.js moves every `.tnote` into the answer side and closes it (line ~1234: `$$('.tnote', cur).forEach(n => { n.open = false; ans.appendChild(n); })`). `applyFit()` does the same for the other layouts.

**Proof.** Screenshot below: the note is on the answer side. The script check found two such notes in today's maths script.
- Screenshot: `screens/maths-examq.png` (Question side: no note)
- Screenshot: `screens/maths-examq-answer.png` (Answer side: the note is here, folded)

### Bug 2. The app depends on cdnjs to show any lesson text (High)
Where: Start-up, every screen

**What you see.** If cdnjs.cloudflare.com is slow, the app waits for it before it draws anything. If it cannot be reached (blocked network, outage, first visit offline), every answer and note shows as raw code with angle brackets, and maths shows as backslash text.

**How to repeat it.** Block cdnjs.cloudflare.com (or open the app on a network that blocks it) and open any lesson in Teach. Press Show answer.

**Why it matters.** One outside server can make a whole lesson unreadable. Your service worker caches the library after the first successful load, so it bites on a fresh device, after Clear cache, or when the cache was evicted.

**Likely cause.** index.html loads `purify.min.js` from cdnjs as a deferred script before app.js, so app.js waits for it. `clean()` in app.js falls back to `esc()` when DOMPurify is missing, which prints the HTML as text. KaTeX and the QR library come from the same host.

**Proof.** Screenshot taken in this sandbox before I served the libraries locally.
- Screenshot: `screens/teach-03-answer-side-nocdn.png` (Answer side with cdnjs unreachable: raw code instead of the worked answer)

### Bug 3. Exam: a rejected save is thrown away and the page still says "Saved" (High)
Where: Student exam page

**What you see.** He types a very long answer (over 50,000 characters) or one save gets any 4xx answer other than 409 or 429. A toast flashes for 3 seconds, then the label goes back to "Saved 4:06 pm". If the page reloads (phone sleep, accidental refresh) the box comes back with the older server copy and everything since is gone.

**How to repeat it.** Start an exam, paste 55,000 characters into a long answer, wait 3 s, read the label, reload.

**Why it matters.** He is told his work is safe when it is not. Rare, but exam work is the worst thing to lose.

**Likely cause.** exam.js line ~209 marks the draft clean on any 4xx; the save label has no "not saved" state; the next load overwrites the clean draft with the server copy. There is no character count or limit hint on the box.

**Proof.** Screenshot below; checks 2b and 2j in the exam results.
- Screenshot: `screens/s2-413-label.png` ("Saved" under the toast "This answer is too long.")

### Bug 4. Exam: one request that never answers stops saving or polling for the rest of the exam (High)
Where: Student exam page, also the teacher page

**What you see.** On a flaky connection one request hangs with no reply. From then on the label says "Saving" for ever and nothing new reaches the server, though the page looks alive. If it was the clock poll that hung, +5 min, lock and hand-in never arrive; the timer keeps counting on its own.

**How to repeat it.** Hold one save request open with a proxy (faultproxy.py in the exams folder), let the rest through, type more, wait 45 s.

**Why it matters.** Mobile black holes and captive portals do exactly this. A reload fixes it, but he does not know he needs one.

**Likely cause.** fetch has no timeout; `flushing` and `sending` flags are cleared only when the request settles; `poll()` reschedules itself only after a reply. Same pattern in exams.js poll().

**Proof.** Checks 2k in s2c_saving.results.json; s2-hung.png.
- Screenshot: `screens/s2-hung.png` ("Saving" that never ends)

### Bug 5. Preview records verdicts and marks the lesson In progress (Medium)
Where: Teach, before Start lesson

**What you see.** The yellow bar says nothing is ticked until you press Start lesson. Tap a verdict while rehearsing and it is saved to GitHub, the lesson becomes In progress, and the home page shows it that way.

**How to repeat it.** Open a lesson in Teach without starting the clock, go to any question, tap Right. Watch the corner: Kept on device, then Saved. Reload the home page: the lesson says In progress.

**Why it matters.** Rehearsing a script before the lesson pollutes his record. Try-out mode avoids it, but the bar promises something it does not do.

**Likely cause.** The verdict handler (`data-v` click in app.js) calls `save()` and `touch()` without checking `live()`; `touch()` moves status to in-progress on any change. Only step ticks are gated on the clock.

**Proof.** Check "preview mode: a verdict tap is saved" in hunt_teach.py passed, and the saved session.json held the verdict with status in-progress.
- Screenshot: `screens/teach-02-question-flip.png` (The preview bar while a verdict is being recorded)

### Bug 6. Question pictures and mark schemes are drawn small (Medium)
Where: Teach (Flip), Show him

**What you see.** An exam question picture sits in a box about 560 px wide inside an 850 px stage, with empty space around it. On the back, the mark scheme picture is about 320 px wide. Show him puts the picture at its natural size in the middle of a black screen, about half the width.

**How to repeat it.** Open 2026-10-04-maths in Teach, Solomon C3 starter. Compare the picture width with the card. Press Show answer. Press Show him.

**Why it matters.** You and he read these over Meet. Small crops are hard to read; the space is there.

**Likely cause.** Images are `width:auto; max-width:100%` so a small crop never grows. In Flip, `.qcard` adds a nested card and padding, and `fitQ()` only shrinks, never grows. The answer side splits text and picture 50/50 even when the text is one line (`.two` class).

**Proof.** Screenshots below.
- Screenshot: `screens/q14-answer-tablet.png` (Tablet, 1 Oct maths, Set 6 Q14: two mark-scheme pages as 150 px thumbnails beside a squeezed column of text (this screen also scrolls by 10 px, found by test_round15))
- Screenshot: `screens/maths-examq.png` (Question picture uses about half the stage)
- Screenshot: `screens/chem-04-showhim.png` (Show him: natural size in a 1366 px screen)

### Bug 7. Student view on the tablet cannot follow your Teach screen (Medium)
Where: Student view on a second device

**What you see.** "Show him" reaches a Student view tab only in the same browser. Your tablet is another device, so the tablet never changes; you walk over and swipe it yourself.

**How to repeat it.** Open Teach on the laptop and Student view on the tablet. Press Show him on the laptop: the tablet stays where it was.

**Why it matters.** This is your real set-up every lesson. It costs taps and attention at the moment you are asking a question.

**Likely cause.** `showHim()` uses a BroadcastChannel, which only reaches tabs of the same browser profile on the same device. There is no shared pointer for "what is on screen now".

**Proof.** Check "Student view on another device does not follow Show him" in hunt_teach.py: the second browser context stayed at question 1 of 10.
- Screenshot: `screens/student-03-tablet-landscape.png` (The tablet Student view, waiting to be swiped)

### Bug 8. A mistyped lesson address creates a real lesson in his record (Medium)
Where: Any #/lesson/… address

**What you see.** Open #/lesson/does-not-exist (or an empty id) and you get a full Plan page called "Lesson". One tap saves students/UK-1/lessons/does-not-exist/session.json with no subject and no date, and it then shows in Record and on the home page.

**How to repeat it.** Type #/lesson/typo at the end of the address, tap a verdict or Start lesson, wait 4 s.

**Why it matters.** A stray tap from an old bookmark or a mistyped link quietly adds a lesson with empty fields to his record.

**Likely cause.** `lessonView()` builds a new session for any id that has no script or session; `parseId()` returns empty subject and date without complaint.

**Proof.** Screenshot below; the pretend GitHub received the write.
- Screenshot: `screens/lesson-does-not-exist-1366-light.png` (A Plan page for a lesson that does not exist)

### Bug 9. "Log without a script" for an existing date and subject merges into the scripted lesson (Medium)
Where: #/new

**What you see.** Log a lesson for 4 Oct maths when a 4 Oct maths script exists: your typed title lands in that script's session.json, the screen shows the script's title, and the make-up tick you set applies to the scripted lesson.

**How to repeat it.** Lessons, Log without a script, today's date, Maths, any title, Start logging.

**Why it matters.** Silent mixing of two lessons' records and a wrong make-up counter.

**Likely cause.** The new-lesson form stores a dirty local copy under the same key as the scripted lesson (date-subject) and `lessonView()` merges it.

**Proof.** s12_misc.log in the screens folder: the typed title appears in the scripted lesson's session.json.

### Bug 10. "Yes: finish logging it" can loop back to the same question (Medium)
Where: Home page, make-up asks

**What you see.** On "Was Sat 3 Oct's lesson taught?" you press Yes, land on the first part of the plan (not on Times or After the lesson), press Finish without minutes, and back home the same question is asked again with no explanation. The natural next tap is "No, I missed it", which wrongly adds 45 minutes.

**How to repeat it.** Any past lesson without minutes: Yes, finish logging it, then Finish and save, then back to home.

**Why it matters.** Wrong make-up time, and confusion about what the app wants.

**Likely cause.** A lesson counts as taught only with minutes above zero (`taughtOK()`), but Finish never asks for minutes and the Yes button opens the plan's first part.

**Proof.** Screenshot below.
- Screenshot: `screens/home-ask-after-finish-no-minutes-1366-light.png` (The same ask returns after Finish)

### Bug 11. On the tablet held upright, five parts of the Plan are off screen with no hint (Medium)
Where: Plan on 800 px wide

**What you see.** The parts strip shows parts 1 to 3; Mistakes warm-up, Extra questions, His work, Times and After the lesson (where Finish lives) are off to the right with no arrow or scrollbar.

**How to repeat it.** Open any Plan at 800x1280 (portrait tablet) or on the phone.

**Why it matters.** Finishing a lesson on the tablet means knowing to swipe a strip that does not look swipeable.

**Likely cause.** `@media (max-width:900px)` turns the rail into a horizontally scrolling strip with no affordance (app.css).

**Proof.** Screenshot below.
- Screenshot: `screens/plan-800x1280-light.png` (Portrait tablet: parts 4 onwards are hidden to the right)

### Bug 12. After a two-device merge the tablet keeps showing its old verdict (Medium)
Where: Plan on two devices

**What you see.** Tablet taps Right on a question. Laptop later taps Wrong and saves. The tablet's next save merges correctly (file says Wrong) but the tablet screen still shows Right until you navigate. One more tap on Right there would clear the verdict to nothing.

**How to repeat it.** Two browsers on the same lesson; tap different verdicts on the same item; tick a step on the first.

**Why it matters.** Rare in your set-up (the tablet shows the Student view, which does not write), but it is the one path that can undo a verdict.

**Likely cause.** After a 409 merge, `flush()` calls `tick()` but not `drawLesson()`; the same-browser storage path does redraw.

**Proof.** s1b_sync.log E and plan-tablet-after-merge-1366-light.png in the screens folder.

### Bug 13. Revise and the warm-up fail offline even when everything is cached (Medium)
Where: Revise, home card, Plan warm-up, Teach warm-up

**What you see.** Offline, the home page and lessons work from the device cache, but the warm-up says "Couldn't load his mistakes".

**How to repeat it.** Open the app, go offline, open Revise.

**Why it matters.** The warm-up is the first two minutes of your lesson. A blip in the connection removes it.

**Likely cause.** `loadRevise()` always refreshes the file list from GitHub when it is older than 20 s and gives up when that fails, instead of using the cached list.

**Proof.** s13_more.log in the screens folder.

### Bug 14. Exam: two tabs of the same link overwrite each other silently (Medium)
Where: Student exam page

**What you see.** He opens the link twice. Typing in tab 2 never updates tab 1's box. One keystroke in tab 1 later sends tab 1's old text and tab 2's answer is gone from the server, while tab 2 still shows it.

**How to repeat it.** Open the link in two tabs, type different text, wait 4 s, press one key in the first tab, read the marking page.

**Why it matters.** Silent loss of a whole answer; easy to do on a tablet by tapping the link twice.

**Likely cause.** `mergeAnswers()` updates the drafts but never the box on screen; the next keystroke sends the stale box with a higher sequence number, which the server accepts.

**Proof.** s2-twotabs-tab1.png and checks 2d.

### Bug 15. Exam: locked while text was unsent, the student is told "Your answers are saved" (Medium)
Where: Student exam page

**What you see.** He loses connection, keeps typing, you lock. When he is back online the page says the exam has ended and his answers are saved. The last text never arrived.

**How to repeat it.** Go offline, type, lock from the teacher page, go online.

**Why it matters.** He will not tell you he lost work because the page told him he did not.

**Likely cause.** The locked screen is static text; a 409 on save only re-polls; the unsent draft stays on the device with no message.

**Proof.** Check 4 in s4_handin.results.json; s4-locked.png.

### Bug 16. Exam: the student page waits on Google Fonts and cdnjs before it paints (Medium)
Where: Student exam page

**What you see.** When fonts.googleapis.com hangs the page paints nothing for 40 s. When cdnjs is blocked, questions show raw tags and raw maths and the QR dialog fails.

**How to repeat it.** Block or throttle those hosts and open the student link.

**Why it matters.** Exam day, student's home network: two outside services can blank the page.

**Likely cause.** exam.html loads the fonts stylesheet render-blocking and the three libraries only from cdnjs; `clean()` falls back to escaped text.

**Proof.** s5-no-cdn.png; first paint numbers in the exam speed table.
- Screenshot: `screens/s5-no-cdn.png` (Student page with cdnjs blocked)

### Bug 17. The verdict strip overflows at phone width (Low)
Where: Teach on a phone (390 px)

**What you see.** Partly and the ⋯ button are cut off on the right; the page scrolls sideways.

**How to repeat it.** Open any question in Teach on a 390 px wide screen.

**Why it matters.** You do not teach from the phone, so this is cosmetic, but it also hides the marks and note fields.

**Likely cause.** `.vstrip` does not wrap; `.ctl.big .vmain` is a fixed three-column grid.

**Proof.** Horizontal scroll check failed at 390 px in all four layouts; overflowing elements were `.ctl.big` and `.vmorebtn`.
- Screenshot: `screens/teach-lay-flip-phone.png` (Phone width: Partly and ⋯ are cut off)

### Bug 18. The ⋯ panel repeats the three verdict buttons (Low)
Where: Teach, Flip

**What you see.** Opening ⋯ shows Right, Wrong, Partly again, then Wording, Terminology, He didn't answer and the note field. Two rows of the same buttons.

**How to repeat it.** Open any question in Flip and press ⋯.

**Why it matters.** Confusing for a split second, and the panel takes more height than it needs, shrinking the question.

**Likely cause.** `applyFlip()` moves the whole `.ctl.big` (with `.vmain`) into the strip, and the "more" state shows `.vmore` under it; the CSS hides `.vmain` only in the folded state.

**Proof.** Screenshot below.
- Screenshot: `screens/chem-03-vmore.png` (The ⋯ panel)

### Bug 19. Small things (Low)
Where: Various

**What you see.** (a) Pause and Resume within the same second logs a second "start". (b) The Revise badge in the sidebar appears only after the home page has drawn. (c) A broken session.json counts as a 0-minute lesson on Record, silently. (d) Suggestions are stamped app "v23" while the app is v25. (e) In dark mode the word TODAY on the week strip is amber on near-white, contrast 1.55 to 1. (f) The merged session lists only the other device under "devices". (g) A question with marks written as "4 + 4" gets an invalid marks box that accepts 12.

**How to repeat it.** See the screens report for each.

**Why it matters.** Cosmetic or bookkeeping.

**Likely cause.** app.js clkgo handler; revBadge() only in fillHomeRevise(); recordView() catch; APP_VERSION constant; app.css week strip; merge(); ctl() max attribute.

**Proof.** Screenshot of the week strip below.
- Screenshot: `screens/week-strip-dark.png` (Dark mode: TODAY is hard to read)

### Bug 20. Exam: small things (Low)
Where: Student, phone and teacher pages

**What you see.** (a) After leaving the marking page with a comment just typed, a script error fires 1.2 s later (the comment is saved). (b) Closing the phone-QR dialog with Escape leaves the fast 2 s poll running. (c) The phone page never re-checks the exam state, so after a lock it still offers "Take a photo" and the upload then fails. (d) The open marking page never refreshes during a running exam, and "Save to tutoring repo" from it saves stale answers. (e) The waiting page says "He hasn't opened the link yet" next to "Last seen 12 s ago". (f) Duration 0 or empty on the setup page is silently ignored. (g) "Failed to fetch" reaches the student and you as a message.

**How to repeat it.** See the exam report for each.

**Why it matters.** Polish before the first real exam.

**Likely cause.** exams.js saveMark debounce; exam.js phone dialog close path; phonePoll() runs once; markView() fetches once; exams.js:238 10 s window; exams.js:300; raw error messages.

**Proof.** Checks 7, 9 and 3 in the exam results.
- Screenshot: `screens/s9-seen-contradiction.png` (Two sentences that disagree)

## Design and UX upgrades

### Upgrade 1. Short answers under the question, Flip only for long ones (small effort)
Your words: Flip makes sense for long questions, not for a one-line question with a one-line answer. Rule: if the question has no picture and the answer is under about 300 characters with no picture, show the answer in a tinted band under the question, revealed by the same Show answer key. Everything else keeps Flip.

- Now: `screens/teach-lay-flip-laptop.png` (A one-line question alone in a big card)
- Note: Same keys, same strip. The board sits beside the answer as a thumbnail that enlarges on tap, so you no longer lose the question when checking the answer.
- Sketch: see report.html, upgrade 1

### Upgrade 2. Picture-first exam questions (medium effort)
On an exam-question screen the picture is the question. It should fill the stage edge to edge, scaled up if the crop is small, with the label and source in a thin line above and hints as a small button in the strip rather than a box under the picture.

- Now: `screens/maths-examq.png` (Exam question with the crop at half size and hints taking a row)
- Note: The back of the card gets the same treatment: the mark scheme picture at full width, the text answer above it, the note folded under a small i.
- Sketch: see report.html, upgrade 2

### Upgrade 3. Follow mode: the tablet shows what you are showing (large effort)
Your real set-up is laptop for Teach, tablet for the student's screen over Meet. A small "now showing" pointer, kept on the exam server you already run (fast) or in session.json (slower), lets the tablet follow every Show him and every question screen you land on, with a Follow / Free toggle on the tablet so you can still swipe ahead.

- Now: `screens/student-03-tablet-landscape.png` (Student view today: moved by hand on the tablet)
- Note: Exam questions as pictures, quick questions as text, as now. The pointer carries lesson id, item id and a timestamp; the tablet polls every 2 seconds while following.
- Sketch: see report.html, upgrade 3

### Upgrade 4. Make Preview honest (small effort)
Either verdicts wait for Start lesson like ticks do, or the bar says so. I propose: in preview, verdict taps show a toast "Press Start lesson to record verdicts" and are not saved; the lesson only becomes In progress when the clock starts or you add an extra question or photo.

- Now: `screens/teach-02-question-flip.png` (Preview bar while verdicts are still being saved)
- Note: Try-out stays as the sandbox for playing with the app itself.
- Sketch: see report.html, upgrade 4

### Upgrade 5. A calmer Teach top bar (small effort)
During a lesson you need the clock, the position and Student view. Warm-up, Suggest and Try-out are start-of-lesson or after-lesson jobs. Group them under one ⋯ at the top right; keep the clock big, and show the part name and the "minute 12, 3 min behind" line next to it instead of only in the outline.

- Now: `screens/chem-kind-q.png` (Seven controls in the top bar during a lesson)
- Note: ⋯ opens Warm-up (with its badge), Suggest a change, Try-out, layout switch.
- Sketch: see report.html, upgrade 5

### Upgrade 6. One verdict strip, no duplicates, bigger taps (small effort)
⋯ should add only what is missing: Wording, Terminology, He didn't answer, Marks and the note. Outline rows are 32 px tall; on the tablet they should be 44 px. The three main verdicts stay 64 px.

- Now: `screens/chem-03-vmore.png` (⋯ opens a second row that repeats Right, Wrong, Partly)
- Note: Same keys 1 to 6 and 0 as today.
- Sketch: see report.html, upgrade 6

### Upgrade 7. Show him at full width, with a pointer (medium effort)
Scale the picture to the width of the screen (or the height, whichever fits), and let you tap or drag to leave a highlight ring the student sees on the tablet in follow mode. Dark background is right for Meet; the picture should fill it.

- Now: `screens/chem-04-showhim.png` (Show him: the crop at natural size on a black screen)
- Sketch: see report.html, upgrade 7

### Upgrade 8. Warm the cache for today's lessons from the home page (small effort)
When the home page finds today's lessons, start fetching their pictures in the background (four at a time, as Teach does) and show a small "ready to teach offline" tick on the tile. By the time you press Teach the pictures are already on the device. Also serve DOMPurify and KaTeX from your own repo so the first maths screen does not wait for cdnjs.

- Now: `screens/teach-01-first.png` (First open of a lesson: pictures arrive one GitHub call at a time)
- Sketch: see report.html, upgrade 8

### Upgrade 9. Home page: one make-up number, bigger week strip, phone nav that does not cover content (small effort)
The home page is clear and one tap from Teach, which is right. It repeats the make-up figure three times at laptop width and twice on the phone. The week strip is the best summary of the week but its dots are tiny and unlabelled. On the phone the sidebar block pushes the content down 250 px and the bottom bar covers the last 70 px of every page.

- Now: `screens/home-1366x768-light.png` (Make-up owed appears three times; the week strip dots are 8 px with no legend)
- Note: One make-up figure in the header, a legend under the strip, 12 px dots. On the phone, the sidebar becomes a single top row.
- Sketch: see report.html, upgrade 9

### Upgrade 10. A verdict that is removed should say so (small effort)
Tap Right twice on a tablet and the verdict is gone, with the only sign a small colour change. Show a toast "Right removed" and ignore a second tap within 400 ms, so a nervous double tap does not undo your mark.

- Now: `screens/chem-kind-q.png` (Tapping the pressed verdict again clears it silently)
- Sketch: see report.html, upgrade 10

### Upgrade 11. Student exam page: Hand in away from Next, bigger picture buttons, a visible time-up strip (small effort)
Under pressure he taps Next every minute. Hand in should not be its neighbour. Move Hand in to the top bar next to the save label, make the confirm dialog's Hand in the plain button and Keep working the accent one, lift Choose picture / Draw / Use phone to 48 px, and keep the time-up message in the sticky header so it never scrolls away. Add a small "characters left" hint near the 50,000 limit.

- Now: `screens/s4-390-bottombar.png` (Hand in sits 10 px from Next, the button he taps most)
- Note: What already reads well stays: the waiting screen, the offline label, "Working or notes (optional)".
- Sketch: see report.html, upgrade 11

### Upgrade 12. Exams tab: one list, plain states, instant first paint (medium effort)
Show one row per exam with a state chip (Ready to run, Waiting, Running, To mark, Marked) and draw the list from the repo at once, then fill the server part when it answers. The exam page should keep polling after a hung request (timeout and retry), and the marking page should refresh while the exam is open.

- Now: `screens/s7-list.png` (Exams split into "From Claude" and "On the exam server")
- Sketch: see report.html, upgrade 12

## Content organisation
The app has grown by rounds of suggestions, and it shows in the grouping: the same thing lives in several places, some names are technical, and the tablet has no obvious home.

### What I would change

- **Home becomes "Today".** One list in lesson order: Chemistry then Maths (or whichever is first), each with Teach ▶, the warm-up count and the script status. The week strip and the make-up card stay. Recent lessons move to a "Lessons" page with a search box.

- **Revise folds into the lesson.** The mistakes warm-up appears in four places today (home card, Revise tab, a Plan part, the Warm-up button in Teach). Keep two: the Warm-up step at the start of every Teach script, and a "Mistakes" section inside UK-1's record. Drop the Revise tab.

- **"Record" becomes "UK-1".** One page per student with tabs: Lessons, Mistakes, Tests, Profile, Make-up time. When a second student arrives, the sidebar gains a student switcher instead of more tabs.

- **Videos becomes "Library".** Videos today; the CGP book pages and the board library later. You said it is storage; name it that way.

- **Exams: plainer labels.** "From Claude" and "On the exam server" are how it is built, not what you do. Use "Ready to run", "Running now", "To mark", "Marked". One row per exam that moves between these states, instead of the same exam listed in two sections.

- **Student view gets a front door on the tablet.** Open the app on the tablet and the first thing offered is "Student screen for today's lesson", with follow mode on. Today you have to find the lesson, open Plan, then Student ↗.

- **Settings splits into "This device" and "Teaching".** Key, repo, device name, exam server and password, cache, install are device things. Text style, layout, hint folding and the lesson length (45 min) are teaching things.

- **Names inside a lesson.** "Plan" is the whole script; call it "Script". "After the lesson" is where you finish; call it "Finish and notes". "His work" becomes "Photos". "I skipped it" and "Skip" sit next to each other with different meanings; rename the question one to "Not asked".

### Proposed sidebar

**Today** Up next per subject, warm-up count, make-up time, week strip

**Lessons** Every script and log, newest first, with search and the subject switch

**UK-1** Lessons · Mistakes · Tests · Profile · Make-up

**Exams** Ready to run · Running · To mark · Marked

**Library** Videos (and later books and boards)

**Settings** This device · Teaching

**What is missing:** a homework tracker (what was set, was it done, from the After notes); a "last time" strip at the top of every script (last verdicts, last stuck point) so you do not need to open the old lesson; and an "in lesson" log of the WhatsApp photos tied to the question they answer, which you already do by hand under His work.

## Suggested order of work
Small batches, each with tests, each a pull request you merge. Nothing goes to the exam server or the live database without your say.

#### Batch 1: Safety first (small, one day)
- Bug 1: notes stay on the question side in every layout
- Bug 2: DOMPurify and KaTeX served from the repo, listed in the service worker
- Bug 3: preview does not record verdicts
- Bug 6: verdict strip wraps on narrow screens
- Add the pretend-GitHub harness to tests/ so the suite runs anywhere

#### Batch 2: Flip done right (small to medium, two to three days)
- Upgrade 1: short answers under the question
- Upgrade 2: picture-first exam questions and full-size mark schemes
- Upgrade 6: one verdict strip, 44 px outline rows
- Upgrade 7: Show him scaled to the screen

#### Batch 3: Speed (small, one to two days)
- Upgrade 8: warm the cache for today's lessons from the home page
- Exams tab: draw the list from the repo at once and fill the server part when it answers; fewer round trips on the exam page
- Home page: ask GitHub only for the folders that changed instead of the whole file list

#### Batch 4: Follow mode for the tablet (large, about a week)
- Upgrade 3: the tablet follows your Teach screen and Show him
- Tablet front door: open straight into today's student screen

#### Batch 5: Exam fixes before the first real exam (small to medium, two to three days)
- Rejected saves keep the text and show "Not saved"; a character count near the limit
- Timeouts and retries on every exam request, student and teacher side
- Two tabs: the box follows the newest text; locked screen tells the truth about unsent text
- Fonts and libraries served from the repo so the student page paints at once
- Upgrade 11: Hand in moved, bigger picture buttons, sticky time-up strip
- Upgrade 12: one exam list with plain states; the marking page refreshes while the exam runs

#### Batch 6: Content organisation (medium, three to four days)
- Today, Lessons, UK-1, Exams, Library, Settings
- Renames inside the lesson
- Homework tracker and the "last time" strip
