import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  ErrorView,
  LoadingView,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  formatDuration,
} from '../../components';
import { fetchCourse, fetchDashboard } from '../../api/endpoints';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The lessons inside one course. Reps choose their own order here rather than
 * being marched through a fixed path.
 */
export function CourseScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Course'>>();
  const navigation = useNavigation<Nav>();
  const { courseId } = route.params;

  const course = useAsync(() => fetchCourse(courseId), [courseId]);
  const dashboard = useAsync(fetchDashboard, []);

  useFocusEffect(
    useCallback(() => {
      void dashboard.reload({ silent: true });
    }, [dashboard.reload]),
  );

  if (course.isLoading && !course.data) return <LoadingView />;
  if (course.error && !course.data) return <ErrorView message={course.error} onRetry={() => void course.reload()} />;
  if (!course.data) return null;

  const assigned = dashboard.data?.courses.find((item) => item.course.id === courseId);
  const progress = assigned?.progress;
  const nextLessonId = progress?.nextLessonId;

  return (
    <Screen scroll onRefresh={() => void course.reload({ silent: true })} refreshing={course.isRefreshing}>
      <Row>
        <Text style={styles.cover}>{course.data.course.coverEmoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{course.data.course.title}</Text>
          <Text style={styles.meta}>
            {course.data.lessons.length} lesson{course.data.lessons.length === 1 ? '' : 's'}
            {course.data.course.xpBonus ? ` · +${course.data.course.xpBonus} XP on completion` : ''}
          </Text>
        </View>
      </Row>

      {course.data.course.description ? (
        <Text style={styles.description}>{course.data.course.description}</Text>
      ) : null}

      {progress ? (
        <View style={{ marginTop: spacing.lg }}>
          <Row style={{ marginBottom: spacing.sm }}>
            <Text style={styles.progressLabel}>
              {progress.completedLessons} of {progress.totalLessons} complete
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.progressPercent}>{progress.percent}%</Text>
          </Row>
          <ProgressBar percent={progress.percent} />
        </View>
      ) : null}

      <SectionHeader title="Lessons" />

      {course.data.lessons.map((lesson, index) => {
        const isNext = lesson.id === nextLessonId;
        const done = Boolean(progress) && !isNext && isBefore(course.data!.lessons, lesson.id, nextLessonId);
        return (
          <Pressable
            key={lesson.id}
            accessibilityRole="button"
            onPress={() => navigation.navigate('LessonPlayer', { lessonId: lesson.id })}
          >
            <Card style={isNext ? styles.nextCard : undefined}>
              <Row>
                <View style={[styles.index, isNext && styles.indexNext]}>
                  <Text style={[styles.indexText, isNext && { color: colors.white }]}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonTitle}>{lesson.title}</Text>
                  <Text style={styles.lessonMeta}>
                    {lesson.isVideo ? `Video · ${formatDuration(lesson.durationSeconds)}` : 'Material'}
                    {lesson.questionCount ? ` · ${lesson.questionCount}-question quiz` : ''}
                  </Text>
                </View>
                {isNext ? <Pill label="Next up" tone="primary" /> : done ? <Pill label="✓" tone="success" /> : null}
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

/** Lessons before the next incomplete one have been finished. */
function isBefore(lessons: { id: string }[], lessonId: string, nextLessonId: string | null | undefined) {
  if (!nextLessonId) return true;
  return lessons.findIndex((l) => l.id === lessonId) < lessons.findIndex((l) => l.id === nextLessonId);
}

const styles = StyleSheet.create({
  cover: { fontSize: 36, marginRight: spacing.md },
  title: { ...typography.title },
  meta: { ...typography.caption, marginTop: 3 },
  description: { ...typography.body, color: colors.textMuted, marginTop: spacing.lg },
  progressLabel: { ...typography.label },
  progressPercent: { ...typography.label, color: colors.text },
  nextCard: { borderColor: colors.primary },
  index: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  indexNext: { backgroundColor: colors.primary },
  indexText: { ...typography.label, color: colors.textMuted },
  lessonTitle: { ...typography.heading, fontSize: 15 },
  lessonMeta: { ...typography.caption, marginTop: 2 },
});
