-- Which mark-scheme marks Ali ticked on a question (Ali, 7 Oct: "check or uncheck that box").
-- JSON array, one number per line of the question's mark list: the marks given for that line.
ALTER TABLE marks ADD COLUMN ticks TEXT;
