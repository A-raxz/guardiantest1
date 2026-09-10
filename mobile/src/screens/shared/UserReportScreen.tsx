import { useRoute, type RouteProp } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchUserReport } from '../../api/endpoints';
import {
  Avatar,
  Card,
  Divider,
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
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, percentColor, spacing, typography } from '../../theme';

/** One employee's full training record — used by managers and HR BPs alike. */
export function UserReportScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'UserReport'>>();
  const { userId } = route.params;
  const { data, error, isLoading, isRefreshing, reload } = useAsync(() => fetchUserReport(userId), [userId]);

  if (isLoading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  const overall = data.courses.length
    ? Math.round(data.courses.reduce((sum, course) => sum + course.percent, 0) / data.courses.length)
    : 0;

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <Row>
        <Avatar name={data.user.name} size={52} color={percentColor(overall)} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.name}>{data.user.name}</Text>
          <Text style={styles.meta}>{data.user.email}</Text>
          <Row style={{ marginTop: spacing.sm }}>
            <Pill label={`${data.user.xpTotal} XP`} tone="warning" />
            <Pill label={data.user.lastLoginAt ? `Last seen ${formatDate(data.user.lastLoginAt)}` : 'Never signed in'} />
          </Row>
        </View>
      </Row>

      <SectionHeader title="Courses" />
      {data.courses.length === 0 ? <EmptyState emoji="📭" title="Nothing assigned yet" /> : null}
      {data.courses.map((course) => (
        <Card key={course.courseId}>
          <Row>
            <Text style={styles.emoji}>{course.coverEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.courseTitle}>{course.title}</Text>
              <Text style={styles.meta}>
                {course.completedLessons}/{course.totalLessons} lessons
                {course.dueAt ? ` · due ${formatDate(course.dueAt)}` : ''}
              </Text>
            </View>
            <Text style={[styles.percent, { color: percentColor(course.percent) }]}>{course.percent}%</Text>
          </Row>
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar percent={course.percent} height={6} />
          </View>
        </Card>
      ))}

      {data.certificates.length > 0 ? (
        <>
          <SectionHeader title="Certificates" />
          <Card>
            {data.certificates.map((certificate, index) => (
              <View key={certificate.serial}>
                {index > 0 ? <Divider /> : null}
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{certificate.courseTitle}</Text>
                    <Text style={styles.meta}>{certificate.serial}</Text>
                  </View>
                  <Text style={styles.meta}>{formatDate(certificate.issuedAt)}</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {data.attempts.length > 0 ? (
        <>
          <SectionHeader title="Quiz attempts" />
          <Card>
            {data.attempts.map((attempt, index) => (
              <View key={`${attempt.takenAt}-${index}`}>
                {index > 0 ? <Divider /> : null}
                <Row>
                  <Text style={styles.mark}>{attempt.passed ? '✅' : '❌'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{attempt.quizTitle}</Text>
                    <Text style={styles.meta}>{formatDate(attempt.takenAt)}</Text>
                  </View>
                  <Text style={styles.rowTitle}>{attempt.score}%</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { ...typography.title },
  meta: { ...typography.caption, marginTop: 2 },
  emoji: { fontSize: 24, marginRight: spacing.md },
  courseTitle: { ...typography.heading, fontSize: 15 },
  percent: { ...typography.heading, fontSize: 16, color: colors.text },
  rowTitle: { ...typography.body, fontSize: 14 },
  mark: { fontSize: 14, marginRight: spacing.md },
});
