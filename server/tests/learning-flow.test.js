import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import { MASTER, login, loginAndActivate, startTestServer } from './helpers.js';

/**
 * The end-to-end flow from the brief:
 * HR BP assigns Drive content -> it appears on the rep's dashboard ->
 * rep watches the video -> rep takes the quiz -> rep earns XP.
 */
describe('assign → watch → quiz → XP', () => {
  let api;
  let masterToken;
  let hrToken;
  let repToken;
  let managerToken;
  let rep;
  let manager;
  let course;
  let lessons;

  before(async () => {
    api = await startTestServer();
    masterToken = (await login(api, MASTER.email, MASTER.password)).token;
    const zone = (await api.post('/api/zones', { name: 'North Zone', code: 'NZ' }, { token: masterToken })).body.zone;

    const hr = await api.post(
      '/api/users',
      { name: 'Priya Sharma', email: 'priya@guardians.example', role: 'HR_BP', zoneId: zone.id },
      { token: masterToken },
    );
    hrToken = await loginAndActivate(api, 'priya@guardians.example', hr.body.temporaryPassword);

    const managerRes = await api.post(
      '/api/users',
      { name: 'Arun Mehta', email: 'arun@guardians.example', role: 'SALES_MANAGER' },
      { token: hrToken },
    );
    manager = managerRes.body.user;
    managerToken = await loginAndActivate(api, 'arun@guardians.example', managerRes.body.temporaryPassword);

    const repRes = await api.post(
      '/api/users',
      { name: 'Ravi Kumar', email: 'ravi@guardians.example', role: 'SALES_REP', managerId: manager.id },
      { token: hrToken },
    );
    rep = repRes.body.user;
    repToken = await loginAndActivate(api, 'ravi@guardians.example', repRes.body.temporaryPassword);
  });
  after(async () => api.close());

  test('the HR BP browses Drive and assigns a whole folder in one action', async () => {
    const listing = await api.get('/api/drive/files', { token: hrToken });
    assert.equal(listing.status, 200);
    assert.ok(listing.body.files.some((f) => f.isFolder));

    const resolved = await api.get('/api/drive/resolve?driveId=fold-onboarding', { token: hrToken });
    assert.equal(resolved.body.kind, 'drive_folder');
    assert.ok(resolved.body.items.length > 1, 'a folder expands into several files');

    const created = await api.post(
      '/api/courses/from-drive',
      { driveId: 'fold-onboarding', title: 'New Rep Onboarding' },
      { token: hrToken },
    );
    assert.equal(created.status, 201);
    course = created.body.course;
    lessons = created.body.lessons;
    assert.equal(course.source, 'drive_folder');
    assert.equal(lessons.length, resolved.body.items.length);
  });

  test('every video lesson gets a quiz attached automatically', async () => {
    const status = await api.get(`/api/quizzes/course/${course.id}/status`, { token: hrToken });
    const videos = status.body.lessons.filter((l) => l.isVideo);
    assert.ok(videos.length > 0);
    assert.ok(videos.every((l) => l.quizId), 'each video lesson has a quiz');
    assert.ok(videos.every((l) => l.needsQuestions), 'the quiz starts empty, waiting for questions');
  });

  test('a single Drive file can also be assigned on its own', async () => {
    const created = await api.post('/api/courses/from-drive', { driveId: 'vid-privacy' }, { token: hrToken });
    assert.equal(created.status, 201);
    assert.equal(created.body.course.source, 'drive_file');
    assert.equal(created.body.lessons.length, 1);
  });

  test('the HR BP writes the quiz questions', async () => {
    const videoLesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const res = await api.put(
      `/api/quizzes/lesson/${videoLesson.id}`,
      {
        passScore: 70,
        xpReward: 100,
        questions: [
          { prompt: 'Who issues your login?', options: ['Yourself', 'Your zone HR BP'], correctIndex: 1 },
          { prompt: 'What earns XP?', options: ['Opening the app', 'Passing a quiz'], correctIndex: 1 },
        ],
      },
      { token: hrToken },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.quiz.questions.length, 2);
    assert.equal(res.body.quiz.isReady, true);
  });

  test('a quiz question needs at least two options', async () => {
    const videoLesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const res = await api.put(
      `/api/quizzes/lesson/${videoLesson.id}`,
      { questions: [{ prompt: 'Sure?', options: ['Yes'], correctIndex: 0 }] },
      { token: hrToken },
    );
    assert.equal(res.status, 400);
  });

  test('assigning the course puts it on the rep dashboard with a Start action', async () => {
    const before = await api.get('/api/assignments/mine', { token: repToken });
    assert.equal(before.body.courses.length, 0);

    const assigned = await api.post(
      '/api/assignments',
      { courseId: course.id, userIds: [rep.id, manager.id] },
      { token: hrToken },
    );
    assert.equal(assigned.status, 201);
    assert.equal(assigned.body.assignedCount, 2);
    assert.ok(assigned.body.lessonsWithoutQuestions.length > 0, 'HR BP is told which videos still need questions');

    const dashboard = await api.get('/api/assignments/mine', { token: repToken });
    assert.equal(dashboard.body.courses.length, 1);
    assert.equal(dashboard.body.continueLearning.course.id, course.id);
    assert.equal(dashboard.body.continueLearning.resume.action, 'start');
    assert.equal(dashboard.body.continueLearning.progress.percent, 0);
  });

  test('assigning the same course twice does not duplicate it', async () => {
    const again = await api.post('/api/assignments', { courseId: course.id, userIds: [rep.id] }, { token: hrToken });
    assert.equal(again.body.assignedCount, 0);
    assert.equal(again.body.skipped[0].reason, 'Already assigned');
  });

  test('a group assignment reaches every member at once', async () => {
    const group = await api.post(
      '/api/groups',
      { name: 'New Joiners', memberIds: [rep.id, manager.id] },
      { token: hrToken },
    );
    assert.equal(group.status, 201);
    const second = await api.post('/api/courses/from-drive', { driveId: 'fold-compliance' }, { token: hrToken });
    const assigned = await api.post(
      '/api/assignments',
      { courseId: second.body.course.id, groupIds: [group.body.group.id] },
      { token: hrToken },
    );
    assert.equal(assigned.body.assignedCount, 2);
  });

  test('leaving a video mid-way resumes at the same second', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const beat = await api.post(
      `/api/learning/lessons/${lesson.id}/progress`,
      { positionSeconds: 145, durationSeconds: 480 },
      { token: repToken },
    );
    assert.equal(beat.status, 200);
    assert.equal(beat.body.progress.status, 'in_progress');

    const reopened = await api.get(`/api/learning/lessons/${lesson.id}`, { token: repToken });
    assert.equal(reopened.body.progress.positionSeconds, 145);

    const dashboard = await api.get('/api/assignments/mine', { token: repToken });
    const entry = dashboard.body.courses.find((c) => c.course.id === course.id);
    assert.equal(entry.resume.action, 'resume');
    assert.equal(entry.resume.positionSeconds, 145);
    assert.equal(entry.progress.status, 'in_progress');
  });

  test('scrubbing backwards does not lose watched time', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const beat = await api.post(
      `/api/learning/lessons/${lesson.id}/progress`,
      { positionSeconds: 30, durationSeconds: 480 },
      { token: repToken },
    );
    assert.equal(beat.body.progress.positionSeconds, 30);
    assert.equal(beat.body.progress.watchedSeconds, 145);
  });

  test('watching to the end marks the video watched but not complete — the quiz still has to be passed', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const beat = await api.post(
      `/api/learning/lessons/${lesson.id}/progress`,
      { positionSeconds: 470, durationSeconds: 480 },
      { token: repToken },
    );
    assert.equal(beat.body.progress.status, 'watched');
    assert.equal(beat.body.courseProgress.completedLessons, 0);
  });

  test('failing the quiz awards no XP', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const quiz = await api.get(`/api/learning/lessons/${lesson.id}/quiz`, { token: repToken });
    assert.equal(quiz.body.quiz.questionCount, 2);
    assert.ok(quiz.body.questions.every((q) => !('correctIndex' in q)), 'answers are never sent to the client');

    const attempt = await api.post(
      `/api/learning/quizzes/${quiz.body.quiz.id}/attempts`,
      { answers: [1, 0] },
      { token: repToken },
    );
    assert.equal(attempt.status, 201);
    assert.equal(attempt.body.score, 50);
    assert.equal(attempt.body.passed, false);
    assert.equal(attempt.body.xpAwarded, 0);
    assert.equal(attempt.body.xp.xpTotal, 0);
  });

  test('passing the quiz completes the lesson and awards XP', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const quiz = await api.get(`/api/learning/lessons/${lesson.id}/quiz`, { token: repToken });

    const attempt = await api.post(
      `/api/learning/quizzes/${quiz.body.quiz.id}/attempts`,
      { answers: [1, 1] },
      { token: repToken },
    );
    assert.equal(attempt.body.score, 100);
    assert.equal(attempt.body.passed, true);
    assert.equal(attempt.body.xpAwarded, 100);
    assert.equal(attempt.body.xp.xpTotal, 100);
    assert.equal(attempt.body.courseProgress.completedLessons, 1);
  });

  test('re-taking a passed quiz does not farm XP', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const quiz = await api.get(`/api/learning/lessons/${lesson.id}/quiz`, { token: repToken });
    assert.equal(quiz.body.alreadyPassed, true);

    const attempt = await api.post(
      `/api/learning/quizzes/${quiz.body.quiz.id}/attempts`,
      { answers: [1, 1] },
      { token: repToken },
    );
    assert.equal(attempt.body.xpAwarded, 0);
    assert.equal(attempt.body.xp.xpTotal, 100);
  });

  test('a wrong number of answers is rejected', async () => {
    const lesson = lessons.find((l) => l.mimeType.startsWith('video/'));
    const quiz = await api.get(`/api/learning/lessons/${lesson.id}/quiz`, { token: repToken });
    const res = await api.post(
      `/api/learning/quizzes/${quiz.body.quiz.id}/attempts`,
      { answers: [1] },
      { token: repToken },
    );
    assert.equal(res.status, 400);
  });

  test('a rep cannot open a lesson from a course they were never assigned', async () => {
    const other = await api.post('/api/courses/from-drive', { driveId: 'vid-conduct' }, { token: hrToken });
    const otherCourse = await api.get(`/api/courses/${other.body.course.id}`, { token: hrToken });
    const res = await api.get(`/api/learning/lessons/${otherCourse.body.lessons[0].id}`, { token: repToken });
    assert.equal(res.status, 403);
  });

  test('finishing every lesson issues a certificate and the course bonus, once', async () => {
    const detail = await api.get(`/api/courses/${course.id}`, { token: hrToken });
    // Watch everything. A lesson with no quiz questions yet (the PDF handout, and
    // the videos the HR BP has not written questions for) must not block the rep.
    for (const lesson of detail.body.lessons) {
      await api.post(
        `/api/learning/lessons/${lesson.id}/progress`,
        { positionSeconds: 600, durationSeconds: 600, completed: true },
        { token: repToken },
      );
    }
    for (const lesson of detail.body.lessons.filter((l) => l.questionCount > 0)) {
      const quiz = await api.get(`/api/learning/lessons/${lesson.id}/quiz`, { token: repToken });
      await api.post(
        `/api/learning/quizzes/${quiz.body.quiz.id}/attempts`,
        { answers: quiz.body.questions.map(() => 1) },
        { token: repToken },
      );
    }

    const dashboard = await api.get('/api/assignments/mine', { token: repToken });
    const entry = dashboard.body.courses.find((c) => c.course.id === course.id);
    assert.equal(entry.progress.percent, 100);
    assert.equal(entry.progress.status, 'completed');

    const certificates = await api.get('/api/me/certificates', { token: repToken });
    assert.equal(certificates.body.certificates.length, 1);
    assert.equal(certificates.body.certificates[0].courseTitle, 'New Rep Onboarding');

    const xpAfter = (await api.get('/api/me/xp', { token: repToken })).body;
    const bonusEvents = xpAfter.history.filter((e) => e.refType === 'course');
    assert.equal(bonusEvents.length, 1, 'the completion bonus is granted exactly once');
  });
});
