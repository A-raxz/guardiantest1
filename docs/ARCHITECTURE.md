# Architecture

## Shape of the system

```
┌──────────────────────────┐         ┌────────────────────────────┐        ┌──────────────┐
│  mobile/  React Native   │  HTTPS  │  server/  Node.js + Express│  REST  │ Google Drive │
│  (Expo, iOS + Android)   │ ──────► │  SQLite, JWT auth          │ ─────► │  (service    │
│                          │ ◄────── │  Drive proxy + streaming   │ ◄───── │   account)   │
└──────────────────────────┘         └────────────────────────────┘        └──────────────┘
```

The app never talks to Google directly. It has no Drive credentials, no service-account
key, and no API key to leak — every Drive read goes through the server, which holds the
credentials and re-checks on every request that the caller is actually allowed to see
what they asked for.

## Backend

`server/` is plain ES modules on Node 22 with two runtime dependencies (`express` and
`cors`). Everything else uses the platform: `node:sqlite` for storage, `node:crypto` for
password hashing (scrypt) and for signing both the app's JWTs and the RS256 assertion
that authenticates the service account to Google.

```
src/
├── config.js              Environment, with a tiny .env reader
├── db/
│   ├── schema.sql         The whole data model, with comments
│   ├── index.js           The single connection — swap this file for Postgres
│   └── seed.js            Master Admin bootstrap + a full demo dataset
├── lib/                   crypto, jwt, roles, validation, error types
├── middleware/
│   ├── auth.js            Token → user, role checks, zone scoping
│   └── errorHandler.js
├── services/
│   ├── drive.js           Google Drive REST + a mock provider for dev and tests
│   ├── gamification.js    XP, levels, grading, certificates, reward catalogue
│   ├── progress.js        Completion maths shared by every report
│   └── serializers.js     Database row → API shape
└── routes/                One router per resource
```

### Why SQLite

The whole organisation is roughly 800 people. SQLite handles that comfortably, keeps the
project free of infrastructure, and makes the test suite instant (each file gets a fresh
in-memory database). Every query goes through `db/index.js`; moving to Postgres means
reimplementing that one module and the SQL in `routes/` and `services/`, not restructuring
the app.

### Authorisation

Three layers, applied in this order:

1. **`requireAuth`** turns a bearer token into a user row, rejects deactivated accounts,
   and — importantly — blocks every route except `/auth/me` and `/auth/change-password`
   while `must_reset_password` is set. A default password gets you nowhere.
2. **`requireRole` / `requireAdmin`** gate whole routers by role.
3. **`resolveZoneScope` / `assertSameZone`** are the zone wall. A Master Admin may name
   any zone; everyone else is pinned to their own, and a request that names another zone
   is a 403 rather than an empty result — silence would leave "does that zone exist?"
   answerable by timing.

`CREATABLE_ROLES` in `lib/roles.js` states who may create whom, so the rule lives in one
place rather than being re-derived in each handler.

### Progress and completion

One definition of "done", in `services/progress.js`, is reused by the rep's dashboard, the
Sales Tracker, the manager dashboard and the Master Admin roll-up, so no two screens can
disagree:

> A lesson is complete when its quiz is passed — or when it has been watched and there is
> no quiz with questions to take.

That second clause matters: a video whose quiz the HR BP has not written yet must not
block a rep who has done everything asked of them. The admin screens surface those empty
quizzes prominently instead.

### XP

XP is awarded on the **first** pass of a quiz, scaled by score (`reward × score / 100`), so
a stronger answer is worth more and re-taking a passed quiz earns nothing. Course
completion adds a bonus and issues a certificate, exactly once, guarded by a unique index
on `(user_id, course_id)`.

Redeeming a reward increments `xp_spent`, never `xp_total` — spending is real, but it
cannot demote you. Level is `floor(total / 500) + 1`.

## Mobile app

Expo SDK 57, React Native 0.86, TypeScript, React Navigation 7.

```
src/
├── api/         Typed client + one function per endpoint
├── state/       Auth context (SecureStore-backed) and a small data-fetching hook
├── theme/       Colours, spacing, type scale — one source for the whole app
├── components/  Screen, Card, AppButton, Field, ProgressBar, Pill, DailyNudge, …
├── navigation/  Role-based tabs inside one stack
└── screens/     rep/ · manager/ · admin/ · shared/
```

**Navigation is role-shaped.** `RoleTabs` returns a different tab set per role, so a rep
has no route to an admin screen even if a link were somehow constructed. The server
enforces the same rules independently — the navigation is for clarity, not security.

**The auth token** lives in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences
on Android). A 401 from any request signs the user out through a handler the auth context
registers with the API client, so an expired session cannot leave a screen half-alive.

**Video playback** has two paths. When the server can stream the Drive file it uses
`expo-video` with native controls, seeking to the stored position on open and writing the
position back every ten seconds and on unmount — which is what makes resume exact. When it
cannot (no credentials, or a Google-native file) it falls back to Drive's embedded preview
in a WebView; that embed exposes no playback events, so the screen counts time on screen
and asks the rep to confirm they have finished.

**The daily pop-up** asks the server on every foreground. The server decides whether 24
hours have passed and what to say, so the cap survives reinstalls, clock changes and a
second device — and the copy can change without an app release.

## Testing

`server/tests/` covers the rules, not the plumbing: that there is no sign-up route, that a
default password unlocks nothing, that an HR BP cannot see or touch another zone, that a
manager cannot assign, that leaving a video mid-way resumes at the same second, that
scrubbing backwards does not lose watched time, that a passed quiz cannot be farmed for
XP, and that the nudge is capped at one per day.

The mobile app is typechecked (`npm run typecheck`) and bundles for both platforms; the
web target exists so the whole app can be driven in a browser during review.

## What would come next

- Push notifications (`expo-notifications`) for assignment and due-date reminders — the
  in-app nudge is deliberately separate from this and would stay.
- Offline video download for reps in the field.
- A web console for HR BPs who would rather do bulk work on a laptop; the API is already
  the whole product, so this is a second client, not a second backend.
- Postgres and object storage if the organisation outgrows a single node.
