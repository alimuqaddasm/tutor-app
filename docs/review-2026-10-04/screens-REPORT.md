# Tutor Desk QA report: every screen except Teach and the student exam page

Date: 2026-10-04 (4 Oct 2026 is a Sunday, not a Saturday; the app shows "Sunday 4 October", which is right).
Scope: Lessons home, Plan view and its parts, Record, Revise, Videos, Settings, Log without a script, Suggest a change, Try-out, make-up minutes, service worker and versions, sidebar, theme.
Environment: app at localhost:8765, Chromium via Playwright, pretend GitHub (fakegh.py) serving the local clone; cdnjs routed to local copies by the harness after the coordinator's fix. YouTube not reachable. Service worker never registers over http, so sw.js was checked by reading.
Scripts, logs and screenshots: this folder (s1a_save.py ... s15_rail.py, *.log, *.png, measure.json).

Totals: 303 automated checks. 13 findings listed as bugs below (after discounting harness mistakes). All 128 screen-size checks passed for sideways scroll and script errors.

## 1. Checks

| Area | Check | Result |
|---|---|---|
| Save | Verdict, note, marks, clock start, step tick, phase change land in ONE session.json PUT after the 4 s debounce; all fields correct | PASS |
| Save | Extra question saved (text, verdict, note) | PASS |
| Save | 3000x4000 JPEG shrunk to 1800x2400 (81 KB); PDF byte for byte; work[] carries item, kind, note | PASS |
| Save | Wrong file type: plain message, no upload, button re-enabled | PASS |
| Save | Finish: status finished, feedback, clock ended, minutes, one PUT, toast, Save changes + Reopen | PASS |
| Sync | Offline mid-save: in-flight PUT lands, later taps wait, nothing attempted offline, one PUT on reconnect, nothing lost | PASS |
| Sync | 409 forever: re-read + one retry, red "Not saved · kept on device", silent retry 12 s / 25 s, recovers | PASS |
| Sync | 500 forever: red status, retry every 25 s, recovers | PASS |
| Sync | Two tabs same browser: storage event within 1 s; later tap wins on the same item; start in one, pause in other = start, pause | PASS |
| Sync | Two devices: 409 merge keeps both devices' verdicts, clock, pause, tick | PASS |
| Sync | Two devices: merged `devices` lists both | FAIL (bug 3) |
| Sync | Two devices: tablet screen redrawn after a merge | FAIL (bug 2) |
| Sync | Refresh with unsaved changes: copy comes back and is pushed later | PASS |
| Sync | Back button mid-save: home draws, save lands | PASS |
| Rapid | Double tap un-sets a verdict (by design, see UX A) | PASS |
| Rapid | 7 fast clock taps: button right, but log says start,pause,start,... | FAIL (bug 9) |
| Rapid | Fast rail taps, double Add, double Upload, double Finish, fast theme taps | PASS |
| Make-up | Real data: no pending ask; owed 135 + 45 - 13 - 0 = 167 everywhere | PASS |
| Make-up | Untaught lesson: ask, "No, I missed it" writes correct makeup.json (entry, id, existing kept, newline), card 212, lesson moved | PASS |
| Make-up | He missed it: 45 / 0 min entries; try-out writes nothing; 500 rolls back; make-up lesson of 50 min gives 117 | PASS |
| Make-up | "Yes: finish logging it" then Finish without minutes: same ask returns | FAIL (bug 7) |
| Revise | 27 due matches a by-hand pass; Got it / Still wrong schedule and history right; one PUT; bad line skipped; Plan warm-up writes review.json; conflict merge; try-out writes nothing | PASS |
| Revise | Schedule: 1, 3, 7, 14 days then mastered; day 30 never used | PASS (UX H) |
| Revise | Sidebar badge only after home | FAIL (bug 10) |
| Revise | Offline after a visit: "Couldn't load his mistakes" | FAIL (bug 6) |
| Record | 5 lessons, 4.2 h, 83 %, 27 open match by hand; test result appended, existing lines kept; profile renders | PASS |
| Record | Broken session.json counted as 0-minute lesson silently | FAIL (bug 11) |
| Videos | 48 / 197 rows, search, chips, player src, transcript seek, Close, missing videos.json | PASS (playback untestable) |
| Settings | Empty fields default; Save and test; font reload; Clear cache; Remove key; Install button | PASS |
| Theme | Auto/Light/Dark cycle on every route and exam.html; Auto follows a dark OS | PASS |
| Suggest | Open, point, tags, save line, byte-for-byte append, offline queue, 409 retry, try-out sends | PASS |
| Suggest | app stamp "v23" vs deployed v25 | FAIL (bug 12) |
| Errors | 19 routes, every Plan part of 4 lessons, broken script, GitHub 500/401: no script errors | PASS |
| Errors | Nonsense lesson id becomes a saved lesson folder | FAIL (bug 4) |
| New | New lesson for an existing date+subject merges into the scripted lesson | FAIL (bug 5) |
| Screens | 14 screens x 4 sizes x 2 themes: no sideways scroll, no errors | PASS |
| Screens | Rail hides 7 of 10 parts at 800x1280 and 9 of 10 at 390 | FAIL (bug 8) |
| Screens | Dark week strip TODAY contrast 1.55:1 | FAIL (bug 13) |
| SW | FILES vs index.html/exam.html ?v= all match; SHELL bumped every time | PASS |
| CDN | DOMPurify/KaTeX from cdnjs at start; without them raw tags and raw LaTeX | FAIL (bug 1) |

