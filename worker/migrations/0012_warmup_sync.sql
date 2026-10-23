-- Warm-up in step with the holiday pack (Ali, 23 Oct). The right letter of a multiple-choice question is kept on the
-- server (never sent to his page) so a wrong tap becomes a warm-up card the moment he finishes that section; such a
-- card shows the question's own picture (qid).
ALTER TABLE questions ADD COLUMN answer TEXT;
ALTER TABLE cards ADD COLUMN qid TEXT;
