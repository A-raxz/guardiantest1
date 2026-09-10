import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Load a .env file without pulling in a dependency. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n/g, '\n');
  }
}

loadDotEnv(path.join(serverRoot, '.env'));

const env = process.env;
const isTest = env.NODE_ENV === 'test';

export const config = {
  serverRoot,
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 4000),
  jwtSecret: env.JWT_SECRET || (isTest ? 'test-secret' : 'guardians-dev-secret-change-me'),
  jwtTtlSeconds: Number(env.JWT_TTL_SECONDS || 43200),
  databaseFile: env.DATABASE_FILE
    ? path.resolve(serverRoot, env.DATABASE_FILE)
    : path.join(serverRoot, 'data', 'guardians.db'),
  defaultUserPassword: env.DEFAULT_USER_PASSWORD || 'Guardians@123',
  seed: {
    masterEmail: env.SEED_MASTER_EMAIL || 'chro@guardians.example',
    masterPassword: env.SEED_MASTER_PASSWORD || 'Master@123',
  },
  drive: {
    provider: env.DRIVE_PROVIDER || 'mock',
    serviceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE
      ? path.resolve(serverRoot, env.GOOGLE_SERVICE_ACCOUNT_FILE)
      : null,
    clientEmail: env.GOOGLE_CLIENT_EMAIL || null,
    privateKey: env.GOOGLE_PRIVATE_KEY || null,
    impersonateSubject: env.GOOGLE_IMPERSONATE_SUBJECT || null,
  },
};

if (config.env === 'production' && config.jwtSecret.includes('change-me')) {
  throw new Error('JWT_SECRET must be set to a unique value in production.');
}
