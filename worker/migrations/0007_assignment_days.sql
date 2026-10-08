-- Assignment, round 2 (Ali, 8 Oct).
-- Days open one after another: day 1 at once, each next day gap_hours after he first opened the day before.
-- After a section is finished (done_at) his answers are fixed; anything later is practice, kept and marked as such.
-- Ali's note per question is shown to him as soon as Ali saves it; "study" (CGP pages or Maths Genie videos)
-- shows with it when he lost marks.
ALTER TABLE exams ADD COLUMN gap_hours REAL NOT NULL DEFAULT 12;
ALTER TABLE sections ADD COLUMN opened_at INTEGER;      -- he first opened this section
ALTER TABLE sections ADD COLUMN released_at INTEGER;    -- Ali opened its day early by hand
ALTER TABLE marks ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN study TEXT;            -- JSON from assignment.json
ALTER TABLE answer_revisions ADD COLUMN practice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN practice INTEGER NOT NULL DEFAULT 0;
