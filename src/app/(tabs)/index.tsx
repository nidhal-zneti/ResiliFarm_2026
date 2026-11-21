import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { USE_MOCK } from '@/api/config';
import { getHomeSummary } from '@/api/home';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateView';
import { AlertsList } from '@/features/home/AlertsList';
import { DemoBanner } from '@/features/home/DemoBanner';
import { GreetingHeader } from '@/features/home/GreetingHeader';
import { IrrigationAdviceCard } from '@/features/home/IrrigationAdviceCard';
import { WaterCard } from '@/features/home/WaterCard';
import { WeatherCard } from '@/features/home/WeatherCard';
import { useAsync } from '@/hooks/useAsync';

/**
 * Home — the most important screen.
 *
 * Answers, in order: Do I need to irrigate today? What's the weather? How much
 * water do I have? Are there any alerts?
 */
export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(getHomeSummary, []);

  if (loading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen scroll={false}>
        <ErrorState code={error} onRetry={reload} />
      </Screen>
    );
  }

  const openNotifications = () => router.push('/notifications');

  return (
    <Screen>
      {USE_MOCK ? <DemoBanner /> : null}

      <GreetingHeader
        name={data.user.fullName}
        farmName={data.farm.name}
        location={data.farm.location}
        unreadCount={data.alerts.length}
        onOpenNotifications={openNotifications}
      />

      <IrrigationAdviceCard advice={data.irrigation} />
      <WeatherCard weather={data.weather} />
      <WaterCard water={data.water} />
      <AlertsList alerts={data.alerts} onSeeAll={openNotifications} />
    </Screen>
  );
}
