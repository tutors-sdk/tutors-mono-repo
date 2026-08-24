CREATE TABLE IF NOT EXISTS whiteboard_scenes (
  room_id TEXT PRIMARY KEY,
  elements JSONB NOT NULL DEFAULT '[]',
  app_state JSONB NOT NULL DEFAULT '{}',
  files JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whiteboard_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read whiteboard scenes"
  ON whiteboard_scenes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can upsert whiteboard scenes"
  ON whiteboard_scenes FOR ALL USING (auth.role() = 'authenticated');
