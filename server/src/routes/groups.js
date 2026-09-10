import { Router } from 'express';
import { getDb } from '../db/index.js';
import { randomId } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ROLES } from '../lib/roles.js';
import { asArray, asString, requireFields } from '../lib/validate.js';
import { assertSameZone, requireAdmin, requireAuth, resolveZoneScope } from '../middleware/auth.js';

export const groupsRouter = Router();
groupsRouter.use(requireAuth, requireAdmin);

const serialize = (row, members = []) => ({
  id: row.id,
  zoneId: row.zone_id,
  name: row.name,
  description: row.description,
  memberCount: members.length,
  members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
  createdAt: row.created_at,
});

const membersOf = (groupId) =>
  getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.role
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ? ORDER BY u.name`,
    )
    .all(groupId);

groupsRouter.get('/', (req, res, next) => {
  try {
    const zoneId = resolveZoneScope(req.user, req.query.zoneId);
    const rows = zoneId
      ? getDb().prepare('SELECT * FROM groups WHERE zone_id = ? ORDER BY name').all(zoneId)
      : getDb().prepare('SELECT * FROM groups ORDER BY name').all();
    res.json({ groups: rows.map((row) => serialize(row, membersOf(row.id))) });
  } catch (error) {
    next(error);
  }
});

groupsRouter.post('/', (req, res, next) => {
  try {
    requireFields(req.body, ['name']);
    const db = getDb();
    const zoneId = resolveZoneScope(req.user, req.body.zoneId) || req.user.zone_id;
    if (!zoneId) throw badRequest('"zoneId" is required');
    const name = asString(req.body.name, 'name', { maxLength: 120 });
    if (db.prepare('SELECT 1 AS ok FROM groups WHERE zone_id = ? AND name = ?').get(zoneId, name)) {
      throw conflict('A group with that name already exists in this zone');
    }
    const id = randomId('grp');
    db.prepare('INSERT INTO groups (id, zone_id, name, description, created_by) VALUES (?, ?, ?, ?, ?)').run(
      id,
      zoneId,
      name,
      req.body.description ? asString(req.body.description, 'description', { maxLength: 500 }) : null,
      req.user.id,
    );
    const memberIds = req.body.memberIds ? asArray(req.body.memberIds, 'memberIds') : [];
    addMembers(req.user, id, zoneId, memberIds);
    res.status(201).json({ group: serialize(db.prepare('SELECT * FROM groups WHERE id = ?').get(id), membersOf(id)) });
  } catch (error) {
    next(error);
  }
});

function addMembers(actor, groupId, zoneId, memberIds) {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
  for (const userId of memberIds) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw notFound(`User "${userId}" not found`);
    assertSameZone(actor, user.zone_id);
    if (user.zone_id !== zoneId) throw badRequest(`${user.name} is not in this group's zone`);
    if (user.role !== ROLES.SALES_REP && user.role !== ROLES.SALES_MANAGER) {
      throw badRequest('Groups hold sales reps and managers only');
    }
    insert.run(groupId, userId);
  }
}

groupsRouter.post('/:id/members', (req, res, next) => {
  try {
    requireFields(req.body, ['memberIds']);
    const group = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) throw notFound('Group not found');
    assertSameZone(req.user, group.zone_id);
    addMembers(req.user, group.id, group.zone_id, asArray(req.body.memberIds, 'memberIds'));
    res.json({ group: serialize(group, membersOf(group.id)) });
  } catch (error) {
    next(error);
  }
});

groupsRouter.delete('/:id/members/:userId', (req, res, next) => {
  try {
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) throw notFound('Group not found');
    assertSameZone(req.user, group.zone_id);
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(group.id, req.params.userId);
    res.json({ group: serialize(group, membersOf(group.id)) });
  } catch (error) {
    next(error);
  }
});

groupsRouter.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) throw notFound('Group not found');
    assertSameZone(req.user, group.zone_id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
