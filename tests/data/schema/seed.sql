-- Rows in the tables that predate supabase/migrations (Rule 0628): each migration is applied to a database holding
-- these, and must leave them as it found them on the columns they had. Shapes follow supabase-legacy-tables.sql;
-- the people are the release harness's stub users, so nothing here is a real student.
INSERT INTO public."tutors-connect-users" (github_id, email, full_name, avatar_url, online_status, date_last_accessed, sentiment) VALUES
  ('harness-student', 'student@harness.test', 'Harness Student', 'https://identity.harness.test/avatar/student.png', 'online', '2026-09-16 09:05:00+00', 'neutral'),
  ('harness-lecturer', 'lecturer@harness.test', 'Harness Lecturer', 'https://identity.harness.test/avatar/lecturer.png', 'offline', '2026-09-15 17:30:00+00', NULL);

INSERT INTO public."tutors-connect-courses" (course_id, visited_at, visit_count, course_record) VALUES
  ('harness-rules', '2026-09-16 09:05:00+00', 42, '{"title": "Harness Rules Course", "visits": 42}'),
  ('runway-fixture', '2026-09-14 08:00:00+00', 3, NULL);

INSERT INTO public."tutors-connect-latest" (course_id, student_id, payload, received_at) VALUES
  ('harness-rules', 'harness-student', '{"courseId": "harness-rules", "title": "Lab 1", "user": {"id": "harness-student"}}', '2026-09-16 09:05:00+00');

INSERT INTO public.calendar (id, studentid, courseid, timeactive, pageloads) VALUES
  ('2026-09-15', 'harness-student', 'harness-rules', 30, 4),
  ('2026-09-16', 'harness-student', 'harness-rules', 90, 7),
  ('2026-09-16', 'harness-lecturer', 'harness-rules', 0, 1);

INSERT INTO public.learning_records (course_id, student_id, lo_id, duration, count, date_last_accessed, type) VALUES
  ('harness-rules', 'harness-student', '/lab/harness-rules/topic-01/lab-01', 120, 3, '2026-09-16 09:05:00+00', 'lab'),
  ('harness-rules', 'harness-student', '/talk/harness-rules/topic-01/talk-01', 30, 1, '2026-09-15 10:00:00+00', 'talk');
