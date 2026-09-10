import { Router } from 'express';
import { getDb } from '../db/index.js';
import { forbidden, notFound } from '../lib/errors.js';
import { ROLES } from '../lib/roles.js';
import { requireAuth, requireRole, resolveZoneScope } from '../middleware/auth.js';
import { completionByCourse, completionByUser, courseProgress } from '../services/progress.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const average = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

const bucketOf = (percent, lastActivityAt) => {
  if (percent >= 100) return 'completed';
  if (percent === 0) return 'not_started';
  if (!lastActivityAt) return 'in_progress';
  const days = (Date.now() - new Date(`${lastActivityAt}Z`).getTime()) / 86_400_000;
  return days > 7 ? 'stalled' : 'in_progress';
};

/**
 * Sales Tracker — the HR BP's view of training across their own zone.
 * A Master Admin can point it at any zone.
 */
reportsRouter.get('/tracker', requireRole(ROLES.MASTER_ADMIN, ROLES.HR_BP), (req, res, next) => {
  try {
    const db = getDb();
    const zoneId = resolveZoneScope(req.user, req.query.zoneId);
    const people = zoneId
      ? db
          .prepare(
            `SELECT u.*, m.name AS manager_name FROM users u LEFT JOIN users m ON m.id = u.manager_id
             WHERE u.zone_id = ? AND u.role IN ('SALES_REP','SALES_MANAGER') AND u.is_active = 1 ORDER BY u.name`,
          )
          .all(zoneId)
      : db
          .prepare(
            `SELECT u.*, m.name AS manager_name FROM users u LEFT JOIN users m ON m.id = u.manager_id
             WHERE u.role IN ('SALES_REP','SALES_MANAGER') AND u.is_active = 1 ORDER BY u.name`,
          )
          .all();

    const completion = completionByUser(people.map((p) => p.id));
    const rows = people.map((person) => {
      const stats = completion.get(person.id);
      return {
        userId: person.id,
        name: person.name,
        email: person.email,
        role: person.role,
        managerName: person.manager_name,
        xpTotal: person.xp_total,
        lastLoginAt: person.last_login_at,
        ...stats,
        bucket: bucketOf(stats.percent, stats.lastActivityAt),
      };
    });

    res.json({
      zoneId: zoneId ?? null,
      summary: {
        people: rows.length,
        averageCompletion: average(rows.map((r) => r.percent)),
        completed: rows.filter((r) => r.bucket === 'completed').length,
        inProgress: rows.filter((r) => r.bucket === 'in_progress').length,
        stalled: rows.filter((r) => r.bucket === 'stalled').length,
        notStarted: rows.filter((r) => r.bucket === 'not_started').length,
      },
      people: rows,
      courses: completionByCourse(zoneId),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Sales Manager's dashboard — completion percentage per employee for their
 * own team. Reporting only: managers do not assign content.
 */
reportsRouter.get('/team', requireRole(ROLES.SALES_MANAGER, ROLES.HR_BP, ROLES.MASTER_ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    let managerId = req.user.id;
    if (req.user.role !== ROLES.SALES_MANAGER) {
      if (!req.query.managerId) throw notFound('Specify a managerId to view a team');
      const manager = db.prepare('SELECT * FROM users WHERE id = ?').get(String(req.query.managerId));
      if (!manager || manager.role !== ROLES.SALES_MANAGER) throw notFound('Sales Manager not found');
      if (req.user.role === ROLES.HR_BP && manager.zone_id !== req.user.zone_id) {
        throw forbidden('That manager belongs to another zone');
      }
      managerId = manager.id;
    }

    const team = db
      .prepare("SELECT * FROM users WHERE manager_id = ? AND is_active = 1 ORDER BY name").all(managerId);
    const completion = completionByUser(team.map((member) => member.id));

    const members = team.map((member) => {
      const stats = completion.get(member.id);
      const courses = db
        .prepare(
          `SELECT c.id, c.title, c.cover_emoji, a.due_at FROM assignments a JOIN courses c ON c.id = a.course_id
           WHERE a.user_id = ? ORDER BY a.created_at DESC`,
        )
        .all(member.id)
        .map((course) => ({
          courseId: course.id,
          title: course.title,
          coverEmoji: course.cover_emoji,
          dueAt: course.due_at,
          ...courseProgress(member.id, course.id),
        }));

      return {
        userId: member.id,
        name: member.name,
        email: member.email,
        employeeCode: member.employee_code,
        xpTotal: member.xp_total,
        lastLoginAt: member.last_login_at,
        ...stats,
        bucket: bucketOf(stats.percent, stats.lastActivityAt),
        courses,
      };
    });

    res.json({
      managerId,
      summary: {
        teamSize: members.length,
        averageCompletion: average(members.map((m) => m.percent)),
        fullyCompliant: members.filter((m) => m.percent >= 100).length,
        stalled: members.filter((m) => m.bucket === 'stalled').length,
        notStarted: members.filter((m) => m.bucket === 'not_started').length,
      },
      members,
    });
  } catch (error) {
    next(error);
  }
});

/** Master Admin's roll-up across every field office. */
reportsRouter.get('/overview', requireRole(ROLES.MASTER_ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const zones = db.prepare('SELECT * FROM zones ORDER BY name').all();
    const zoneRows = zones.map((zone) => {
      const people = db
        .prepare("SELECT id FROM users WHERE zone_id = ? AND role IN ('SALES_REP','SALES_MANAGER') AND is_active = 1")
        .all(zone.id)
        .map((row) => row.id);
      const completion = completionByUser(people);
      const percents = people.map((id) => completion.get(id).percent);
      const hrBp = db
        .prepare("SELECT name, email FROM users WHERE zone_id = ? AND role = 'HR_BP' AND is_active = 1 LIMIT 1")
        .get(zone.id);
      return {
        zoneId: zone.id,
        name: zone.name,
        code: zone.code,
        hrBpName: hrBp?.name ?? null,
        hrBpEmail: hrBp?.email ?? null,
        people: people.length,
        averageCompletion: average(percents),
        fullyCompliant: percents.filter((p) => p >= 100).length,
      };
    });

    const totals = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE is_active = 1) AS users,
           (SELECT COUNT(*) FROM courses) AS courses,
           (SELECT COUNT(*) FROM assignments) AS assignments,
           (SELECT COUNT(*) FROM certificates) AS certificates,
           (SELECT COALESCE(SUM(amount), 0) FROM xp_events) AS xp_awarded`,
      )
      .get();

    res.json({
      totals: {
        users: totals.users,
        zones: zones.length,
        courses: totals.courses,
        assignments: totals.assignments,
        certificates: totals.certificates,
        xpAwarded: totals.xp_awarded,
      },
      averageCompletion: average(zoneRows.map((z) => z.averageCompletion)),
      zones: zoneRows,
    });
  } catch (error) {
    next(error);
  }
});

/** Drill-down: one employee's full training record. */
reportsRouter.get('/user/:userId', (req, res, next) => {
  try {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
    if (!target) throw notFound('User not found');

    if (req.user.role === ROLES.SALES_REP && target.id !== req.user.id) throw forbidden();
    if (req.user.role === ROLES.SALES_MANAGER && target.manager_id !== req.user.id && target.id !== req.user.id) {
      throw forbidden('That employee is not on your team');
    }
    if (req.user.role === ROLES.HR_BP && target.zone_id !== req.user.zone_id) {
      throw forbidden('That employee belongs to another zone');
    }

    const courses = db
      .prepare(
        `SELECT c.*, a.due_at FROM assignments a JOIN courses c ON c.id = a.course_id
         WHERE a.user_id = ? ORDER BY a.created_at DESC`,
      )
      .all(target.id)
      .map((course) => ({
        courseId: course.id,
        title: course.title,
        coverEmoji: course.cover_emoji,
        dueAt: course.due_at,
        ...courseProgress(target.id, course.id),
      }));

    const attempts = db
      .prepare(
        `SELECT qa.score, qa.passed, qa.created_at, q.title FROM quiz_attempts qa
         JOIN quizzes q ON q.id = qa.quiz_id WHERE qa.user_id = ? ORDER BY qa.created_at DESC LIMIT 25`,
      )
      .all(target.id)
      .map((row) => ({ quizTitle: row.title, score: row.score, passed: Boolean(row.passed), takenAt: row.created_at }));

    res.json({
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        xpTotal: target.xp_total,
        lastLoginAt: target.last_login_at,
      },
      courses,
      attempts,
      certificates: db
        .prepare(
          `SELECT ce.serial, ce.issued_at, c.title FROM certificates ce JOIN courses c ON c.id = ce.course_id
           WHERE ce.user_id = ? ORDER BY ce.issued_at DESC`,
        )
        .all(target.id)
        .map((row) => ({ serial: row.serial, issuedAt: row.issued_at, courseTitle: row.title })),
    });
  } catch (error) {
    next(error);
  }
});
