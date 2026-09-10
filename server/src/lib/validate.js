import { badRequest } from './errors.js';

export function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const value = body?.[f];
    return value === undefined || value === null || value === '';
  });
  if (missing.length) {
    throw badRequest(`Missing required field(s): ${missing.join(', ')}`, { missing });
  }
}

export function asString(value, field, { maxLength = 500 } = {}) {
  if (typeof value !== 'string') throw badRequest(`"${field}" must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`"${field}" must not be empty`);
  if (trimmed.length > maxLength) throw badRequest(`"${field}" is too long`);
  return trimmed;
}

export function asEmail(value, field = 'email') {
  const email = asString(value, field, { maxLength: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest(`"${field}" is not a valid email`);
  return email;
}

export function asInt(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value);
  if (!Number.isInteger(num)) throw badRequest(`"${field}" must be an integer`);
  if (num < min || num > max) throw badRequest(`"${field}" must be between ${min} and ${max}`);
  return num;
}

export function asArray(value, field, { maxLength = 500 } = {}) {
  if (!Array.isArray(value)) throw badRequest(`"${field}" must be an array`);
  if (value.length > maxLength) throw badRequest(`"${field}" has too many items`);
  return value;
}

export function asEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw badRequest(`"${field}" must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * Passwords are issued by admins and then reset by the user on first login,
 * so the rule is deliberately simple but not trivially guessable.
 */
export function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw badRequest('Password must be at least 8 characters long');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw badRequest('Password must contain at least one letter and one number');
  }
  return password;
}
