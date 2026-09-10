import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchCourses } from '../../api/endpoints';
import {
  AppButton,
  Card,
  EmptyState,
  ErrorView,
  LoadingView,
  Pill,
  Row,
  Screen,
  SectionHeader,
} from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, spacing, typography } from '../../theme';

/** The HR BP's content library: everything built from Google Drive for their zone. */
export function ContentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { data, error, isLoading, isRefreshing, reload } = useAsync(() => fetchCourses(), []);

  useFocusEffect(
    useCallback(() => {
      void reload({ silent: true });
    }, [reload]),
  );

  if (isLoading && !data) return <LoadingView label="Loading courses…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <Text style={styles.eyebrow}>{user?.zoneName ?? 'All zones'}</Text>
      <Text style={styles.title}>Content</Text>
      <Text style={styles.lede}>
        Pull a video or a whole folder out of Google Drive, attach a quiz, then assign it to people or groups in your
        zone.
      </Text>

      <AppButton
        label="Add from Google Drive"
        icon="📁"
        onPress={() => navigation.navigate('DriveBrowser', {})}
        style={{ marginTop: spacing.lg }}
      />

      <SectionHeader title={`${data?.courses.length ?? 0} course${data?.courses.length === 1 ? '' : 's'}`} />

      {!data?.courses.length ? (
        <EmptyState
          emoji="📂"
          title="No courses yet"
          body="Everything starts in Drive — pick a folder and the app turns each file into a lesson."
        />
      ) : null}

      {data?.courses.map((course) => (
        <Pressable
          key={course.id}
          accessibilityRole="button"
          onPress={() => navigation.navigate('CourseSetup', { courseId: course.id })}
        >
          <Card>
            <Row style={{ alignItems: 'flex-start' }}>
              <Text style={styles.emoji}>{course.coverEmoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.courseTitle}>{course.title}</Text>
                <Text style={styles.meta}>
                  {course.lessonCount ?? 0} lesson{course.lessonCount === 1 ? '' : 's'} · assigned to{' '}
                  {course.assignedCount ?? 0}
                </Text>
                <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  <Pill label={course.source === 'drive_folder' ? 'Drive folder' : 'Drive file'} />
                  {course.quizzesMissing ? (
                    <Pill label={`${course.quizzesMissing} quiz to write`} tone="warning" />
                  ) : (
                    <Pill label="Quizzes ready" tone="success" />
                  )}
                </Row>
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.label, color: colors.primary },
  title: { ...typography.display, marginTop: 2 },
  lede: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },
  emoji: { fontSize: 26, marginRight: spacing.md },
  courseTitle: { ...typography.heading, fontSize: 15 },
  meta: { ...typography.caption, marginTop: 2 },
});
