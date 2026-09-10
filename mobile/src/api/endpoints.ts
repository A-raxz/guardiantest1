import { api } from './client';
import type {
  AttemptResult,
  Certificate,
  Course,
  DashboardResponse,
  DriveItem,
  Group,
  Lesson,
  LessonDetail,
  Nudge,
  OverviewResponse,
  QuizBuilderQuestion,
  QuizResponse,
  Reward,
  Role,
  TeamResponse,
  TrackerResponse,
  User,
  XpSummary,
  Zone,
} from './types';

/* -------------------------------- Auth -------------------------------- */

export const login = (email: string, password: string) =>
  api.post<{ token: string; user: User; mustResetPassword: boolean }>(
    '/api/auth/login',
    { email, password },
    { anonymous: true },
  );

export const fetchMe = () => api.get<{ user: User; mustResetPassword: boolean }>('/api/auth/me');

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post<{ token: string; user: User; mustResetPassword: boolean }>('/api/auth/change-password', {
    currentPassword,
    newPassword,
  });

/* ------------------------------ Rep flow ------------------------------ */

export const fetchDashboard = () => api.get<DashboardResponse>('/api/assignments/mine');

export const fetchCourse = (courseId: string) =>
  api.get<{ course: Course; lessons: Lesson[] }>(`/api/courses/${courseId}`);

export const fetchLesson = (lessonId: string) => api.get<LessonDetail>(`/api/learning/lessons/${lessonId}`);

export const saveLessonProgress = (
  lessonId: string,
  positionSeconds: number,
  durationSeconds: number,
  completed = false,
) =>
  api.post<{ progress: { status: string; positionSeconds: number }; courseProgress: unknown }>(
    `/api/learning/lessons/${lessonId}/progress`,
    { positionSeconds: Math.round(positionSeconds), durationSeconds: Math.round(durationSeconds), completed },
  );

export const fetchQuiz = (lessonId: string) => api.get<QuizResponse>(`/api/learning/lessons/${lessonId}/quiz`);

export const submitQuiz = (quizId: string, answers: (number | null)[]) =>
  api.post<AttemptResult>(`/api/learning/quizzes/${quizId}/attempts`, { answers });

/* ---------------------------- Gamification ---------------------------- */

export const fetchXp = () =>
  api.get<XpSummary & { history: { amount: number; reason: string; refType: string | null; createdAt: string }[] }>(
    '/api/me/xp',
  );

export const fetchSummary = () =>
  api.get<{
    xp: XpSummary;
    completion: { totalLessons: number; completedLessons: number; percent: number };
    quizzesPassed: number;
    quizAttempts: number;
    certificates: number;
  }>('/api/me/summary');

export const fetchRewards = () => api.get<{ xp: XpSummary; rewards: Reward[] }>('/api/me/rewards');

export const redeemReward = (rewardId: string) =>
  api.post<{ ok: true; reward: { id: string; name: string; icon: string }; xp: XpSummary }>(
    `/api/me/rewards/${rewardId}/redeem`,
  );

export const fetchCertificates = () => api.get<{ certificates: Certificate[] }>('/api/me/certificates');

export const fetchLeaderboard = () =>
  api.get<{
    leaderboard: { rank: number; userId: string; name: string; xpTotal: number; level: number; isMe: boolean }[];
  }>('/api/me/leaderboard');

/* --------------------------- Notifications ---------------------------- */

export const fetchDailyNudge = () =>
  api.post<{ nudge: Nudge | null; reason?: string; nextEligibleInHours?: number }>('/api/notifications/daily-nudge');

export const fetchNotifications = () =>
  api.get<{
    notifications: {
      id: string;
      title: string;
      body: string;
      kind: string;
      action: { type: string; courseId?: string } | null;
      readAt: string | null;
      createdAt: string;
    }[];
    unreadCount: number;
  }>('/api/notifications');

export const markNotificationRead = (id: string) => api.post<{ ok: true }>(`/api/notifications/${id}/read`);

/* ------------------------------- Admin -------------------------------- */

export const fetchZones = () => api.get<{ zones: Zone[] }>('/api/zones');

export const createZone = (name: string, code: string) =>
  api.post<{ zone: Zone }>('/api/zones', { name, code });

export const fetchUsers = (params: { zoneId?: string; role?: Role; search?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.zoneId) query.set('zoneId', params.zoneId);
  if (params.role) query.set('role', params.role);
  if (params.search) query.set('search', params.search);
  const suffix = query.toString();
  return api.get<{ users: User[] }>(`/api/users${suffix ? `?${suffix}` : ''}`);
};

