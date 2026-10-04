# Next steps for Tutor Desk (from the review of 4 Oct 2026)

Start a new chat with: "Read docs/review-2026-10-04/NEXT-STEPS.md and do batch N" (or name bug or upgrade numbers from REPORT.md).

Rules for every batch: add or update tests that prove the fix, run `cd worker && npx vitest run` and the browser tests in `tests/` (see tests/README.md, section "Running without a GitHub token"), bump the `?v=` numbers in index.html and exam.html and the `SHELL` name in sw.js when files change, then open a pull request for Ali to merge. Never merge it yourself. Never deploy the exam server or touch the live database without asking Ali first.

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

Bug and upgrade numbers refer to REPORT.md in this folder.