"""The offline shell (sw.js FILES) must hold the exact ?v= version of every file index.html and exam.html ask for.
A version missing from the list is not cached at install; after the next shell update it is gone offline and the page breaks.
No browser or server needed:  python tests/test_offline_list.py
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda f: open(os.path.join(ROOT, f), encoding="utf-8").read()
files = set(re.findall(r'"([\w./-]+\?v=\d+)"', read("sw.js")))
ok = True
for page in ["index.html", "exam.html"]:
    asked = re.findall(r'(?:src|href)="([\w./-]+\?v=\d+)"', read(page))
    missing = [a for a in asked if a not in files]
    print(("PASS " if not missing else "FAIL ") + page + " files are all in the offline list" + (" | missing: " + ", ".join(missing) if missing else ""))
    ok = ok and not missing
sys.exit(0 if ok else 1)