export const createUser = (input: {
  name: string;
  email: string;
  role: Role;
  zoneId?: string;
  managerId?: string | null;
  employeeCode?: string | null;
}) => api.post<{ user: User; temporaryPassword: string }>('/api/users', input);

export const updateUser = (userId: string, input: { isActive?: boolean; name?: string; managerId?: string | null }) =>
  api.patch<{ user: User }>(`/api/users/${userId}`, input);

export const resetUserPassword = (userId: string) =>
  api.post<{ temporaryPassword: string; user: User }>(`/api/users/${userId}/reset-password`);

export const browseDrive = (folderId?: string) =>
  api.get<{ provider: string; folderId: string; files: DriveItem[] }>(
    `/api/drive/files${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`,
  );

export const resolveDrive = (driveId: string) =>
  api.get<{ root: DriveItem; kind: string; items: DriveItem[]; videoCount: number }>(
    `/api/drive/resolve?driveId=${encodeURIComponent(driveId)}`,
  );

export const createCourseFromDrive = (input: { driveId: string; title?: string; description?: string; zoneId?: string }) =>
  api.post<{ course: Course; lessons: Lesson[] }>('/api/courses/from-drive', input);

export const fetchCourses = (zoneId?: string) =>
  api.get<{ courses: Course[] }>(`/api/courses${zoneId ? `?zoneId=${zoneId}` : ''}`);

export const deleteCourse = (courseId: string) => api.del<{ ok: true }>(`/api/courses/${courseId}`);

export const fetchQuizStatus = (courseId: string) =>
  api.get<{
    courseId: string;
    lessons: {
      lessonId: string;
      title: string;
      isVideo: boolean;
      quizId: string | null;
      questionCount: number;
      needsQuestions: boolean;
    }[];
  }>(`/api/quizzes/course/${courseId}/status`);

export const fetchLessonQuiz = (lessonId: string) =>
  api.get<{
    quiz: {
      id: string;
      lessonId: string;
      title: string;
      passScore: number;
      xpReward: number;
      isReady: boolean;
      questions: { id: string; prompt: string; options: string[]; correctIndex: number; explanation: string | null }[];
    } | null;
  }>(`/api/quizzes/lesson/${lessonId}`);

export const saveLessonQuiz = (
  lessonId: string,
  input: { title?: string; passScore?: number; xpReward?: number; questions: QuizBuilderQuestion[] },
) => api.put<{ quiz: unknown }>(`/api/quizzes/lesson/${lessonId}`, input);

export const assignCourse = (input: {
  courseId: string;
  userIds?: string[];
  groupIds?: string[];
  dueAt?: string | null;
}) =>
  api.post<{
    assignedCount: number;
    assignedUserIds: string[];
    skipped: { userId: string; reason: string }[];
    lessonsWithoutQuestions: string[];
  }>('/api/assignments', input);

export const fetchCourseAssignments = (courseId: string) =>
  api.get<{
    course: Course;
    assignments: {
      assignmentId: string;
      userId: string;
      name: string;
      email: string;
      role: Role;
      viaGroup: string | null;
      dueAt: string | null;
      assignedAt: string;
      progress: { percent: number; status: string; completedLessons: number; totalLessons: number };
    }[];
  }>(`/api/assignments/course/${courseId}`);

export const fetchGroups = (zoneId?: string) =>
  api.get<{ groups: Group[] }>(`/api/groups${zoneId ? `?zoneId=${zoneId}` : ''}`);

export const createGroup = (input: { name: string; description?: string; memberIds?: string[]; zoneId?: string }) =>
  api.post<{ group: Group }>('/api/groups', input);

/* ------------------------------ Reporting ----------------------------- */

export const fetchTracker = (zoneId?: string) =>
  api.get<TrackerResponse>(`/api/reports/tracker${zoneId ? `?zoneId=${zoneId}` : ''}`);

export const fetchTeam = (managerId?: string) =>
  api.get<TeamResponse>(`/api/reports/team${managerId ? `?managerId=${managerId}` : ''}`);

export const fetchOverview = () => api.get<OverviewResponse>('/api/reports/overview');

export const fetchUserReport = (userId: string) =>
  api.get<{
    user: { id: string; name: string; email: string; role: Role; xpTotal: number; lastLoginAt: string | null };
    courses: {
      courseId: string;
      title: string;
      coverEmoji: string;
      dueAt: string | null;
      percent: number;
      status: string;
      completedLessons: number;
      totalLessons: number;
    }[];
    attempts: { quizTitle: string; score: number; passed: boolean; takenAt: string }[];
    certificates: { serial: string; issuedAt: string; courseTitle: string }[];
  }>(`/api/reports/user/${userId}`);
