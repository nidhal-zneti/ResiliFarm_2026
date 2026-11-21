import { Sprout } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';
import { Screen } from '@/components/Screen';

export default function FarmScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ComingSoon icon={Sprout} title={t('farm.title')} note={t('farm.previewNote')} />
    </Screen>
  );
}
