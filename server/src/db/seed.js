import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getDb } from './index.js';
import { hashPassword, randomId } from '../lib/crypto.js';
import { ROLES } from '../lib/roles.js';
import { seedRewards } from '../services/gamification.js';
import { resolveDriveSelection } from '../services/drive.js';

const log = (quiet, ...args) => {
  if (!quiet) console.log(...args);
};

/**
 * Bootstraps the one account that cannot be created through the app: the
 * Master Admin. Everything else is created by an admin from inside the app.
 */
export function ensureSeedData({ quiet = false } = {}) {
  const db = getDb();
  seedRewards();

  const existing = db.prepare("SELECT id FROM users WHERE role = 'MASTER_ADMIN' LIMIT 1").get();
  if (existing) return existing.id;

  const id = randomId('usr');
  db.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, must_reset_password)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(id, config.seed.masterEmail, 'CHRO — Master Admin', ROLES.MASTER_ADMIN, hashPassword(config.seed.masterPassword));

  log(quiet, `Created Master Admin: ${config.seed.masterEmail} / ${config.seed.masterPassword}`);
  return id;
}

const QUESTION_BANK = {
  'Welcome to Guardians': [
    {
      prompt: 'What does the Guardians School Of Learning exist to do?',
      options: [
        'Track holiday requests',
        'Give every rep the training they need to sell well',
        'Replace the CRM',
        'Manage payroll',
      ],
      correctIndex: 1,
      explanation: 'The school exists to build selling capability across every zone.',
    },
    {
      prompt: 'Who issues your login credentials?',
      options: ['You sign up yourself', 'Your zone HR Business Partner', 'The IT helpdesk', 'Your customer'],
      correctIndex: 1,
      explanation: 'There is no public sign-up — the HR BP for your zone creates your account.',
    },
    {
      prompt: 'What earns you XP in the app?',
      options: ['Opening the app', 'Passing the quiz that follows a video', 'Logging in daily', 'Sending an email'],
      correctIndex: 1,
    },
  ],
  'Using the CRM': [
    {
      prompt: 'When should a call be logged in the CRM?',
      options: ['At the end of the month', 'Same day, while the detail is fresh', 'Only if it closed', 'Never'],
      correctIndex: 1,
    },
    {
      prompt: 'What makes a pipeline stage change valid?',
      options: [
        'A gut feeling',
        'An agreed next step with the customer',
        'A manager asking for it',
        'The end of the quarter',
      ],
      correctIndex: 1,
    },
  ],
  'The Guardians Pitch': [
    {
      prompt: 'What opens the Guardians pitch?',
      options: ['The price list', 'The customer’s problem in their own words', 'A product tour', 'A discount'],
      correctIndex: 1,
    },
    {
      prompt: 'How long should the core pitch run?',
      options: ['Under three minutes', 'Twenty minutes', 'An hour', 'As long as it takes'],
      correctIndex: 0,
    },
  ],
  'Data Privacy Essentials': [
    {
      prompt: 'A customer asks what happens to their data. What do you do?',
      options: [
        'Guess',
        'Point them to the published privacy notice and escalate anything you are unsure of',
        'Say nothing',
        'Promise it is never stored',
      ],
      correctIndex: 1,
    },
    {
      prompt: 'Where may customer contact details be stored?',
      options: ['A personal spreadsheet', 'Your phone notes', 'The approved CRM only', 'A shared chat group'],
      correctIndex: 2,
    },
  ],
  'Code of Conduct': [
    {
      prompt: 'A prospect offers you a personal gift to win the deal. What is the correct response?',
      options: ['Accept quietly', 'Decline and report it', 'Accept and share it with the team', 'Ask for cash instead'],
      correctIndex: 1,
    },
    {
      prompt: 'Who can you raise a conduct concern with?',
      options: ['Nobody', 'Your manager or your zone HR Business Partner', 'Only the CHRO', 'A customer'],
      correctIndex: 1,
    },
  ],
};

