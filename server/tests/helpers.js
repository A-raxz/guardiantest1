import { openDatabase, useDatabase, closeDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { ensureSeedData } from '../src/db/seed.js';

process.env.NODE_ENV = 'test';

/** A fresh in-memory database + listening app for each test file. */
export async function startTestServer() {
  closeDb();
  useDatabase(openDatabase(':memory:'));
  ensureSeedData({ quiet: true });

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const request = async (method, path, { token, body } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  return {
    baseUrl,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    del: (path, opts) => request('DELETE', path, opts),
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          closeDb();
          resolve();
        });
      }),
  };
}

export async function login(api, email, password) {
  const res = await api.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Log in with the issued credential and complete the forced reset. */
export async function loginAndActivate(api, email, temporaryPassword, newPassword = 'NewPass123') {
  const first = await login(api, email, temporaryPassword);
  if (!first.mustResetPassword) return first.token;
  const changed = await api.post(
    '/api/auth/change-password',
    { currentPassword: temporaryPassword, newPassword },
    { token: first.token },
  );
  if (changed.status !== 200) throw new Error(`Password reset failed: ${JSON.stringify(changed.body)}`);
  return changed.body.token;
}

export const MASTER = { email: 'chro@guardians.example', password: 'Master@123' };
