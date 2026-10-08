# Clear Desk: the Tutor Desk design system

Read this before you add or change any page. Every screen follows it, so a new page looks right the first time.

- **Styles:** `design.css`. Tokens (colours, type, space, corners) and the shared parts (buttons, tags, cards, verdicts). Pages use these classes and tokens. Never write a new colour, font size or corner size on a page.
- **Design system in Claude:** "Clear Desk" design system artifact (tokens, components, cover): https://claude.ai/artifact/8Zz82qih6yELUUsWH68uxb (private to Ali's account).
- **Screens:** the Claude Design canvas "Tutor Desk Design System" has all 26 screens drawn in this system: https://claude.ai/artifact/H5JReBhkCaFYfif9Jnh5D4 (private to Ali's account). `design.css` is the same file the canvas uses (`clear-desk.css` there).
- **Questions:** exam text keeps the board's font: Arial for AQA (`.q-aqa`), Times for Edexcel (`.q-edexcel`). Everything else uses the app font.

## The look in one line

A light, quiet desk: white cards on a soft grey ground, one sans font, colour only where it means something, key facts as tags, and an 8 px rhythm.

## Colour (tokens in `design.css`)

| Token | Use |
|---|---|
| `--ground` `--surface` `--sunk` | page, cards, answers and mark schemes |
| `--line` `--line-strong` | borders, input outlines |
| `--text` `--text-2` `--text-3` | main text, secondary, hints |
| `--slate` | the main button on a page, and Day tags |
| `--chem` / `--chem-wash` | chemistry only |
| `--maths` / `--maths-wash` | maths only |
| `--live` / `--live-wash` | the running clock, make-up owed, due counts, "on it now" |
| `--right` `--partly` `--wording` `--term` `--wrong` `--none` | verdicts only |
| `--ask` | the "Ask" and "Question" tags |

No other colours. No gradients, no graph paper behind pages (Teach has it as an option), no black blocks.

## Type

One app font (`--font`): Plus Jakarta Sans by default. Settings offers Hanken Grotesk and Atkinson Hyperlegible Next (`data-font` on `<html>`).
Three weights: 400 to read, 600 for headings and buttons, 700 for big numbers. Numbers use tabular figures in the same font, never a monospace font.

| Class | Size | For |
|---|---|---|
| `.t-page` | 40 | page title (Home, Exams, Record, Settings, Videos) |
| `.t-title` | 34 | a lesson or exam title |
| `.t-sec` | 20 | section heading |
| `.t-card` | 18 | card heading |
| body | 16 | text |
| `.hint` | 14 | hints, secondary lines |
| `.lab` | 13 | small labels above a group |
| `.t-big` | 28 / 700 | stat numbers |

## Space and shape

Gaps are 8, 16, 24, 32 or 48 px (`--s2` to `--s7`). 4 px only inside tags. Card padding 24. Page edges 48 (16 on a phone).
Corners: 8 tags, 12 buttons and inputs, 16 cards, round for pills. One shadow (`.raised`), used once a screen for the thing in focus.
Every tap target is at least 44 px. The app is used on a tablet first.

## Tags: key facts are tags, not sentences

If a fact repeats from item to item (subject, day, date, topic, source, status, marks, minutes), show it as a tag. Write a sentence only when it says something new.

| Tag | Class | Example |
|---|---|---|
| Subject | `.tag.chem` / `.tag.maths` with `.dot` | Chemistry, Maths |
| Day | `.tag.day` | Day 1 |
| Topic | `.tag.topic` with the code in `<b>` | **3.3.8** Aldehydes and ketones, **Y2 · 6** Trig functions |
| Source | `.ref` with one `<span>` per part, question last as `.qn` | Edexcel · Paper 2 · June 2018 · **Q1** |
| Part of a lesson | `.tag.line` | Quiz, Starter, New, Re-teach, Practice, Revision, Exam, Video, Keep it fresh, Check, Homework |
| Optional | `.tag.dash` | If time, No script yet |
| Status | `.tag`, `.tag.live`, `.tag.ok` | Draft script, 47 due today, Logged |
| Verdict | `.tag.ok` `.partly` `.wording` `.term` `.bad` | ✓ Right, ✕ Wrong |

Topic codes: chemistry uses the AQA spec code (3.3.8). Maths uses the Pearson book and chapter (Y2 · 6) or the section number (7.1).

## Lessons: how they are named and shown

- **Title = the main topic** of the lesson: "Tollens' and Fehling's", "7.1 Addition formulae". Not a sentence of everything in it.
- **Parts carry a kind:** each part name starts with its kind: `Quiz:`, `Starter:`, `New:`, `Re-teach:`, `Practice:`, `Revision:`, `Exam:`, `Video:`, `Keep it fresh:`, `Check:`, `Homework:`, `If time:`. Untimed reference parts: `Bank:` (question bank, book pages) and `Recycle:` (spaced repeats). The app shows the kind as a tag and the rest as the part's name.
- The lesson card shows the title, the subject and topic tags, and the parts as a strip sized by minutes (`.flow`), the main part highlighted.

## Verdicts

Always this set, always this order, with these symbols: **Right ✓, Partly ½, Wording ≈, Terminology Aa, Wrong ✕, No answer −**.
"Not asked" (you chose not to ask it) is not a verdict: a dashed button in the bottom bar, never a mistake.
In Teach the verdicts are round buttons down the right edge (`.vrail`; in the app `.ctl.big.vrail .vr .vd`): A (answer) on top, then Right, Wrong, Partly on keys 1 to 3, then the mic and More (Wording, Terminology, No answer, marks, note on keys 4 to 6). Soft tinted circles; the chosen one fills with its colour.