## 2. Bugs

### Bug 1. If cdnjs.cloudflare.com is blocked, lessons show raw HTML tags and raw LaTeX
Ali sees `<p>Sketch each...</p>` and `\(y = 2\operatorname{cosec} 2\theta\)` instead of formatted content on Plan, Teach and Student. Steps: block cdnjs (this sandbox did on the first runs), open any lesson. Severity: High (network dependent). Cause: index.html loads purify.min.js from cdnjs; clean() (app.js:11) falls back to esc() when DOMPurify is missing; KaTeX (loadKatex) same; the service worker caches cdn files only after a first successful load. Fix: ship purify and KaTeX in the repo and list them in sw.js FILES. Proof: coordinator's note and the first-run screenshots (superseded).

### Bug 2. After a two-device merge the Plan screen keeps the tablet's old verdict
Tablet taps Right on st9. Laptop taps Wrong on st9 (later) and saves via 409 merge. Tablet ticks a step; its save hits 409, merges (file now says Wrong), but the tablet still shows Right pressed until Ali navigates away. Severity: Medium (screen disagrees with the record; his next tap on Right would then un-set Wrong to null). Cause: app.js:171-173 flush() runs only `tick()` after merge(), not drawLesson(); the storage-event path (app.js:181-184) does redraw. Proof: s1b_sync.log "FAIL E: tablet's screen shows the laptop's verdict on st9 (wrong) after the merge [false]"; plan-tablet-after-merge-1366-light.png.

### Bug 3. merge() drops the local device from `devices`
Merged file after the laptop wrote it has devices: ["tablet"]. Severity: Low. Cause: app.js:136-149 merge() copies remote and never unions local.devices. Proof: s1b_sync.log "FAIL E: devices lists both [['tablet']]".

### Bug 4. Any mistyped or empty lesson id becomes a real lesson folder
`#/lesson/does-not-exist`, `#/lesson/`, `#/lesson/%2F%2F%2F` open a full Plan titled "Lesson"; one tap writes students/UK-1/lessons/does-not-exist/session.json with subject "" and date "", which then shows in Record and the home list. Severity: Medium. Cause: lessonView() builds newSession() for any id with no script/session (meant for Log without a script); parseId() returns empty fields and nothing rejects them. Fix: require /^\d{4}-\d{2}-\d{2}-(chem|maths)$/ for an unscripted id, else show "No such lesson". Proof: s12_misc.log first FAIL; lesson-does-not-exist-1366-light.png.

### Bug 5. Log without a script for a date that already has that subject's lesson silently merges into it
Ali types "Unscripted chem" for today (chem), ticks Make-up, presses Start logging: lands on today's scripted chemistry lesson, his title is gone from the screen but written into that lesson's session.json, and the make-up flag now sits on the scripted lesson (changes the counter). Severity: Medium. Cause: newform submit builds id = date-subject and stores a dirty local copy under localKey(id); lessonView merges it over the existing lesson. Fix: if the id exists in the tree, say so and open it, or add a suffix. Proof: s12_misc.log "new lesson route: #/lesson/2026-10-04-chem | title: Every reaction condition..." and "FAIL 'new' on an existing scripted lesson did not overwrite ... [Unscripted chem]".

### Bug 6. Revise and the Plan's Mistakes warm-up do not work offline even when everything is cached
After using the app online, with GitHub down: home and opened lessons draw from cache, but Revise shows "Couldn't load his mistakes · GitHub 500", the Plan warm-up part too, and the home warm-up card says "Couldn't load the mistakes list". Settings promises offline use. Severity: Medium (daily 5-minute warm-up). Cause: loadRevise() calls loadTree(force) which goes to the network when the tree is older than 20 s and rejects on failure; no fallback to the cached TREE unlike lessonsView/lessonView. Proof: s13_more.log FAIL line.

