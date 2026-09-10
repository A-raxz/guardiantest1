import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AppButton,
  Card,
  EmptyState,
  ErrorView,
  LoadingView,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  formatDate,
} from '../../components';
import { DailyNudge } from '../../components/DailyNudge';
import { fetchDashboard } from '../../api/endpoints';
import type { AssignedCourse } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The rep's dashboard. Assigned courses land here, with a single Start /
 * Resume button that jumps straight to the exact second they left off.
 */
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { data, error, isLoading, isRefreshing, reload } = useAsync(fetchDashboard, []);

  // Progress changes while the player and quiz screens are open.
  useFocusEffect(
    useCallback(() => {
      void reload({ silent: true });
    }, [reload]),
  );

  const openCourse = (courseId: string) => navigation.navigate('Course', { courseId });

  if (isLoading && !data) return <LoadingView label="Loading your courses…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;

  const featured = data?.continueLearning ?? null;
  const rest = (data?.courses ?? []).filter((item) => item.course.id !== featured?.course.id);

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <DailyNudge
        onAction={(action) => {
          if (action.type === 'course' && action.courseId) openCourse(action.courseId);
          if (action.type === 'rewards') navigation.navigate('Tabs');
        }}
      />

      <Row style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name}>{user?.name ?? 'there'}</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={styles.bell}
        >
          <Text style={{ fontSize: 18 }}>🔔</Text>
        </Pressable>
      </Row>

      <LinearGradient colors={['#1E2C55', '#141C2E']} style={styles.xpCard}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={styles.levelTitle}>
              Level {user?.level.level} · {user?.level.title}
            </Text>
            <Text style={styles.xpText}>
              {user?.level.xpIntoLevel ?? 0} / {user?.level.xpForNextLevel ?? 500} XP to the next level
            </Text>
          </View>
          <Text style={styles.xpTotal}>{user?.xpTotal ?? 0}</Text>
        </Row>
        <ProgressBar percent={(user?.level.progress ?? 0) * 100} />
      </LinearGradient>

      {featured ? (
        <>
          <SectionHeader title={featured.resume?.action === 'resume' ? 'Pick up where you left off' : 'Ready when you are'} />
          <Card>
            <Row>
              <Text style={styles.cover}>{featured.course.coverEmoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.courseTitle}>{featured.course.title}</Text>
                <Text style={styles.courseMeta}>
                  {featured.progress.completedLessons} of {featured.progress.totalLessons} lessons ·{' '}
                  {featured.progress.percent}%
                </Text>
              </View>
            </Row>
            {featured.resume?.action === 'resume' ? (
              <Text style={styles.resumeLine}>
                ▶︎ {featured.resume.lessonTitle} — from {formatClock(featured.resume.positionSeconds)}
              </Text>
            ) : null}
            <ProgressBar percent={featured.progress.percent} />
            <AppButton
              label={featured.resume?.action === 'resume' ? 'Resume course' : 'Start course'}
              onPress={() =>
                featured.resume
                  ? navigation.navigate('LessonPlayer', { lessonId: featured.resume.lessonId })
                  : openCourse(featured.course.id)
              }
              style={{ marginTop: spacing.lg }}
            />
            <AppButton
              label="View all lessons"
              variant="ghost"
              onPress={() => openCourse(featured.course.id)}
              style={{ marginTop: spacing.xs }}
            />
          </Card>
        </>
      ) : null}

      <SectionHeader
        title="Your courses"
        action={
          data ? (
            <Text style={styles.counts}>
              {data.counts.completed}/{data.counts.total} complete
            </Text>
          ) : null
        }
      />

      {rest.length === 0 && !featured ? (
        <EmptyState
          emoji="📭"
          title="Nothing assigned yet"
          body="Your HR Business Partner will assign training here. You will get a nudge when it lands."
        />
      ) : null}

      {rest.map((item) => (
        <CourseRow key={item.course.id} item={item} onPress={() => openCourse(item.course.id)} />
      ))}
    </Screen>
  );
}

function CourseRow({ item, onPress }: { item: AssignedCourse; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <Row>
          <Text style={styles.cover}>{item.course.coverEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.courseTitle}>{item.course.title}</Text>
            <Text style={styles.courseMeta}>
              {item.progress.completedLessons}/{item.progress.totalLessons} lessons
              {item.dueAt ? ` · due ${formatDate(item.dueAt)}` : ''}
            </Text>
          </View>
          {item.progress.status === 'completed' ? (
            <Pill label="Done" tone="success" />
          ) : item.progress.status === 'in_progress' ? (
            <Pill label={`${item.progress.percent}%`} tone="primary" />
          ) : (
            <Pill label="Not started" />
          )}
        </Row>
        <View style={{ marginTop: spacing.md }}>
          <ProgressBar percent={item.progress.percent} height={6} />
        </View>
      </Card>
    </Pressable>
  );
}

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatClock = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  greeting: { ...typography.body, color: colors.textMuted },
  name: { ...typography.display },
  bell: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  levelTitle: { ...typography.heading },
  xpText: { ...typography.caption, marginTop: 2 },
  xpTotal: { fontSize: 26, fontWeight: '700', color: colors.accent },
  cover: { fontSize: 30, marginRight: spacing.md },
  courseTitle: { ...typography.heading },
  courseMeta: { ...typography.caption, marginTop: 3 },
  resumeLine: { ...typography.body, color: colors.primary, marginTop: spacing.md, marginBottom: spacing.sm },
  counts: { ...typography.caption },
});
