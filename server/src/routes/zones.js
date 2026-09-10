import { Router } from 'express';
import { getDb } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { conflict, notFound } from '../lib/errors.js';
import { ROLES } from '../lib/roles.js';
import { asString, requireFields } from '../lib/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { publicZone } from '../services/serializers.js';

export const zonesRouter = Router();
zonesRouter.use(requireAuth);

const ZONE_LIST_SQL = `
  SELECT z.*,
         (SELECT COUNT(*) FROM users u WHERE u.zone_id = z.id AND u.is_active = 1) AS user_count,
         (SELECT u.name FROM users u WHERE u.zone_id = z.id AND u.role = 'HR_BP' AND u.is_active = 1 LIMIT 1) AS hr_bp_name
  FROM zones z
  ORDER BY z.name`;

/** Master Admin sees every field office; everyone else sees only their own. */
zonesRouter.get('/', (req, res) => {
  const rows = getDb().prepare(ZONE_LIST_SQL).all();
  const visible =
    req.user.role === ROLES.MASTER_ADMIN ? rows : rows.filter((z) => z.id === req.user.zone_id);
  res.json({ zones: visible.map(publicZone) });
});

zonesRouter.post('/', requireRole(ROLES.MASTER_ADMIN), (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'code']);
    const name = asString(req.body.name, 'name', { maxLength: 120 });
    const code = asString(req.body.code, 'code', { maxLength: 20 }).toUpperCase();
    const db = getDb();
    if (db.prepare('SELECT 1 AS ok FROM zones WHERE name = ? OR code = ?').get(name, code)) {
      throw conflict('A zone with that name or code already exists');
    }
    const id = randomId('zone');
    db.prepare('INSERT INTO zones (id, name, code) VALUES (?, ?, ?)').run(id, name, code);
    res.status(201).json({ zone: publicZone(db.prepare('SELECT * FROM zones WHERE id = ?').get(id)) });
  } catch (error) {
    next(error);
  }
});

zonesRouter.delete('/:id', requireRole(ROLES.MASTER_ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.id);
    if (!zone) throw notFound('Zone not found');
    const users = db.prepare('SELECT COUNT(*) AS c FROM users WHERE zone_id = ?').get(zone.id);
    if (users.c > 0) throw conflict('Move or deactivate the people in this zone before deleting it');
    db.prepare('DELETE FROM zones WHERE id = ?').run(zone.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
