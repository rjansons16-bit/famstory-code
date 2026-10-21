import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { YearSeriesCard } from '@/components/family/year-series';
import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { traditions } from '@/domain/yearly';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';

/**
 * THE FAMILY'S TRADITIONS (docs/07-IMPROVEMENTS.md item 80): whatever it has
 * done again and again - Midsummer, the first day of school, the same cake -
 * each with a strip of its years. Found, never entered: a tag or a title the
 * family already used in two different years (domain/yearly.ts).
 */
export default function Traditions() {
  const router = useRouter();
  const loadArchive = useApp((s) => s.loadArchive);
  const visible = useVisibleEvents();

  useEffect(() => {
    void loadArchive();
    track({ name: 'yearly_opened', view: 'traditions' });
  }, [loadArchive]);

  const series = useMemo(() => traditions(visible), [visible]);

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('traditions.title')} onBack={() => goBack(router)} />
      <Text variant="body" tone="muted">
        {t('traditions.hint')}
      </Text>

      {series.length === 0 ? (
        <Card elevation="flat">
          <Text variant="body" tone="muted">
            {t('traditions.empty')}
          </Text>
        </Card>
      ) : null}

      {series.map((s) => (
        <YearSeriesCard key={s.key} series={s} />
      ))}
    </Screen>
  );
}
