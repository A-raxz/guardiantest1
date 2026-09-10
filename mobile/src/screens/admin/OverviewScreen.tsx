import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createZone, fetchOverview, fetchZones } from '../../api/endpoints';
import {
  AppButton,
  Card,
  EmptyState,
  ErrorView,
  Field,
  LoadingView,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatTile,
} from '../../components';
import { showDialog } from '../../components/dialog';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, percentColor, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The Master Admin's roll-up: every zone, its HR BP, and how it is doing. */
export function OverviewScreen() {
  const navigation = useNavigation<Nav>();
  const overview = useAsync(fetchOverview, []);
  const zones = useAsync(fetchZones, []);

  const [showNewZone, setShowNewZone] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneCode, setZoneCode] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void overview.reload({ silent: true });
    }, [overview.reload]),
  );

  const addZone = async () => {
    if (!zoneName.trim() || !zoneCode.trim()) {
      showDialog('Missing details', 'A zone needs a name and a short code.');
      return;
    }
    setBusy(true);
    try {
      await createZone(zoneName.trim(), zoneCode.trim());
      setZoneName('');
      setZoneCode('');
      setShowNewZone(false);
      void overview.reload({ silent: true });
      void zones.reload({ silent: true });
    } catch (e) {
      showDialog('Could not create the zone', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (overview.isLoading && !overview.data) return <LoadingView />;
  if (overview.error && !overview.data) {
    return <ErrorView message={overview.error} onRetry={() => void overview.reload()} />;
  }
  if (!overview.data) return null;

  return (
    <Screen scroll onRefresh={() => void overview.reload({ silent: true })} refreshing={overview.isRefreshing}>
      <Text style={styles.eyebrow}>Master Admin</Text>
      <Text style={styles.title}>Guardians overview</Text>

      <Row style={{ marginTop: spacing.lg }}>
        <StatTile value={overview.data.totals.users} label="Active people" />
        <StatTile value={overview.data.totals.zones} label="Zones" />
        <StatTile
          value={`${overview.data.averageCompletion}%`}
          label="Average complete"
          tone={percentColor(overview.data.averageCompletion)}
        />
      </Row>
      <Row style={{ marginTop: spacing.sm }}>
        <StatTile value={overview.data.totals.courses} label="Courses" />
        <StatTile value={overview.data.totals.certificates} label="Certificates" tone={colors.accent} />
        <StatTile value={overview.data.totals.xpAwarded} label="XP awarded" tone={colors.accent} />
      </Row>

      <SectionHeader
        title="Field offices"
        action={
          <Pressable onPress={() => setShowNewZone((value) => !value)} accessibilityRole="button">
            <Text style={styles.link}>{showNewZone ? 'Cancel' : '+ New zone'}</Text>
          </Pressable>
        }
      />

      {showNewZone ? (
        <Card>
          <Field label="Zone name" value={zoneName} onChangeText={setZoneName} placeholder="East Zone" />
          <Field
            label="Short code"
            value={zoneCode}
            onChangeText={setZoneCode}
            placeholder="EZ"
            autoCapitalize="characters"
          />
          <AppButton label="Create zone" onPress={() => void addZone()} loading={busy} />
        </Card>
      ) : null}

      {!overview.data.zones.length ? (
        <EmptyState
          emoji="🗺️"
          title="No zones yet"
          body="Create a field office, then give it an HR Business Partner."
        />
      ) : null}

      {overview.data.zones.map((zone) => (
        <Card key={zone.zoneId}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={styles.zoneName}>{zone.name}</Text>
              <Text style={styles.meta}>
                {zone.code} · {zone.people} {zone.people === 1 ? 'person' : 'people'}
              </Text>
            </View>
            <Text style={[styles.percent, { color: percentColor(zone.averageCompletion) }]}>
              {zone.averageCompletion}%
            </Text>
          </Row>
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar percent={zone.averageCompletion} height={6} />
          </View>
          <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }}>
            {zone.hrBpName ? (
              <Pill label={`HR BP · ${zone.hrBpName}`} tone="primary" />
            ) : (
              <Pill label="No HR BP assigned" tone="warning" />
            )}
            <Pill label={`${zone.fullyCompliant} fully compliant`} tone="success" />
          </Row>
          {!zone.hrBpName ? (
            <AppButton
              label="Create the HR BP login"
              variant="secondary"
              onPress={() => navigation.navigate('CreateUser', { presetRole: 'HR_BP' })}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.label, color: colors.primary },
  title: { ...typography.display, marginTop: 2 },
  link: { ...typography.label, color: colors.primary },
  zoneName: { ...typography.heading, fontSize: 16 },
  meta: { ...typography.caption, marginTop: 2 },
  percent: { ...typography.title, fontSize: 20 },
});
