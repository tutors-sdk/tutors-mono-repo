-- What a fresh Supabase project has before the first migration runs, as far
-- as the Tutors migrations depend on it. Applied by migration mode to the
-- throwaway Postgres before version a's migrations. Keep it minimal: anything
-- added here is something the rehearsal assumes rather than proves.
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- auth.uid() as Supabase defines it, so policies that call it parse.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
