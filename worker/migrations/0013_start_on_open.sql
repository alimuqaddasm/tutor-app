-- Start when he opens the link (Ali, 6 Nov): Ali sets it while the exam is waiting; the clock (base_minutes) starts
-- the first time his page asks for the exam, so Ali need not be there to press Start.
ALTER TABLE exams ADD COLUMN start_on_open INTEGER NOT NULL DEFAULT 0;
