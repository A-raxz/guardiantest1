import { Router } from 'express';
import { getDb, transaction } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/errors.js';
import { asArray, asInt, asString, requireFields } from '../lib/validate.js';
import { assertSameZone, requireAdmin, requireAuth } from '../middleware/auth.js';
import { publicQuestion } from '../services/serializers.js';

export const quizzesRouter = Router();
quizzesRouter.use(requireAuth, requireAdmin);

function loadLesson(user, lessonId) {
  const db = getDb();
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) throw notFound('Lesson not found');
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(lesson.course_id);
  assertSameZone(user, course.zone_id);
  return { lesson, course };
}

function serializeQuiz(quiz) {
  const questions = getDb()
    .prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position')
    .all(quiz.id);
  return {
    id: quiz.id,
    lessonId: quiz.lesson_id,
    title: quiz.title,
    passScore: quiz.pass_score,
    xpReward: quiz.xp_reward,
    isReady: questions.length > 0,
    questions: questions.map((q) => publicQuestion(q, { includeAnswer: true })),
  };
}

quizzesRouter.get('/lesson/:lessonId', (req, res, next) => {
  try {
    const { lesson } = loadLesson(req.user, req.params.lessonId);
    const quiz = getDb().prepare('SELECT * FROM quizzes WHERE lesson_id = ?').get(lesson.id);
    if (!quiz) return res.json({ quiz: null });
    return res.json({ quiz: serializeQuiz(quiz) });
  } catch (error) {
    return next(error);
  }
});

/**
 * Create or replace the quiz attached to a lesson.
 * Questions are sent whole, which keeps the mobile quiz builder a simple
 * "edit then save" screen rather than a per-question sync.
 */
quizzesRouter.put('/lesson/:lessonId', (req, res, next) => {
  try {
    requireFields(req.body, ['questions']);
    const db = getDb();
    const { lesson } = loadLesson(req.user, req.params.lessonId);
    const questions = asArray(req.body.questions, 'questions', { maxLength: 50 });

    const cleaned = questions.map((question, index) => {
      const prompt = asString(question.prompt, `questions[${index}].prompt`, { maxLength: 500 });
      const options = asArray(question.options, `questions[${index}].options`, { maxLength: 6 }).map((opt, i) =>
        asString(opt, `questions[${index}].options[${i}]`, { maxLength: 300 }),
      );
      if (options.length < 2) throw badRequest(`Question ${index + 1} needs at least two options`);
      const correctIndex = asInt(question.correctIndex, `questions[${index}].correctIndex`, {
        min: 0,
        max: options.length - 1,
      });
      return {
        prompt,
        options,
        correctIndex,
        explanation: question.explanation
          ? asString(question.explanation, `questions[${index}].explanation`, { maxLength: 500 })
          : null,
      };
    });

    const passScore = req.body.passScore !== undefined ? asInt(req.body.passScore, 'passScore', { min: 0, max: 100 }) : 70;
    const xpReward = req.body.xpReward !== undefined ? asInt(req.body.xpReward, 'xpReward', { min: 0, max: 10_000 }) : 100;
    const title = req.body.title ? asString(req.body.title, 'title', { maxLength: 160 }) : `Quiz — ${lesson.title}`;

    const quizId = transaction(() => {
      let quiz = db.prepare('SELECT * FROM quizzes WHERE lesson_id = ?').get(lesson.id);
      if (quiz) {
        db.prepare('UPDATE quizzes SET title = ?, pass_score = ?, xp_reward = ? WHERE id = ?').run(
          title,
          passScore,
          xpReward,
          quiz.id,
        );
        db.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?').run(quiz.id);
      } else {
        const id = randomId('quz');
        db.prepare('INSERT INTO quizzes (id, lesson_id, title, pass_score, xp_reward) VALUES (?, ?, ?, ?, ?)').run(
          id,
          lesson.id,
          title,
          passScore,
          xpReward,
        );
        quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
      }

      const insert = db.prepare(
        `INSERT INTO quiz_questions (id, quiz_id, prompt, options_json, correct_index, explanation, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      cleaned.forEach((question, index) => {
        insert.run(
          randomId('qq'),
          quiz.id,
          question.prompt,
          JSON.stringify(question.options),
          question.correctIndex,
          question.explanation,
          index,
        );
      });
      return quiz.id;
    });

    return res.json({ quiz: serializeQuiz(db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId)) });
  } catch (error) {
    return next(error);
  }
});

/** Lessons in a course that still need questions written. */
quizzesRouter.get('/course/:courseId/status', (req, res, next) => {
  try {
    const db = getDb();
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId);
    if (!course) throw notFound('Course not found');
    assertSameZone(req.user, course.zone_id);

    const rows = db
      .prepare(
        `SELECT l.id AS lesson_id, l.title, l.mime_type, q.id AS quiz_id,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
         FROM lessons l LEFT JOIN quizzes q ON q.lesson_id = l.id
         WHERE l.course_id = ? ORDER BY l.position`,
      )
      .all(course.id);

    res.json({
      courseId: course.id,
      lessons: rows.map((row) => ({
        lessonId: row.lesson_id,
        title: row.title,
        isVideo: Boolean(row.mime_type && row.mime_type.startsWith('video/')),
        quizId: row.quiz_id,
        questionCount: row.question_count ?? 0,
        needsQuestions: Boolean(row.mime_type?.startsWith('video/')) && (row.question_count ?? 0) === 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});
