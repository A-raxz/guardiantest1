import crypto from 'node:crypto';
import { config } from '../config.js';
import { unauthorized } from './errors.js';

const base64url = (input) => Buffer.from(input).toString('base64url');

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/** Minimal HS256 JWT implementation — keeps the backend dependency-light. */
export function signToken(payload, { ttlSeconds = config.jwtTtlSeconds } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds };
  const head = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify(body));
  const signature = sign(`${head}.${claims}`, config.jwtSecret);
  return `${head}.${claims}.${signature}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') throw unauthorized('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized('Invalid token');
  const [head, claims, signature] = parts;
  const expected = sign(`${head}.${claims}`, config.jwtSecret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw unauthorized('Invalid token');

  let payload;
  try {
    payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  } catch {
    throw unauthorized('Invalid token');
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    throw unauthorized('Session expired, please sign in again');
  }
  return payload;
}
