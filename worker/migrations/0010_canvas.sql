-- The teaching canvas (Ali, 17 Oct): Teach on the laptop and Student view on the tablet are on different devices,
-- so what goes on the canvas is relayed through here. One row per action ("add question q5", "remove", "move to top",
-- "new page", a piece moved on the tablet); both screens read the log in order. Rows older than 3 days are dropped.
CREATE TABLE canvas_actions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  action TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX canvas_room_seq ON canvas_actions (room, seq);
