export type Role = 'MASTER_ADMIN' | 'HR_BP' | 'SALES_MANAGER' | 'SALES_REP';

export interface Level {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  roleLabel: string;
  zoneId: string | null;
  zoneName: string | null;
  managerId: string | null;
  managerName: string | null;
  employeeCode: string | null;
  isActive: boolean;
  mustResetPassword: boolean;
  xpTotal: number;
  xpAvailable: number;
  level: Level;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface Zone {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  userCount?: number;
  hrBpName?: string | null;
}

export interface Course {
  id: string;
  zoneId: string | null;
  title: string;
  description: string | null;
  source: 'drive_folder' | 'drive_file' | 'manual';
  driveId: string | null;
  coverEmoji: string;
  xpBonus: number;
  createdAt: string;
  lessonCount?: number;
  assignedCount?: number;
  quizzesMissing?: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  driveFileId: string;
  mimeType: string | null;
  isVideo: boolean;
  previewUrl: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
  durationSeconds: number;
  position: number;
  quizId?: string | null;
  questionCount?: number;
}

export interface CourseProgress {
  totalLessons: number;
  completedLessons: number;
  percent: number;
  status: 'not_started' | 'in_progress' | 'completed';
  nextLessonId: string | null;
  lastActivityAt: string | null;
}

export interface AssignedCourse {
  course: Course;
  dueAt: string | null;
  assignedAt: string;
  progress: CourseProgress;
  resume: {
    lessonId: string;
    lessonTitle: string;
    positionSeconds: number;
    durationSeconds: number;
    status: string;
    action: 'start' | 'resume';
  } | null;
}

export interface DashboardResponse {
  continueLearning: AssignedCourse | null;
  courses: AssignedCourse[];
  counts: { total: number; inProgress: number; notStarted: number; completed: number };
}

export interface LessonDetail {
  lesson: Lesson;
  course: { id: string; title: string; coverEmoji: string };
  playback: { kind: 'stream' | 'preview'; url: string };
  progress: {
    status: string;
    positionSeconds: number;
    watchedSeconds: number;
    durationSeconds: number;
  };
  quiz: { id: string; title: string; passScore: number; xpReward: number; questionCount: number } | null;
  nextLessonId: string | null;
  prevLessonId: string | null;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  position: number;
  correctIndex?: number;
  explanation?: string | null;
}

export interface QuizResponse {
  quiz: {
    id: string;
    lessonId: string;
    title: string;
    passScore: number;
    xpReward: number;
    questionCount: number;
    isReady: boolean;
  };
  questions: QuizQuestion[];
  previousBestScore: number | null;
  attempts: number;
  alreadyPassed: boolean;
}

export interface AttemptResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  passScore: number;
  passed: boolean;
  xpAwarded: number;
  results: {
    questionId: string;
    prompt: string;
    givenIndex: number | null;
    correctIndex: number;
    correct: boolean;
    explanation: string | null;
  }[];
  xp: XpSummary;
  courseProgress: CourseProgress;
  courseCompleted: boolean;
  certificate: { id: string; serial: string; courseTitle: string } | null;
  courseBonusXp: number;
}

export interface XpSummary extends Level {
  xpTotal: number;
  xpSpent: number;
  xpAvailable: number;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  kind: 'cosmetic' | 'functional' | 'real_world';
  costXp: number;
  icon: string;
  repeatable: boolean;
  minLevel: number;
  timesRedeemed: number;
  owned: boolean;
  locked: boolean;
  affordable: boolean;
  canRedeem: boolean;
}

export interface Nudge {
  title: string;
  body: string;
  cta: string;
  action: { type: string; courseId?: string } | null;
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  isVideo: boolean;
  webViewLink: string;
  thumbnailLink: string | null;
  durationSeconds: number;
  modifiedTime: string | null;
}

export interface TrackerPerson {
  userId: string;
  name: string;
  email: string;
  role: Role;
  managerName: string | null;
  xpTotal: number;
  lastLoginAt: string | null;
  coursesAssigned: number;
  totalLessons: number;
  completedLessons: number;
  percent: number;
  lastActivityAt: string | null;
  bucket: 'completed' | 'in_progress' | 'stalled' | 'not_started';
}

export interface TrackerResponse {
  zoneId: string | null;
  summary: {
    people: number;
    averageCompletion: number;
    completed: number;
    inProgress: number;
    stalled: number;
    notStarted: number;
  };
  people: TrackerPerson[];
  courses: { courseId: string; title: string; coverEmoji: string; assignedUsers: number; percent: number }[];
}

export interface TeamMember extends TrackerPerson {
  employeeCode: string | null;
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
}

export interface TeamResponse {
  managerId: string;
  summary: {
    teamSize: number;
    averageCompletion: number;
    fullyCompliant: number;
    stalled: number;
    notStarted: number;
  };
  members: TeamMember[];
}

export interface OverviewResponse {
  totals: {
    users: number;
    zones: number;
    courses: number;
    assignments: number;
    certificates: number;
    xpAwarded: number;
  };
  averageCompletion: number;
  zones: {
    zoneId: string;
    name: string;
    code: string;
    hrBpName: string | null;
    hrBpEmail: string | null;
    people: number;
    averageCompletion: number;
    fullyCompliant: number;
  }[];
}

export interface Certificate {
  id: string;
  serial: string;
  issuedAt: string;
  courseTitle: string;
  coverEmoji: string;
  holderName: string;
}

export interface Group {
  id: string;
  zoneId: string;
  name: string;
  description: string | null;
  memberCount: number;
  members: { id: string; name: string; email: string; role: Role }[];
  createdAt: string;
}

export interface QuizBuilderQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
}
