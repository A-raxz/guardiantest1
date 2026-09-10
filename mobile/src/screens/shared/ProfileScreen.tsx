import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchCertificates, fetchLeaderboard, fetchSummary, fetchXp } from '../../api/endpoints';
import {
  AppButton,
  Avatar,
  Card,
  Divider,
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
import { showDialog } from '../../components/dialog';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, radius, roleColor, spacing, typography } from '../../theme';

/** Profile, XP history, certificates and the zone leaderboard. */
export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const isLearner = user?.role === 'SALES_REP' || user?.role === 'SALES_MANAGER';

  const summary = useAsync(fetchSummary, []);
  const xp = useAsync(fetchXp, []);
  const certificates = useAsync(fetchCertificates, []);
  const leaderboard = useAsync(
    () => (user?.role === 'SALES_REP' ? fetchLeaderboard() : Promise.resolve({ leaderboard: [] })),
    [user?.role],
  );

  const reloadAll = () => {
    void summary.reload({ silent: true });
    void xp.reload({ silent: true });
    void certificates.reload({ silent: true });
    void leaderboard.reload({ silent: true });
  };

  const confirmSignOut = () =>
    showDialog('Sign out?', 'You will need your password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  if (!user) return <LoadingView />;
  if (summary.isLoading && !summary.data) return <LoadingView />;
  if (summary.error && !summary.data) return <ErrorView message={summary.error} onRetry={() => void summary.reload()} />;

  return (
    <Screen scroll onRefresh={reloadAll} refreshing={summary.isRefreshing}>
      <Row style={{ marginBottom: spacing.lg }}>
        <Avatar name={user.name} size={58} color={roleColor[user.role]} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <Pill label={user.roleLabel} tone="primary" />
            {user.zoneName ? <Pill label={user.zoneName} /> : null}
          </Row>
        </View>
      </Row>

      {isLearner && summary.data ? (
        <>
          <LinearGradient colors={['#1E2C55', '#141C2E']} style={styles.levelCard}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={styles.levelTitle}>
                  Level {summary.data.xp.level} · {summary.data.xp.title}
                </Text>
                <Text style={styles.levelHint}>
                  {summary.data.xp.xpForNextLevel - summary.data.xp.xpIntoLevel} XP to level{' '}
                  {summary.data.xp.level + 1}
                </Text>
              </View>
              <Text style={styles.levelXp}>{summary.data.xp.xpTotal}</Text>
            </Row>
            <ProgressBar percent={summary.data.xp.progress * 100} />
          </LinearGradient>

          <Row style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
            <StatTile value={`${summary.data.completion.percent}%`} label="Training complete" />
            <StatTile value={summary.data.quizzesPassed} label="Quizzes passed" />
            <StatTile value={summary.data.certificates} label="Certificates" tone={colors.accent} />
          </Row>
        </>
      ) : null}

      {certificates.data && certificates.data.certificates.length > 0 ? (
        <>
          <SectionHeader title="Certificates" />
          {certificates.data.certificates.map((certificate) => (
            <Card key={certificate.id} style={styles.certificate}>
              <Row>
                <Text style={styles.certEmoji}>{certificate.coverEmoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.certTitle}>{certificate.courseTitle}</Text>
                  <Text style={styles.certMeta}>
                    {certificate.serial} · issued {formatDate(certificate.issuedAt)}
                  </Text>
                </View>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {leaderboard.data && leaderboard.data.leaderboard.length > 1 ? (
        <>
          <SectionHeader title={`${user.zoneName ?? 'Zone'} leaderboard`} />
          <Card>
            {leaderboard.data.leaderboard.slice(0, 10).map((entry, index) => (
              <View key={entry.userId}>
                {index > 0 ? <Divider /> : null}
                <Row>
                  <Text style={[styles.rank, entry.isMe && { color: colors.accent }]}>#{entry.rank}</Text>
                  <Text style={[styles.leaderName, entry.isMe && { color: colors.accent, fontWeight: '700' }]}>
                    {entry.name}
                    {entry.isMe ? ' (you)' : ''}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.leaderXp}>{entry.xpTotal} XP</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {xp.data && xp.data.history.length > 0 ? (
        <>
          <SectionHeader title="Recent XP" />
          <Card>
            {xp.data.history.slice(0, 8).map((event, index) => (
              <View key={`${event.createdAt}-${index}`}>
                {index > 0 ? <Divider /> : null}
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.xpReason}>{event.reason}</Text>
                    <Text style={styles.xpDate}>{formatDate(event.createdAt)}</Text>
                  </View>
                  <Text style={styles.xpAmount}>+{event.amount}</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <AppButton label="Sign out" variant="secondary" onPress={confirmSignOut} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { ...typography.title },
  email: { ...typography.caption, marginTop: 2 },
  levelCard: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  levelTitle: { ...typography.heading },
  levelHint: { ...typography.caption, marginTop: 2 },
  levelXp: { fontSize: 26, fontWeight: '700', color: colors.accent },
  certificate: { borderColor: colors.accent },
  certEmoji: { fontSize: 26, marginRight: spacing.md },
  certTitle: { ...typography.heading, fontSize: 15 },
  certMeta: { ...typography.caption, marginTop: 2 },
  rank: { ...typography.label, width: 36, color: colors.textMuted },
  leaderName: { ...typography.body },
  leaderXp: { ...typography.label, color: colors.text },
  xpReason: { ...typography.body, fontSize: 14 },
  xpDate: { ...typography.caption, marginTop: 2 },
  xpAmount: { ...typography.label, color: colors.success },
});
