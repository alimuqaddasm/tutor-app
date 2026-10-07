-- Assignment mode (Ali, 7 Oct): a take-home pack with no clock. One link, open until Ali locks it, split into
-- sections (a day's maths, a day's chemistry). "Done" on a section opens its mark schemes to the student;
-- anything he saves after that is flagged as learnt from the mark scheme, not marked.
ALTER TABLE exams ADD COLUMN kind TEXT NOT NULL DEFAULT 'exam';      -- exam | assignment
ALTER TABLE questions ADD COLUMN section_id TEXT;
ALTER TABLE questions ADD COLUMN ms_img BLOB;                        -- mark scheme picture, shown to him only after Done
ALTER TABLE questions ADD COLUMN ms_mime TEXT;
CREATE TABLE sections (
  exam_id TEXT NOT NULL,
  id TEXT NOT NULL,
  pos INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  day INTEGER,
  date TEXT,
  suggest_min REAL,
  done_at INTEGER,
  took_min REAL,
  PRIMARY KEY (exam_id, id)
);
