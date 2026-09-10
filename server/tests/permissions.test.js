import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import { MASTER, login, loginAndActivate, startTestServer } from './helpers.js';

describe('roles, zones and permissions', () => {
  let api;
  let masterToken;
  let north;
  let west;
  let northHrToken;
  let westHrToken;
  let northRep;

  before(async () => {
    api = await startTestServer();
    masterToken = (await login(api, MASTER.email, MASTER.password)).token;

    north = (await api.post('/api/zones', { name: 'North Zone', code: 'NZ' }, { token: masterToken })).body.zone;
    west = (await api.post('/api/zones', { name: 'West Zone', code: 'WZ' }, { token: masterToken })).body.zone;

    const northHr = await api.post(
      '/api/users',
      { name: 'Priya Sharma', email: 'priya@guardians.example', role: 'HR_BP', zoneId: north.id },
      { token: masterToken },
    );
    const westHr = await api.post(
      '/api/users',
      { name: 'Kavya Rao', email: 'kavya@guardians.example', role: 'HR_BP', zoneId: west.id },
      { token: masterToken },
    );
    northHrToken = await loginAndActivate(api, 'priya@guardians.example', northHr.body.temporaryPassword);
    westHrToken = await loginAndActivate(api, 'kavya@guardians.example', westHr.body.temporaryPassword);

    const rep = await api.post(
      '/api/users',
      { name: 'Ravi Kumar', email: 'ravi@guardians.example', role: 'SALES_REP' },
      { token: northHrToken },
    );
    northRep = rep.body.user;
  });
  after(async () => api.close());

  test('an HR BP creating a user lands them in their own zone', () => {
    assert.equal(northRep.zoneId, north.id);
    assert.equal(northRep.mustResetPassword, true);
  });

  test('an HR BP cannot create accounts in another zone', async () => {
    const res = await api.post(
      '/api/users',
      { name: 'Trespasser', email: 'tres@guardians.example', role: 'SALES_REP', zoneId: west.id },
      { token: northHrToken },
    );
    assert.equal(res.status, 403);
  });

  test('an HR BP cannot create another HR BP', async () => {
    const res = await api.post(
      '/api/users',
      { name: 'Shadow HR', email: 'shadow@guardians.example', role: 'HR_BP' },
      { token: northHrToken },
    );
    assert.equal(res.status, 403);
  });

  test('one active HR BP per zone', async () => {
    const res = await api.post(
      '/api/users',
      { name: 'Second HR', email: 'second.hr@guardians.example', role: 'HR_BP', zoneId: north.id },
      { token: masterToken },
    );
    assert.equal(res.status, 409);
  });

  test('an HR BP sees only their own zone', async () => {
    const zones = await api.get('/api/zones', { token: northHrToken });
    assert.deepEqual(zones.body.zones.map((z) => z.id), [north.id]);

    const users = await api.get('/api/users', { token: northHrToken });
    assert.ok(users.body.users.every((u) => u.zoneId === north.id));

    const crossZone = await api.get(`/api/users?zoneId=${west.id}`, { token: northHrToken });
    assert.equal(crossZone.status, 403);

    const otherUser = await api.get(`/api/users/${northRep.id}`, { token: westHrToken });
    assert.equal(otherUser.status, 403);
  });

  test('the Master Admin sees every zone', async () => {
    const zones = await api.get('/api/zones', { token: masterToken });
    assert.equal(zones.body.zones.length, 2);
  });

  test('a sales rep cannot browse the directory or assign content', async () => {
    const repToken = await loginAndActivate(api, 'ravi@guardians.example', 'Guardians@123');
    assert.equal((await api.get('/api/users', { token: repToken })).status, 403);
    assert.equal((await api.get('/api/drive/files', { token: repToken })).status, 403);
    assert.equal((await api.post('/api/assignments', { courseId: 'x' }, { token: repToken })).status, 403);
    assert.equal((await api.post('/api/zones', { name: 'Mine', code: 'M' }, { token: repToken })).status, 403);
  });

  test('a sales manager is report-only: no assigning, no credential creation', async () => {
    const manager = await api.post(
      '/api/users',
      { name: 'Arun Mehta', email: 'arun@guardians.example', role: 'SALES_MANAGER' },
      { token: northHrToken },
    );
    const managerToken = await loginAndActivate(api, 'arun@guardians.example', manager.body.temporaryPassword);

    assert.equal((await api.post('/api/assignments', { courseId: 'x' }, { token: managerToken })).status, 403);
    assert.equal(
      (
        await api.post(
          '/api/users',
          { name: 'New Rep', email: 'newrep@guardians.example', role: 'SALES_REP' },
          { token: managerToken },
        )
      ).status,
      403,
    );
    assert.equal(
      (await api.post('/api/courses/from-drive', { driveId: 'fold-onboarding' }, { token: managerToken })).status,
      403,
    );
    // ...but the reporting dashboard is open to them.
    assert.equal((await api.get('/api/reports/team', { token: managerToken })).status, 200);
  });

  test('an HR BP cannot reset a Master Admin or another HR BP credential', async () => {
    const master = await api.get('/api/users?role=MASTER_ADMIN', { token: masterToken });
    const masterId = master.body.users[0].id;
    assert.equal((await api.post(`/api/users/${masterId}/reset-password`, {}, { token: northHrToken })).status, 403);
  });

  test('an admin can reissue a credential and it forces another reset', async () => {
    const res = await api.post(`/api/users/${northRep.id}/reset-password`, {}, { token: northHrToken });
    assert.equal(res.status, 200);
    assert.match(res.body.temporaryPassword, /^[A-Za-z0-9]{10}$/);
    const relogin = await login(api, 'ravi@guardians.example', res.body.temporaryPassword);
    assert.equal(relogin.mustResetPassword, true);
  });
});
