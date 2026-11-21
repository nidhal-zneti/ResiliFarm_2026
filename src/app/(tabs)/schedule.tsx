import { CalendarDays } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';
import { Screen } from '@/components/Screen';

export default function ScheduleScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ComingSoon icon={CalendarDays} title={t('schedule.title')} note={t('schedule.previewNote')} />
    </Screen>
  );
}
