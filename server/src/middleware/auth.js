import { getDb } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';
import { ROLES } from '../lib/roles.js';

const PASSWORD_RESET_ALLOWLIST = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

export function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    const payload = verifyToken(token);
    // Joined so every handler (and /auth/me) can name the caller's zone.
    const user = getDb()
      .prepare(
        `SELECT u.*, z.name AS zone_name, m.name AS manager_name
         FROM users u
         LEFT JOIN zones z ON z.id = u.zone_id
         LEFT JOIN users m ON m.id = u.manager_id
         WHERE u.id = ?`,
      )
      .get(payload.sub);
    if (!user) throw unauthorized('Account no longer exists');
    if (!user.is_active) throw forbidden('This account has been deactivated');

    // A user holding a default password can only look at themselves and set a new one.
    // req.path is relative to the router's mount point, so rebuild the full path.
    const fullPath = `${req.baseUrl}${req.path}`.replace(/\/$/, '');
    if (user.must_reset_password && !PASSWORD_RESET_ALLOWLIST.has(fullPath)) {
      throw forbidden('You must set a new password before using the app');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action requires one of: ${roles.join(', ')}`));
    }
    return next();
  };
}

export const requireAdmin = requireRole(ROLES.MASTER_ADMIN, ROLES.HR_BP);

/**
 * The zone a request is allowed to act on.
 * A Master Admin may name any zone (or all of them); everyone else is pinned
 * to their own — an HR BP has no visibility into other field offices.
 */
export function resolveZoneScope(user, requestedZoneId) {
  if (user.role === ROLES.MASTER_ADMIN) return requestedZoneId || null;
  if (requestedZoneId && requestedZoneId !== user.zone_id) {
    throw forbidden('You can only access your own zone');
  }
  return user.zone_id;
}

export function assertSameZone(user, targetZoneId) {
  if (user.role === ROLES.MASTER_ADMIN) return;
  if (!targetZoneId || targetZoneId !== user.zone_id) {
    throw forbidden('That record belongs to another zone');
  }
}
