import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { requestPasswordReset } from '@/api/auth';
import { AlertBanner } from '@/components/AlertBanner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme';
import { errorMessage } from '@/utils/errors';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.title}>{t('auth.resetTitle')}</Text>
      <Text style={styles.help}>{t('auth.resetHelp')}</Text>

      {sent ? <AlertBanner tone="success" title={t('auth.resetSent')} /> : null}
      {error ? (
        <AlertBanner tone="danger" title={t('common.error')} message={errorMessage(t, error)} />
      ) : null}

      {!sent ? (
        <>
          <View style={styles.form}>
            <TextField
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="nom@exemple.com"
            />
          </View>
          <Button
            label={t('auth.resetTitle')}
            onPress={handleSubmit}
            loading={busy}
            disabled={!email.trim() || busy}
            fullWidth
          />
        </>
      ) : null}

      <Pressable onPress={() => router.push('/login')} hitSlop={8}>
        <Text style={styles.link}>{t('auth.backToSignIn')}</Text>
      </Pressable>
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
  help: {
    ...typography.small,
    color: colors.textMuted,
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
});