## Words (glossary)

| Say | Means | Never |
|---|---|---|
| Lesson | one subject on one day | session |
| Part | a timed block of a lesson | phase (in the UI) |
| Step | one thing to say, ask or show | chunk (in the UI) |
| Plan · Teach · Student view | the three ways to open a lesson | Student (alone) |
| Show him | puts one question full screen for him | |
| Mistakes warm-up (nav: Warm-up) | spaced revision, day 1, 3, 7, 14, 30 | Revise |
| Due today · Still open | cards to ask now · mistakes not yet mastered | |
| Exam | timed, on his tablet | test |
| Assignment | no clock, sections with Done | |
| Outside result | a school mock or anything not run in the app | test result |
| His work | his photos and working | his answer |
| Photo | his work | picture (that is a question or mark scheme image) |
| Make-up owed | minutes still to teach | |
| Try-out | practice mode: nothing saves except a suggestion | |

## Wording rules

1. Short and plain. A button is a verb and a thing: "Start lesson", "Accept Claude's mark". Never a lone noun like "Open" or "Compare".
2. Repeated facts are tags. A sentence only when it says something new.
3. No em or en dashes. Use a colon, a full stop or a middle dot ( · ).
4. Sentence case: every label, tag, heading, button and status starts with a capital ("Holiday practice", "Today", "Not started"), and only the first word does. Topic names keep the book's capitals. `tag()` capitalises its text for you, so data written in lower case still shows right.
4a. A lesson title is its name only ("Addition formulae"). The section number is a topic tag (7.1) and an exam lesson carries the Exam tag instead of the word "test" (`lessonParts()` in `app.js`).
5. One name per thing. Use the glossary.
6. Numbers carry a noun: "10/16 right", "7/10 marks", "47 due today", "45 min", "2 h 38 min", "18:40". A countdown says "left".
7. Teacher screens call the student "he". His screens say "you" and "your teacher", and never show notes meant for Ali, Claude's names for parts, or "(revised)".
8. Anything that can't be undone says so before it's pressed: "After Done you can't change your answers."
9. Empty states say what will appear and when: "Shows here after Claude reads the photos."
10. Status messages name the result: "Saved: Wrong", "Photo sent 18:01", "Locked · marked".
11. No filler: no greetings, praise or "Let's".
12. Never the student's real name. Use the code name (UK-1).

## Page patterns

- **List pages** (Lessons, Videos, Exams, Record, Settings): sidebar (`.side`) + `.main` + `.wrap`. Title `.t-page`, then a row of tags, then sections with `.t-sec` headings.
- **Lesson and focus pages** (Plan, Teach, Warm-up, After the lesson, His work, Mark): the thin icon rail (`.iconrail`) instead of the sidebar, so the work gets the room.
- **His screens** (Show him, Student view, his exam page, his phone, his assignment): no app chrome, white or ground, big exam-font text, round arrow buttons.
- **Assignment cards** (Exams): the plan's `facts`, `scope`, `leftOut` and `todo` show as tags; the long `why` note folds under "Notes from Claude". Never a paragraph on the card.
- **Bars:** `.topbar` and `.botbar`. The main action sits at the right end of the bottom bar.
- **Phone** (under 760 px): the sidebar becomes a bottom bar of five tabs (Lessons, Warm-up, Exams, Record, More).

## How the app is wired (read before editing CSS or markup)

- Every page loads `design.css` then its own sheet: `app.css` (teacher app, one numbered section per screen) or `app.css` + `exam.css` (his pages). The `<body>` has class `cd`.
- `design.css` base rules use `:where()`, so they weigh nothing and any class rule wins. Never add `!important` to beat them.
- Class names in `design.css` are the shared vocabulary. Before you add a class to a page, check `design.css` does not already use the name for something else (`grep -n '\.name' design.css`). Names already taken: `.iconrail`, `.clockpill`, `.input`, `.icon`, `.loadmore`, `.mrow`, `.choice`, `.tag`, `.ref`, `.flow`, `.kinds`, `.seg`, `.field`, `.check`, `.v`, `.vrail`, `.card`, `.list`, `.li`, `.btn`.
- Subject colour: put `data-subject="maths"` or `"chem"` on a container and use `var(--accent)`, `var(--accent-ink)`, `var(--accent-wash)` inside it.
- Light theme only. No dark-mode blocks.
- Tags in `app.js`: `tag(html, cls)`, `subjTag(subject)`, `topicTag(script)`. Lesson words: `lessonTitle(script, session)` (main topic), `kindOf(partName)` and `partTitle(partName)` (kind tag + the rest), `kindsHTML(script)`. Use these, never build the strings again.
- Verdicts in `app.js`: `VERD` (order and labels), `VHELP` (tooltips), `VTAG` (as tags).

## Adding a new page

1. Find the closest screen on the canvas and copy its structure.
2. Use only classes and tokens from `design.css`. If you need something new, add it to `design.css` (and the canvas's Main board) first, as a token or a component, then use it.
3. Put repeated facts in tags. Check every label against the glossary and the wording rules.
4. Screenshot it at 1440 px and 390 px before you push.
