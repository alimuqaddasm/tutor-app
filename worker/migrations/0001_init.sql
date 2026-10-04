-- Tutor Desk exams. Times are milliseconds since 1970 (UTC), always taken from the server clock.
CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | waiting | running | submitted | locked
  token TEXT UNIQUE,                             -- the student link; NULL until made
  ratio REAL,                                    -- minutes per mark used for the suggestion
  base_minutes REAL NOT NULL DEFAULT 0,
  started_at INTEGER,
  original_end_at INTEGER,
  end_at INTEGER,
  submitted_at INTEGER,
  locked_at INTEGER,
  last_seen_at INTEGER,
  timeup_logged_for INTEGER,                     -- the end_at whose "time up" is already in events
  created_at INTEGER NOT NULL
);

CREATE TABLE questions (
  id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  pos INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  text_html TEXT NOT NULL DEFAULT '',
  marks REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'long',             -- short | long | upload_required | upload_optional
  suggested_min REAL,
  img BLOB,
  img_mime TEXT,
  PRIMARY KEY (exam_id, id)
);

CREATE TABLE extensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  minutes REAL NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE answer_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  text TEXT NOT NULL,
  seq INTEGER NOT NULL,
  client_at INTEGER,
  server_at INTEGER NOT NULL,
  late INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX answer_rev_q ON answer_revisions (exam_id, question_id, id);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  source TEXT NOT NULL,                          -- file | drawing | phone
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  data BLOB NOT NULL,
  server_at INTEGER NOT NULL,
  late INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER
);
CREATE INDEX uploads_q ON uploads (exam_id, question_id);

CREATE TABLE phone_tokens (
  token TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE marks (
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  score REAL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (exam_id, question_id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX events_exam ON events (exam_id, id);

CREATE TABLE past_papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  marks REAL NOT NULL,
  minutes REAL NOT NULL
);
