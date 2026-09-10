import { getDb } from '../db/index.js';
import { randomId, serialNumber } from '../lib/crypto.js';

/** XP needed to move up one level. */
export const LEVEL_STEP = 500;

export const LEVEL_TITLES = [
  'Rookie',
  'Challenger',
  'Closer',
  'Specialist',
  'Ace',
  'Guardian',
  'Legend',
];

export function levelFor(xpTotal) {
  const level = Math.floor(xpTotal / LEVEL_STEP) + 1;
  const floorXp = (level - 1) * LEVEL_STEP;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xpIntoLevel: xpTotal - floorXp,
    xpForNextLevel: LEVEL_STEP,
    progress: Math.min(1, (xpTotal - floorXp) / LEVEL_STEP),
  };
}

/** Award XP and keep the denormalised user total in step. Returns the new totals. */
export function awardXp(userId, amount, reason, ref = {}) {
  const db = getDb();
  if (amount > 0) {
    db.prepare(
      `INSERT INTO xp_events (id, user_id, amount, reason, ref_type, ref_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomId('xp'), userId, amount, reason, ref.type ?? null, ref.id ?? null);
    db.prepare('UPDATE users SET xp_total = xp_total + ? WHERE id = ?').run(amount, userId);
  }
  return xpSummary(userId);
}

export function xpSummary(userId) {
  const row = getDb()
    .prepare('SELECT xp_total AS total, xp_spent AS spent FROM users WHERE id = ?')
    .get(userId);
  const total = row?.total ?? 0;
  const spent = row?.spent ?? 0;
  return { xpTotal: total, xpSpent: spent, xpAvailable: total - spent, ...levelFor(total) };
}

/**
 * Score a submitted attempt.
 * XP is granted the first time a quiz is passed, scaled by the score so a
 * stronger answer is worth more; later re-takes improve the recorded score
 * but do not farm XP.
 */
export function gradeQuiz(quiz, questions, answers) {
  const results = questions.map((question, index) => {
    const given = answers[index];
    const correct = given === question.correct_index;
    return {
      questionId: question.id,
      prompt: question.prompt,
      givenIndex: typeof given === 'number' ? given : null,
      correctIndex: question.correct_index,
      correct,
      explanation: question.explanation || null,
    };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  return { score, correctCount, total: questions.length, passed: score >= quiz.pass_score, results };
}

export function hasPassedBefore(userId, quizId) {
  const row = getDb()
    .prepare('SELECT 1 AS ok FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND passed = 1 LIMIT 1')
    .get(userId, quizId);
  return Boolean(row);
}

export function issueCertificate(userId, courseId) {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?')
    .get(userId, courseId);
  if (existing) return { certificate: existing, isNew: false };

  const certificate = {
    id: randomId('cert'),
    user_id: userId,
    course_id: courseId,
    serial: serialNumber(),
  };
  db.prepare(
    'INSERT INTO certificates (id, user_id, course_id, serial) VALUES (?, ?, ?, ?)',
  ).run(certificate.id, userId, courseId, certificate.serial);
  return { certificate: db.prepare('SELECT * FROM certificates WHERE id = ?').get(certificate.id), isNew: true };
}

export const DEFAULT_REWARDS = [
  {
    id: 'rw_pick_next',
    name: 'Pick-Your-Path Pass',
    description: 'Choose any assigned course to tackle next, in whatever order suits you.',
    kind: 'functional',
    cost_xp: 300,
    icon: '🧭',
    repeatable: 1,
    min_level: 1,
  },
  {
    id: 'rw_retry',
    name: 'Second-Shot Token',
    description: 'Retake a quiz with a clean slate — your best score is the one that counts.',
    kind: 'functional',
    cost_xp: 250,
    icon: '🔁',
    repeatable: 1,
    min_level: 1,
  },
  {
    id: 'rw_deadline',
    name: 'Breathing Room',
    description: 'Push one course deadline out by three days, no questions asked.',
    kind: 'functional',
    cost_xp: 400,
    icon: '⏳',
    repeatable: 1,
    min_level: 2,
  },
  {
    id: 'rw_theme_midnight',
    name: 'Midnight Theme',
    description: 'Unlock the Midnight colour theme for your app.',
    kind: 'cosmetic',
    cost_xp: 200,
    icon: '🌙',
    repeatable: 0,
    min_level: 1,
  },
  {
    id: 'rw_frame_gold',
    name: 'Gold Avatar Frame',
    description: 'A gold frame around your profile picture on every leaderboard.',
    kind: 'cosmetic',
    cost_xp: 600,
    icon: '🖼️',
    repeatable: 0,
    min_level: 3,
  },
  {
    id: 'rw_title_closer',
    name: 'Custom Title',
    description: 'Set a custom title that shows next to your name in your zone.',
    kind: 'cosmetic',
    cost_xp: 800,
    icon: '🏷️',
    repeatable: 0,
    min_level: 3,
  },
  {
    id: 'rw_coffee',
    name: 'Coffee on the Company',
    description: 'A ₹250 coffee voucher, delivered by your HR Business Partner.',
    kind: 'real_world',
    cost_xp: 1000,
    icon: '☕',
    repeatable: 1,
    min_level: 2,
  },
  {
    id: 'rw_mentor',
    name: 'Mentor Hour',
    description: 'A one-hour coaching session with a senior closer of your choosing.',
    kind: 'real_world',
    cost_xp: 1500,
    icon: '🎯',
    repeatable: 1,
    min_level: 4,
  },
];

export function seedRewards() {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO rewards (id, name, description, kind, cost_xp, icon, repeatable, min_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of DEFAULT_REWARDS) {
    insert.run(r.id, r.name, r.description, r.kind, r.cost_xp, r.icon, r.repeatable, r.min_level);
  }
}
