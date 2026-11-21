import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signIn } from '@/api/auth';
import { AlertBanner } from '@/components/AlertBanner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme';
import { errorMessage } from '@/utils/errors';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.title}>{t('auth.signIn')}</Text>

      {error ? (
        <AlertBanner tone="danger" title={t('common.error')} message={errorMessage(t, error)} />
      ) : null}

      <View style={styles.form}>
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          placeholder="nom@exemple.com"
        />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />
      </View>

      <Button
        label={t('auth.signIn')}
        onPress={handleSubmit}
        loading={busy}
        disabled={!canSubmit}
        fullWidth
      />

      <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8}>
        <Text style={styles.link}>{t('auth.forgotPassword')}</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.noAccount')}</Text>
        <Pressable onPress={() => router.push('/signup')} hitSlop={8}>
          <Text style={styles.link}>{t('auth.signUp')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingTop: spacing.xxl,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  form: {
    gap: spacing.lg,
  },
  link: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerText: {
    ...typography.small,
    color: colors.textMuted,
  },
});
