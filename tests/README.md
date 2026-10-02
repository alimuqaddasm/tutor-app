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

Screenshots go to ./v4shots and ./v3shots (create them first) and tests/shots.
On Windows run with PYTHONIOENCODING=utf-8, or printing ★ crashes the console.

The tests read the real lessons, which change as Ali teaches; checks compare against what is already there, never against an empty lesson.
