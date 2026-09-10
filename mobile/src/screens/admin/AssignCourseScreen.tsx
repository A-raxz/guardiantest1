import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { assignCourse, fetchGroups, fetchUsers } from '../../api/endpoints';
import { AppButton, Card, EmptyState, ErrorView, LoadingView, Pill, Row, Screen, SectionHeader } from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Assign a course to individuals, to whole groups, or both at once. */
export function AssignCourseScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'AssignCourse'>>();
  const navigation = useNavigation<Nav>();
  const { courseId } = route.params;

  const people = useAsync(() => fetchUsers(), []);
  const groups = useAsync(() => fetchGroups(), []);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (set: Set<string>, id: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const learners = (people.data?.users ?? []).filter(
    (user) => (user.role === 'SALES_REP' || user.role === 'SALES_MANAGER') && user.isActive,
  );

  const assign = async () => {
    if (!selectedUsers.size && !selectedGroups.size) {
      Alert.alert('Nobody selected', 'Pick at least one person or group.');
      return;
    }
    setBusy(true);
    try {
      const result = await assignCourse({
        courseId,
        userIds: [...selectedUsers],
        groupIds: [...selectedGroups],
      });
      const warning = result.lessonsWithoutQuestions.length
        ? `\n\nStill to write: ${result.lessonsWithoutQuestions.join(', ')}.`
        : '';
      Alert.alert(
        'Assigned',
        `${result.assignedCount} ${result.assignedCount === 1 ? 'person' : 'people'} now have this course.` +
          (result.skipped.length ? ` ${result.skipped.length} skipped.` : '') +
          warning,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not assign', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (people.isLoading && !people.data) return <LoadingView />;
  if (people.error && !people.data) return <ErrorView message={people.error} onRetry={() => void people.reload()} />;

  const total = selectedUsers.size + selectedGroups.size;

  return (
    <Screen scroll>
      <Text style={styles.title}>Assign this course</Text>
      <Text style={styles.lede}>Everyone you pick sees it on their dashboard immediately and gets a notification.</Text>

      {groups.data?.groups.length ? (
        <>
          <SectionHeader title="Groups" />
          {groups.data.groups.map((group) => {
            const on = selectedGroups.has(group.id);
            return (
              <Pressable
                key={group.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(selectedGroups, group.id, setSelectedGroups)}
              >
                <Card style={on ? styles.on : undefined}>
                  <Row>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{group.name}</Text>
                      <Text style={styles.meta}>
                        {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
        </>
      ) : null}

      <SectionHeader title="People" />
      {!learners.length ? (
        <EmptyState emoji="👤" title="No reps in your zone yet" body="Create logins on the People tab first." />
      ) : null}

      {learners.map((user) => {
        const on = selectedUsers.has(user.id);
        return (
          <Pressable
            key={user.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => toggle(selectedUsers, user.id, setSelectedUsers)}
          >
            <Card style={on ? styles.on : undefined}>
              <Row>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{user.name}</Text>
                  <Text style={styles.meta}>{user.email}</Text>
                </View>
                {user.role === 'SALES_MANAGER' ? <Pill label="Manager" tone="success" /> : null}
              </Row>
            </Card>
          </Pressable>
        );
      })}

      <AppButton
        label={total ? `Assign to ${total} selected` : 'Select who gets this'}
        disabled={!total}
        loading={busy}
        onPress={() => void assign()}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.display },
  lede: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },
  on: { borderColor: colors.primary },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.white, fontWeight: '700', fontSize: 13 },
  name: { ...typography.heading, fontSize: 15 },
  meta: { ...typography.caption, marginTop: 2 },
});
