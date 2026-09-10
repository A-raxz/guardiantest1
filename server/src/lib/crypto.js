import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/** Hash a password with scrypt. Returns `scrypt$<salt-hex>$<hash-hex>`. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  let derived;
  try {
    derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS);
  } catch {
    return false;
  }
  return crypto.timingSafeEqual(expected, derived);
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Temporary credential handed to a new user by their HR BP. */
export function generateTemporaryPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  // Guarantee the generated value satisfies assertPasswordStrength().
  return `${out.slice(0, length - 2)}${crypto.randomInt(10)}${crypto.randomInt(10)}`;
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

export function serialNumber() {
  return crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
}
