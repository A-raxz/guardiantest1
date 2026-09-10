import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { browseDrive, createCourseFromDrive, resolveDrive } from '../../api/endpoints';
import type { DriveItem } from '../../api/types';
import {
  AppButton,
  Card,
  EmptyState,
  ErrorView,
  LoadingView,
  Pill,
  Row,
  Screen,
  SectionHeader,
  formatDuration,
} from '../../components';
import { showDialog } from '../../components/dialog';
import type { RootStackParamList } from '../../navigation/types';
import { useAsync } from '../../state/useAsync';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Browse the connected Google Drive and turn a selection into a course.
 * Picking a folder assigns everything inside it in one action.
 */
export function DriveBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'DriveBrowser'>>();
  const folderId = route.params?.folderId;

  const { data, error, isLoading, isRefreshing, reload } = useAsync(() => browseDrive(folderId), [folderId]);
  const [selected, setSelected] = useState<DriveItem | null>(null);
  const [preview, setPreview] = useState<{ items: DriveItem[]; videoCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const select = async (item: DriveItem) => {
    setSelected(item);
    setPreview(null);
    try {
      const resolved = await resolveDrive(item.id);
      setPreview({ items: resolved.items, videoCount: resolved.videoCount });
    } catch (e) {
      showDialog('Cannot use that item', e instanceof Error ? e.message : 'Try another file or folder.');
      setSelected(null);
    }
  };

  const create = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const created = await createCourseFromDrive({ driveId: selected.id });
      navigation.replace('CourseSetup', { courseId: created.course.id });
    } catch (e) {
      showDialog('Could not create the course', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading && !data) return <LoadingView label="Opening Google Drive…" />;
  if (error && !data) return <ErrorView message={error} onRetry={() => void reload()} />;

  return (
    <Screen scroll onRefresh={() => void reload({ silent: true })} refreshing={isRefreshing}>
      <Text style={styles.eyebrow}>Google Drive · {data?.provider === 'google' ? 'connected' : 'sample content'}</Text>
      <Text style={styles.title}>{route.params?.folderName ?? 'Training Drive'}</Text>

      {!data?.files.length ? <EmptyState emoji="📂" title="This folder is empty" /> : null}

      <SectionHeader title="Folders and files" />
      {data?.files.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() =>
            item.isFolder && selected?.id !== item.id
              ? void select(item)
              : item.isFolder
                ? navigation.push('DriveBrowser', { folderId: item.id, folderName: item.name })
                : void select(item)
          }
          onLongPress={() =>
            item.isFolder ? navigation.push('DriveBrowser', { folderId: item.id, folderName: item.name }) : undefined
          }
        >
          <Card style={selected?.id === item.id ? styles.selectedCard : undefined}>
            <Row>
              <Text style={styles.icon}>{item.isFolder ? '📁' : item.isVideo ? '🎬' : '📄'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.isFolder
                    ? selected?.id === item.id
                      ? 'Tap again to open · selected for assignment'
                      : 'Tap to select the whole folder · long-press to open'
                    : item.isVideo
                      ? `Video${item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ''}`
                      : 'Material'}
                </Text>
              </View>
              {selected?.id === item.id ? <Pill label="Selected" tone="primary" /> : null}
            </Row>
          </Card>
        </Pressable>
      ))}

      {selected ? (
        <View style={styles.tray}>
          <Text style={styles.trayTitle}>{selected.name}</Text>
          <Text style={styles.trayBody}>
            {preview
              ? `${preview.items.length} file${preview.items.length === 1 ? '' : 's'} · ${preview.videoCount} video${
                  preview.videoCount === 1 ? '' : 's'
                } will each get a quiz`
              : 'Checking what is inside…'}
          </Text>
          <AppButton label="Create course from this" onPress={() => void create()} loading={busy} disabled={!preview} />
          <AppButton label="Cancel" variant="ghost" onPress={() => setSelected(null)} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.label, color: colors.primary },
  title: { ...typography.display, marginTop: 2 },
  icon: { fontSize: 22, marginRight: spacing.md },
  name: { ...typography.heading, fontSize: 15 },
  meta: { ...typography.caption, marginTop: 2 },
  selectedCard: { borderColor: colors.primary },
  tray: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  trayTitle: { ...typography.heading, fontSize: 15 },
  trayBody: { ...typography.caption, marginBottom: spacing.sm },
});
