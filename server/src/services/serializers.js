import { ROLE_LABELS } from '../lib/roles.js';
import { levelFor } from './gamification.js';

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] ?? row.role,
    zoneId: row.zone_id ?? null,
    zoneName: row.zone_name ?? null,
    managerId: row.manager_id ?? null,
    managerName: row.manager_name ?? null,
    employeeCode: row.employee_code ?? null,
    isActive: Boolean(row.is_active),
    mustResetPassword: Boolean(row.must_reset_password),
    xpTotal: row.xp_total ?? 0,
    xpAvailable: (row.xp_total ?? 0) - (row.xp_spent ?? 0),
    level: levelFor(row.xp_total ?? 0),
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export const publicZone = (row) =>
  row && {
    id: row.id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
    ...(row.user_count !== undefined ? { userCount: row.user_count } : {}),
    ...(row.hr_bp_name !== undefined ? { hrBpName: row.hr_bp_name } : {}),
  };

export const publicLesson = (row) => ({
  id: row.id,
  courseId: row.course_id,
  title: row.title,
  driveFileId: row.drive_file_id,
  mimeType: row.mime_type,
  isVideo: Boolean(row.mime_type && row.mime_type.startsWith('video/')),
  previewUrl: `https://drive.google.com/file/d/${row.drive_file_id}/preview`,
  webViewLink: row.web_view_link,
  thumbnailLink: row.thumbnail_link,
  durationSeconds: row.duration_seconds,
  position: row.position,
});

export const publicCourse = (row) => ({
  id: row.id,
  zoneId: row.zone_id,
  title: row.title,
  description: row.description,
  source: row.source,
  driveId: row.drive_id,
  coverEmoji: row.cover_emoji,
  xpBonus: row.xp_bonus,
  createdAt: row.created_at,
  ...(row.lesson_count !== undefined ? { lessonCount: row.lesson_count } : {}),
  ...(row.assigned_count !== undefined ? { assignedCount: row.assigned_count } : {}),
  ...(row.quizzes_missing !== undefined ? { quizzesMissing: row.quizzes_missing } : {}),
});

export const publicQuestion = (row, { includeAnswer = false } = {}) => ({
  id: row.id,
  prompt: row.prompt,
  options: JSON.parse(row.options_json),
  position: row.position,
  ...(includeAnswer ? { correctIndex: row.correct_index, explanation: row.explanation } : {}),
});
