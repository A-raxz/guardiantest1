import { Router } from 'express';
import { getDb, transaction } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ROLES } from '../lib/roles.js';
import { asString, requireFields } from '../lib/validate.js';
import { assertSameZone, requireAdmin, requireAuth, resolveZoneScope } from '../middleware/auth.js';
import { resolveDriveSelection } from '../services/drive.js';
import { publicCourse, publicLesson } from '../services/serializers.js';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

const COURSE_SELECT = `
  SELECT c.*,
         (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
         (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assigned_count,
         (SELECT COUNT(*) FROM lessons l
            LEFT JOIN quizzes q ON q.lesson_id = l.id
            LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
          WHERE l.course_id = c.id AND qq.id IS NULL) AS quizzes_missing
  FROM courses c`;

const EMOJIS = ['📘', '📗', '📙', '📕', '🎥', '🚀', '🛡️', '💼', '🧭', '🏆'];
const pickEmoji = (seed) => EMOJIS[Math.abs([...seed].reduce((a, c) => a + c.charCodeAt(0), 0)) % EMOJIS.length];

coursesRouter.get('/', (req, res, next) => {
  try {
    if (req.user.role === ROLES.SALES_REP) throw badRequest('Use /api/assignments/mine to see your courses');
    const zoneId = resolveZoneScope(req.user, req.query.zoneId);
    const rows = zoneId
      ? getDb().prepare(`${COURSE_SELECT} WHERE c.zone_id = ? ORDER BY c.created_at DESC`).all(zoneId)
      : getDb().prepare(`${COURSE_SELECT} ORDER BY c.created_at DESC`).all();
    res.json({ courses: rows.map(publicCourse) });
  } catch (error) {
    next(error);
  }
});

/**
 * Build a course out of a Google Drive selection.
 * A single file becomes a one-lesson course; a folder is expanded so that a
 * whole set of videos is assignable in one action. Every video lesson gets a
 * quiz shell attached, ready for the HR BP to fill in.
 */
coursesRouter.post('/from-drive', requireAdmin, async (req, res, next) => {
  try {
    requireFields(req.body, ['driveId']);
    const db = getDb();
    const zoneId = resolveZoneScope(req.user, req.body.zoneId) || req.user.zone_id;
    if (!zoneId) throw badRequest('"zoneId" is required');

    const selection = await resolveDriveSelection(String(req.body.driveId));
    const title = req.body.title
      ? asString(req.body.title, 'title', { maxLength: 160 })
      : selection.root.name;

    const courseId = randomId('crs');
    transaction(() => {
      db.prepare(
        `INSERT INTO courses (id, zone_id, title, description, source, drive_id, cover_emoji, xp_bonus, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        courseId,
        zoneId,
        title,
        req.body.description ? asString(req.body.description, 'description', { maxLength: 1000 }) : null,
        selection.kind,
        selection.root.id,
        req.body.coverEmoji || pickEmoji(title),
        Number.isInteger(req.body.xpBonus) ? req.body.xpBonus : 50,
        req.user.id,
      );

      const insertLesson = db.prepare(
        `INSERT INTO lessons (id, course_id, title, drive_file_id, mime_type, web_view_link, thumbnail_link, duration_seconds, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertQuiz = db.prepare(
        'INSERT INTO quizzes (id, lesson_id, title, pass_score, xp_reward) VALUES (?, ?, ?, ?, ?)',
      );

      selection.items.forEach((item, index) => {
        const lessonId = randomId('lsn');
        insertLesson.run(
          lessonId,
          courseId,
          item.name.replace(/\.[a-z0-9]{2,5}$/i, ''),
          item.id,
          item.mimeType,
          item.webViewLink,
          item.thumbnailLink,
          item.durationSeconds,
          index,
        );
        // "Each piece of assigned video content should have a quiz attached."
        if (item.isVideo) {
          insertQuiz.run(randomId('quz'), lessonId, `Quiz — ${item.name.replace(/\.[a-z0-9]{2,5}$/i, '')}`, 70, 100);
        }
      });
    });

    const course = db.prepare(`${COURSE_SELECT} WHERE c.id = ?`).get(courseId);
    res.status(201).json({
      course: publicCourse(course),
      lessons: db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position').all(courseId).map(publicLesson),
    });
  } catch (error) {
    next(error);
  }
});

coursesRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const course = db.prepare(`${COURSE_SELECT} WHERE c.id = ?`).get(req.params.id);
    if (!course) throw notFound('Course not found');
    if (req.user.role === ROLES.SALES_REP) {
      const assigned = db
        .prepare('SELECT 1 AS ok FROM assignments WHERE course_id = ? AND user_id = ?')
        .get(course.id, req.user.id);
      if (!assigned) throw notFound('Course not found');
    } else {
      assertSameZone(req.user, course.zone_id);
    }

    const lessons = db
      .prepare(
        `SELECT l.*, q.id AS quiz_id,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
         FROM lessons l LEFT JOIN quizzes q ON q.lesson_id = l.id
         WHERE l.course_id = ? ORDER BY l.position`,
      )
      .all(course.id);

    res.json({
      course: publicCourse(course),
      lessons: lessons.map((row) => ({
        ...publicLesson(row),
        quizId: row.quiz_id,
        questionCount: row.question_count ?? 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

coursesRouter.patch('/:id', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!course) throw notFound('Course not found');
    assertSameZone(req.user, course.zone_id);

    const updates = [];
    const params = [];
    for (const [field, column, max] of [
      ['title', 'title', 160],
      ['description', 'description', 1000],
      ['coverEmoji', 'cover_emoji', 8],
    ]) {
      if (req.body[field] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(req.body[field] ? asString(req.body[field], field, { maxLength: max }) : null);
      }
    }
    if (req.body.xpBonus !== undefined) {
      updates.push('xp_bonus = ?');
      params.push(Number(req.body.xpBonus) || 0);
    }
    if (!updates.length) throw badRequest('Nothing to update');
    db.prepare(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`).run(...params, course.id);
    res.json({ course: publicCourse(db.prepare(`${COURSE_SELECT} WHERE c.id = ?`).get(course.id)) });
  } catch (error) {
    next(error);
  }
});

coursesRouter.delete('/:id', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!course) throw notFound('Course not found');
    assertSameZone(req.user, course.zone_id);
    db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
