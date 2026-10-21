-- One atomic write for a whiteboard save (Rules 0653 and 0654).
--
-- The reader used to read a room's stored files and then upsert the scene in a second request. In a
-- shared room two saves could both read before either wrote: a peer that had the new image's element
-- but not its bytes then wrote back the old file map and erased the image. This function merges the
-- stored files with the ones the save sends inside the upsert itself, on the locked row, so a save
-- that lands in between can no longer be overwritten with a stale file map.
--
-- Files written: every file the new elements reference (an element's fileId), taken from the files
-- sent, then from the files already stored. Stored entries that are not a well-formed Excalidraw
-- BinaryFileData (id matching its key, a mimeType, a data: URL) are left behind. A scene whose stored
-- elements and files come to more than 4 MiB of JSON raises SQLSTATE 54000 and writes nothing.
--
-- Expand only: one new function; the previous release keeps its two requests. SECURITY INVOKER, so the
-- policies on whiteboard_scenes (packages/svelte/utils/rbac/sql/003_whiteboard_scenes.sql) apply as they
-- do to the upsert it replaces. plpgsql, because the release harness rehearses on a database without
-- whiteboard_scenes and a plpgsql body is not resolved at create time.

CREATE OR REPLACE FUNCTION public.save_whiteboard_scene(p_room_id text, p_elements jsonb, p_files jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_bytes bigint;
BEGIN
  IF jsonb_typeof(p_elements) IS DISTINCT FROM 'array' OR jsonb_typeof(p_files) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'save_whiteboard_scene: elements must be an array and files an object' USING ERRCODE = '22023';
  END IF;

  INSERT INTO whiteboard_scenes AS s (room_id, elements, app_state, files, updated_at)
  VALUES (
    p_room_id,
    p_elements,
    '{"viewBackgroundColor": "#ffffff"}'::jsonb,
    (SELECT COALESCE(jsonb_object_agg(f.key, f.value), '{}'::jsonb)
       FROM jsonb_each(p_files) f
      WHERE f.key IN (SELECT e->>'fileId' FROM jsonb_array_elements(p_elements) e)),
    now()
  )
  ON CONFLICT (room_id) DO UPDATE
    SET elements = EXCLUDED.elements,
        app_state = EXCLUDED.app_state,
        files = (SELECT COALESCE(jsonb_object_agg(f.key, f.value), '{}'::jsonb)
                   FROM jsonb_each(
                          (SELECT COALESCE(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
                             FROM jsonb_each(CASE WHEN jsonb_typeof(s.files) = 'object' THEN s.files ELSE '{}'::jsonb END) k
                            WHERE jsonb_typeof(k.value) = 'object'
                              AND k.value->>'id' = k.key
                              AND jsonb_typeof(k.value->'mimeType') = 'string'
                              AND jsonb_typeof(k.value->'dataURL') = 'string'
                              AND left(k.value->>'dataURL', 5) = 'data:') || p_files) f
                  WHERE f.key IN (SELECT e->>'fileId' FROM jsonb_array_elements(p_elements) e)),
        updated_at = now()
  RETURNING octet_length(s.elements::text) + octet_length(s.files::text) INTO v_bytes;

  IF v_bytes > 4 * 1024 * 1024 THEN
    RAISE EXCEPTION 'save_whiteboard_scene: scene is % bytes, over the 4 MiB limit', v_bytes USING ERRCODE = '54000';
  END IF;
END;
$$;
