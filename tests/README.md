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

The maths and QR checks load KaTeX and the QR library from cdnjs, so they need internet.

Running without a GitHub token (Linux, Mac, cloud sessions):

    The tests above sign in with the GitHub CLI's token and read the real repo. `tests/review/fakegh.py` replaces GitHub
    with a pretend one that serves a local clone of the tutoring repo (expected next to this folder as ../tutoring, or
    set TUTORING_CLONE=/path) and records every write in memory, so nothing real is ever touched. It also serves
    DOMPurify, KaTeX and the QR library from `tests/review/cdn/` for machines that cannot reach cdnjs.

    python tests/review/runtest.py tests/test_teach.py        # any existing test, with GitHub and cdnjs replaced
    CHROMIUM_PATH=/opt/pw-browsers/chromium python tests/review/runtest.py tests/test_round15.py   # a specific Chromium
    python tests/review/hunt_teach.py                         # the 4 Oct review's Teach stress test (71 checks)
    python tests/review/exams/s1_timer.py                     # exam scenarios s1 to s9 (need the local exam server)
    python tests/review/screens/explore.py                    # every other screen at four sizes, light and dark

    The review itself (bugs, upgrades, work plan) is in docs/review-2026-10-04/.
