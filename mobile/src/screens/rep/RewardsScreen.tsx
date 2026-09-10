import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchRewards, redeemReward } from '../../api/endpoints';
import type { Reward } from '../../api/types';
import { AppButton, Card, ErrorView, LoadingView, Pill, ProgressBar, Row, Screen, SectionHeader } from '../../components';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

const KIND_LABEL: Record<Reward['kind'], string> = {
  functional: 'Perks that change how you learn',
  cosmetic: 'Make the app yours',
  real_world: 'Off-app rewards',
};

const KIND_ORDER: Reward['kind'][] = ['functional', 'cosmetic', 'real_world'];

/**
 * The reward store.
 *
 * Rather than one fixed prize at the end of one fixed path, XP is a currency
 * and the rep decides what it buys — a perk that changes how they progress, a
 * cosmetic, or something off-app. That is the flexibility the brief asks for.
 */
export function RewardsScreen() {
  const { refreshUser } = useAuth();
  const { data, error, isLoading, isRefreshing, reload } = useAsync(fetchRewards, []);
  const [busyId, setBusyId] = useState<string | null>(null);

  const redeem = async (reward: Reward) => {
    setBusyId(reward.id);
    try {
      const result = await redeemReward(reward.id);
      await Promise.all([reload({ silent: true }), refreshUser()]);
      Alert.alert(`${result.reward.icon}  ${result.reward.name}`, 'Redeemed. Your HR BP can see it on your record.');
    } catch (e) {
      Alert.alert('Could not redeem', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading && !data) return <LoadingView label="Loading rewards…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <LinearGradient colors={['#3B2A12', '#141C2E']} style={styles.balance}>
        <Text style={styles.balanceLabel}>XP to spend</Text>
        <Text style={styles.balanceValue}>{data.xp.xpAvailable}</Text>
        <Text style={styles.balanceHint}>
          {data.xp.xpTotal} earned all-time · Level {data.xp.level} {data.xp.title}
        </Text>
        <ProgressBar percent={data.xp.progress * 100} height={6} />
      </LinearGradient>

      {KIND_ORDER.map((kind) => {
        const rewards = data.rewards.filter((reward) => reward.kind === kind);
        if (!rewards.length) return null;
        return (
          <View key={kind}>
            <SectionHeader title={KIND_LABEL[kind]} />
            {rewards.map((reward) => (
              <RewardCard
                key={reward.id}
                reward={reward}
                busy={busyId === reward.id}
                onRedeem={() => void redeem(reward)}
              />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

function RewardCard({ reward, busy, onRedeem }: { reward: Reward; busy: boolean; onRedeem: () => void }) {
  return (
    <Card style={reward.owned ? styles.ownedCard : undefined}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Text style={styles.icon}>{reward.icon}</Text>
        <View style={{ flex: 1 }}>
          <Row>
            <Text style={styles.name}>{reward.name}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.cost}>{reward.costXp} XP</Text>
          </Row>
          <Text style={styles.description}>{reward.description}</Text>
          <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
            {reward.owned ? <Pill label="Unlocked" tone="success" /> : null}
            {reward.locked ? <Pill label={`Level ${reward.minLevel}+`} tone="warning" /> : null}
            {reward.repeatable && reward.timesRedeemed > 0 ? (
              <Pill label={`Used ${reward.timesRedeemed}×`} tone="primary" />
            ) : null}
          </Row>
        </View>
      </Row>

      {!reward.owned ? (
        <AppButton
          label={
            reward.locked
              ? `Reach level ${reward.minLevel}`
              : reward.affordable
                ? 'Redeem'
                : `Need ${reward.costXp} XP`
          }
          variant={reward.canRedeem ? 'primary' : 'secondary'}
          disabled={!reward.canRedeem}
          loading={busy}
          onPress={onRedeem}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  balance: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  balanceLabel: { ...typography.label },
  balanceValue: { fontSize: 38, fontWeight: '800', color: colors.accent },
  balanceHint: { ...typography.caption, marginBottom: spacing.sm },
  icon: { fontSize: 26, marginRight: spacing.md },
  name: { ...typography.heading, fontSize: 15 },
  cost: { ...typography.label, color: colors.accent },
  description: { ...typography.body, color: colors.textMuted, marginTop: 2, fontSize: 14 },
  ownedCard: { borderColor: colors.success },
});
