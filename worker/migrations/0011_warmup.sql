-- The warm-up deck on his link (Ali, 21 Oct): multiple-choice cards from his old mistakes and from his book pages.
-- Each run is 15 cards, shuffled; he sees right or wrong after the last card. Ali approves every card in the tutoring
-- repo; a card drafted from a mark scheme (ms_worded) that Ali has not looked at goes live by itself at live_at.
CREATE TABLE cards (
  exam_id TEXT NOT NULL,
  id TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'general',      -- mistake | general
  subject TEXT NOT NULL DEFAULT 'chem',
  q TEXT NOT NULL,
  options TEXT NOT NULL,                     -- JSON array of 4 strings; the first is the right one
  why TEXT NOT NULL DEFAULT '',              -- the book's or mark scheme's words, shown after the deck
  page TEXT NOT NULL DEFAULT '',             -- "CGP p.174"
  topic TEXT NOT NULL DEFAULT '',            -- spec code, "3.3.9"
  status TEXT NOT NULL DEFAULT 'live',       -- live | pending | off
  ms_worded INTEGER NOT NULL DEFAULT 0,
  live_at INTEGER,
  PRIMARY KEY (exam_id, id)
);
CREATE TABLE card_tries (
  exam_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  picked TEXT NOT NULL DEFAULT '',
  right INTEGER NOT NULL
);
CREATE INDEX card_tries_exam ON card_tries (exam_id, card_id, at);
