# API reference

Base URL: `http://localhost:4000` in development.
All endpoints are under `/api`. Everything except `POST /api/auth/login` and
`GET /api/health` needs `Authorization: Bearer <token>`.

Errors come back as `{ "error": { "message": string, "status": number, "details"?: object } }`.

While an account still holds its issued password (`mustResetPassword: true`) every
endpoint except `/api/auth/me` and `/api/auth/change-password` returns **403**.

Roles: `MASTER_ADMIN`, `HR_BP`, `SALES_MANAGER`, `SALES_REP`.

---

## Auth

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | anyone | `{ email, password }` → `{ token, user, mustResetPassword }`. Wrong password and unknown account return the same message. |
| `GET` | `/api/auth/me` | any signed-in user | Current user. |
| `POST` | `/api/auth/change-password` | any signed-in user | `{ currentPassword, newPassword }` → a fresh token. Clears the forced-reset flag. |

There is no sign-up endpoint. Accounts are created through `POST /api/users`.

## Zones

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/zones` | any signed-in user | Master Admin sees all; everyone else sees only their own. |
| `POST` | `/api/zones` | Master Admin | `{ name, code }` |
| `DELETE` | `/api/zones/:id` | Master Admin | Refuses while the zone still has people. |

## Users

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/users?zoneId=&role=&search=` | Master Admin, HR BP, Sales Manager | HR BP is pinned to their zone; a manager sees only their direct reports; a rep gets 403. |
| `POST` | `/api/users` | Master Admin, HR BP | `{ name, email, role, zoneId?, managerId?, employeeCode? }` → `{ user, temporaryPassword }`. An HR BP may create only reps and managers, in their own zone. One active HR BP per zone. |
| `GET` | `/api/users/:id` | scoped | |
| `PATCH` | `/api/users/:id` | Master Admin, HR BP | `{ name?, isActive?, managerId?, employeeCode? }` |
| `POST` | `/api/users/:id/reset-password` | Master Admin, HR BP | Issues a new temporary password and re-arms the forced reset. |

## Groups

| Method | Path | Who |
| --- | --- | --- |
| `GET` `POST` | `/api/groups` | Master Admin, HR BP |
| `POST` | `/api/groups/:id/members` | Master Admin, HR BP |
| `DELETE` | `/api/groups/:id/members/:userId` | Master Admin, HR BP |
| `DELETE` | `/api/groups/:id` | Master Admin, HR BP |

## Google Drive

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/drive/files?folderId=` | Master Admin, HR BP | Folder listing for the content picker. |
| `GET` | `/api/drive/resolve?driveId=` | Master Admin, HR BP | What assigning this file or folder would produce, before committing. |

## Courses

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/courses?zoneId=` | admins, managers | Reps use `/api/assignments/mine`. |
| `POST` | `/api/courses/from-drive` | Master Admin, HR BP | `{ driveId, title?, description?, zoneId? }`. A folder becomes one lesson per file; each video lesson gets a quiz shell. |
| `GET` | `/api/courses/:id` | scoped | Course + lessons, with `quizId` and `questionCount` per lesson. |
| `PATCH` `DELETE` | `/api/courses/:id` | Master Admin, HR BP | |

## Quizzes (authoring)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/quizzes/lesson/:lessonId` | Master Admin, HR BP | Includes correct answers — admin only. |
| `PUT` | `/api/quizzes/lesson/:lessonId` | Master Admin, HR BP | `{ title?, passScore?, xpReward?, questions: [{ prompt, options[], correctIndex, explanation? }] }`. Replaces the question set. |
| `GET` | `/api/quizzes/course/:courseId/status` | Master Admin, HR BP | Which lessons still need questions. |

## Assignments

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/assignments/mine` | reps, managers | The dashboard: courses, progress, and the resume point with `action: "start" \| "resume"`. |
| `POST` | `/api/assignments` | Master Admin, HR BP | `{ courseId, userIds?, groupIds?, dueAt? }` → assigned count, skips with reasons, and `lessonsWithoutQuestions`. |
| `GET` | `/api/assignments/course/:courseId` | Master Admin, HR BP | Who has it and how far along. |
| `DELETE` | `/api/assignments/:id` | Master Admin, HR BP | |

## Learning

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/learning/lessons/:id` | anyone the course is assigned to | Lesson, playback source (`stream` or `preview`), stored position, quiz summary, next/previous lesson. |
| `GET` | `/api/learning/lessons/:id/stream` | as above | Range-aware proxy of the Drive bytes. Only present when Drive credentials are configured. |
| `POST` | `/api/learning/lessons/:id/progress` | reps, managers | `{ positionSeconds, durationSeconds?, completed? }`. Watched time only moves forward; ≥95% counts as watched. |
| `GET` | `/api/learning/lessons/:id/quiz` | as above | Questions **without** the answers. |
| `POST` | `/api/learning/quizzes/:quizId/attempts` | as above | `{ answers: number[] }` → score, per-question feedback, XP, course progress, certificate. |

## Me — XP, rewards, certificates

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/me/summary` | Level, completion, quizzes passed, certificates. |
| `GET` | `/api/me/xp` | Totals plus the last 50 XP events. |
| `GET` | `/api/me/rewards` | Catalogue with `canRedeem` / `locked` / `affordable` per reward. |
| `POST` | `/api/me/rewards/:id/redeem` | Spends XP. 409 if already owned, 400 if short or under-levelled. |
| `GET` | `/api/me/certificates` | |
| `GET` | `/api/me/leaderboard` | Top reps in the caller's zone. |

## Notifications

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/notifications` | Recent notifications and the unread count. |
| `POST` | `/api/notifications/:id/read` | |
| `POST` | `/api/notifications/daily-nudge` | Call on every app open. Returns a nudge at most once per 24 hours; otherwise `{ nudge: null, reason: "already_shown_today", nextEligibleInHours }`. |

## Reports

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/reports/tracker?zoneId=` | Master Admin, HR BP | **Sales Tracker** — per-person completion for the zone, plus per-course rollups. |
| `GET` | `/api/reports/team?managerId=` | Sales Manager (own team), admins | **Manager dashboard** — completion percentage per employee and team summary. |
| `GET` | `/api/reports/overview` | Master Admin | Every zone, its HR BP, and organisation-wide totals. |
| `GET` | `/api/reports/user/:userId` | scoped | One employee's full record: courses, quiz attempts, certificates. |

People in tracker and team reports carry a `bucket` of `completed`, `in_progress`,
`stalled` (nothing for over a week) or `not_started`.
