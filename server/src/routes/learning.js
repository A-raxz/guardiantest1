import { Router } from 'express';
import { getDb } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { ROLES } from '../lib/roles.js';
import { asArray, asInt, requireFields } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { getDriveProvider, previewUrl } from '../services/drive.js';
import { awardXp, gradeQuiz, hasPassedBefore, issueCertificate, xpSummary } from '../services/gamification.js';
import { courseProgress } from '../services/progress.js';
import { publicLesson, publicQuestion } from '../services/serializers.js';

export const learningRouter = Router();
learningRouter.use(requireAuth);

/** A lesson is reachable if the course it belongs to is assigned to the caller. */
function loadAssignedLesson(user, lessonId) {
  const db = getDb();
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) throw notFound('Lesson not found');
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(lesson.course_id);

  if (user.role === ROLES.MASTER_ADMIN) return { lesson, course };
  if (user.role === ROLES.HR_BP) {
    if (course.zone_id !== user.zone_id) throw forbidden('That course belongs to another zone');
    return { lesson, course };
  }
  const assigned = db
    .prepare('SELECT 1 AS ok FROM assignments WHERE course_id = ? AND user_id = ?')
    .get(course.id, user.id);
  if (!assigned) throw forbidden('This course has not been assigned to you');
  return { lesson, course };
}

/** Everything the player screen needs, including where to resume from. */
learningRouter.get('/lessons/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const { lesson, course } = loadAssignedLesson(req.user, req.params.id);
    const progress = db
      .prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(req.user.id, lesson.id);
    const quiz = db.prepare('SELECT * FROM quizzes WHERE lesson_id = ?').get(lesson.id);
    const questionCount = quiz
      ? db.prepare('SELECT COUNT(*) AS c FROM quiz_questions WHERE quiz_id = ?').get(quiz.id).c
      : 0;

    let stream = null;
    try {
      stream = await getDriveProvider().streamUrl(lesson.drive_file_id);
    } catch {
      stream = null; // Fall back to the Drive preview embed.
    }

    const siblings = db
      .prepare('SELECT id, title, position FROM lessons WHERE course_id = ? ORDER BY position')
      .all(course.id);
    const index = siblings.findIndex((s) => s.id === lesson.id);

    res.json({
      lesson: publicLesson(lesson),
      course: { id: course.id, title: course.title, coverEmoji: course.cover_emoji },
      // A signed media URL when Drive credentials are configured, otherwise the
      // embeddable preview page rendered in a WebView.
      playback: stream
        ? { kind: 'stream', url: `/api/learning/lessons/${lesson.id}/stream` }
        : { kind: 'preview', url: previewUrl(lesson.drive_file_id) },
      progress: {
        status: progress?.status ?? 'not_started',
        positionSeconds: progress?.last_position_seconds ?? 0,
        watchedSeconds: progress?.watched_seconds ?? 0,
        durationSeconds: progress?.duration_seconds || lesson.duration_seconds,
      },
      quiz: quiz
        ? { id: quiz.id, title: quiz.title, passScore: quiz.pass_score, xpReward: quiz.xp_reward, questionCount }
        : null,
      nextLessonId: index >= 0 && index + 1 < siblings.length ? siblings[index + 1].id : null,
      prevLessonId: index > 0 ? siblings[index - 1].id : null,
    });
  } catch (error) {
    next(error);
  }
});