const GENERIC_QUESTIONS = (title) => [
  {
    prompt: `What is the main takeaway from "${title}"?`,
    options: [
      'It is optional background reading',
      'It sets the standard you are expected to apply in the field',
      'It only applies to managers',
      'It replaces the sales process',
    ],
    correctIndex: 1,
  },
  {
    prompt: 'Where do you go if something in this lesson is unclear?',
    options: ['Ignore it', 'Ask your manager or zone HR BP', 'Guess in front of the customer', 'Wait a year'],
    correctIndex: 1,
  },
];

/** Full demo dataset: three zones, staff, Drive-sourced courses and assignments. */
export async function seedDemoData({ quiet = false } = {}) {
  const db = getDb();
  const masterId = ensureSeedData({ quiet });
  const password = config.defaultUserPassword;

  const zones = [
    { name: 'North Zone', code: 'NZ' },
    { name: 'West Zone', code: 'WZ' },
    { name: 'South Zone', code: 'SZ' },
  ].map((zone) => {
    const existing = db.prepare('SELECT * FROM zones WHERE code = ?').get(zone.code);
    if (existing) return existing;
    const id = randomId('zone');
    db.prepare('INSERT INTO zones (id, name, code) VALUES (?, ?, ?)').run(id, zone.name, zone.code);
    return db.prepare('SELECT * FROM zones WHERE id = ?').get(id);
  });

  const createUser = ({ email, name, role, zoneId, managerId = null, employeeCode = null }) => {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) return existing;
    const id = randomId('usr');
    db.prepare(
      `INSERT INTO users (id, email, name, role, zone_id, manager_id, employee_code, password_hash, must_reset_password, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(id, email, name, role, zoneId, managerId, employeeCode, hashPassword(password), masterId);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  };

  const staff = [
    { zone: 0, hrBp: ['priya.sharma@guardians.example', 'Priya Sharma'], manager: ['arun.mehta@guardians.example', 'Arun Mehta'], reps: [['ravi.kumar@guardians.example', 'Ravi Kumar'], ['neha.gupta@guardians.example', 'Neha Gupta'], ['sameer.iyer@guardians.example', 'Sameer Iyer']] },
    { zone: 1, hrBp: ['kavya.rao@guardians.example', 'Kavya Rao'], manager: ['deepak.nair@guardians.example', 'Deepak Nair'], reps: [['isha.patel@guardians.example', 'Isha Patel'], ['rohit.singh@guardians.example', 'Rohit Singh']] },
    { zone: 2, hrBp: ['anita.desai@guardians.example', 'Anita Desai'], manager: ['vikram.reddy@guardians.example', 'Vikram Reddy'], reps: [['meera.joshi@guardians.example', 'Meera Joshi'], ['karan.malhotra@guardians.example', 'Karan Malhotra']] },
  ];

  const created = { hrBps: [], managers: [], reps: [] };
  staff.forEach((entry, index) => {
    const zone = zones[entry.zone];
    const hrBp = createUser({ email: entry.hrBp[0], name: entry.hrBp[1], role: ROLES.HR_BP, zoneId: zone.id });
    const manager = createUser({ email: entry.manager[0], name: entry.manager[1], role: ROLES.SALES_MANAGER, zoneId: zone.id });
    created.hrBps.push(hrBp);
    created.managers.push(manager);
    entry.reps.forEach(([email, name], repIndex) => {
      created.reps.push(
        createUser({
          email,
          name,
          role: ROLES.SALES_REP,
          zoneId: zone.id,
          managerId: manager.id,
          employeeCode: `G${index + 1}${String(repIndex + 1).padStart(3, '0')}`,
        }),
      );
    });
  });

  // Courses built the same way the app builds them: from a Drive selection.
  const courseSpecs = [
    { driveId: 'fold-onboarding', zone: zones[0], emoji: '🚀' },
    { driveId: 'fold-compliance', zone: zones[0], emoji: '🛡️' },
    { driveId: 'fold-product', zone: zones[1], emoji: '💼' },
    { driveId: 'fold-onboarding', zone: zones[1], emoji: '🚀' },
    { driveId: 'fold-compliance', zone: zones[2], emoji: '🛡️' },
  ];

  for (const spec of courseSpecs) {
    const already = db
      .prepare('SELECT id FROM courses WHERE zone_id = ? AND drive_id = ?')
      .get(spec.zone.id, spec.driveId);
    if (already) continue;

    const selection = await resolveDriveSelection(spec.driveId);
    const courseId = randomId('crs');
    const hrBp = created.hrBps.find((u) => u.zone_id === spec.zone.id);
    db.prepare(
      `INSERT INTO courses (id, zone_id, title, description, source, drive_id, cover_emoji, xp_bonus, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      courseId,
      spec.zone.id,
      selection.root.name.replace(/^\d+\s*—\s*/, ''),
      `Assigned from Google Drive folder "${selection.root.name}".`,
      selection.kind,
      selection.root.id,
      spec.emoji,
      50,
      hrBp?.id ?? masterId,
    );

    selection.items.forEach((item, index) => {
      const lessonTitle = item.name.replace(/\.[a-z0-9]{2,5}$/i, '');
      const lessonId = randomId('lsn');
      db.prepare(
        `INSERT INTO lessons (id, course_id, title, drive_file_id, mime_type, web_view_link, duration_seconds, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(lessonId, courseId, lessonTitle, item.id, item.mimeType, item.webViewLink, item.durationSeconds, index);

      if (!item.isVideo) return;
      const quizId = randomId('quz');
      db.prepare('INSERT INTO quizzes (id, lesson_id, title, pass_score, xp_reward) VALUES (?, ?, ?, ?, ?)').run(
        quizId,
        lessonId,
        `Quiz — ${lessonTitle}`,
        70,
        100,
      );
      const questions = QUESTION_BANK[lessonTitle] || GENERIC_QUESTIONS(lessonTitle);
      questions.forEach((question, position) => {
        db.prepare(
          `INSERT INTO quiz_questions (id, quiz_id, prompt, options_json, correct_index, explanation, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          randomId('qq'),
          quizId,
          question.prompt,
          JSON.stringify(question.options),
          question.correctIndex,
          question.explanation ?? null,
          position,
        );
      });
    });
  }

  // Assign every course to the reps and managers of its own zone.
  const assign = db.prepare(
    `INSERT OR IGNORE INTO assignments (id, course_id, user_id, assigned_by, due_at)
     VALUES (?, ?, ?, ?, date('now', '+14 days'))`,
  );
  for (const course of db.prepare('SELECT * FROM courses').all()) {
    const hrBp = created.hrBps.find((u) => u.zone_id === course.zone_id);
    const audience = db
      .prepare("SELECT id FROM users WHERE zone_id = ? AND role IN ('SALES_REP','SALES_MANAGER')")
      .all(course.zone_id);
    for (const person of audience) assign.run(randomId('asg'), course.id, person.id, hrBp?.id ?? masterId);
  }

  log(quiet, '\nDemo data ready.');
  log(quiet, `  Master Admin  : ${config.seed.masterEmail} / ${config.seed.masterPassword}`);
  log(quiet, `  HR BP         : ${staff[0].hrBp[0]} / ${password}`);
  log(quiet, `  Sales Manager : ${staff[0].manager[0]} / ${password}`);
  log(quiet, `  Sales Rep     : ${staff[0].reps[0][0]} / ${password}`);
  log(quiet, `  Zones         : ${zones.map((z) => z.code).join(', ')}`);
}

// True only when this file is the entry point (`npm run seed`), not when it is
// imported by the server. Compared as resolved paths so it holds on Windows,
// where argv[1] uses backslashes and import.meta.url does not.
const isDirectRun =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await seedDemoData();
}
