import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchCourse, fetchCourseAssignments, fetchQuizStatus } from '../../api/endpoints';
import {
  AppButton,
  Card,
  Divider,
  ErrorView,
  LoadingView,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  formatDuration,
} from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, percentColor, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** What a course contains, which quizzes still need writing, and who has it. */
export function CourseSetupScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CourseSetup'>>();
  const navigation = useNavigation<Nav>();
  const { courseId } = route.params;

  const course = useAsync(() => fetchCourse(courseId), [courseId]);
  const quizzes = useAsync(() => fetchQuizStatus(courseId), [courseId]);
  const assignments = useAsync(() => fetchCourseAssignments(courseId), [courseId]);

  useFocusEffect(
    useCallback(() => {
      void quizzes.reload({ silent: true });
      void assignments.reload({ silent: true });
    }, [quizzes.reload, assignments.reload]),
  );

  if (course.isLoading && !course.data) return <LoadingView />;
  if (course.error && !course.data) return <ErrorView message={course.error} onRetry={() => void course.reload()} />;
  if (!course.data) return null;

  const pending = quizzes.data?.lessons.filter((lesson) => lesson.needsQuestions) ?? [];

  return (
    <Screen
      scroll
      onRefresh={() => {
        void course.reload({ silent: true });
        void quizzes.reload({ silent: true });
        void assignments.reload({ silent: true });
      }}
      refreshing={course.isRefreshing}
    >
      <Row>
        <Text style={styles.emoji}>{course.data.course.coverEmoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{course.data.course.title}</Text>
          <Text style={styles.meta}>
            {course.data.lessons.length} lesson{course.data.lessons.length === 1 ? '' : 's'} · from{' '}
            {course.data.course.source === 'drive_folder' ? 'a Drive folder' : 'a Drive file'}
          </Text>
        </View>
      </Row>

      {pending.length > 0 ? (
        <Card style={styles.warn}>
          <Text style={styles.warnText}>
            ✍️ {pending.length} video{pending.length === 1 ? '' : 's'} still {pending.length === 1 ? 'needs' : 'need'} quiz
            questions. Reps can watch them, but they earn no XP until the quiz exists.
          </Text>
        </Card>
      ) : null}

      <AppButton
        label="Assign to people or groups"
        icon="👥"
        onPress={() => navigation.navigate('AssignCourse', { courseId })}
        style={{ marginTop: spacing.md }}
      />

      <SectionHeader title="Lessons and quizzes" />
      {course.data.lessons.map((lesson, index) => {
        const status = quizzes.data?.lessons.find((entry) => entry.lessonId === lesson.id);
        return (
          <Pressable
            key={lesson.id}
            accessibilityRole="button"
            onPress={() => navigation.navigate('QuizBuilder', { lessonId: lesson.id, lessonTitle: lesson.title })}
          >
            <Card>
              <Row style={{ alignItems: 'flex-start' }}>
                <Text style={styles.index}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonTitle}>{lesson.title}</Text>
                  <Text style={styles.meta}>
                    {lesson.isVideo ? `Video · ${formatDuration(lesson.durationSeconds)}` : 'Material'}
                  </Text>
                  <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
                    {status?.needsQuestions ? (
                      <Pill label="Quiz needs questions" tone="warning" />
                    ) : status?.questionCount ? (
                      <Pill
                        label={`${status.questionCount} question${status.questionCount === 1 ? '' : 's'}`}
                        tone="success"
                      />
                    ) : (
                      <Pill label="No quiz needed" />
                    )}
                  </Row>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Row>
            </Card>
          </Pressable>
        );
      })}

      <SectionHeader title={`Assigned to ${assignments.data?.assignments.length ?? 0}`} />
      {assignments.data?.assignments.length ? (
        <Card>
          {assignments.data.assignments.map((assignment, index) => (
            <View key={assignment.assignmentId}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => navigation.navigate('UserReport', { userId: assignment.userId, name: assignment.name })}
              >
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{assignment.name}</Text>
                    <Text style={styles.meta}>
                      {assignment.progress.completedLessons}/{assignment.progress.totalLessons} lessons
                      {assignment.viaGroup ? ` · via ${assignment.viaGroup}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.percent, { color: percentColor(assignment.progress.percent) }]}>
                    {assignment.progress.percent}%
                  </Text>
                </Row>
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar percent={assignment.progress.percent} height={5} />
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <Text style={styles.meta}>Nobody has this course yet.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 34, marginRight: spacing.md },
  title: { ...typography.title },
  meta: { ...typography.caption, marginTop: 2 },
  warn: { borderColor: colors.warning, marginTop: spacing.lg },
  warnText: { ...typography.body, color: colors.warning, fontSize: 14 },
  index: { ...typography.label, width: 22, color: colors.textFaint },
  lessonTitle: { ...typography.heading, fontSize: 15 },
  chevron: { fontSize: 22, color: colors.textFaint, marginLeft: spacing.sm },
  personName: { ...typography.body, fontSize: 14 },
  percent: { ...typography.heading, fontSize: 15 },
});
