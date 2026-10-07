-- Time on each question (Ali, 7 Oct): one row per visit. The student page reports the question on screen with
-- every poll (about every 3 s); a visit is extended while reports keep coming and a new one starts after a switch
-- or a gap. Server times only.
CREATE TABLE question_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL
);
CREATE INDEX question_views_exam ON question_views (exam_id, id);
