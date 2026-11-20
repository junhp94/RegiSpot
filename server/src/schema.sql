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
