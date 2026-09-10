import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import { MASTER, login, startTestServer } from './helpers.js';

describe('authentication', () => {
  let api;
  let masterToken;

  before(async () => {
    api = await startTestServer();
    masterToken = (await login(api, MASTER.email, MASTER.password)).token;
  });
  after(async () => api.close());

  test('there is no public sign-up route', async () => {
    const res = await api.post('/api/auth/signup', { email: 'x@y.com', password: 'Passw0rd1' });
    assert.equal(res.status, 404);
  });

  test('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = await api.post('/api/auth/login', { email: MASTER.email, password: 'nope' });
    const noSuchUser = await api.post('/api/auth/login', { email: 'ghost@guardians.example', password: 'nope' });
    assert.equal(wrongPassword.status, 401);
    assert.equal(noSuchUser.status, 401);
    assert.equal(wrongPassword.body.error.message, noSuchUser.body.error.message);
  });

  test('an admin-created account must reset its password before doing anything else', async () => {
    const zone = await api.post('/api/zones', { name: 'Test Zone', code: 'TZ' }, { token: masterToken });
    const created = await api.post(
      '/api/users',
      { name: 'Reset Me', email: 'reset.me@guardians.example', role: 'SALES_REP', zoneId: zone.body.zone.id },
      { token: masterToken },
    );
    assert.equal(created.status, 201);
    const temporaryPassword = created.body.temporaryPassword;

    const first = await login(api, 'reset.me@guardians.example', temporaryPassword);
    assert.equal(first.mustResetPassword, true);

    const blocked = await api.get('/api/assignments/mine', { token: first.token });
    assert.equal(blocked.status, 403);

    const weak = await api.post(
      '/api/auth/change-password',
      { currentPassword: temporaryPassword, newPassword: 'short' },
      { token: first.token },
    );
    assert.equal(weak.status, 400);

    const changed = await api.post(
      '/api/auth/change-password',
      { currentPassword: temporaryPassword, newPassword: 'FreshPass1' },
      { token: first.token },
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body.mustResetPassword, false);

    const allowed = await api.get('/api/assignments/mine', { token: changed.body.token });
    assert.equal(allowed.status, 200);

    const again = await login(api, 'reset.me@guardians.example', 'FreshPass1');
    assert.equal(again.mustResetPassword, false);
  });

  test('requests without a token are rejected', async () => {
    assert.equal((await api.get('/api/assignments/mine')).status, 401);
    assert.equal((await api.get('/api/assignments/mine', { token: 'garbage' })).status, 401);
  });

  test('a deactivated account cannot sign in', async () => {
    const zone = await api.post('/api/zones', { name: 'Exit Zone', code: 'XZ' }, { token: masterToken });
    const created = await api.post(
      '/api/users',
      { name: 'Gone Soon', email: 'gone@guardians.example', role: 'SALES_REP', zoneId: zone.body.zone.id },
      { token: masterToken },
    );
    await api.patch(`/api/users/${created.body.user.id}`, { isActive: false }, { token: masterToken });
    const res = await api.post('/api/auth/login', {
      email: 'gone@guardians.example',
      password: created.body.temporaryPassword,
    });
    assert.equal(res.status, 401);
  });
});
