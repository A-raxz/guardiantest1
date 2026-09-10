import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, Field } from '../../components';
import { useAuth } from '../../state/AuthContext';
import { colors, radius, spacing, typography } from '../../theme';
import { API_BASE_URL } from '../../api/client';

/**
 * The only way into the app. There is no sign-up: an HR Business Partner
 * creates the account and hands over the first password.
 */
export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign you in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={['#0B1220', '#101B36', '#0B1220']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <Image source={require('../../../assets/icon.png')} style={styles.logo} />
              <Text style={styles.title}>Guardians</Text>
              <Text style={styles.subtitle}>School Of Learning</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Text style={styles.cardBody}>
                Use the credentials your HR Business Partner issued. Accounts are created for you — there is no sign-up.
              </Text>

              <Field
                label="Work email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@guardians.example"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <AppButton label="Sign in" onPress={submit} loading={busy} style={{ marginTop: spacing.sm }} />
              <Text style={styles.help}>
                Forgotten your password? Your zone HR BP can issue a new one from their admin app.
              </Text>
            </View>

            <Text style={styles.footer}>{API_BASE_URL}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 68, height: 68, borderRadius: radius.lg, marginBottom: spacing.md },
  title: { ...typography.display, letterSpacing: 0.5 },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  cardTitle: { ...typography.title, marginBottom: spacing.xs },
  cardBody: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm },
  help: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg },
  footer: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl, color: colors.textFaint },
});
