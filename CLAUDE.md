# Tutor Desk app

The lesson app for Ali's tutoring. Static site on GitHub Pages (`main` is live at https://alimuqaddasm.github.io/tutor-app/). It holds no data: it reads and writes the private `alimuqaddasm/tutoring` repo with a key kept in the browser. The exam server is in `worker/` (Cloudflare Worker + D1).

## Before you change anything you can see

**Read `DESIGN.md` first.** It is the design system (Clear Desk): colours, type, spacing, tags, verdicts, the glossary and the wording rules. `design.css` holds the tokens and shared parts; page styles go in `app.css` (teacher app) and `exam.css` (his exam pages) and use only tokens and `design.css` classes. The canvas with every screen drawn is linked in `DESIGN.md`.

- No new colours, font sizes or corner sizes on a page. Add a token to `design.css` first if you truly need one.
- Repeated facts are tags (subject, day, topic, source, status). Words follow the glossary in `DESIGN.md`.
- No em or en dashes in anything the user sees.
- Never the student's real name. Use the code name (UK-1).

## Files

| File | What |
|---|---|
| `index.html`, `app.js`, `app.css` | the teacher app (Lessons, Prepare, Teach, Student view, Warm-up, Videos, Record, Settings) |
| `exams.js` | the Exams tab inside the teacher app |
| `exam.html`, `exam.js`, `exam.css` | his exam and assignment pages, and his phone page |
| `design.css` | the design system |
| `title.js` | `titleCase()` for titles, on both the teacher app and his pages |
| `sw.js` | offline shell. Bump `SHELL` and the `?v=` numbers in `index.html`/`exam.html` when a file changes. This matters: a file with `?v=` (and anything in `vendor/`) is served from the saved copy and never asked for again under the same address |
| `worker/` | exam server. `cd worker && npx vitest run` |
| `tests/` | Playwright browser tests (see `tests/README.md`). They serve this folder on :8765 and never write to the real repo |

Old versions are git tags, not folders: `v1-before-redesign`, `v2-liked`. Teach has one layout for questions: Flip.

## Speed: how the app avoids waiting (keep these working)

- **Saving.** Every write to GitHub goes through `putB64()` or `commitFiles()` in `app.js`. They pass the save to `ownSave()`, which keeps the saved bytes on the device and moves the file list on to the new commit, so nothing is downloaded back after a save. A write made any other way still works; it only costs one download of the file list (about 1 MB).
- **Reading.** `fileJSON()` gives a fresh copy to change. `fileJSONro()` gives one shared copy for screens that only read (Home, Record): never change what it returns.
- **Drawing.** `morph(el, html)` changes only what differs. It is used for Home and for the Teach outline. Use it only where no listener or canvas drawing hangs on the nodes themselves. A box that is filled in a moment later gets `data-keep`.
- **Home** opens from the view kept on the device (`tutor.home`, only on the same day, student and subject filter), then the real data changes what differs.
- **Exams.** The list, an exam page and the marking page show the copy kept on the device first. A change sent to the exam server with `?full=1` gets the exam back in the same answer (one trip, not two). `worker/` must be deployed for that; an older server is asked the old way.

## Working rules

- Talk to Ali in short, plain language. Ask before anything that changes the live site.
- Work on a branch and open a pull request; `main` is what Ali teaches from.
- Before pushing: run the relevant tests, and screenshot the changed screens at 1440 px and 390 px.
