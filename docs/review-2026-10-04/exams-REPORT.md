# Tutor Desk exam flow: stress test report (4 Oct 2026)

Environment: app at localhost:8765, local exam server (wrangler dev) at localhost:8787, Chromium via Playwright, pretend GitHub (fakegh.py, serving the local clone read-only), cdnjs served from local copies through fakegh (this sandbox cannot reach cdnjs.cloudflare.com or fonts.googleapis.com). Nothing touched api.github.com or the live worker. Scripts, logs, screenshots and per-check JSON are in this folder (s1_timer.py ... s9_extra.py, common.py, faultproxy.py).

Totals: 251 checks, 213 PASS, 38 FAIL. Of the 38 FAILs, 7 are harness artefacts (section 6), 16 are the same tap-target finding repeated per size and theme, and 15 are distinct product findings written up below.

## 1. Check table

| # | Area | Check | Result |
|---|------|-------|--------|
| 1a | Timer | Refresh mid exam: countdown continues within 2 s of the server; answer still there | PASS |
| 1b | Timer | Device clock +5 min / -5 min: timer still shows server time (within 2 s) | PASS |
| 1c | Timer | Offline 40 s while teacher adds +5: on reconnect timer, answer and banner all correct in 0.6 s, no manual online event needed | PASS |
| 1d | Timer | "Time is up" appears 0.1 s after the real end; banner says keep working; box stays open; late text flagged | PASS |
| 1d | Timer | +5 after time up: timer restarts at 5:00, "Your teacher added 5 min." banner, time-up banner removed; later text still flagged late | PASS |
| 1d | Timer | Second +5 while running reaches the student within one poll; banner still there 7 s later | PASS |
| 1e | Timer | Page opened for the first time after time up: Time is up, box open | PASS |
| 2a | Saving | 20,000 chars reach the server exactly (1.1 s) | PASS |
| 2b | Saving | 55,000 chars (server 413): label still says "Saved hh:mm" | FAIL (Bug 1) |
| 2b | Saving | 55,000 chars then refresh: text replaced by the old 20,000-char server copy | FAIL (Bug 1) |
| 2b | Saving | Shortening under 50k saves again | PASS |
| 2c | Saving | Offline mid-save, keep typing, back online: final text arrives exactly once | PASS |
| 2d | Saving | Two tabs: tab 2 sees tab 1's text on open | PASS |
| 2d | Saving | Two tabs: tab 1's box never updates after tab 2 types; one keystroke in tab 1 overwrites tab 2's work on the server | FAIL (Bug 2) |
| 2e | Saving | Refresh with unsent text (inside the 900 ms debounce): kept and sent | PASS |
| 2f | Saving | beforeunload handler blocks leaving when text is unsent, allows it when saved | PASS |
| 2f | Saving | Close the tab offline, reopen: text restored from the device and sent | PASS |
| 2f2 | Saving | Close right after typing (online): text still reached the server | PASS |
| 2g | Saving | Slow server (2 s per save), fast typing: last text wins | PASS |
| 2h/2i | Saving | 500 twice, then 429: retried, text arrives | PASS |
| 2j | Saving | A one-off 404 on a save: text dropped for good, label says Saved | FAIL (Bug 1) |
| 2k | Saving | One save request that never answers: nothing is saved again for the rest of the exam ("Saving" for ever) | FAIL (Bug 3) |
| 2k | Saving | One state poll that never answers: polling stops for good (+5 never arrives) | FAIL (Bug 3) |
| 3 | Pictures | 6000x6000 PNG: shrunk to 2000x2000 JPEG (24 KB), accepted in 1.0 s | PASS |
| 3 | Pictures | 1x1 PNG accepted | PASS |
| 3 | Pictures | .txt renamed .jpg, PDF, HEIC (with and without MIME type): refused with a clear message | PASS |
| 3 | Pictures | GIF and WebP: converted to JPEG and uploaded | PASS |
| 3 | Pictures | 21st picture: server 409, student told "already has 20 pictures", no card left waiting | PASS |
| 3 | Pictures | Remove asks first and removes | PASS |
| 3 | Pictures | Remove while offline: picture stays, toast reads "Failed to fetch" | PASS (UX 4) |
| 3 | Pictures | Picture chosen offline waits in the outbox, survives closing the tab, sent on reconnect | PASS |
| 3 | Pictures | Drawing: cancel with strokes asks first; add works (source drawing); empty drawing refused | PASS |
| 3 | Pictures | Phone page 390x844: opens, names the question, photo sent, appears on student page, teacher page counts it, marking page shows it | PASS |
| 3 | Pictures | Phone page after lock (reload): says not open | PASS |
| 3 | Pictures | Phone page learns about a lock without a reload | FAIL (Bug 8) |
| 4 | Hand in | Dialog warns "3 questions have no answer yet" | PASS |
| 4 | Hand in | With a picture still sending: warned, button disabled | PASS |
| 4 | Hand in | Offline with unsent text: refused in 0.5 s with a plain message, not submitted | PASS |
| 4 | Hand in | Offline with everything saved: toast reads "Failed to fetch" | FAIL (UX 4) |
| 4 | Hand in | Inputs disabled, "Handed in" timer, banner, attach and Hand in hidden, server submitted, later saves 409 | PASS |
| 4 | Hand in | Teacher reopens after hand in: student continues without refresh, typing saves, Hand in button back | PASS |
| 4 | Hand in | Lock then reopen: exam back, answer still there | PASS |
| 4 | Hand in | Lock while the student has unsent (offline) text: locked screen says "Your answers are saved" though the last text never arrived | FAIL (Bug 5) |
| 4 | Hand in | Hand in button at phone width is 10 px from Next | FAIL (UX 1) |
| 5 | Maths | KaTeX renders \( \dfrac{1}{2} \) and \[ \int_0^1 x\,dx \] on the student page (display maths on its own line) and on the marking page | PASS |
| 5 | Maths | Lists and bold survive DOMPurify; script and onerror stripped; broken maths does not blank the question | PASS |
| 5 | Maths | With cdnjs unreachable: raw `<p>` tags and raw LaTeX; QR dialog says it could not load | FAIL (Bug 4) |
| 6 | Screens | Student page running / time up / submitted / locked / hand-in / drawing / zoom / phone page at 1366x768, 1280x800, 800x1280, 390x844, light and dark: no sideways scroll | PASS (all 8 combos) |
| 6 | Screens | Timer stays on screen with the keyboard open (phone and tablet portrait) | PASS |
| 6 | Screens | Tap targets: Choose picture / Draw / Use phone 40 px high, Remove 32 px, drawing toolbar 40 px | FAIL x16 (UX 2) |
| 6 | Screens | Teacher list / exam / marking pages at all four sizes, both themes: no sideways scroll | PASS |
| 6 | Screens | Teacher setup page (waiting exam) at 390 px: sideways scroll | FAIL (UX 3) |
| 7 | Teacher | #/exams lists the real repo exam with its "why" | PASS |
| 7 | Teacher | Load to exam server: 2.1 to 2.4 s, all 7 pictures sent (358 KB) and shown, 29 marks, 35 min, ratio 1.2, types and text intact | PASS |
| 7 | Teacher | Suggestion maths: past papers (100+105 marks, 120+120 min) = 1.17 min/mark, 29 marks -> 35 min; own number 1.2 -> 35 min | PASS |
| 7 | Teacher | Setup duration 0, -5, abc: silently ignored (35 kept); 10000: server message shown | PASS (UX 6) |
| 7 | Teacher | Link, "he is waiting", Start confirm, 35:00, inputs disabled after start | PASS |
| 7 | Teacher | +5 and custom 2.5 work; custom 0 / -5 / abc refused by the page; 10000 refused by the server with its message | PASS |
| 7 | Teacher | 24 API calls per minute while running (one /live every 2.5 s) | PASS |
| 7 | Teacher | Server down 30 s: "Can't reach the exam server. Retrying." within 2.7 s; clock keeps running; clears on return (+5 meanwhile toasts "Failed to fetch") | PASS (UX 4) |
| 7 | Teacher | Two teacher tabs: +10 and lock propagate within a poll; reopen works | PASS |
| 7 | Teacher | Marking: 7 mark-scheme pictures from the repo; 9/7 and -1 refused ("0 to 7") and never sent; 3.25 saves; total 3.25 / 29 | PASS |
| 7 | Teacher | Comment autosave: on the server 1.24 s after the last keystroke; comment typed then page left at once still saved | PASS |
| 7 | Teacher | Save to tutoring repo: result.json + work/q1-1.png + work/q1-2.png to the pretend GitHub only; second save writes result.json only | PASS |
| 7 | Teacher | result.json content: scores, comment, final text, picture list, extensions, events, status | PASS |
| 7 | Teacher | Leaving the marking page mid-save: save finishes in the background; no confirmation anywhere | PASS (UX 7) |
| 7 | Teacher | Script error "Cannot read properties of null (reading 'value')" after leaving the marking page | FAIL (Bug 6) |
| 7 | Teacher | An open marking page never shows pictures or text added after it was opened | FAIL (Bug 9) |
| 7 | Teacher | Back button mark -> exam -> list; no stray /live polls afterwards; refresh on all three pages | PASS |
| 9 | Teacher | Waiting page says "He hasn't opened the link yet" and "Last seen 12 s ago" at once | FAIL (UX 5) |
| 9 | Student | After closing the phone-QR dialog with Escape, state polls run at 2 s + 3 s (7 in 12 s) for the rest of the exam | FAIL (Bug 7) |
| 9 | Student | Time-up banner on screen for a student scrolled down typing on a phone | PASS |
| 9 | Student | Picture sent after time up is flagged late | PASS |
| 8 | Speed | See section 4 | measured |
| 9 | Errors | No pageerror in scenarios 1 to 6 and 8; one in 7 and 9 (Bug 6) | see Bug 6 |

