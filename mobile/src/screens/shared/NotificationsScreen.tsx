import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchNotifications, markNotificationRead } from '../../api/endpoints';
import { Card, EmptyState, ErrorView, LoadingView, Row, Screen, formatDate } from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, spacing, typography } from '../../theme';

const ICONS: Record<string, string> = { assignment: '📚', certificate: '🏆', nudge: '👋' };

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data, error, isLoading, isRefreshing, reload } = useAsync(fetchNotifications, []);

  if (isLoading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;

  const open = async (id: string, action: { type: string; courseId?: string } | null) => {
    await markNotificationRead(id).catch(() => undefined);
    void reload({ silent: true });
    if (action?.type === 'course' && action.courseId) navigation.navigate('Course', { courseId: action.courseId });
  };

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      {!data?.notifications.length ? (
        <EmptyState emoji="🔕" title="Nothing here yet" body="Assignments and reminders will show up on this screen." />
      ) : null}

      {data?.notifications.map((notification) => (
        <Pressable key={notification.id} onPress={() => void open(notification.id, notification.action)}>
          <Card style={!notification.readAt ? styles.unread : undefined}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Text style={styles.icon}>{ICONS[notification.kind] ?? '🔔'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{notification.title}</Text>
                <Text style={styles.body}>{notification.body}</Text>
                <Text style={styles.date}>{formatDate(notification.createdAt)}</Text>
              </View>
              {!notification.readAt ? <View style={styles.dot} /> : null}
            </Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  unread: { borderColor: colors.primary },
  icon: { fontSize: 20, marginRight: spacing.md },
  title: { ...typography.heading, fontSize: 15 },
  body: { ...typography.body, color: colors.textMuted, marginTop: 2, fontSize: 14 },
  date: { ...typography.caption, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
