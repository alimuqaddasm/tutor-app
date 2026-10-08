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
| `index.html`, `app.js`, `app.css` | the teacher app (Lessons, Plan, Teach, Student view, Warm-up, Videos, Record, Settings) |
| `exams.js` | the Exams tab inside the teacher app |
| `exam.html`, `exam.js`, `exam.css` | his exam and assignment pages, and his phone page |
| `design.css` | the design system |
| `sw.js` | offline shell. Bump `SHELL` and the `?v=` numbers in `index.html`/`exam.html` when a file changes |
| `worker/` | exam server. `cd worker && npx vitest run` |
| `tests/` | Playwright browser tests (see `tests/README.md`). They serve this folder on :8765 and never write to the real repo |
| `v1/`, `v2/` | old versions kept as revert points (tags `v1-before-redesign`, `v2-liked`) |

## Working rules

- Talk to Ali in short, plain language. Ask before anything that changes the live site.
- Work on a branch and open a pull request; `main` is what Ali teaches from.
- Before pushing: run the relevant tests, and screenshot the changed screens at 1440 px and 390 px.