## 2. Bugs

### Bug 1. A rejected save is silently thrown away and the page then says "Saved" (High)
What the student sees: he types a very long answer (over 50,000 characters, or any save the server answers with a 4xx other than 409 or 429). A toast "This answer is too long." shows for 3 seconds at the bottom, then the top-right label returns to "Saved 4:06 AM". If he refreshes (or the tab reloads after a phone sleep), the box comes back with the old server copy and everything typed since is gone.
Steps: start an exam, type 55,000 characters into a long answer (or make one PUT /api/s/answers return 404), wait 3 s, read the save label; reload the page.
Severity: High. The 55k case is rare, but the same branch fires for any one-off 4xx, and the student is told his work is safe when it is not.
Likely cause: exam.js:209 `if (e.status && e.status < 500 && e.status !== 429) { d.dirty = false; toast(e.message); return; }` marks the draft clean; saveState() (exam.js:222-230) has no "not saved" state and shows "Saved" because nothing is dirty; mergeAnswers (exam.js:165) overwrites a clean draft with the server text on the next load.
Proof: s2-413-label.png (label "Saved" under the toast "This answer is too long."); checks "2b 55,000 chars: the save label warns..." and "2b after refresh the 55,000-char text is still in the box" in s2_saving.results.json (box had 20,000 chars after reload); "2j after a one-off 4xx the text is still sent later" in s2c_saving.results.json (server kept the older text, label "Saved").