/** Proxy the Drive bytes so the app never sees the service-account token. */
learningRouter.get('/lessons/:id/stream', async (req, res, next) => {
  try {
    const { lesson } = loadAssignedLesson(req.user, req.params.id);
    const stream = await getDriveProvider().streamUrl(lesson.drive_file_id);
    if (!stream) throw notFound('No direct stream available for this file');

    const headers = { ...stream.headers };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(stream.url, { headers });

    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (error) {
    return next(error);
  }
});

/**
 * Heartbeat from the player. Called every few seconds while watching and once
 * more on exit, so leaving mid-video and coming back resumes in place.
 */
learningRouter.post('/lessons/:id/progress', (req, res, next) => {
  try {
    const db = getDb();
    const { lesson, course } = loadAssignedLesson(req.user, req.params.id);
    if (req.user.role !== ROLES.SALES_REP && req.user.role !== ROLES.SALES_MANAGER) {
      throw forbidden('Only course receivers record progress');
    }

    const positionSeconds = asInt(req.body.positionSeconds ?? 0, 'positionSeconds', { min: 0, max: 86_400 });
    const durationSeconds = asInt(
      req.body.durationSeconds ?? lesson.duration_seconds ?? 0,
      'durationSeconds',
      { min: 0, max: 86_400 },
    );
    const existing = db
      .prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(req.user.id, lesson.id);

    // Watched time only ever moves forward, so scrubbing back does not undo it.
    const watchedSeconds = Math.max(existing?.watched_seconds ?? 0, positionSeconds);
    const finishedByRatio = durationSeconds > 0 && positionSeconds / durationSeconds >= 0.95;
    const watched = Boolean(req.body.completed) || finishedByRatio;
    const status = existing?.status === 'completed' ? 'completed' : watched ? 'watched' : 'in_progress';

    db.prepare(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, last_position_seconds, watched_seconds, duration_seconds, watched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'watched' THEN datetime('now') ELSE NULL END, datetime('now'))
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET
         status = excluded.status,
         last_position_seconds = excluded.last_position_seconds,
         watched_seconds = excluded.watched_seconds,
         duration_seconds = MAX(lesson_progress.duration_seconds, excluded.duration_seconds),
         watched_at = COALESCE(lesson_progress.watched_at, excluded.watched_at),
         updated_at = datetime('now')`,
    ).run(req.user.id, lesson.id, status, positionSeconds, watchedSeconds, durationSeconds, status);

    maybeCompleteCourse(req.user.id, course);

    res.json({
      progress: {
        status,
        positionSeconds,
        watchedSeconds,
        durationSeconds,
      },
      courseProgress: courseProgress(req.user.id, course.id),
    });
  } catch (error) {
    next(error);
  }
});

/** The quiz taken after the video. Correct answers are never sent to the client. */
learningRouter.get('/lessons/:id/quiz', (req, res, next) => {
  try {
    const db = getDb();
    const { lesson } = loadAssignedLesson(req.user, req.params.id);
    const quiz = db.prepare('SELECT * FROM quizzes WHERE lesson_id = ?').get(lesson.id);
    if (!quiz) throw notFound('This lesson has no quiz');

    const questions = db
      .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position').all(quiz.id);
    const best = db
      .prepare('SELECT MAX(score) AS best, COUNT(*) AS attempts FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?')
      .get(quiz.id, req.user.id);

    res.json({
      quiz: {
        id: quiz.id,
        lessonId: lesson.id,
        title: quiz.title,
        passScore: quiz.pass_score,
        xpReward: quiz.xp_reward,
        questionCount: questions.length,
        isReady: questions.length > 0,
      },
      questions: questions.map((q) => publicQuestion(q)),
      previousBestScore: best?.best ?? null,
      attempts: best?.attempts ?? 0,
      alreadyPassed: hasPassedBefore(req.user.id, quiz.id),
    });
  } catch (error) {
    next(error);
  }
});

/** Submit an attempt: grade it, award XP on the first pass, unlock the course. */
learningRouter.post('/quizzes/:quizId/attempts', (req, res, next) => {
  try {
    requireFields(req.body, ['answers']);
    const db = getDb();
    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.quizId);
    if (!quiz) throw notFound('Quiz not found');
    const { lesson, course } = loadAssignedLesson(req.user, quiz.lesson_id);

    const questions = db
      .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position').all(quiz.id);
    if (!questions.length) throw badRequest('This quiz has no questions yet');

    const answers = asArray(req.body.answers, 'answers', { maxLength: questions.length });
    if (answers.length !== questions.length) {
      throw badRequest(`Expected ${questions.length} answers, received ${answers.length}`);
    }

    const graded = gradeQuiz(quiz, questions, answers);
    const firstPass = graded.passed && !hasPassedBefore(req.user.id, quiz.id);
    const xpAwarded = firstPass ? Math.round((quiz.xp_reward * graded.score) / 100) : 0;

    db.prepare(
      `INSERT INTO quiz_attempts (id, quiz_id, user_id, score, passed, xp_awarded, answers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomId('att'), quiz.id, req.user.id, graded.score, graded.passed ? 1 : 0, xpAwarded, JSON.stringify(answers));

    if (graded.passed) {
      db.prepare(
        `INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at, updated_at)
         VALUES (?, ?, 'completed', datetime('now'), datetime('now'))
         ON CONFLICT(user_id, lesson_id) DO UPDATE SET
           status = 'completed',
           completed_at = COALESCE(lesson_progress.completed_at, datetime('now')),
           updated_at = datetime('now')`,
      ).run(req.user.id, lesson.id);
    }
    if (xpAwarded > 0) awardXp(req.user.id, xpAwarded, `Passed "${quiz.title}"`, { type: 'quiz', id: quiz.id });

    const completion = maybeCompleteCourse(req.user.id, course);

    res.status(201).json({
      score: graded.score,
      correctCount: graded.correctCount,
      totalQuestions: graded.total,
      passScore: quiz.pass_score,
      passed: graded.passed,
      xpAwarded,
      results: graded.results,
      xp: xpSummary(req.user.id),
      courseProgress: courseProgress(req.user.id, course.id),
      courseCompleted: completion.completed,
      certificate: completion.certificate,
      courseBonusXp: completion.bonusXp,
    });
  } catch (error) {
    next(error);
  }
});

/** Issue the completion bonus and certificate exactly once per course. */
function maybeCompleteCourse(userId, course) {
  const progress = courseProgress(userId, course.id);
  if (progress.status !== 'completed' || progress.totalLessons === 0) {
    return { completed: false, certificate: null, bonusXp: 0 };
  }
  const { certificate, isNew } = issueCertificate(userId, course.id);
  let bonusXp = 0;
  if (isNew) {
    bonusXp = course.xp_bonus ?? 0;
    if (bonusXp > 0) awardXp(userId, bonusXp, `Completed "${course.title}"`, { type: 'course', id: course.id });
    getDb()
      .prepare('INSERT INTO notifications (id, user_id, title, body, kind, action) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        randomId('ntf'),
        userId,
        'Course complete 🎉',
        `You finished ${course.title} and earned a certificate.`,
        'certificate',
        JSON.stringify({ type: 'certificate', courseId: course.id }),
      );
  }
  return {
    completed: true,
    certificate: isNew ? { id: certificate.id, serial: certificate.serial, courseTitle: course.title } : null,
    bonusXp,
  };
}
