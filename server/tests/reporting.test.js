import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import { MASTER, login, loginAndActivate, startTestServer } from './helpers.js';

describe('tracker, dashboards, rewards and nudges', () => {
  let api;
  let masterToken;
  let hrToken;
  let managerToken;
  let repToken;
  let otherRepToken;
  let manager;
  let rep;
  let otherRep;
  let westHrToken;

  before(async () => {
    api = await startTestServer();
    masterToken = (await login(api, MASTER.email, MASTER.password)).token;
    const north = (await api.post('/api/zones', { name: 'North Zone', code: 'NZ' }, { token: masterToken })).body.zone;
    const west = (await api.post('/api/zones', { name: 'West Zone', code: 'WZ' }, { token: masterToken })).body.zone;

    const hr = await api.post(
      '/api/users',
      { name: 'Priya Sharma', email: 'priya@guardians.example', role: 'HR_BP', zoneId: north.id },
      { token: masterToken },
    );
    hrToken = await loginAndActivate(api, 'priya@guardians.example', hr.body.temporaryPassword);

    const westHr = await api.post(
      '/api/users',
      { name: 'Kavya Rao', email: 'kavya@guardians.example', role: 'HR_BP', zoneId: west.id },
      { token: masterToken },
    );
    westHrToken = await loginAndActivate(api, 'kavya@guardians.example', westHr.body.temporaryPassword);

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

    const otherRepRes = await api.post(
      '/api/users',
      { name: 'Neha Gupta', email: 'neha@guardians.example', role: 'SALES_REP', managerId: manager.id },
      { token: hrToken },
    );
    otherRep = otherRepRes.body.user;
    otherRepToken = await loginAndActivate(api, 'neha@guardians.example', otherRepRes.body.temporaryPassword);

    // One course, one video with a quiz, assigned to both reps.
    const created = await api.post(
      '/api/courses/from-drive',
      { driveId: 'vid-privacy', title: 'Data Privacy Essentials' },
      { token: hrToken },
    );
    const lesson = created.body.lessons[0];
    await api.put(
      `/api/quizzes/lesson/${lesson.id}`,
      {
        xpReward: 600,
        questions: [
          { prompt: 'Where may customer data live?', options: ['A spreadsheet', 'The approved CRM'], correctIndex: 1 },
        ],
      },
      { token: hrToken },
    );
    await api.post(
      '/api/assignments',
      { courseId: created.body.course.id, userIds: [rep.id, otherRep.id] },
      { token: hrToken },
    );

    // Ravi finishes it; Neha never starts.
    await api.post(
      `/api/learning/lessons/${lesson.id}/progress`,
      { positionSeconds: 600, durationSeconds: 600, completed: true },
      { token: repToken },
    );
    const quiz = await api.get(`/api/learning/lessons/${lesson.id}/quiz`, { token: repToken });
    await api.post(
      `/api/learning/quizzes/${quiz.body.quiz.id}/attempts`,
      { answers: [1] },
      { token: repToken },
    );
  });
  after(async () => api.close());

  test('the Sales Tracker reports completion per person for the HR BP’s zone', async () => {
    const res = await api.get('/api/reports/tracker', { token: hrToken });
    assert.equal(res.status, 200);
    const ravi = res.body.people.find((p) => p.userId === rep.id);
    const neha = res.body.people.find((p) => p.userId === otherRep.id);
    assert.equal(ravi.percent, 100);
    assert.equal(ravi.bucket, 'completed');
    assert.equal(neha.percent, 0);
    assert.equal(neha.bucket, 'not_started');
    assert.equal(res.body.summary.completed, 1);
    assert.equal(res.body.summary.notStarted, 2, 'the manager is tracked alongside the reps');
    assert.equal(res.body.courses[0].percent, 50);
  });

  test('an HR BP’s tracker never leaks another zone', async () => {
    const west = await api.get('/api/reports/tracker', { token: westHrToken });
    assert.equal(west.body.people.length, 0);
    assert.equal((await api.get(`/api/reports/user/${rep.id}`, { token: westHrToken })).status, 403);
  });

  test('the Sales Manager dashboard shows % completion per employee on their team', async () => {
    const res = await api.get('/api/reports/team', { token: managerToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.teamSize, 2);
    assert.equal(res.body.summary.averageCompletion, 50);
    assert.equal(res.body.summary.fullyCompliant, 1);
    const ravi = res.body.members.find((m) => m.userId === rep.id);
    assert.equal(ravi.percent, 100);
    assert.equal(ravi.courses[0].percent, 100);
  });

  test('a manager cannot drill into someone outside their team', async () => {
    const outsider = await api.post(
      '/api/users',
      { name: 'Solo Rep', email: 'solo@guardians.example', role: 'SALES_REP' },
      { token: hrToken },
    );
    const res = await api.get(`/api/reports/user/${outsider.body.user.id}`, { token: managerToken });
    assert.equal(res.status, 403);
  });

  test('a rep can only pull their own record', async () => {
    assert.equal((await api.get(`/api/reports/user/${rep.id}`, { token: repToken })).status, 200);
    assert.equal((await api.get(`/api/reports/user/${otherRep.id}`, { token: repToken })).status, 403);
    assert.equal((await api.get('/api/reports/tracker', { token: repToken })).status, 403);
  });

  test('the Master Admin overview rolls every zone up', async () => {
    const res = await api.get('/api/reports/overview', { token: masterToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.totals.zones, 2);
    const north = res.body.zones.find((z) => z.code === 'NZ');
    assert.equal(north.hrBpName, 'Priya Sharma');
    assert.ok(north.averageCompletion > 0);
  });

  test('XP buys a reward of the rep’s own choosing', async () => {
    const before = await api.get('/api/me/rewards', { token: repToken });
    assert.ok(before.body.xp.xpTotal >= 600);
    const affordable = before.body.rewards.find((r) => r.canRedeem);
    assert.ok(affordable, 'something is within reach');
    const tooExpensive = before.body.rewards.find((r) => !r.affordable);
    assert.ok(tooExpensive);

    const redeemed = await api.post(`/api/me/rewards/${affordable.id}/redeem`, {}, { token: repToken });
    assert.equal(redeemed.status, 201);
    assert.equal(redeemed.body.xp.xpAvailable, before.body.xp.xpAvailable - affordable.costXp);
    assert.equal(redeemed.body.xp.xpTotal, before.body.xp.xpTotal, 'spending does not lower the level');

    if (!affordable.repeatable) {
      const again = await api.post(`/api/me/rewards/${affordable.id}/redeem`, {}, { token: repToken });
      assert.equal(again.status, 409);
    }
  });

  test('a reward beyond your XP is refused', async () => {
    const rewards = await api.get('/api/me/rewards', { token: otherRepToken });
    const any = rewards.body.rewards[0];
    const res = await api.post(`/api/me/rewards/${any.id}/redeem`, {}, { token: otherRepToken });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /more XP/);
  });

  test('the app-open pop-up is capped at one per 24 hours', async () => {
    const first = await api.post('/api/notifications/daily-nudge', {}, { token: otherRepToken });
    assert.equal(first.status, 200);
    assert.ok(first.body.nudge, 'the first open of the day gets a nudge');
    assert.match(first.body.nudge.title, /waiting for you/);

    const second = await api.post('/api/notifications/daily-nudge', {}, { token: otherRepToken });
    assert.equal(second.body.nudge, null);
    assert.equal(second.body.reason, 'already_shown_today');
    assert.ok(second.body.nextEligibleInHours > 23);
  });

  test('the nudge points a rep at the course they left half-finished', async () => {
    const course = await api.post('/api/courses/from-drive', { driveId: 'fold-product' }, { token: hrToken });
    await api.post('/api/assignments', { courseId: course.body.course.id, userIds: [rep.id] }, { token: hrToken });
    await api.post(
      `/api/learning/lessons/${course.body.lessons[0].id}/progress`,
      { positionSeconds: 60, durationSeconds: 1080 },
      { token: repToken },
    );
    const res = await api.post('/api/notifications/daily-nudge', {}, { token: repToken });
    assert.match(res.body.nudge.title, /where you left off/);
    assert.equal(res.body.nudge.action.courseId, course.body.course.id);
  });

  test('the zone leaderboard ranks reps by XP', async () => {
    const res = await api.get('/api/me/leaderboard', { token: repToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.leaderboard[0].name, 'Ravi Kumar');
    assert.equal(res.body.leaderboard[0].isMe, true);
    assert.ok(res.body.leaderboard.every((row) => row.name !== 'Arun Mehta'), 'managers are not on the rep board');
  });

  test('the profile summary carries level, completion and certificates', async () => {
    const res = await api.get('/api/me/summary', { token: repToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.certificates, 1);
    assert.equal(res.body.quizzesPassed, 1);
    assert.ok(res.body.xp.level >= 2, '600 XP is past the first level');
    assert.ok(res.body.completion.percent > 0);
  });
});