### Bug 2. Two tabs of the same link overwrite each other without warning (Medium)
What the student sees: he opens the link twice (easy on a tablet: the link tapped again from the chat). He types in tab 2; tab 1 keeps its old text in the box. If he later types one character in tab 1, the server gets tab 1's old text plus that character and tab 2's answer is gone from the server; tab 2 still shows its own text, so nobody notices until marking.
Steps: open the link in two tabs, type "step two then three then four" in tab 1, type "TAB TWO wrote this" in tab 2, wait 4 s, press one key in tab 1, read /review: final is "step two then three then four!".
Severity: Medium (silent loss of a whole answer; only with two tabs open).
Likely cause: exam.js:160-169 mergeAnswers updates `drafts` but never the textarea on screen (question() runs only on render or navigation); onType (exam.js:183) then sends the stale textarea value with a higher seq, which the server accepts (index.js:250 only rejects a lower seq).
Proof: s2-twotabs-tab1.png; checks "2d tab 1's box updates..." and "2d typing one char in tab 1 does not wipe tab 2's text" in s2_saving.results.json.

### Bug 3. One request that never returns stops saving (or polling) for the rest of the exam (High)
What the student sees: on a flaky mobile connection one fetch hangs (no response, no error). From then on the label says "Saving" for ever, nothing typed afterwards reaches the server, yet the page looks alive. If the hung request was the state poll, the timer keeps counting locally but +5 min, lock and hand-in state never arrive.
Steps: put a proxy in front of the server that holds one PUT /api/s/answers open (faultproxy.py, hang=1), type, let new requests through, type more, wait 45 s: the server never gets the new text. Same with one GET /api/s/state held open, then +5 from the teacher: never shown.
Severity: High. Captive portals and mobile black holes do exactly this; a reload fixes it but the student does not know he needs one.
Likely cause: exam.js:36 fetch has no timeout or AbortController; flush() sets `flushing = true` (exam.js:197) and clears it only when the promise settles; poll() reschedules itself only in then/catch (exam.js:150, 156); the 5 s interval at exam.js:132 calls flush(), which returns at once while `flushing` is true. The same pattern exists in sendPending (`sending`, exam.js:248) and on the teacher side (exams.js:273 poll reschedules only after a reply).
Proof: checks "2k after one hung save request..." and "2k after one hung state poll..." in s2c_saving.results.json; s2-hung.png (label "Saving").

