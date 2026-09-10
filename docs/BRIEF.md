# Guardians LMS — source brief

Transcribed from *Guardians LMS_ Guardians School Of Learning.docx*, the planning
document this project was built from. Section 8 of that document listed assumptions to
confirm; per the build instruction those were not raised as questions — how each was
resolved is recorded at the end.

## 2. Tech stack

- Frontend: React Native (single codebase for iOS + Android)
- Backend: Node.js
- Content storage: Google Drive (course videos/materials are assigned directly from Drive)

## 3. User roles & permissions

Four roles, structured around zones ("field offices"):

**a) Master Admin (CHRO)** — full access to the entire system, all zones, all users.
Creates and manages HR Business Partner (HR BP) admin accounts. Can also directly
manage/issue login credentials if needed (a fallback for the HR BP's normal job).

**b) HR Business Partner (HR BP) Admin** — one HR BP per zone/field office. Can only see
and manage people belonging to their own zone, with no visibility into other zones.
Creates login credentials for sales reps and managers in their zone; assigns
courses/content sourced from Google Drive, including assigning an entire folder at once;
uses the Sales Tracker to monitor training progress across their zone.

**c) Sales Manager** — views performance dashboards/reports for their team, sees
completion percentages per employee, and has an admin-style reporting dashboard
(read/reporting focus, not content assignment).

**d) Sales Employee / Rep ("course receiver")** — end user of the training content. Logs
in with credentials issued by their zone's HR BP. Views assigned courses, watches videos,
takes quizzes, earns XP, tracks their own progress.

**e) Authentication model** — no public/self-service sign-up page; login only. Accounts
are created on the backend by the HR BP for their zone (or by the Master Admin as a
fallback). New accounts get a default password, with a forced password reset on first
login.

## 4. Core app flow

```
HR BP assigns content (from Google Drive, file or folder)
        ↓
Appears on the Sales Rep's User Dashboard
        ↓
Sales Rep watches the assigned Video
        ↓
Sales Rep takes a Quiz on that content
        ↓
Rep earns XP (gamified reward)
```

**Home page** — a "Start" button to begin an assigned course. Resume support is required:
a rep should be able to leave a course mid-way and pick up where they left off, not
restart.

**Notifications** — a pop-up on app open, capped at once per day (a reminder to continue
training, shown no more than once in a 24-hour period).

## 5. Content & integration

Course videos and materials live in Google Drive; the app does not need its own file
storage for source content. HR BP admins assign content by connecting to Google Drive and
selecting either a single file or an entire folder (to batch-assign multiple files/videos
at once). Each piece of assigned video content should have a quiz attached, to be taken
after viewing.

## 6. Gamification & engagement

- XP system: reps earn XP by completing quizzes after videos.
- Reward mechanism: needs "player flexibility" — avoid a single rigid reward path; give
  reps some choice in how they progress or what they unlock.
- Certification and skill-development milestones tied to course/quiz completion.

## 7. Reporting & tracking

- **Sales Tracker** — used by the HR BP to track training progress within their zone.
- **Admin Dashboard** — used by sales managers to view team reports, including percentage
  completion per employee and overall team training status.

## 8. Assumptions, and how this build resolved them

The brief asked for these to be confirmed before building. They were resolved as follows,
each choice reversible without restructuring anything.

| Open point | How it was built |
| --- | --- |
| Role model — earlier notes described three sign-up profiles; later notes revised this to login-only with HR split into Master Admin and HR BP | Built to the **later, revised model**, as the brief itself recommends. Four roles, no sign-up route anywhere in the API. |
| "Player flexibility" in the reward mechanism is not fully specified | XP is treated as a **currency, not a single prize**. Reps spend it in a reward store on perks that change how they learn (pick-your-path pass, second-shot token, deadline extension), cosmetics, or off-app rewards — and courses are offered in any order rather than gated in sequence. The catalogue is data (`rewards` table), so it can be re-priced or replaced without code changes. |
| "AR assignment" in the flow diagram — Augmented Reality, or shorthand for something else? | Read as **assignment/reporting**, not Augmented Reality. No AR is in scope; nothing else in the brief implies it, and it would be a different project. |
| Team size context (800 total / ~700 sales / 15 per project) | Treated as **organisational background**, not a spec. No hard caps on users per zone. |
| Sales Manager's role in content assignment | Managers are **report-only** — the API refuses assignment and credential creation from a manager account, and there is a test for it. |
