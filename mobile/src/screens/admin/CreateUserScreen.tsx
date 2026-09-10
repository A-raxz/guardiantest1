import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { createUser, fetchUsers, fetchZones } from '../../api/endpoints';
import type { Role } from '../../api/types';
import { AppButton, Card, Field, Row, Screen, SectionHeader } from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ROLE_OPTIONS: { role: Role; label: string; hint: string }[] = [
  { role: 'SALES_REP', label: 'Sales Rep', hint: 'Takes courses, quizzes and earns XP' },
  { role: 'SALES_MANAGER', label: 'Sales Manager', hint: 'Reads team reports; cannot assign content' },
  { role: 'HR_BP', label: 'HR Business Partner', hint: 'Runs one zone — Master Admin only' },
];

/** Create a login. The temporary password is shown once, at the end. */
export function CreateUserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreateUser'>>();
  const { user } = useAuth();
  const isMaster = user?.role === 'MASTER_ADMIN';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [role, setRole] = useState<Role>(route.params?.presetRole ?? 'SALES_REP');
  const [zoneId, setZoneId] = useState<string | null>(user?.zoneId ?? null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const zones = useAsync(() => (isMaster ? fetchZones() : Promise.resolve({ zones: [] })), [isMaster]);
  const managers = useAsync(
    () => fetchUsers({ role: 'SALES_MANAGER', zoneId: zoneId ?? undefined }),
    [zoneId],
  );

  const availableRoles = ROLE_OPTIONS.filter((option) => isMaster || option.role !== 'HR_BP');

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing details', 'A name and a work email are both required.');
      return;
    }
    if (isMaster && role !== 'MASTER_ADMIN' && !zoneId) {
      Alert.alert('Pick a zone', 'Everyone except the Master Admin belongs to a zone.');
      return;
    }
    setBusy(true);
    try {
      const result = await createUser({
        name: name.trim(),
        email: email.trim(),
        role,
        zoneId: zoneId ?? undefined,
        managerId: role === 'SALES_REP' ? managerId : null,
        employeeCode: employeeCode.trim() || null,
      });
      Alert.alert(
        'Login created',
        `${result.user.name}\n${result.user.email}\n\nTemporary password:\n${result.temporaryPassword}\n\n` +
          'Share this directly. They will be asked to set their own password on first sign-in.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not create the account', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Create a login</Text>
      <Text style={styles.lede}>
        There is no sign-up page. You create the account here and hand over the first password.
      </Text>

      <SectionHeader title="Role" />
      {availableRoles.map((option) => (
        <Pressable
          key={option.role}
          accessibilityRole="radio"
          accessibilityState={{ selected: role === option.role }}
          onPress={() => setRole(option.role)}
        >
          <Card style={role === option.role ? styles.on : undefined}>
            <Row>
              <View style={[styles.radio, role === option.role && styles.radioOn]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionHint}>{option.hint}</Text>
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}

      <SectionHeader title="Details" />
      <Field label="Full name" value={name} onChangeText={setName} placeholder="Ravi Kumar" autoCapitalize="words" />
      <Field
        label="Work email"
        value={email}
        onChangeText={setEmail}
        placeholder="ravi.kumar@guardians.example"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Employee code (optional)"
        value={employeeCode}
        onChangeText={setEmployeeCode}
        placeholder="G1001"
        autoCapitalize="characters"
      />

      {isMaster && zones.data?.zones.length ? (
        <>
          <SectionHeader title="Zone" />
          <Row style={{ flexWrap: 'wrap' }}>
            {zones.data.zones.map((zone) => (
              <Pressable
                key={zone.id}
                onPress={() => setZoneId(zone.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: zoneId === zone.id }}
                style={[styles.chip, zoneId === zone.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, zoneId === zone.id && { color: colors.white }]}>{zone.name}</Text>
              </Pressable>
            ))}
          </Row>
        </>
      ) : null}

      {role === 'SALES_REP' && managers.data?.users.length ? (
        <>
          <SectionHeader title="Reports to" />
          <Row style={{ flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => setManagerId(null)}
              style={[styles.chip, managerId === null && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: managerId === null }}
            >
              <Text style={[styles.chipText, managerId === null && { color: colors.white }]}>No manager</Text>
            </Pressable>
            {managers.data.users.map((manager) => (
              <Pressable
                key={manager.id}
                onPress={() => setManagerId(manager.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: managerId === manager.id }}
                style={[styles.chip, managerId === manager.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, managerId === manager.id && { color: colors.white }]}>
                  {manager.name}
                </Text>
              </Pressable>
            ))}
          </Row>
        </>
      ) : null}

      <AppButton label="Create login" onPress={() => void submit()} loading={busy} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.display },
  lede: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },
  on: { borderColor: colors.primary },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
  },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionLabel: { ...typography.heading, fontSize: 15 },
  optionHint: { ...typography.caption, marginTop: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
});
