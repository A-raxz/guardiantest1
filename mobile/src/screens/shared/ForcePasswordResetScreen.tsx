import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, Field } from '../../components';
import { useAuth } from '../../state/AuthContext';
import { colors, radius, spacing, typography } from '../../theme';

/**
 * Shown immediately after the first login. The account is issued with a
 * default password and cannot be used for anything else until it is replaced.
 */
export function ForcePasswordResetScreen() {
  const { user, completePasswordReset, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Use at least 8 characters, with a letter and a number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(currentPassword, newPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.emoji}>🔐</Text>
            <Text style={styles.title}>Set your own password</Text>
            <Text style={styles.body}>
              Welcome{user ? `, ${user.name.split(' ')[0]}` : ''}. Your account was created with a temporary password.
              Choose your own before you carry on.
            </Text>

            <Field
              label="Temporary password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="The one you were given"
            />
            <Field
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              hint="At least 8 characters, including a letter and a number."
            />
            <Field
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={submit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <AppButton label="Save and continue" onPress={submit} loading={busy} />
            <AppButton label="Sign out" onPress={() => void signOut()} variant="ghost" style={{ marginTop: spacing.sm }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emoji: { fontSize: 34, marginBottom: spacing.sm },
  title: { ...typography.title, marginBottom: spacing.xs },
  body: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm },
});
