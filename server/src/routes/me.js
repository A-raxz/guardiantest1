import { Router } from 'express';
import { getDb, transaction } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { levelFor, xpSummary } from '../services/gamification.js';
import { userCompletion } from '../services/progress.js';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/xp', (req, res) => {
  const history = getDb()
    .prepare('SELECT amount, reason, ref_type, created_at FROM xp_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id)
    .map((row) => ({ amount: row.amount, reason: row.reason, refType: row.ref_type, createdAt: row.created_at }));
  res.json({ ...xpSummary(req.user.id), history });
});

meRouter.get('/certificates', (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT ce.id, ce.serial, ce.issued_at, c.title, c.cover_emoji
       FROM certificates ce JOIN courses c ON c.id = ce.course_id
       WHERE ce.user_id = ? ORDER BY ce.issued_at DESC`,
    )
    .all(req.user.id);
  res.json({
    certificates: rows.map((row) => ({
      id: row.id,
      serial: row.serial,
      issuedAt: row.issued_at,
      courseTitle: row.title,
      coverEmoji: row.cover_emoji,
      holderName: req.user.name,
    })),
  });
});

/** Profile header: level, XP, completion and streak-style counters. */
meRouter.get('/summary', (req, res) => {
  const db = getDb();
  const completion = userCompletion(req.user.id);
  const quizzes = db
    .prepare('SELECT COUNT(*) AS attempts, COALESCE(SUM(passed), 0) AS passed FROM quiz_attempts WHERE user_id = ?')
    .get(req.user.id);
  const certificates = db
    .prepare('SELECT COUNT(*) AS c FROM certificates WHERE user_id = ?')
    .get(req.user.id).c;

  res.json({
    xp: xpSummary(req.user.id),
    completion,
    quizzesPassed: quizzes.passed,
    quizAttempts: quizzes.attempts,
    certificates,
  });
});

/* ----------------------------- Rewards ----------------------------- *
 * The reward mechanism is deliberately a menu rather than a single
 * fixed prize: a rep chooses what their XP buys — cosmetic, functional
 * or real-world — which is the "player flexibility" the brief calls for.
 * ------------------------------------------------------------------- */

meRouter.get('/rewards', (req, res) => {
  const db = getDb();
  const summary = xpSummary(req.user.id);
  const redemptions = db
    .prepare('SELECT reward_id, COUNT(*) AS times, MAX(created_at) AS last_at FROM reward_redemptions WHERE user_id = ? GROUP BY reward_id')
    .all(req.user.id);
  const byReward = new Map(redemptions.map((r) => [r.reward_id, r]));

  const rewards = db
    .prepare('SELECT * FROM rewards WHERE is_active = 1 ORDER BY cost_xp')
    .all()
    .map((reward) => {
      const owned = byReward.get(reward.id);
      const alreadyOwned = Boolean(owned) && !reward.repeatable;
      const levelLocked = summary.level < reward.min_level;
      return {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        kind: reward.kind,
        costXp: reward.cost_xp,
        icon: reward.icon,
        repeatable: Boolean(reward.repeatable),
        minLevel: reward.min_level,
        timesRedeemed: owned?.times ?? 0,
        owned: alreadyOwned,
        locked: levelLocked,
        affordable: summary.xpAvailable >= reward.cost_xp,
        canRedeem: !alreadyOwned && !levelLocked && summary.xpAvailable >= reward.cost_xp,
      };
    });

  res.json({ xp: summary, rewards });
});

meRouter.post('/rewards/:id/redeem', (req, res, next) => {
  try {
    const db = getDb();
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!reward) throw notFound('Reward not found');

    const summary = xpSummary(req.user.id);
    if (summary.level < reward.min_level) throw badRequest(`Reach level ${reward.min_level} to unlock this reward`);
    if (!reward.repeatable) {
      const owned = db
        .prepare('SELECT 1 AS ok FROM reward_redemptions WHERE user_id = ? AND reward_id = ?')
        .get(req.user.id, reward.id);
      if (owned) throw conflict('You already own this reward');
    }
    if (summary.xpAvailable < reward.cost_xp) {
      throw badRequest(`You need ${reward.cost_xp - summary.xpAvailable} more XP for this reward`);
    }

    transaction(() => {
      db.prepare(
        'INSERT INTO reward_redemptions (id, user_id, reward_id, cost_xp) VALUES (?, ?, ?, ?)',
      ).run(randomId('rdm'), req.user.id, reward.id, reward.cost_xp);
      db.prepare('UPDATE users SET xp_spent = xp_spent + ? WHERE id = ?').run(reward.cost_xp, req.user.id);
    });

    res.status(201).json({ ok: true, reward: { id: reward.id, name: reward.name, icon: reward.icon }, xp: xpSummary(req.user.id) });
  } catch (error) {
    next(error);
  }
});

/** Zone leaderboard — light competition, opt-in by simply being in a zone. */
meRouter.get('/leaderboard', (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT id, name, xp_total FROM users
       WHERE role = 'SALES_REP' AND is_active = 1 AND zone_id IS ? 
       ORDER BY xp_total DESC, name LIMIT 20`,
    )
    .all(req.user.zone_id);
  res.json({
    leaderboard: rows.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      name: row.name,
      xpTotal: row.xp_total,
      level: levelFor(row.xp_total).level,
      isMe: row.id === req.user.id,
    })),
  });
});
