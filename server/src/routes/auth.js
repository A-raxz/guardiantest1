import { Router } from 'express';
import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import { asEmail, assertPasswordStrength, requireFields } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { publicUser } from '../services/serializers.js';

export const authRouter = Router();

/**
 * There is no sign-up route by design: accounts are created by an HR BP for
 * their zone (or by the Master Admin as a fallback). This is login only.
 */
authRouter.post('/login', (req, res, next) => {
  try {
    requireFields(req.body, ['email', 'password']);
    const email = asEmail(req.body.email);
    const db = getDb();
    const user = db
      .prepare(
        `SELECT u.*, z.name AS zone_name, m.name AS manager_name
         FROM users u
         LEFT JOIN zones z ON z.id = u.zone_id
         LEFT JOIN users m ON m.id = u.manager_id
         WHERE u.email = ?`,
      )
      .get(email);

    // Same message either way so the endpoint cannot be used to enumerate staff.
    if (!user || !verifyPassword(String(req.body.password), user.password_hash)) {
      throw unauthorized('Incorrect email or password');
    }
    if (!user.is_active) throw unauthorized('This account has been deactivated. Contact your HR BP.');

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

    res.json({
      token: signToken({ sub: user.id, role: user.role, zoneId: user.zone_id }),
      user: publicUser({ ...user, last_login_at: new Date().toISOString() }),
      mustResetPassword: Boolean(user.must_reset_password),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), mustResetPassword: Boolean(req.user.must_reset_password) });
});

/** Used both for the forced first-login reset and for voluntary changes. */
authRouter.post('/change-password', requireAuth, (req, res, next) => {
  try {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    const { currentPassword, newPassword } = req.body;
    if (!verifyPassword(String(currentPassword), req.user.password_hash)) {
      throw unauthorized('Your current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw badRequest('Your new password must be different from the current one');
    }
    assertPasswordStrength(newPassword);

    getDb()
      .prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE id = ?')
      .run(hashPassword(newPassword), req.user.id);

    const user = getDb()
      .prepare(
        `SELECT u.*, z.name AS zone_name FROM users u LEFT JOIN zones z ON z.id = u.zone_id WHERE u.id = ?`,
      )
      .get(req.user.id);
    res.json({
      user: publicUser(user),
      mustResetPassword: false,
      token: signToken({ sub: user.id, role: user.role, zoneId: user.zone_id }),
    });
  } catch (error) {
    next(error);
  }
});
