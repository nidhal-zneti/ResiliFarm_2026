import { Sprout } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { getMyFarm } from '@/api/farms';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateView';
import { FarmMapCard } from '@/features/home/FarmMapCard';
import { useAsync } from '@/hooks/useAsync';
import { colors, spacing, typography } from '@/theme';
import { submitProblemReport, getProblemReports, ProblemCategory, ProblemReport } from '@/api/reports';
import { Button } from '@/components/Button';

export default function FarmScreen() {
  const { t } = useTranslation();
  const { data: farm, loading, error, reload } = useAsync(getMyFarm, []);
  const [category, setCategory] = useState<ProblemCategory>('irrigation');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | undefined>();
  const [photoType, setPhotoType] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<ProblemReport[]>([]);

  useEffect(() => {
    getProblemReports().then(setReports).catch(() => setReports([]));
  }, []);

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('farm.reportPermissionTitle'), t('farm.reportPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoName(result.assets[0].fileName ?? 'problem.jpg');
      setPhotoType(result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  const submitReport = async () => {
    if (!farm || description.trim().length === 0) return;
    setSubmitting(true);
    try {
      const report = await submitProblemReport({
        farmId: farm.id,
        category,
        description: description.trim(),
        photoUri,
        photoName,
        photoType,
      });
      setReports((current) => [report, ...current]);
      setDescription('');
      setPhotoUri(null);
      Alert.alert(t('farm.reportSubmittedTitle'), t('farm.reportSubmitted'));
    } catch (submitError) {
      Alert.alert(t('common.error'), submitError instanceof Error ? submitError.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (error || !farm) {
    return (
      <Screen scroll={false}>
        <ErrorState code={error} onRetry={reload} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>{t('farm.title')}</Text>
      <Card>
        <View style={styles.heading}>
          <View style={styles.icon}>
            <Sprout size={24} color={colors.primary} />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.farmName}>{farm.name}</Text>
            <Text style={styles.location}>{farm.location}</Text>
          </View>
        </View>
        <View style={styles.details}>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>{t('farm.crop')}</Text>
            <Text style={styles.detailValue}>{farm.crop || t('common.unavailable')}</Text>
          </View>
          <View style={styles.detail}>
            <Text style={styles.detailLabel}>{t('farm.area')}</Text>
            <Text style={styles.detailValue}>
              {farm.areaHa > 0 ? `${farm.areaHa} ha` : t('common.unavailable')}
            </Text>
          </View>
        </View>
      </Card>
      <FarmMapCard
        name={farm.name}
        location={farm.location}
        latitude={farm.latitude}
        longitude={farm.longitude}
      />
      <Card>
        <Text style={styles.sectionTitle}>{t('farm.reportProblem')}</Text>
        <Text style={styles.sectionHelp}>{t('farm.reportProblemHelp')}</Text>
        <View style={styles.categoryList}>
          {([
            ['irrigation', 'irrigation'],
            ['leak', 'leak'],
            ['cropHealth', 'cropHealth'],
            ['waterTank', 'waterTank'],
            ['sensor', 'sensor'],
            ['other', 'other'],
          ] as [ProblemCategory, string][]).map(([value, key]) => {
            const selected = category === value;
            return (
              <Pressable
                key={value}
                onPress={() => setCategory(value)}
                style={[styles.category, selected && styles.categorySelected]}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                  {t(`farm.reportCategory.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('farm.reportDescriptionPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.description}
          multiline
          maxLength={1000}
          textAlignVertical="top"
        />
        {photoUri ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: photoUri }} style={styles.photo} />
            <Pressable onPress={() => setPhotoUri(null)} style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>{t('common.remove')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={choosePhoto} style={styles.addPhoto}>
            <Text style={styles.addPhotoText}>{t('farm.attachPhoto')}</Text>
          </Pressable>
        )}
        <Button
          label={t('farm.submitReport')}
          onPress={submitReport}
          loading={submitting}
          disabled={description.trim().length === 0}
          fullWidth
        />
      </Card>
      {reports.length > 0 ? (
        <Card>
          <Text style={styles.sectionTitle}>{t('farm.recentReports')}</Text>
          {reports.slice(0, 5).map((report) => (
            <View key={report.id} style={styles.reportRow}>
              <View style={styles.reportInfo}>
                <Text style={styles.reportCategory}>
                  {t(`farm.reportCategory.${report.category}`)}
                </Text>
                <Text numberOfLines={2} style={styles.reportDescription}>
                  {report.description}
                </Text>
              </View>
              <Text style={styles.reportStatus}>{t(`farm.reportStatus.${report.status}`)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: {
    flex: 1,
  },
  farmName: {
    ...typography.subtitle,
    color: colors.text,
  },
  location: {
    ...typography.small,
    color: colors.textMuted,
  },
  details: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  detail: {
    flex: 1,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detailValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  sectionHelp: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  category: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  categorySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  categoryText: {
    ...typography.small,
    color: colors.text,
  },
  categoryTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  description: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.body,
  },
  addPhoto: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  addPhotoText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  photoPreview: {
    marginVertical: spacing.md,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  removePhoto: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  removePhotoText: {
    ...typography.small,
    color: colors.danger,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
  },
  reportInfo: {
    flex: 1,
  },
  reportCategory: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  reportDescription: {
    ...typography.small,
    color: colors.textMuted,
  },
  reportStatus: {
    ...typography.caption,
    color: colors.primary,
  },
});
