-- "typed" = 1: text_html is the whole question, typed in the paper's style, and the picture is only a cropped figure.
-- His pages then show the text and the figure. Without it a question with a picture shows only the picture (Ali, 11 Oct).
ALTER TABLE questions ADD COLUMN typed INTEGER NOT NULL DEFAULT 0;
