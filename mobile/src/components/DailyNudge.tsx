import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchDailyNudge } from '../api/endpoints';
import type { Nudge } from '../api/types';
import { colors, radius, spacing, typography } from '../theme';
import { AppButton } from './index';

/**
 * The pop-up the brief asks for on app open, capped at once per day.
 *
 * The cap is enforced by the server, so the app can ask on every foreground
 * without risking a second pop-up: the API simply answers with nothing.
 */
export function DailyNudge({ onAction }: { onAction?: (action: { type: string; courseId?: string }) => void }) {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const lastAskedAt = useRef(0);

  const ask = useCallback(async () => {
    // Guard against a burst of foreground events on the same app open.
    if (Date.now() - lastAskedAt.current < 60_000) return;
    lastAskedAt.current = Date.now();
    try {
      const response = await fetchDailyNudge();
      if (response.nudge) setNudge(response.nudge);
    } catch {
      // A nudge is never worth showing an error over.
    }
  }, []);

  useEffect(() => {
    void ask();
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void ask();
    });
    return () => subscription.remove();
  }, [ask]);

  if (!nudge) return null;

  const dismiss = () => setNudge(null);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Dismiss reminder">
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>{nudge.title}</Text>
          <Text style={styles.body}>{nudge.body}</Text>
          <AppButton
            label={nudge.cta}
            onPress={() => {
              dismiss();
              if (nudge.action) onAction?.(nudge.action);
            }}
          />
          <Pressable onPress={dismiss} style={styles.later} accessibilityRole="button">
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emoji: { fontSize: 32, marginBottom: spacing.sm },
  title: { ...typography.title, marginBottom: spacing.xs },
  body: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  later: { alignItems: 'center', paddingVertical: spacing.md },
  laterText: { ...typography.body, color: colors.textFaint },
});
