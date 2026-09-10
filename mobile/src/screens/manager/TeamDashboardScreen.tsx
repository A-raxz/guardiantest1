import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchTeam } from '../../api/endpoints';
import type { TeamMember } from '../../api/types';
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
import { DailyNudge } from '../../components/DailyNudge';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, percentColor, spacing, typography } from '../../theme';

type Filter = 'all' | 'stalled' | 'not_started' | 'completed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'stalled', label: 'Stalled' },
  { key: 'not_started', label: 'Not started' },
  { key: 'completed', label: 'Complete' },
];

/**
 * The Sales Manager's dashboard: completion percentage per employee, and the
 * team's overall training status. Reporting only — managers do not assign.
 */
export function TeamDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { data, error, isLoading, isRefreshing, reload } = useAsync(() => fetchTeam(), []);
  const [filter, setFilter] = useState<Filter>('all');

  if (isLoading && !data) return <LoadingView label="Loading your team…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  const members = data.members.filter((member) => (filter === 'all' ? true : member.bucket === filter));

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <DailyNudge />
      <Text style={styles.eyebrow}>{user?.zoneName ?? 'Your team'}</Text>
      <Text style={styles.title}>Team training</Text>

      <Row style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        <StatTile value={data.summary.teamSize} label="Team members" />
        <StatTile
          value={`${data.summary.averageCompletion}%`}
          label="Average complete"
          tone={percentColor(data.summary.averageCompletion)}
        />
        <StatTile value={data.summary.fullyCompliant} label="Fully compliant" tone={colors.success} />
      </Row>
      {data.summary.stalled > 0 ? (
        <Card style={styles.alert}>
          <Text style={styles.alertText}>
            ⚠️ {data.summary.stalled} {data.summary.stalled === 1 ? 'person has' : 'people have'} not touched their
            training in over a week.
          </Text>
        </Card>
      ) : null}

      <Row style={styles.filters}>
        {FILTERS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setFilter(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === option.key }}
            style={[styles.filter, filter === option.key && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === option.key && { color: colors.white }]}>{option.label}</Text>
          </Pressable>
        ))}
      </Row>

      <SectionHeader title={`${members.length} ${members.length === 1 ? 'person' : 'people'}`} />

      {members.length === 0 ? (
        <EmptyState emoji="🙌" title="Nobody in this group" body="Try a different filter." />
      ) : null}

      {members.map((member) => (
        <MemberCard
          key={member.userId}
          member={member}
          onPress={() => navigation.navigate('UserReport', { userId: member.userId, name: member.name })}
        />
      ))}
    </Screen>
  );
}

function MemberCard({ member, onPress }: { member: TeamMember; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <Avatar name={member.name} color={percentColor(member.percent)} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Row>
              <Text style={styles.memberName}>{member.name}</Text>
              <View style={{ flex: 1 }} />
              <Text style={[styles.percent, { color: percentColor(member.percent) }]}>{member.percent}%</Text>
            </Row>
            <Text style={styles.memberMeta}>
              {member.completedLessons}/{member.totalLessons} lessons · {member.coursesAssigned} course
              {member.coursesAssigned === 1 ? '' : 's'}
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar percent={member.percent} height={6} />
            </View>
            <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
              {member.bucket === 'stalled' ? <Pill label="Stalled" tone="danger" /> : null}
              {member.bucket === 'not_started' ? <Pill label="Not started" tone="warning" /> : null}
              {member.bucket === 'completed' ? <Pill label="Complete" tone="success" /> : null}
              <Text style={styles.lastSeen}>
                {member.lastActivityAt ? `Last activity ${formatDate(member.lastActivityAt)}` : 'No activity yet'}
              </Text>
            </Row>
          </View>
        </Row>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.label, color: colors.primary },
  title: { ...typography.display, marginTop: 2 },
  alert: { borderColor: colors.warning, marginTop: spacing.sm },
  alertText: { ...typography.body, color: colors.warning, fontSize: 14 },
  filters: { marginTop: spacing.md, flexWrap: 'wrap' },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  memberName: { ...typography.heading, fontSize: 15 },
  memberMeta: { ...typography.caption, marginTop: 2 },
  percent: { ...typography.heading, fontSize: 16 },
  lastSeen: { ...typography.caption },
});
