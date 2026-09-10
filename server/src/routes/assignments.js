import { Router } from 'express';
import { getDb, transaction } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ROLES } from '../lib/roles.js';
import { asArray, requireFields } from '../lib/validate.js';
import { assertSameZone, requireAdmin, requireAuth } from '../middleware/auth.js';
import { courseProgress } from '../services/progress.js';
import { publicCourse } from '../services/serializers.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

/**
 * The rep's dashboard payload: everything assigned to them, with progress and
 * the exact lesson + second to resume from.
 */
assignmentsRouter.get('/mine', (req, res, next) => {
  try {
    const db = getDb();
    const courses = db
      .prepare(
        `SELECT c.*, a.due_at AS due_at, a.created_at AS assignment_created_at
         FROM assignments a JOIN courses c ON c.id = a.course_id
         WHERE a.user_id = ? ORDER BY a.created_at DESC`,
      )
      .all(req.user.id);

    const items = courses.map((course) => {
      const progress = courseProgress(req.user.id, course.id);
      const resume = progress.nextLessonId
        ? db
            .prepare(
              `SELECT l.id, l.title, l.duration_seconds, COALESCE(lp.last_position_seconds, 0) AS position_seconds,
                      COALESCE(lp.status, 'not_started') AS status
               FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
               WHERE l.id = ?`,
            )
            .get(req.user.id, progress.nextLessonId)
        : null;

      return {
        course: publicCourse(course),
        dueAt: course.due_at,
        assignedAt: course.assignment_created_at,
        progress,
        resume: resume
          ? {
              lessonId: resume.id,
              lessonTitle: resume.title,
              positionSeconds: resume.position_seconds,
              durationSeconds: resume.duration_seconds,
              status: resume.status,
              // "Start" for a fresh course, "Resume" once they have left off partway.
              action: resume.position_seconds > 0 || resume.status !== 'not_started' ? 'resume' : 'start',
            }
          : null,
      };
    });

    // Reps choose their own order, so the list is offered rather than gated:
    // continue-where-you-left-off first, then everything else.
    const inFlight = items.filter((i) => i.progress.status === 'in_progress');
    const notStarted = items.filter((i) => i.progress.status === 'not_started');
    const done = items.filter((i) => i.progress.status === 'completed');

    res.json({
      continueLearning: inFlight[0] || notStarted[0] || null,
      courses: [...inFlight, ...notStarted, ...done],
      counts: { total: items.length, inProgress: inFlight.length, notStarted: notStarted.length, completed: done.length },
    });
  } catch (error) {
    next(error);
  }
});

/** Assign a course to individuals and/or whole groups. */
assignmentsRouter.post('/', requireAdmin, (req, res, next) => {
  try {
    requireFields(req.body, ['courseId']);
    const db = getDb();
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.body.courseId);
    if (!course) throw notFound('Course not found');
    assertSameZone(req.user, course.zone_id);

    const userIds = new Set(req.body.userIds ? asArray(req.body.userIds, 'userIds') : []);
    const groupIds = req.body.groupIds ? asArray(req.body.groupIds, 'groupIds') : [];
    const viaGroup = new Map();

    for (const groupId of groupIds) {
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
      if (!group) throw notFound(`Group "${groupId}" not found`);
      assertSameZone(req.user, group.zone_id);
      for (const member of db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(group.id)) {
        userIds.add(member.user_id);
        if (!viaGroup.has(member.user_id)) viaGroup.set(member.user_id, group.id);
      }
    }
    if (!userIds.size) throw badRequest('Select at least one person or group');

    const dueAt = req.body.dueAt ? String(req.body.dueAt) : null;
    const insertAssignment = db.prepare(
      `INSERT OR IGNORE INTO assignments (id, course_id, user_id, assigned_by, via_group_id, due_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertNotification = db.prepare(
      'INSERT INTO notifications (id, user_id, title, body, kind, action) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const assigned = [];
    const skipped = [];
    transaction(() => {
      for (const userId of userIds) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) throw notFound(`User "${userId}" not found`);
        assertSameZone(req.user, user.zone_id);
        if (user.zone_id !== course.zone_id) {
          skipped.push({ userId, reason: 'Belongs to a different zone' });
          continue;
        }
        if (user.role !== ROLES.SALES_REP && user.role !== ROLES.SALES_MANAGER) {
          skipped.push({ userId, reason: 'Courses are assigned to reps and managers only' });
          continue;
        }
        const result = insertAssignment.run(
          randomId('asg'),
          course.id,
          userId,
          req.user.id,
          viaGroup.get(userId) ?? null,
          dueAt,
        );
        if (result.changes > 0) {
          assigned.push(userId);
          insertNotification.run(
            randomId('ntf'),
            userId,
            'New course assigned',
            `${course.title} is waiting for you. ${course.title.length > 40 ? '' : 'Start whenever you are ready.'}`.trim(),
            'assignment',
            JSON.stringify({ type: 'course', courseId: course.id }),
          );
        } else {
          skipped.push({ userId, reason: 'Already assigned' });
        }
      }
    });

    const missingQuizzes = db
      .prepare(
        `SELECT l.title FROM lessons l
         LEFT JOIN quizzes q ON q.lesson_id = l.id
         LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
         WHERE l.course_id = ? AND qq.id IS NULL AND l.mime_type LIKE 'video/%'`,
      )
      .all(course.id)
      .map((row) => row.title);

    res.status(201).json({
      assignedCount: assigned.length,
      assignedUserIds: assigned,
      skipped,
      // Surfaced so the HR BP knows which videos still need questions written.
      lessonsWithoutQuestions: missingQuizzes,
    });
  } catch (error) {
    next(error);
  }
});

/** Who has this course, and how far along are they. */
assignmentsRouter.get('/course/:courseId', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId);
    if (!course) throw notFound('Course not found');
    assertSameZone(req.user, course.zone_id);

    const rows = db
      .prepare(
        `SELECT a.id AS assignment_id, a.due_at, a.created_at, u.id AS user_id, u.name, u.email, u.role, g.name AS group_name
         FROM assignments a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN groups g ON g.id = a.via_group_id
         WHERE a.course_id = ? ORDER BY u.name`,
      )
      .all(course.id);

    res.json({
      course: publicCourse(course),
      assignments: rows.map((row) => ({
        assignmentId: row.assignment_id,
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        viaGroup: row.group_name,
        dueAt: row.due_at,
        assignedAt: row.created_at,
        progress: courseProgress(row.user_id, course.id),
      })),
    });
  } catch (error) {
    next(error);
  }
});

assignmentsRouter.delete('/:id', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT a.*, c.zone_id AS zone_id FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.id = ?')
      .get(req.params.id);
    if (!row) throw notFound('Assignment not found');
    assertSameZone(req.user, row.zone_id);
    db.prepare('DELETE FROM assignments WHERE id = ?').run(row.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
