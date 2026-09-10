import type { AttemptResult, Role } from '../api/types';

export type RootStackParamList = {
  Tabs: undefined;
  Course: { courseId: string };
  LessonPlayer: { lessonId: string };
  Quiz: { lessonId: string };
  QuizResult: { result: AttemptResult; lessonId: string };
  Notifications: undefined;
  DriveBrowser: { folderId?: string; folderName?: string };
  CourseSetup: { courseId: string };
  QuizBuilder: { lessonId: string; lessonTitle: string };
  AssignCourse: { courseId: string };
  CreateUser: { presetRole?: Role };
  UserReport: { userId: string; name?: string };
  ZoneDetail: { zoneId: string; name: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
