import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/api/auth';
import { getProfile } from '@/api/profile';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateView';
import { useAsync } from '@/hooks/useAsync';
import { useLocale } from '@/hooks/useLocale';
import { AppLocale, SUPPORTED_LOCALES } from '@/i18n';
import { colors, radius, spacing, touchTarget, typography } from '@/theme';

const LOCALE_LABELS: Record<AppLocale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const { data: user, loading, error, reload } = useAsync(getProfile, []);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/welcome');
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (error || !user) {
    return (
      <Screen scroll={false}>
        <ErrorState code={error} onRetry={reload} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.pageTitle}>{t('profile.title')}</Text>

      <Card>
        <Text style={styles.section}>{t('profile.personalInfo')}</Text>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.muted}>{user.email}</Text>
      </Card>

      <Card>
        <Text style={styles.section}>{t('profile.language')}</Text>
        <View style={styles.langs}>
          {SUPPORTED_LOCALES.map((code) => {
            const selected = locale === code;
            return (
              <Pressable
                key={code}
                onPress={() => setLocale(code)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.lang, selected && styles.langSelected]}
              >
                <Text style={[styles.langText, selected && styles.langTextSelected]}>
                  {LOCALE_LABELS[code]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Pressable
        onPress={handleSignOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <LogOut size={20} color={colors.danger} />
        <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  section: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  muted: {
    ...typography.small,
    color: colors.textMuted,
  },
  langs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lang: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  langText: {
    ...typography.small,
    color: colors.text,
  },
  langTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    backgroundColor: colors.dangerSoft,
  },
  signOutText: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  pressed: {
    opacity: 0.85,
  },
});