### Bug 4. The student page depends on cdnjs at start: without it, questions show raw HTML tags and raw LaTeX (Medium)
What the student sees: if cdnjs.cloudflare.com is blocked or slow (school filter, some mobile networks), every question reads like `<p>Show that \( \dfrac{1}{2} \) ...</p>`; the QR dialog says "QR code could not load".
Steps: block https://cdnjs.cloudflare.com/** and open the student link.
Severity: Medium (the exam is still doable but looks broken, maths is unreadable; an exam-day single point of failure outside your control).
Likely cause: exam.js:23 `clean()` falls back to `esc(html)` when DOMPurify is missing, which escapes the tags instead of showing the text; DOMPurify, KaTeX and qrcode load only from cdnjs (exam.html:21-22, exam.js:52) with no local copy.
Proof: s5-no-cdn.png, s5-no-cdn-qr.png; check "5 without the CDN the question text is still readable" in s5_maths.results.json. Related: the render-blocking Google Fonts stylesheet (exam.html:16): when fonts.googleapis.com hangs, the student page paints nothing at all within 40 s; when it fails fast, first paint is 56 ms (s8 notes).

### Bug 5. Locked while text was unsent: the student is told "Your answers are saved" (Medium)
What the student sees: he loses connection, keeps typing, the teacher locks; on reconnect the page shows "The exam has ended. Your answers are saved." but the last text never reached the server (the save is refused with 409 after the lock).
Steps: go offline, type, lock from the teacher, go online. /review has the old text; the page says saved.
Severity: Medium. He will not tell you he lost work because the page told him he did not.
Likely cause: exam.js:279 locked screen is static text; flush() on 409 (exam.js:208) only polls; the dirty draft stays in localStorage but nothing is shown.
Proof: check "4 lock with unsent text..." in s4_handin.results.json (server had "pi/6 after reopen", page said saved); s4-locked.png.

### Bug 6. Script error after leaving the marking page with a comment just typed (Low)
What the teacher sees: nothing visible; a TypeError "Cannot read properties of null (reading 'value')" is thrown about 1.2 s after leaving the marking page if a comment was being typed. The comment itself is saved by the change event.
Steps: on #/exams/<id>/mark type in a comment box, click "Exam page" within a second.
Likely cause: exams.js:464 debounce timer fires saveMark() after navigation; exams.js:369 reads `.value` on elements that no longer exist.
Proof: pageerror in s7_teacher.results.json ("7 no script errors") and s9_extra.results.json.

