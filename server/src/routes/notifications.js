import { Router } from 'express';
import { getDb } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { courseProgress } from '../services/progress.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const NUDGE_INTERVAL_HOURS = 24;

notificationsRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  res.json({
    notifications: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      kind: row.kind,
      action: row.action ? JSON.parse(row.action) : null,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    unreadCount: rows.filter((row) => !row.read_at).length,
  });
});

notificationsRouter.post('/:id/read', (req, res) => {
  getDb()
    .prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/**
 * The pop-up shown when the app opens.
 *
 * The cap lives on the server so it holds across devices and reinstalls: the
 * endpoint returns a nudge at most once in any 24-hour window, and records the
 * moment it hands one out.
 */
notificationsRouter.post('/daily-nudge', (req, res, next) => {
  try {
    const db = getDb();
    const log = db.prepare('SELECT * FROM nudge_log WHERE user_id = ?').get(req.user.id);
    if (log) {
      const hoursSince = (Date.now() - new Date(`${log.last_shown_at}Z`).getTime()) / 3_600_000;
      if (hoursSince < NUDGE_INTERVAL_HOURS) {
        return res.json({
          nudge: null,
          reason: 'already_shown_today',
          nextEligibleInHours: Math.max(0, Math.round((NUDGE_INTERVAL_HOURS - hoursSince) * 10) / 10),
        });
      }
    }

    const nudge = buildNudge(req.user);
    if (!nudge) return res.json({ nudge: null, reason: 'nothing_to_say' });

    db.prepare(
      `INSERT INTO nudge_log (user_id, last_shown_at) VALUES (?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET last_shown_at = datetime('now')`,
    ).run(req.user.id);
    db.prepare('INSERT INTO notifications (id, user_id, title, body, kind, action) VALUES (?, ?, ?, ?, ?, ?)').run(
      randomId('ntf'),
      req.user.id,
      nudge.title,
      nudge.body,
      'nudge',
      nudge.action ? JSON.stringify(nudge.action) : null,
    );
    return res.json({ nudge });
  } catch (error) {
    return next(error);
  }
});

/** Pick the most useful thing to say: finish what is started, then what is due. */
function buildNudge(user) {
  const db = getDb();
  const courses = db
    .prepare(
      `SELECT c.*, a.due_at FROM assignments a JOIN courses c ON c.id = a.course_id
       WHERE a.user_id = ? ORDER BY COALESCE(a.due_at, '9999'), a.created_at`,
    )
    .all(user.id);
  if (!courses.length) return null;

  const withProgress = courses.map((course) => ({ course, progress: courseProgress(user.id, course.id) }));
  const inFlight = withProgress.find((item) => item.progress.status === 'in_progress');
  if (inFlight) {
    return {
      title: 'Pick up where you left off',
      body: `${inFlight.course.title} is ${inFlight.progress.percent}% done. A few minutes gets you closer to your next level.`,
      cta: 'Resume',
      action: { type: 'course', courseId: inFlight.course.id },
    };
  }

  const notStarted = withProgress.find((item) => item.progress.status === 'not_started');
  if (notStarted) {
    return {
      title: 'A course is waiting for you',
      body: `${notStarted.course.title} has ${notStarted.progress.totalLessons} lesson${
        notStarted.progress.totalLessons === 1 ? '' : 's'
      } ready. Start whenever suits you.`,
      cta: 'Start',
      action: { type: 'course', courseId: notStarted.course.id },
    };
  }

  return {
    title: 'All caught up 🎉',
    body: 'Every assigned course is complete. Spend your XP in the rewards store while you wait for the next one.',
    cta: 'Open rewards',
    action: { type: 'rewards' },
  };
}
