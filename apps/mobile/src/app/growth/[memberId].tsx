import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { YearSeriesCard } from '@/components/family/year-series';
import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { growingUp } from '@/domain/yearly';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';

/**
 * ONE PERSON GROWING UP (docs/07-IMPROVEMENTS.md item 79): the same moment of
 * theirs, year after year - every first day of school in a row, with how old
 * they were - from the entries already about them.
 */
export default function GrowingUp() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const person = useApp((s) => s.members.find((m) => m.id === memberId));
  const loadArchive = useApp((s) => s.loadArchive);
  const visible = useVisibleEvents();

  useEffect(() => {
    void loadArchive();
    track({ name: 'yearly_opened', view: 'growth' });
  }, [loadArchive]);

  const series = useMemo(() => (person ? growingUp(visible, person) : []), [visible, person]);

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('growth.title')} subtitle={person?.displayName} onBack={() => goBack(router)} />
      <Text variant="body" tone="muted">
        {t('growth.hint')}
      </Text>

      {series.length === 0 ? (
        <Card elevation="flat">
          <Text variant="body" tone="muted">
            {t('growth.empty')}
          </Text>
        </Card>
      ) : null}

      {series.map((s) => (
        <YearSeriesCard key={s.key} series={s} showAge />
      ))}
    </Screen>
  );
}
