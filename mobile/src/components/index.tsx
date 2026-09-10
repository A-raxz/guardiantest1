import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, percentColor, radius, shadow, spacing, typography } from '../theme';

/* ------------------------------ Layout ------------------------------ */

export function Screen({
  children,
  scroll = false,
  onRefresh,
  refreshing = false,
  padded = true,
  edges = ['top'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const insets = useSafeAreaInsets();
  const content = padded ? { padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom } : undefined;

  if (!scroll) {
    return (
      <SafeAreaView style={styles.screen} edges={edges}>
        <View style={[{ flex: 1 }, content]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <ScrollView
        contentContainerStyle={content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/* ------------------------------ Controls ------------------------------ */

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'secondary' && { color: colors.text },
            variant === 'ghost' && { color: colors.primary },
          ]}
        >
          {icon ? `${icon}  ` : ''}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
}) {
  const toneStyles: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: '#3B2A12', fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    primary: { bg: colors.primarySoft, fg: colors.primary },
  };
  const { bg, fg } = toneStyles[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------ Feedback ------------------------------ */

export function ProgressBar({ percent, height = 8 }: { percent: number; height?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: clamped, min: 0, max: 100 }}
      style={[styles.progressTrack, { height, borderRadius: height / 2 }]}
    >
      <View
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: percentColor(clamped),
        }}
      />
    </View>
  );
}

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.centeredText}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorEmoji}>⚠️</Text>
      <Text style={styles.centeredText}>{message}</Text>
      {onRetry ? <AppButton label="Try again" onPress={onRetry} variant="secondary" style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function Avatar({ name, size = 40, color = colors.primary }: { name: string; size?: number; color?: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`, borderColor: color },
      ]}
    >
      <Text style={{ color, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function StatTile({ value, label, tone }: { value: string | number; label: string; tone?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const formatDuration = (seconds: number) => {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.heading },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { color: colors.white, fontSize: 15, fontWeight: '600' },
  field: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs },
  fieldHint: { ...typography.caption, marginTop: spacing.xs },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
  progressTrack: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centeredText: { ...typography.body, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  errorEmoji: { fontSize: 34 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { ...typography.heading, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  statTile: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: { ...typography.caption, marginTop: 2, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
