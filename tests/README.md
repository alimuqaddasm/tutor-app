Browser tests for the Tutor Desk (Playwright + Microsoft Edge). They serve this folder on localhost:8765,
sign in with the GitHub CLI's token (`gh auth token`), read the real data repo, and block every write
(PUT/POST/DELETE to api.github.com), so nothing in the data changes.

    pip install playwright && python -m playwright install msedge
    python tests/test_teach.py     # Teach v4: preview vs live, Skip, outline, quiz picker, figures, Student view, phone
    python tests/stress.py         # timings, 200+ rapid Teach steps, every route, resize, offline
    python tests/test_tryout.py    # try-out mode sends nothing; a suggestion is the only write; normal mode still saves
    python tests/test_suggestions_1oct.py   # Ali's 12 suggestions of 1 Oct
    python tests/test_bugs_round10.py       # round 10 bug hunt: 24 PASS/FAIL checks (exit 1 on a FAIL); saves go to a pretend GitHub inside the test
    python tests/test_round11.py            # round 11 (2 Oct): I-skipped-it, Taught/Next/Skip, student swipe/arrows, missed lessons + make-up time (27 checks)
    python tests/test_round12.py            # round 12 (2 Oct): page stays at top, steady top bar, try-out dot, folded maths hints, instant suggestions (13 checks)
    python tests/test_round13.py            # round 13 (2 Oct): pictures preload in Teach, exam-paper maths font, try-out glow + label (6 checks)
    python tests/test_round14.py            # round 14 (2 Oct): Try-out button, plain dot, make-up chip, Side panel / Floating card layouts with no scrolling (15 checks)
    python tests/test_round15.py            # round 15 (2 Oct): Flip layout, question and answer screens with no scrolling (8 checks)
    python tests/test_round16.py            # round 16 (2 Oct): Flip is the default; week dots only for taught lessons (2 checks)

Screenshots go to ./v4shots and ./v3shots (create them first) and tests/shots.
On Windows run with PYTHONIOENCODING=utf-8, or printing ★ crashes the console.

The tests read the real lessons, which change as Ali teaches; checks compare against what is already there, never against an empty lesson.
Since v23 the default Teach layout is Flip; tests written for the Classic page set tutor.layout = classic in their browser.

Exam section (needs a local exam server, nothing touches GitHub or the real server):

    cd worker && npm install && npx vitest run                 # server: timer, extensions, time up, autosave, uploads, access (34 tests)
    cd worker && npx wrangler d1 migrations apply tutor-exams --local
    echo TEACHER_PASSWORD=local-test > worker/.dev.vars
    (cd worker && npx wrangler dev --port 8787 --local) &      # the exam server on this machine
    python -m http.server 8765 &                               # the app
    python tests/test_exam.py         # student page + phone page: live start, +5 live, offline, pictures, drawing, QR, time up, hand in (32 checks)
    python tests/test_exams_tab.py    # Exams tab: load from repo, time suggestion, link, start, + minutes, lock, mark, save to repo (33 checks)
    python tests/test_exams_tryout.py # Try-out: practice exams do everything, real exams are look-only, nothing goes to GitHub (26 checks)
    python tests/test_batch1_exam.py  # 5 Oct fixes: refused save kept and shown, hung request recovers, two tabs, lock with unsent work, no cdnjs (11 checks)

Running without a GitHub token (Linux, Mac, cloud sessions): tests/fakegh.py is a pretend GitHub that serves a clone of
the tutoring repo (next to this repo as ../tutoring, or set TUTORING_CLONE) and keeps every write in memory.

    python tests/runtest.py tests/test_teach.py     # any older test, with GitHub replaced (CHROMIUM_PATH picks a Chromium)
    python tests/test_batch1_lessons.py             # 5 Oct fixes: notes in Flip, preview, mistyped address, taken date, minutes (16 checks)
    python tests/test_flip_5oct.py                  # Flip card of 5 Oct: answer on the front when it fits, mark scheme first on the back (17 checks)
    python tests/test_quickflow.py                  # Quick flow of 5 Oct: one quiz board, merged section screens, notes behind an i, make-up log, maths video list, paper fonts (23 checks)
    python tests/test_paper_5oct.py                 # Question text set like the papers, arrows between zoomed pages, After the lesson pre-filled (11 checks)
    python tests/test_sayit.py                      # Say it: the mic beside the verdicts (and M) writes the note; nothing in preview (7 checks)

The maths and QR checks load KaTeX and the QR library from cdnjs, so they need internet.