### Bug 7. Closing the phone-QR dialog with Escape leaves the 2 s fast poll running (Low)
What the student sees: nothing; the server gets a state poll every 2 s and every 3 s (7 in 12 s instead of 4) for the rest of the exam.
Steps: press "Use phone", press Escape (or tap the backdrop), count /api/s/state requests.
Likely cause: exam.js:425 wraps `d.close` with clearInterval, but modal()'s Escape and backdrop handlers (exam.js:385-387) call the inner `close()` directly, so the interval survives.
Proof: check "9 after closing the phone dialog with Escape..." in s9_extra.results.json.

### Bug 8. The phone page never re-checks the exam state (Low)
What the student sees: after a lock (or hand in), the phone page still offers "Take a photo"; the upload then fails with "The exam has ended, so nothing more can be added." It also lists the computer's drawings as "Sent", which is confusing on a phone.
Likely cause: exam.js:504 phonePoll() runs once at start and again only after an upload error; no interval.
Proof: check "3 phone page learns about the lock without a reload" in s3b_pictures.results.json; s3-phone-stale-lock.png.

### Bug 9. The marking page never refreshes while open (Low)
What the teacher sees: with the marking page open during a running exam (the page even says "answers may still change"), new text and pictures never appear until the page is left and reopened; "Save to tutoring repo" from that stale page writes the stale answers.
Likely cause: exams.js:316 markView fetches /review once; no polling.
Proof: check "7 an open marking page shows pictures added after it was opened" in s7_teacher.results.json (0 shown, 2 on the server).

## 3. UX observations

1. Hand in sits 10 px from Next in the bottom bar at phone width (s4-390-bottombar.png); on a laptop the two sit side by side too (s6-light-laptop-running.png). Next is the thing he taps most. The confirm dialog is the only safety net, and its "Hand in" is the accent button where the default action is expected (s6-light-phone-handin.png). Suggest moving Hand in to the left or the top bar, and making the dialog's Hand in the plain button.
2. Tap targets: Choose picture / Draw / Use phone are 40 px high, Remove under each picture is 32 px, all drawing toolbar buttons 40 px (s6 audits, s6-light-phone-drawing.png). The question dots and bottom bar are 44 to 48 px, so the page is inconsistent; Remove at 32 px next to a picture is easy to miss with a pen.
3. Teacher setup page at 390 px scrolls sideways (s6t-light-phone-setup.png, s6t-dark-phone-setup.png). The past-paper table in the Time card is a bare `.xt-table` without the `.xt-scroll` wrapper (exams.js:209), and the questions table shows only # / Question / Marks before being cut.
4. Raw browser errors reach people: "Failed to fetch" on remove-while-offline (student, exam.js:265), hand-in-while-offline when nothing is dirty (student, exam.js:406, s4-handin-offline-toast.png), and "+5" while the server is down (teacher, exams.js:291).
5. Contradictory text on the teacher waiting page: "He hasn't opened the link yet" next to "Last seen 12 s ago" (s9-seen-contradiction.png; exams.js:238 uses a 10 s window for the sentence while the seen line shows any past visit).
6. Setup page duration 0, -5 or empty: Save changes silently keeps the old value with no message, because exams.js:300 only sends base_minutes when `dur > 0`. The teacher thinks it saved.
7. Leaving the marking page during "Save to tutoring repo" gives no confirmation afterwards (the save does finish). A toast on completion would do.
8. Time up: the timer pill turns red and reads "Time is up"; the banner is at the top of the content and scrolls away (s6-dark-phone-timeup.png shows the pill with the banner off screen). The pill alone does not say he may keep writing.
9. 20 pictures on one question makes the page 1450 px tall with the thumbnails below the fold (s3-21pics.png); acceptable for a rare case.
10. What works well: "Working or notes (optional)" vs "Your answer", "This question needs a picture of your working.", the waiting screen ("It will open here on its own; no need to refresh"), and the offline label ("Offline: kept on this computer, will send when back") read clearly in both themes at all four sizes (s6-*-running.png, s1-offline40.png). The timer stayed visible with the keyboard open on phone and tablet (s6-light-phone-keyboard.png).
11. "Saved 4:02 AM" uses the device clock, so with a drifted clock it disagrees with the teacher's log by the drift (s1 notes). Harmless but confusing.
12. There is no character count or limit hint on the answer box, so the 50,000 limit arrives as a surprise (Bug 1).
13. Phone page lists drawings made on the computer as "Sent 4:16 AM" alongside its own photos (s3-phone-390.png).

