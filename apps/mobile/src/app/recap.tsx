import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { EventRow } from '@/components/event/event-card';
import { countPhotos } from '@/components/event/month-recap-card';
import { Avatar } from '@/components/ui/avatar';
import { CategoryChip } from '@/components/ui/chip';
import { Header, SectionHeader, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useVisibleEvents } from '@/data/store';
import { monthRecap, parseMonthKey } from '@/domain/recap';
import { tf, t } from '@/i18n';
import { monthName } from '@/lib/date';
import { usePhotoTransition } from '@/lib/motion';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * A MONTH, LOOKED BACK ON - "Your September, in nine photographs".
 *
 * Nine photographs spread across the month, how many memories there were and
 * how many milestones, who was in them most, what kind of month it was, and
 * then everything, in order. Counting only (domain/recap.ts), from what this
 * person can see.
 */
export default function Recap() {
  const theme = useTheme();
  const router = useRouter();
  const photoFade = usePhotoTransition();
  const { month: key } = useLocalSearchParams<{ month?: string }>();
  const visible = useVisibleEvents();
  const members = useApp((s) => s.members);

  // Last month when the address names none, or names one that is not a month.
  const month = useMemo(() => {
    const now = new Date();
    return parseMonthKey(key) ?? new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }, [key]);
  const recap = useMemo(() => monthRecap(visible, month), [visible, month]);

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={tf('recap.title', monthName(recap.month))} onBack={() => goBack(router)} />

      <Text variant="body" tone="muted">
        {tf('recap.summary', recap.events.length, countPhotos(recap))}
        {recap.milestones > 0 ? ` · ${tf('recap.milestones', recap.milestones)}` : ''}
      </Text>

      {recap.photos.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          {recap.photos.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.thumbnailUrl ?? photo.url }}
              style={{
                width: '32.5%',
                aspectRatio: 1,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.color.surfaceMuted,
              }}
              contentFit="cover"
              transition={photoFade}
            />
          ))}
        </View>
      ) : null}

      {recap.people.length > 0 ? (
        <View>
          <SectionHeader title={t('recap.people')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
            {recap.people.slice(0, 6).map(({ memberId, count }) => {
              const person = members.find((m) => m.id === memberId);
              if (!person) return null;
              return (
                <View key={memberId} style={{ alignItems: 'center', gap: theme.spacing.xs }}>
                  <Avatar name={person.displayName} url={person.avatarUrl} size="md" />
                  <Text variant="caption">{person.displayName}</Text>
                  <Text variant="caption" tone="muted">
                    {count}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {recap.kinds.length > 0 ? (
        <View>
          <SectionHeader title={t('recap.kinds')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {recap.kinds.map(({ categoryId, count }) => (
              <View key={categoryId} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <CategoryChip categoryId={categoryId} />
                <Text variant="caption" tone="muted">
                  {count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title={t('recap.everything')} />
        {recap.events.map((e) => (
          <EventRow key={e.id} event={e} onPress={() => router.push(`/event/${e.id}`)} />
        ))}
      </View>
    </Screen>
  );
}
