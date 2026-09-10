import { Router } from 'express';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { generateTemporaryPassword, hashPassword, randomId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { CREATABLE_ROLES, ROLES } from '../lib/roles.js';
import { asEmail, asEnum, asString, requireFields } from '../lib/validate.js';
import { assertSameZone, requireAdmin, requireAuth, resolveZoneScope } from '../middleware/auth.js';
import { publicUser } from '../services/serializers.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const USER_SELECT = `
  SELECT u.*, z.name AS zone_name, m.name AS manager_name
  FROM users u
  LEFT JOIN zones z ON z.id = u.zone_id
  LEFT JOIN users m ON m.id = u.manager_id`;

/**
 * Directory listing.
 * Master Admin: everyone (optionally filtered to one zone).
 * HR BP: their own zone only.
 * Sales Manager: their own direct reports only.
 */
usersRouter.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { role, search } = req.query;
    const clauses = [];
    const params = [];

    if (req.user.role === ROLES.SALES_MANAGER) {
      clauses.push('u.manager_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === ROLES.SALES_REP) {
      throw forbidden('Sales representatives cannot browse the directory');
    } else {
      const zoneId = resolveZoneScope(req.user, req.query.zoneId);
      if (zoneId) {
        clauses.push('u.zone_id = ?');
        params.push(zoneId);
      }
    }
    if (role) {
      clauses.push('u.role = ?');
      params.push(asEnum(role, 'role', Object.values(ROLES)));
    }
    if (search) {
      clauses.push('(u.name LIKE ? OR u.email LIKE ? OR u.employee_code LIKE ?)');
      const like = `%${String(search).trim()}%`;
      params.push(like, like, like);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`${USER_SELECT}${where} ORDER BY u.role, u.name`).all(...params);
    res.json({ users: rows.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

/** Create a login. This is how every account in the system comes to exist. */
usersRouter.post('/', requireAdmin, (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'role']);
    const db = getDb();
    const name = asString(req.body.name, 'name', { maxLength: 120 });
    const email = asEmail(req.body.email);
    const role = asEnum(req.body.role, 'role', Object.values(ROLES));

    if (!CREATABLE_ROLES[req.user.role].includes(role)) {
      throw forbidden(`A ${req.user.role} cannot create a ${role} account`);
    }
    if (db.prepare('SELECT 1 AS ok FROM users WHERE email = ?').get(email)) {
      throw conflict('Someone is already registered with that email address');
    }

    let zoneId = null;
    if (role !== ROLES.MASTER_ADMIN) {
      zoneId = resolveZoneScope(req.user, req.body.zoneId) || req.user.zone_id;
      if (!zoneId) throw badRequest('"zoneId" is required for this role');
      if (!db.prepare('SELECT 1 AS ok FROM zones WHERE id = ?').get(zoneId)) throw notFound('Zone not found');
    }
    if (role === ROLES.HR_BP && zoneId) {
      const existing = db
        .prepare("SELECT name FROM users WHERE role = 'HR_BP' AND zone_id = ? AND is_active = 1")
        .get(zoneId);
      if (existing) throw conflict(`${existing.name} is already the HR BP for this zone`);
    }

    let managerId = null;
    if (req.body.managerId) {
      const manager = db.prepare('SELECT * FROM users WHERE id = ?').get(req.body.managerId);
      if (!manager || manager.role !== ROLES.SALES_MANAGER) throw badRequest('"managerId" must be a Sales Manager');
      assertSameZone(req.user, manager.zone_id);
      if (manager.zone_id !== zoneId) throw badRequest('The manager must belong to the same zone');
      managerId = manager.id;
    }

    // Admin-issued credential: shown once, then the user is forced to replace it.
    const temporaryPassword = req.body.password
      ? asString(req.body.password, 'password', { maxLength: 128 })
      : config.defaultUserPassword || generateTemporaryPassword();

    const id = randomId('usr');
    db.prepare(
      `INSERT INTO users (id, email, name, role, zone_id, manager_id, employee_code, password_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      email,
      name,
      role,
      zoneId,
      managerId,
      req.body.employeeCode ? asString(req.body.employeeCode, 'employeeCode', { maxLength: 40 }) : null,
      hashPassword(temporaryPassword),
      req.user.id,
    );

    const created = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id);
    res.status(201).json({ user: publicUser(created), temporaryPassword });
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/:id', (req, res, next) => {
  try {
    const row = getDb().prepare(`${USER_SELECT} WHERE u.id = ?`).get(req.params.id);
    if (!row) throw notFound('User not found');
    if (row.id !== req.user.id) {
      if (req.user.role === ROLES.SALES_REP) throw forbidden();
      if (req.user.role === ROLES.SALES_MANAGER && row.manager_id !== req.user.id) throw forbidden();
      if (req.user.role === ROLES.HR_BP) assertSameZone(req.user, row.zone_id);
    }
    res.json({ user: publicUser(row) });
  } catch (error) {
    next(error);
  }
});

usersRouter.patch('/:id', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) throw notFound('User not found');
    assertSameZone(req.user, target.zone_id);
    if (target.role === ROLES.MASTER_ADMIN && req.user.role !== ROLES.MASTER_ADMIN) throw forbidden();
    if (req.user.role === ROLES.HR_BP && target.role === ROLES.HR_BP) {
      throw forbidden('Only the Master Admin manages HR Business Partner accounts');
    }

    const updates = [];
    const params = [];
    if (req.body.name !== undefined) {
      updates.push('name = ?');
      params.push(asString(req.body.name, 'name', { maxLength: 120 }));
    }
    if (req.body.employeeCode !== undefined) {
      updates.push('employee_code = ?');
      params.push(req.body.employeeCode ? asString(req.body.employeeCode, 'employeeCode', { maxLength: 40 }) : null);
    }
    if (req.body.isActive !== undefined) {
      if (target.id === req.user.id) throw badRequest('You cannot deactivate your own account');
      updates.push('is_active = ?');
      params.push(req.body.isActive ? 1 : 0);
    }
    if (req.body.managerId !== undefined) {
      if (req.body.managerId === null) {
        updates.push('manager_id = NULL');
      } else {
        const manager = db.prepare('SELECT * FROM users WHERE id = ?').get(req.body.managerId);
        if (!manager || manager.role !== ROLES.SALES_MANAGER) throw badRequest('"managerId" must be a Sales Manager');
        assertSameZone(req.user, manager.zone_id);
        updates.push('manager_id = ?');
        params.push(manager.id);
      }
    }
    if (!updates.length) throw badRequest('Nothing to update');

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params, target.id);
    res.json({ user: publicUser(db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(target.id)) });
  } catch (error) {
    next(error);
  }
});

/** Reissue a credential — the fallback path when someone is locked out. */
usersRouter.post('/:id/reset-password', requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) throw notFound('User not found');
    assertSameZone(req.user, target.zone_id);
    if (req.user.role === ROLES.HR_BP && target.role !== ROLES.SALES_REP && target.role !== ROLES.SALES_MANAGER) {
      throw forbidden('You can only reset credentials for reps and managers in your zone');
    }
    const temporaryPassword = generateTemporaryPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 1 WHERE id = ?').run(
      hashPassword(temporaryPassword),
      target.id,
    );
    res.json({ temporaryPassword, user: publicUser(db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(target.id)) });
  } catch (error) {
    next(error);
  }
});