## 4. Speed numbers (this machine, local server, pretend GitHub)

- #/exams list: cold start (empty device cache) 3.7 s to list visible (DOMContentLoaded 3.6 s; 2 GitHub calls: tree plus exam.json blob); the s7 runs measured 8.6 and 9.3 s cold. Warm, same tab (hash change): 219 ms. Reload with device cache: 6.4 s. In this sandbox the first 3 to 6 s are the render-blocking Google Fonts stylesheet failing through the proxy; on a normal network expect well under 1 s warm.
- "Load to exam server" for students/UK-1/exams/2026-10-07-maths/exam.json: 2.1 s and 2.4 s (two runs), including 7 picture uploads.
- Question images sent to the server (one stitched JPEG per question): 75,966 / 19,139 / 14,383 / 91,515 / 37,650 / 23,477 / 104,530 bytes, total 358 KB (repo PNGs total 401 KB).
- Teacher page API calls while running: 24 per minute, all GET /api/t/exams/<id>/live (every 2.5 s). While waiting: 11 in 30 s. None after leaving the page.
- Student page: first paint 568 ms and question screen at 603 ms when fonts fail fast; 3.5 s when the Google Fonts request has to time out; no paint within 40 s when fonts.googleapis.com hangs (render-blocking stylesheet, exam.html:16). With fonts aborted instantly: first paint 56 ms, question screen 89 ms. Student polls: /api/s/state every 3 s running, 2 s waiting, 10 s otherwise.
- Picture pipeline: 6000x6000 PNG shrunk and uploaded in 1.0 s (stored 2000x2000 JPEG, 24 KB); a 1346x687 drawing stored as PNG, 25 KB.
- Autosave: 20,000 characters on the server 1.1 s after typing; marking comment on the server 1.24 s after the last keystroke.
- Offline recovery: timer, banner and the queued answer all correct 0.6 s after the network returns.

## 5. Script errors and console

- pageerror: none in scenarios 1, 2, 3, 4, 5, 6, 8. One in 7 and 9: "Cannot read properties of null (reading 'value')" (Bug 6).
- Console errors: only failed loads of fonts.googleapis.com and cdnjs in this sandbox (ERR_TUNNEL_CONNECTION_FAILED); no app errors.

## 6. Could not be tested, and harness artefacts

- The browser's real "leave this page?" prompt: headless Chromium here never shows beforeunload dialogs, even for a one-line test page (note "capability ... False" in s2c), so the two "2f ... leave warning" FAILs in s2b are not evidence. The handler was verified directly: it prevents default when text is unsent and not when all is saved.
- s2b 2g, 2h, 2i, 2j FAILs are a harness artefact: a sleeping route handler left one request hung, which triggered Bug 3 and blocked the rest of that script. The same checks were rerun honestly through faultproxy.py in s2c (2g, 2h, 2i PASS; 2j and 2k are real).
- Real time only: the server has no clock injection over HTTP, so timer checks used short exams (0.05 to 0.5 min). A multi-hour exam, DST, or a device sleep that suspends the whole process was not simulated beyond 40 s offline.
- KaTeX, DOMPurify, the QR library and Google Fonts came from local copies or failed; the real CDN path was not exercised.
- HEIC: only a HEIC-like blob was tried (Chromium cannot decode real HEIC either); the message is right.
- The s1 and s2 screenshots were first taken before the local cdnjs stand-in existed, so question text in them showed raw tags; both scripts were rerun at the end to retake them (s1.rerun.log, s2.rerun.log). The findings do not depend on those images.
