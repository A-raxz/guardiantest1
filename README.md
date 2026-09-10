# Guardians LMS — Guardians School Of Learning

A learning management app for the Guardians sales organisation, built to the brief in
`docs/BRIEF.md`. One React Native codebase ships to **iOS and Android**; a Node.js API
serves it, and course material comes straight out of **Google Drive**.

```
guardiantest1/
├── mobile/     React Native (Expo) app — iOS + Android from one codebase
├── server/     Node.js API — auth, assignments, quizzes, XP, reporting
└── docs/       Brief, architecture notes and the API reference
```

## What it does

**HR BP assigns content from Drive → it appears on the rep's dashboard → the rep watches
the video → takes the quiz → earns XP.** That flow is the spine of the app.

| Role | What they get |
| --- | --- |
| **Master Admin (CHRO)** | Every zone. Creates zones and HR BP accounts, and can issue any credential directly as a fallback. Roll-up reporting across all field offices. |
| **HR Business Partner** | One zone only, with no visibility into the others. Creates rep and manager logins, assigns Drive content (a file, or a whole folder in one action), writes quizzes, and runs the Sales Tracker. |
| **Sales Manager** | A read-only dashboard: completion percentage per employee and the team's overall status. Managers are course receivers too, but they cannot assign content. |
| **Sales Rep** | Assigned courses, video playback with resume, quizzes, XP, rewards and certificates. |

Also built in:

- **Login only — no sign-up anywhere.** Accounts are created by an admin, issued with a
  temporary password, and every account must set its own password before it can do
  anything else.
- **Resume support.** The player writes the watched position back every ten seconds and
  again on exit, so leaving mid-video and returning picks up at the same second. The home
  screen's button says *Start* on a fresh course and *Resume* once there is something to
  return to.
- **A quiz on every video.** Creating a course from Drive attaches a quiz to each video
  lesson; the HR BP fills in the questions, and the app shows them which are still empty.
- **A once-a-day pop-up.** The cap is enforced by the API, so it holds across devices and
  reinstalls rather than trusting the phone's clock.
- **XP with real choice.** XP is a currency, not a single fixed prize: reps spend it on
  perks that change how they learn, cosmetics, or off-app rewards — and they choose which
  assigned course to tackle next rather than being marched down one path.
- **Certificates** issued automatically when every lesson in a course is complete.

## Running it

You need **Node 22.5 or newer** (the server uses the built-in SQLite module).

```bash
# 1. API
cd server
cp .env.example .env
npm install
npm run seed        # demo zones, staff, Drive-sourced courses and assignments
npm start           # http://localhost:4000

# 2. App
cd ../mobile
npm install
npm start           # then press i (iOS simulator), a (Android), or scan the QR code
```

The app finds the API automatically: it talks to whatever machine is running
`expo start`, on port 4000. Point it somewhere else with `EXPO_PUBLIC_API_URL`.

### Demo logins

After `npm run seed` (every account below uses the password `Guardians@123`, except the
Master Admin):

| Role | Email | Password |
| --- | --- | --- |
| Master Admin | `chro@guardians.example` | `Master@123` |
| HR BP — North Zone | `priya.sharma@guardians.example` | `Guardians@123` |
| Sales Manager | `arun.mehta@guardians.example` | `Guardians@123` |
| Sales Rep | `ravi.kumar@guardians.example` | `Guardians@123` |

## Google Drive

Out of the box the server runs with `DRIVE_PROVIDER=mock`: a small sample Drive tree so
the whole flow can be demoed and tested without credentials.

To connect the real thing, create a Google Cloud service account, enable the Drive API,
share the training folder with the service account's email, and set:

```bash
DRIVE_PROVIDER=google
GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json
# For a shared drive, also impersonate a Workspace user:
GOOGLE_IMPERSONATE_SUBJECT=training@guardians.example
```

With credentials configured the API streams video bytes through
`/api/learning/lessons/:id/stream`, so the app plays Drive files natively (with a real
scrubber, and therefore accurate resume) and the service-account token never leaves the
server. Without them the app falls back to Drive's embedded preview in a WebView.

## Tests

```bash
cd server && npm test        # 44 API tests: auth, zone isolation, the full learning flow, reporting
cd mobile && npm run typecheck
```

The API suite runs against a throwaway in-memory database and covers the rules that
matter: no sign-up route, forced password reset, an HR BP never seeing another zone, a
manager never assigning content, XP that cannot be farmed by re-taking a passed quiz, and
the once-per-24-hours nudge cap.

## Shipping to the stores

```bash
cd mobile
npx eas build --platform ios        # or android
npx eas submit --platform ios
```

`eas.json` carries development, preview and production profiles, each pointing at the
right API. Bundle identifiers are `com.guardians.lms` on both platforms. Set a real
`projectId` in `app.json` under `extra.eas` when the EAS project is created.

## Documentation

- [`docs/BRIEF.md`](docs/BRIEF.md) — the requirements this was built from
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it fits together and why
- [`docs/API.md`](docs/API.md) — every endpoint
