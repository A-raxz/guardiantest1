PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A zone is a field office. Every non-master user belongs to exactly one.
CREATE TABLE IF NOT EXISTS zones (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('MASTER_ADMIN','HR_BP','SALES_MANAGER','SALES_REP')),
  zone_id              TEXT REFERENCES zones(id) ON DELETE RESTRICT,
  manager_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  employee_code        TEXT,
  password_hash        TEXT NOT NULL,
  must_reset_password  INTEGER NOT NULL DEFAULT 1,
  is_active            INTEGER NOT NULL DEFAULT 1,
  xp_total             INTEGER NOT NULL DEFAULT 0,
  xp_spent             INTEGER NOT NULL DEFAULT 0,
  last_login_at        TEXT,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  -- Only a Master Admin may exist without a zone.
  CHECK (zone_id IS NOT NULL OR role = 'MASTER_ADMIN')
);
CREATE INDEX IF NOT EXISTS idx_users_zone ON users(zone_id);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);

-- Groups let an HR BP assign a course to a whole team in one action.
CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  zone_id     TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (zone_id, name)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- A course is created from a Google Drive file or folder.
CREATE TABLE IF NOT EXISTS courses (
  id               TEXT PRIMARY KEY,
  zone_id          TEXT REFERENCES zones(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  source           TEXT NOT NULL CHECK (source IN ('drive_folder','drive_file','manual')),
  drive_id         TEXT,
  cover_emoji      TEXT NOT NULL DEFAULT '📘',
  xp_bonus         INTEGER NOT NULL DEFAULT 50,
  created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_courses_zone ON courses(zone_id);

-- One lesson per Drive file. A folder assignment produces many.
CREATE TABLE IF NOT EXISTS lessons (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  drive_file_id    TEXT NOT NULL,
  mime_type        TEXT,
  web_view_link    TEXT,
  thumbnail_link   TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, drive_file_id)
);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);

-- Every video lesson carries a quiz that is taken after viewing.
CREATE TABLE IF NOT EXISTS quizzes (
  id            TEXT PRIMARY KEY,
  lesson_id     TEXT NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  pass_score    INTEGER NOT NULL DEFAULT 70,
  xp_reward     INTEGER NOT NULL DEFAULT 100,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id            TEXT PRIMARY KEY,
  quiz_id       TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  options_json  TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation   TEXT,
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON quiz_questions(quiz_id, position);

CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  via_group_id  TEXT REFERENCES groups(id) ON DELETE SET NULL,
  due_at        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);

-- Resume support: last_position_seconds is where the rep left off.
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id             TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','watched','completed')),
  last_position_seconds INTEGER NOT NULL DEFAULT 0,
  watched_seconds       INTEGER NOT NULL DEFAULT 0,
  duration_seconds      INTEGER NOT NULL DEFAULT 0,
  started_at            TEXT NOT NULL DEFAULT (datetime('now')),
  watched_at            TEXT,
  completed_at          TEXT,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON lesson_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           TEXT PRIMARY KEY,
  quiz_id      TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score        INTEGER NOT NULL,
  passed       INTEGER NOT NULL,
  xp_awarded   INTEGER NOT NULL DEFAULT 0,
  answers_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xp_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref_type   TEXT,
  ref_id     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_events(user_id, created_at DESC);

-- "Player flexibility": reps spend XP on rewards they choose themselves.
CREATE TABLE IF NOT EXISTS rewards (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('cosmetic','functional','real_world')),
  cost_xp       INTEGER NOT NULL,
  icon          TEXT NOT NULL DEFAULT '🎁',
  repeatable    INTEGER NOT NULL DEFAULT 0,
  min_level     INTEGER NOT NULL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id  TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  cost_xp    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'granted',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON reward_redemptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS certificates (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  serial     TEXT NOT NULL UNIQUE,
  issued_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'nudge',
  action     TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- Enforces "pop-up on app open, at most once per 24 hours" on the server,
-- so the cap holds across devices and reinstalls.
CREATE TABLE IF NOT EXISTS nudge_log (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_shown_at TEXT NOT NULL
);
