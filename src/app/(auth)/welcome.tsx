import { useRouter } from 'expo-router';
import { Sprout } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Sprout size={44} color={colors.primary} />
        </View>
        <Text style={styles.brand}>{t('common.appName')}</Text>
        <Text style={styles.title}>{t('auth.welcomeTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
      </View>

      <View style={styles.actions}>
        <Button label={t('auth.signIn')} onPress={() => router.push('/login')} fullWidth />
        <Button
          label={t('auth.signUp')}
          onPress={() => router.push('/signup')}
          variant="secondary"
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingTop: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  brand: {
    ...typography.caption,
    color: colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.display,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
});
