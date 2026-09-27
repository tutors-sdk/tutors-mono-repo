-- Bookmarks: a learning object a signed-in reader saved to find again from the home page.
--
-- The reader reads and writes bookmarks only through its own server routes
-- (apps/reader/src/routes/api/bookmarks), which take the login from the Auth.js
-- session and use the service_role key. So the table gets RLS with no policy: anon
-- can neither read nor write a bookmark, and service_role bypasses RLS.
-- The title and type are copied from the course's published tutors.json when the
-- bookmark is made, so the home page can list bookmarks without reading every course.
CREATE TABLE IF NOT EXISTS tutors_bookmarks (
  login TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lo_route TEXT NOT NULL,
  title TEXT NOT NULL,
  lo_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (login, course_id, lo_route)
);

CREATE INDEX IF NOT EXISTS idx_tutors_bookmarks_login_created ON tutors_bookmarks (login, created_at DESC);

ALTER TABLE tutors_bookmarks ENABLE ROW LEVEL SECURITY;
