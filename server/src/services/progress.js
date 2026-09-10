import { getDb } from '../db/index.js';

/** A lesson counts as done when its quiz is passed (or it has no quiz to take). */
export const LESSON_DONE_SQL = `
  CASE
    WHEN lp.status = 'completed' THEN 1
    WHEN lp.status = 'watched' AND (q.id IS NULL OR COALESCE(qq.question_count, 0) = 0) THEN 1
    ELSE 0
  END`;

const COURSE_ROWS_SQL = `
  SELECT
    l.id                AS lesson_id,
    l.course_id         AS course_id,
    ${LESSON_DONE_SQL}  AS done,
    COALESCE(lp.status, 'not_started') AS status,
    lp.updated_at       AS updated_at
  FROM lessons l
  LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
  LEFT JOIN quizzes q ON q.lesson_id = l.id
  LEFT JOIN (
    SELECT quiz_id, COUNT(*) AS question_count FROM quiz_questions GROUP BY quiz_id
  ) qq ON qq.quiz_id = q.id
  WHERE l.course_id = ?
  ORDER BY l.position, l.created_at`;

export function courseProgress(userId, courseId) {
  const rows = getDb().prepare(COURSE_ROWS_SQL).all(userId, courseId);
  const total = rows.length;
  const completed = rows.filter((r) => r.done === 1).length;
  const started = rows.some((r) => r.status !== 'not_started');
  const nextLesson = rows.find((r) => r.done !== 1) || null;
  return {
    totalLessons: total,
    completedLessons: completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    status: total && completed === total ? 'completed' : started ? 'in_progress' : 'not_started',
    nextLessonId: nextLesson ? nextLesson.lesson_id : null,
    lastActivityAt: rows.reduce((latest, r) => (r.updated_at > (latest || '') ? r.updated_at : latest), null),
  };
}

/** Overall completion across everything assigned to one user. */
export function userCompletion(userId) {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(l.id) AS total_lessons,
         COALESCE(SUM(${LESSON_DONE_SQL}), 0) AS done_lessons
       FROM assignments a
       JOIN lessons l ON l.course_id = a.course_id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = a.user_id
       LEFT JOIN quizzes q ON q.lesson_id = l.id
       LEFT JOIN (
         SELECT quiz_id, COUNT(*) AS question_count FROM quiz_questions GROUP BY quiz_id
       ) qq ON qq.quiz_id = q.id
       WHERE a.user_id = ?`,
    )
    .get(userId);
  const total = row?.total_lessons ?? 0;
  const done = row?.done_lessons ?? 0;
  return { totalLessons: total, completedLessons: done, percent: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * Completion per employee for a set of users — the shape both the HR BP's
 * Sales Tracker and the Sales Manager's dashboard are built on.
 */
export function completionByUser(userIds) {
  if (!userIds.length) return new Map();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT
         a.user_id                                   AS user_id,
         COUNT(DISTINCT a.course_id)                 AS courses_assigned,
         COUNT(l.id)                                 AS total_lessons,
         COALESCE(SUM(${LESSON_DONE_SQL}), 0)        AS done_lessons,
         MAX(lp.updated_at)                          AS last_activity_at
       FROM assignments a
       JOIN lessons l ON l.course_id = a.course_id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = a.user_id
       LEFT JOIN quizzes q ON q.lesson_id = l.id
       LEFT JOIN (
         SELECT quiz_id, COUNT(*) AS question_count FROM quiz_questions GROUP BY quiz_id
       ) qq ON qq.quiz_id = q.id
       WHERE a.user_id IN (${placeholders})
       GROUP BY a.user_id`,
    )
    .all(...userIds);

  const map = new Map();
  for (const row of rows) {
    map.set(row.user_id, {
      coursesAssigned: row.courses_assigned,
      totalLessons: row.total_lessons,
      completedLessons: row.done_lessons,
      percent: row.total_lessons ? Math.round((row.done_lessons / row.total_lessons) * 100) : 0,
      lastActivityAt: row.last_activity_at || null,
    });
  }
  for (const id of userIds) {
    if (!map.has(id)) {
      map.set(id, {
        coursesAssigned: 0,
        totalLessons: 0,
        completedLessons: 0,
        percent: 0,
        lastActivityAt: null,
      });
    }
  }
  return map;
}

/** Per-course rollup across a set of users, for the zone tracker. */
export function completionByCourse(zoneId) {
  return getDb()
    .prepare(
      `SELECT
         c.id                                   AS course_id,
         c.title                                AS title,
         c.cover_emoji                          AS cover_emoji,
         COUNT(DISTINCT a.user_id)              AS assigned_users,
         COUNT(l.id)                            AS total_lessons,
         COALESCE(SUM(${LESSON_DONE_SQL}), 0)   AS done_lessons
       FROM courses c
       LEFT JOIN assignments a ON a.course_id = c.id
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN lessons l ON l.course_id = c.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = a.user_id
       LEFT JOIN quizzes q ON q.lesson_id = l.id
       LEFT JOIN (
         SELECT quiz_id, COUNT(*) AS question_count FROM quiz_questions GROUP BY quiz_id
       ) qq ON qq.quiz_id = q.id
       WHERE (? IS NULL OR c.zone_id = ?) AND (u.id IS NULL OR u.is_active = 1)
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
    )
    .all(zoneId ?? null, zoneId ?? null)
    .map((row) => ({
      courseId: row.course_id,
      title: row.title,
      coverEmoji: row.cover_emoji,
      assignedUsers: row.assigned_users,
      percent: row.total_lessons ? Math.round((row.done_lessons / row.total_lessons) * 100) : 0,
    }));
}
