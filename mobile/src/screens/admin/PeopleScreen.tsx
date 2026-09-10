import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchUsers, resetUserPassword, updateUser } from '../../api/endpoints';
import type { Role, User } from '../../api/types';
import {
  AppButton,
  Avatar,
  Card,
  EmptyState,
  ErrorView,
  Field,
  LoadingView,
  Pill,
  Row,
  Screen,
  SectionHeader,
  formatDate,
} from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { colors, roleColor, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ROLE_FILTERS: { key: Role | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Everyone' },
  { key: 'SALES_REP', label: 'Reps' },
  { key: 'SALES_MANAGER', label: 'Managers' },
  { key: 'HR_BP', label: 'HR BPs' },
];

/**
 * Credential management. This is where accounts come from: there is no
 * sign-up, so an admin creates the login and hands over the first password.
 */
export function PeopleScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | 'ALL'>('ALL');
  const { data, error, isLoading, isRefreshing, reload } = useAsync(
    () => fetchUsers({ search: search || undefined, role: role === 'ALL' ? undefined : role }),
    [search, role],
  );

  useFocusEffect(
    useCallback(() => {
      void reload({ silent: true });
    }, [reload]),
  );

  const isMaster = user?.role === 'MASTER_ADMIN';

  const reissue = (target: User) =>
    Alert.alert(
      'Issue a new password?',
      `${target.name} will have to set their own password the next time they sign in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Issue',
          onPress: async () => {
            try {
              const result = await resetUserPassword(target.id);
              void reload({ silent: true });
              Alert.alert('New temporary password', `${target.name}: ${result.temporaryPassword}\n\nShare it directly.`);
            } catch (e) {
              Alert.alert('Could not reset', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );

  const toggleActive = (target: User) =>
    Alert.alert(
      target.isActive ? 'Deactivate account?' : 'Reactivate account?',
      target.isActive ? `${target.name} will not be able to sign in.` : `${target.name} can sign in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: target.isActive ? 'Deactivate' : 'Reactivate',
          style: target.isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateUser(target.id, { isActive: !target.isActive });
              void reload({ silent: true });
            } catch (e) {
              Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );

  if (isLoading && !data) return <LoadingView label="Loading people…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <Text style={styles.eyebrow}>{isMaster ? 'All zones' : (user?.zoneName ?? 'Your zone')}</Text>
      <Text style={styles.title}>People</Text>

      <AppButton
        label="Create a login"
        icon="➕"
        onPress={() => navigation.navigate('CreateUser', {})}
        style={{ marginTop: spacing.lg }}
      />

      <Field
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Name, email or employee code"
        autoCapitalize="none"
        style={{ marginTop: spacing.md }}
      />

      <Row style={{ flexWrap: 'wrap', marginBottom: spacing.sm }}>
        {ROLE_FILTERS.filter((option) => isMaster || option.key !== 'HR_BP').map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setRole(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: role === option.key }}
            style={[styles.chip, role === option.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, role === option.key && { color: colors.white }]}>{option.label}</Text>
          </Pressable>
        ))}
      </Row>

      <SectionHeader title={`${data?.users.length ?? 0} account${data?.users.length === 1 ? '' : 's'}`} />

      {!data?.users.length ? (
        <EmptyState emoji="👥" title="Nobody here yet" body="Create the first login with the button above." />
      ) : null}

      {data?.users.map((person) => (
        <Card key={person.id} style={!person.isActive ? styles.inactive : undefined}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('UserReport', { userId: person.id, name: person.name })}
          >
            <Row style={{ alignItems: 'flex-start' }}>
              <Avatar name={person.name} color={roleColor[person.role]} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.name}>{person.name}</Text>
                <Text style={styles.meta}>{person.email}</Text>
                <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  <Pill label={person.roleLabel} tone="primary" />
                  {person.zoneName ? <Pill label={person.zoneName} /> : null}
                  {person.mustResetPassword ? <Pill label="Password not set" tone="warning" /> : null}
                  {!person.isActive ? <Pill label="Deactivated" tone="danger" /> : null}
                </Row>
                <Text style={styles.lastSeen}>
                  {person.lastLoginAt ? `Last signed in ${formatDate(person.lastLoginAt)}` : 'Has never signed in'}
                  {person.managerName ? ` · reports to ${person.managerName}` : ''}
                </Text>
              </View>
            </Row>
          </Pressable>

          <Row style={{ marginTop: spacing.md }}>
            <AppButton label="New password" variant="secondary" onPress={() => reissue(person)} style={{ flex: 1 }} />
            {person.id !== user?.id ? (
              <AppButton
                label={person.isActive ? 'Deactivate' : 'Reactivate'}
                variant="ghost"
                onPress={() => toggleActive(person)}
                style={{ flex: 1 }}
              />
            ) : null}
          </Row>
        </Card>
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
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  name: { ...typography.heading, fontSize: 15 },
  meta: { ...typography.caption, marginTop: 2 },
  lastSeen: { ...typography.caption, marginTop: spacing.sm },
  inactive: { opacity: 0.6 },
});