### Bug 7. "Yes: finish logging it" then Finish without minutes asks the same question again
For an untaught-looking lesson the home asks "Was Sat 3 Oct's lesson taught?". Yes opens the plan's first part (not After the lesson or Times); Finish and save with no minutes; back home the same ask appears with no explanation. Severity: Medium (the natural reaction is "No, I missed it", adding 45 min wrongly). Cause: taughtOK() (app.js:296) needs minutes > 0; Finish does not warn when minutes is null; the Yes link targets the plan root. Proof: home-ask-after-finish-no-minutes-1366-light.png; s12_misc.log.

### Bug 8. Tablet portrait and phone: the phase rail hides most parts
At 800x1280 the rail strip shows parts 1 to 3 only; Mistakes warm-up, Extra, His work, Times and After the lesson (Finish) are off to the right with no arrow or scrollbar. At 390 only one part shows. Rail scrollWidth 2360 vs clientWidth 768 / 358. Severity: Medium for teaching in portrait. Cause: app.css @media (max-width:900px) rail overflow-x:auto without an affordance. Proof: plan-800x1280-dark.png, plan-390x844-light.png, rail-scrolled-800x1280.png, s15_rail.py output.

### Bug 9. Pause then Resume within the same second logs "start" again
Clock history reads Started, Paused, Started... Minutes still right. Severity: Low. Cause: clkgo handler uses `r2.secs ? "resume" : "start"`; secs is whole seconds. Proof: s2_rapid.log.

### Bug 10. Revise badge appears only after the home page has drawn
Open the app straight on Revise or a lesson: no "27" badge. Severity: Low. Cause: revBadge() only called from fillHomeRevise(). Proof: s12_misc.log.

### Bug 11. A broken session.json counts as a lesson with 0 minutes on Record, silently
"5 lessons logged, 3.3 hours, 86 %" with no warning. Severity: Low. Cause: recordView keeps ids whose fileJSON failed. Proof: s5_record.log.

### Bug 12. Suggestions stamped app "v23", deployed app is v25
Severity: Low. Cause: app.js:1383 APP_VERSION not bumped. Proof: s8_suggest.log.

### Bug 13. Dark week strip "TODAY" contrast 1.55:1
Amber 10 px text on a near-white today cell. Severity: Low. Cause: app.css:415 `.wd.today .dots{color:var(--amber)}` on var(--ink) which is light in dark mode. Proof: week-strip-dark.png, measure.json.

## 3. UX and design observations

A. Verdict double tap un-sets the verdict with no toast; the tally that reflects it is far below the question. Suggest a "Verdict removed" toast or ignoring a second tap within 400 ms.

Home (home-1366x768-light.png, home-1280x800-dark.png, home-390x844-light.png, home-view-390x844-dark.png): clear hierarchy, one tap to Teach. The make-up owed figure appears three times at 1366 and twice stacked on the phone. Week strip dots are 8 px with no legend; "TODAY"/"OFF" 10 px. On the phone the fixed bottom nav covers 70 px and the sidebar block takes 250 px before content. Loading text at once; warm start draws in 0.35 s before GitHub answers. Error screen shows raw `GitHub 500: {"message": ...}` under a clear title (error-github-down-home-1366-light.png).

Plan (plan-1280x800-light.png, plan-800x1280-dark.png, plan-390x844-light.png, plan-m2-view-800x1280-light.png, plan-times-800x1280-light.png, plan-after-1280x800-dark.png): good rail with planned minutes and x/y done; big verdict buttons. Tap targets under 44 px on tablet sizes (measured): tick circles 36 px, verdict buttons 42 px, small buttons 40 px (Start lesson, Edit times, Show him, Suggest, Try-out, theme), subject switch 36 px, chips 40 px (rating 1 to 5, filters), checkboxes 20 px, breadcrumb link 24 px tall. Marks box for a two-part question gets max="4 + 4" (invalid), shows "/ 4 + 4", accepts 12. Contrast fine (hint 4.81:1 light / 5.83:1 dark, label 4.70:1, pill 4.39:1 lowest on the green Logged pill, save 5.23:1). Text under 14 px: pills/labels 13 px, rail subtitles 13 px, ASK/SAY 11.2 px, CORE/DEEP 10.9 px. Save status only in the sidebar footer; on the phone it scrolls away, so a failed save is invisible mid-lesson (only 401/403 toasts). Finish sits at the bottom of a long form. The try-out bar covers "Open the plan" and the theme button at 1280x800 (tryout-1280x800-light.png). Empty states for Extra and His work are clear; Times has a two-tap guarded reset.

Record (record-1366x768-light.png, record-view-390x844-light.png, record-table-390x844-light.png): totals right; on the phone the time log table scrolls sideways inside its card (628 px in 356) and lesson titles wrap to three lines. Mistakes list complete; test form validates; profile renders.

