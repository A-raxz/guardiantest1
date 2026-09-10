import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchTracker, fetchZones } from '../../api/endpoints';
import type { TrackerPerson } from '../../api/types';
import {
  Avatar,
  Card,
  EmptyState,
  ErrorView,
  LoadingView,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  formatDate,
} from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, percentColor, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Bucket = 'all' | TrackerPerson['bucket'];

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'stalled', label: 'Stalled' },
  { key: 'completed', label: 'Complete' },
];

/**
 * The Sales Tracker: how training is going across the HR BP's zone.
 * A Master Admin can switch between zones.
 */
export function TrackerScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const isMaster = user?.role === 'MASTER_ADMIN';

  const [zoneId, setZoneId] = useState<string | undefined>(undefined);
  const [bucket, setBucket] = useState<Bucket>('all');

  const zones = useAsync(() => (isMaster ? fetchZones() : Promise.resolve({ zones: [] })), [isMaster]);
  const tracker = useAsync(() => fetchTracker(zoneId), [zoneId]);

  useFocusEffect(
    useCallback(() => {
      void tracker.reload({ silent: true });
    }, [tracker.reload]),
  );

  if (tracker.isLoading && !tracker.data) return <LoadingView label="Building the tracker…" />;
  if (tracker.error && !tracker.data) {
    return <ErrorView message={tracker.error} onRetry={() => void tracker.reload()} />;
  }
  if (!tracker.data) return null;

  const people = tracker.data.people.filter((person) => (bucket === 'all' ? true : person.bucket === bucket));

  return (
    <Screen scroll onRefresh={() => void tracker.reload({ silent: true })} refreshing={tracker.isRefreshing}>
      <Text style={styles.eyebrow}>Sales Tracker</Text>
      <Text style={styles.title}>{isMaster ? 'Training across zones' : (user?.zoneName ?? 'Your zone')}</Text>

      {isMaster && zones.data?.zones.length ? (
        <Row style={{ flexWrap: 'wrap', marginTop: spacing.md }}>
          <Pressable
            onPress={() => setZoneId(undefined)}
            style={[styles.chip, zoneId === undefined && styles.chipOn]}
            accessibilityRole="tab"
          >
            <Text style={[styles.chipText, zoneId === undefined && { color: colors.white }]}>All zones</Text>
          </Pressable>
          {zones.data.zones.map((zone) => (
            <Pressable
              key={zone.id}
              onPress={() => setZoneId(zone.id)}
              style={[styles.chip, zoneId === zone.id && styles.chipOn]}
              accessibilityRole="tab"
            >
              <Text style={[styles.chipText, zoneId === zone.id && { color: colors.white }]}>{zone.code}</Text>
            </Pressable>
          ))}
        </Row>
      ) : null}

      <Row style={{ marginTop: spacing.lg }}>
        <StatTile value={tracker.data.summary.people} label="People" />
        <StatTile
          value={`${tracker.data.summary.averageCompletion}%`}
          label="Average"
          tone={percentColor(tracker.data.summary.averageCompletion)}
        />
        <StatTile value={tracker.data.summary.completed} label="Complete" tone={colors.success} />
        <StatTile value={tracker.data.summary.stalled} label="Stalled" tone={colors.danger} />
      </Row>

      {tracker.data.courses.length ? (
        <>
          <SectionHeader title="By course" />
          <Card>
            {tracker.data.courses.map((course, index) => (
              <View key={course.courseId} style={index > 0 ? { marginTop: spacing.md } : undefined}>
                <Row>
                  <Text style={styles.courseEmoji}>{course.coverEmoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseTitle}>{course.title}</Text>
                    <Text style={styles.meta}>
                      {course.assignedUsers} assigned · {course.percent}% complete
                    </Text>
                  </View>
                </Row>
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar percent={course.percent} height={5} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Row style={{ flexWrap: 'wrap', marginTop: spacing.lg }}>
        {BUCKETS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setBucket(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: bucket === option.key }}
            style={[styles.chip, bucket === option.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, bucket === option.key && { color: colors.white }]}>{option.label}</Text>
          </Pressable>
        ))}
      </Row>

      <SectionHeader title={`${people.length} ${people.length === 1 ? 'person' : 'people'}`} />

      {!people.length ? <EmptyState emoji="🔍" title="Nobody in this group" body="Try another filter." /> : null}

      {people.map((person) => (
        <Pressable
          key={person.userId}
          accessibilityRole="button"
          onPress={() => navigation.navigate('UserReport', { userId: person.userId, name: person.name })}
        >
          <Card>
            <Row style={{ alignItems: 'flex-start' }}>
              <Avatar name={person.name} color={percentColor(person.percent)} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Row>
                  <Text style={styles.name}>{person.name}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.percent, { color: percentColor(person.percent) }]}>{person.percent}%</Text>
                </Row>
                <Text style={styles.meta}>
                  {person.completedLessons}/{person.totalLessons} lessons · {person.xpTotal} XP
                  {person.managerName ? ` · ${person.managerName}` : ''}
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar percent={person.percent} height={5} />
                </View>
                <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  {person.bucket === 'stalled' ? <Pill label="Stalled" tone="danger" /> : null}
                  {person.role === 'SALES_MANAGER' ? <Pill label="Manager" tone="success" /> : null}
                  <Text style={styles.meta}>
                    {person.lastLoginAt ? `Last seen ${formatDate(person.lastLoginAt)}` : 'Never signed in'}
                  </Text>
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
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  courseEmoji: { fontSize: 20, marginRight: spacing.sm },
  courseTitle: { ...typography.body, fontSize: 14 },
  name: { ...typography.heading, fontSize: 15 },
  meta: { ...typography.caption, marginTop: 2 },
  percent: { ...typography.heading, fontSize: 16 },
});
