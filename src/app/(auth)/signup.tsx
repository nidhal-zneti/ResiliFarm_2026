import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signUp } from '@/api/auth';
import { AlertBanner } from '@/components/AlertBanner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { apiRequest } from '@/api/client';

type Country = { id: number; name: string; code: string };
type Region = { id: number; name: string; country_id: number };
type Crop = 'olive' | 'wheat' | 'tomato';

export default function SignupScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [countryId, setCountryId] = useState<number | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [regionSearch, setRegionSearch] = useState('');
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [crop, setCrop] = useState<Crop>('olive');
  const [areaHa, setAreaHa] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ regions: Region[]; countries: Country[] }>('/regions', { auth: false })
      .then((data) => {
        setRegions(data.regions);
        setCountries(data.countries);
        setCountryId((current) => current ?? data.countries[0]?.id ?? null);
        setRegionId((current) => current ?? data.regions[0]?.id ?? null);
      })
      .catch(() => setRegions([]));
  }, []);

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    farmName.trim().length > 0 &&
    regionId !== null &&
    Number(areaHa) > 0 &&
    !busy;

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      // New accounts always receive the FARMER role — never chosen by the client.
      await signUp({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        farm: {
          name: farmName.trim(),
          regionId: regionId!,
          crop,
          areaHa: Number(areaHa),
        },
      });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.title}>{t('auth.signUp')}</Text>

      {error ? (
        <AlertBanner tone="danger" title={t('common.error')} message={errorMessage(t, error)} />
      ) : null}

      <View style={styles.form}>
        <TextField
          label={t('auth.fullName')}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoComplete="name"
        />
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
          hint={t('auth.passwordHint')}
          secureTextEntry
          autoComplete="password"
        />
        <Text style={styles.sectionTitle}>{t('auth.farmDetails')}</Text>
        <TextField
          label={t('auth.farmName')}
          value={farmName}
          onChangeText={setFarmName}
          placeholder={t('auth.farmNamePlaceholder')}
          autoCapitalize="words"
        />
        <TextField
          label={t('auth.areaHa')}
          value={areaHa}
          onChangeText={setAreaHa}
          placeholder="5"
          keyboardType="decimal-pad"
          hint={t('auth.areaHaHint')}
        />
        <View style={styles.choiceGroup}>
          <Text style={styles.choiceLabel}>{t('auth.region')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRegionPickerOpen(true)}
            style={styles.comboBox}
          >
            <Text style={styles.comboText}>
              {regions.find((region) => region.id === regionId)?.name ?? t('auth.regionPlaceholder')}
            </Text>
            <Text style={styles.comboArrow}>⌄</Text>
          </Pressable>
        </View>
        <View style={styles.choiceGroup}>
          <Text style={styles.choiceLabel}>{t('auth.crop')}</Text>
          <View style={styles.choices}>
            {(['olive', 'wheat', 'tomato'] as Crop[]).map((option) => {
              const selected = crop === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCrop(option)}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                    {t(`auth.crop.${option}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Button
        label={t('auth.signUp')}
        onPress={handleSubmit}
        loading={busy}
        disabled={!canSubmit}
        fullWidth
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.haveAccount')}</Text>
        <Pressable onPress={() => router.push('/login')} hitSlop={8}>
          <Text style={styles.link}>{t('auth.signIn')}</Text>
        </Pressable>
      </View>

      <Modal
        visible={regionPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRegionPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('auth.region')}</Text>
              <Pressable onPress={() => setRegionPickerOpen(false)} hitSlop={8}>
                <Text style={styles.modalClose}>{t('common.close')}</Text>
              </Pressable>
            </View>
            <TextField
              label={t('auth.regionSearch')}
              value={regionSearch}
              onChangeText={setRegionSearch}
              placeholder={t('auth.regionSearchPlaceholder')}
              autoCapitalize="words"
            />
            <View style={styles.countryTabs}>
              {countries.map((country) => {
                const selected = countryId === country.id;
                return (
                  <Pressable
                    key={country.id}
                    onPress={() => {
                      setCountryId(country.id);
                      setRegionId(regions.find((region) => region.country_id === country.id)?.id ?? null);
                    }}
                    style={[styles.countryTab, selected && styles.countryTabSelected]}
                  >
                    <Text style={[styles.countryTabText, selected && styles.countryTabTextSelected]}>
                      {country.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView style={styles.regionList} showsVerticalScrollIndicator>
              {regions
                .filter((region) =>
                  region.country_id === countryId &&
                  region.name.toLowerCase().includes(regionSearch.trim().toLowerCase()),
                )
                .map((region) => {
                  const selected = regionId === region.id;
                  return (
                    <Pressable
                      key={region.id}
                      onPress={() => {
                        setRegionId(region.id);
                        setRegionPickerOpen(false);
                      }}
                      style={[styles.regionOption, selected && styles.regionOptionSelected]}
                    >
                      <Text style={[styles.regionOptionText, selected && styles.regionOptionTextSelected]}>
                        {region.name}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  sectionTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    marginTop: spacing.sm,
  },
  choiceGroup: {
    gap: spacing.sm,
  },
  choiceLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choice: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  choiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  choiceText: {
    ...typography.small,
    color: colors.text,
  },
  choiceTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  comboBox: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  comboText: {
    ...typography.body,
    color: colors.text,
  },
  comboArrow: {
    ...typography.title,
    color: colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  modalCard: {
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  modalClose: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  regionList: {
    maxHeight: 420,
  },
  regionOption: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'center',
  },
  regionOptionSelected: {
    backgroundColor: colors.primarySoft,
  },
  regionOptionText: {
    ...typography.body,
    color: colors.text,
  },
  regionOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  countryTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countryTab: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryTabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  countryTabText: {
    ...typography.small,
    color: colors.text,
  },
  countryTabTextSelected: {
    color: colors.primary,
    fontWeight: '600',
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