Revise (revise-1366-light.png, revise-390x844-dark.png): clear card, two taps per mistake, good toasts. 27 due with 20 first-timers makes the "5-minute warm-up" a 27-question session; no "do 5" cap. H: header says day 1, 3, 7, 14 and 30 but items are mastered after the day-14 pass (GAPS has 5 entries, box >= 5 is done); wording or code is off.

Videos (videos-1366x768-dark.png, videos-playing-1366-light.png): grouped by topic with durations and transcript pills, debounced search keeps the caret, transcript lines seek the player. Playback unverified. Sidebar subject and video chips can disagree without a hint.

Settings (settings-800x1280-light.png, settings-nokey-1366-light.png): plain and complete; the Teach layout explanation is dense. Remove key leaves tree and lesson copies on the device (fine).

New (new-390x844-light.png): the Start button hides under the phone bottom nav until scrolled.

Suggest a change (suggest-panel-1366-light.png, suggest-390x844-light.png, suggest-list-open-1280-light.png): Point at it works without triggering the control; replies shown in green. The failure toast says "(no connection)" even when the cause was a write conflict.

Try-out (home-tryout-1366-light.png, tryout-1280x800-light.png): dot, panel and Leave work; nothing written in any try-out check except suggestions, as intended.

Light and dark consistent on every screen; dark background is rgb(13,15,30) (token block at app.css:363 overrides :15). exam.html follows tutor.theme.

## 4. Speed numbers

Cold home (new profile): 1.23 s to tiles; 16 requests: 1 tree (161,676 bytes, recursive tree of the whole repo) + 15 blobs: 7 script.json (288 KB, largest 76 KB), 5 session.json (50 KB), mistakes.jsonl 13 KB, review.json 1.2 KB, makeup.json 0.8 KB. Total 515,146 bytes. Every script.json is downloaded for the home page although only title, summary, status, date are used. The 161 KB tree is fetched again on every visit to home, Record, Revise, Videos, the Suggest panel and once under every opened lesson.
Warm home: 0.35 s to tiles with GitHub answering nothing (localStorage tree + IndexedDB blobs); then 1 request (tree). Maths plan after home: 0.10 s, then 28 picture blobs (2.57 MB) prefetched in the background. Record after home: 0.10 s, 4 blobs (168 KB).
Slow network, cold, with real request overlap: 2 s round trip: tiles 6.3 s (3 round trips), warm-up card 8.3 s; 5 s: tiles 15.3 s, warm-up card 20.2 s. Lesson opened first on a fresh device: "Opening the lesson" at once, plan after 2 round trips. Record: "Loading his record" at once, 1 to 2 round trips. A tap on a 5 s network: "Kept on device" at once, "Saving..." after 4 s, "Saved" 5 s later. No blank or stuck screen. (s9_speed.py's 30 s / 75 s figures were the harness blocking on time.sleep; redone in s9b_delay.py.)

## 5. Service worker and versions (by reading; could not run over http)

FILES: ./, index.html, app.css?v=24, app.js?v=25, exams.js?v=2, exam-config.js?v=2, exam.html, exam.js?v=2, exam.css?v=2, manifest, icons, logo.svg. index.html loads app.css?v=24, exam-config.js?v=2, app.js?v=25, exams.js?v=2; exam.html loads app.css?v=24, exam.css?v=2, exam-config.js?v=2, exam.js?v=2. All match. SHELL bumped in every commit touching a versioned file: v24 e572238, v25 1034f7f, v26 ef5fceb, v27 f35b966 (app.js 24 to 25). app.css last changed in e572238 (bumped to 24 there), so 24 is right.
Strategy: own files network first with cache:"no-cache" and shell-cache fallback (then index.html); fonts and cdnjs cache first forever in tutor-cdn; api.github.com untouched; updateViaCache none, reg.update() on each return to the screen, skipWaiting, old tutor-shell-* caches deleted on activate, clients.claim.
Old tablet after a deploy: next open online fetches the new index.html and new app.js?v=25 from the network at once, new worker installs in parallel; offline it keeps the old consistent shell. Harmless window; fetch handler is version agnostic. tutor-cdn is never pruned (fine while CDN URLs carry versions; Google Fonts CSS is cached forever). cdnjs files are not in FILES, see bug 1. APP_VERSION "v23" (bug 12).

## 6. Not tested
Service worker execution; the real install prompt (simulated); YouTube playback; real GitHub latency, limits and concurrent commits by Claude; touch gestures and rotation mid-lesson; the Samsung tablet's own browser. The data clone is on branch claude/tutor-desk-review-ranwq1, not main. No file in /home/user/tutor-app or /home/user/tutoring was modified.
