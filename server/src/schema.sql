-- RegiSpot schema — idempotent, run on every startup via migrate.js
-- All CREATE statements use IF NOT EXISTS so re-running is safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- Users (our own auth — replaces Cognito)
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique email index
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id           TEXT        PRIMARY KEY,                      -- short random id, e.g. "aB3xK9qZ"
  name         TEXT        NOT NULL,
  sport_type   TEXT        NOT NULL,
  max_members  INT         NOT NULL DEFAULT 50,
  member_count INT         NOT NULL DEFAULT 0,
  access_code  CHAR(6)     NOT NULL UNIQUE,
  owner_id     UUID        NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Members (one row per user-group pair)
CREATE TABLE IF NOT EXISTS members (
  group_id       TEXT        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES users(id),
  nickname       TEXT        NOT NULL,
  nickname_lower TEXT        NOT NULL,
  role           TEXT        NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  UNIQUE (group_id, nickname_lower)   -- one nickname per group
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT        PRIMARY KEY,
  group_id        TEXT        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  date            TEXT        NOT NULL,  -- stored as text "YYYY-MM-DD" for display flexibility
  time            TEXT        NOT NULL,  -- stored as text "HH:MM" or "7:00 PM"
  location        TEXT        NOT NULL,
  capacity        INT         NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  signed_up_count INT         NOT NULL DEFAULT 0
                               CHECK (signed_up_count >= 0 AND signed_up_count <= capacity),
  match_format    TEXT,
  skill_level     TEXT,
  court_count     INT,
  created_by      UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signups (one row per user-session pair)
CREATE TABLE IF NOT EXISTS signups (
  session_id  TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id),
  nickname    TEXT        NOT NULL,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- ── Weekly schedules, waitlist, day-of lock (2026-11-23) ─────────────────────
-- Weekly schedules — sessions are generated from these on request.
CREATE TABLE IF NOT EXISTS schedules (
  id               TEXT        PRIMARY KEY,
  group_id         TEXT        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  weekday          INT         NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time       TEXT        NOT NULL,   -- "20:00"
  end_time         TEXT        NOT NULL,   -- "22:00"
  location         TEXT        NOT NULL,
  court_count      INT         NOT NULL,
  capacity         INT         NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  open_days_before INT         NOT NULL DEFAULT 5,
  active           BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_time         TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS schedule_id      TEXT REFERENCES schedules(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS open_days_before INT     NOT NULL DEFAULT 5;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_schedule_date_idx
  ON sessions (schedule_id, date) WHERE schedule_id IS NOT NULL;

-- signed_up_count counts only status = 'registered'.
ALTER TABLE signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'registered'
  CHECK (status IN ('registered', 'waitlisted'));
ALTER TABLE signups ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;  -- set on register / promotion

-- ── Guests (2026-11-23) ──────────────────────────────────────────────────────
-- A guest is a signups row with no account: user_id NULL, guest_name set,
-- added_by = the member who registered them. Rows get a surrogate id so a
-- member can add any number of guests to one session.
ALTER TABLE signups ADD COLUMN IF NOT EXISTS id         BIGSERIAL;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS added_by   UUID REFERENCES users(id);

-- Move the primary key from (session_id, user_id) to id — only while it is still the old key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signups_pkey' AND conrelid = 'signups'::regclass
      AND pg_get_constraintdef(oid) LIKE '%user_id%'
  ) THEN
    ALTER TABLE signups DROP CONSTRAINT signups_pkey;
    ALTER TABLE signups ADD PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE signups ALTER COLUMN user_id DROP NOT NULL;

-- Still one signup per member per session (raises 23505 on duplicates, as before).
CREATE UNIQUE INDEX IF NOT EXISTS signups_session_user_idx
  ON signups (session_id, user_id) WHERE user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signups_member_or_guest') THEN
    ALTER TABLE signups ADD CONSTRAINT signups_member_or_guest CHECK (
      (user_id IS NOT NULL AND guest_name IS NULL)
      OR (user_id IS NULL AND guest_name IS NOT NULL AND added_by IS NOT NULL)
    );
  END IF;
END $$;
