-- Multiple choice (Ali, 11 Oct): he taps a letter instead of sending a picture of it.
-- "choices" is the letters on offer ("ABCD"). "work" is an optional line asking for working as pictures
-- ("Draw all 4 isomers and send a picture"); any question may carry it.
ALTER TABLE questions ADD COLUMN choices TEXT;
ALTER TABLE questions ADD COLUMN work TEXT;
