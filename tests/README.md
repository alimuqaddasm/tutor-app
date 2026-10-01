Browser tests for the Tutor Desk (Playwright + Microsoft Edge). They serve this folder on localhost:8765,
sign in with the GitHub CLI's token (`gh auth token`), read the real data repo, and block every write
(PUT/POST/DELETE to api.github.com), so nothing in the data changes.

    pip install playwright && python -m playwright install msedge
    python tests/test_teach.py     # Teach v4: preview vs live, Skip, outline, quiz picker, figures, Student view, phone
    python tests/stress.py         # timings, 200+ rapid Teach steps, every route, resize, offline
    python tests/test_tryout.py    # try-out mode sends nothing; a suggestion is the only write; normal mode still saves
    python tests/test_suggestions_1oct.py   # Ali's 12 suggestions of 1 Oct
    python tests/test_bugs_round10.py       # round 10 bug hunt: 24 PASS/FAIL checks (exit 1 on a FAIL); saves go to a pretend GitHub inside the test

Screenshots go to ./v4shots and ./v3shots (create them first) and tests/shots.
On Windows run with PYTHONIOENCODING=utf-8, or printing ★ crashes the console.
