import { Image } from 'expo-image';
import { View } from 'react-native';

import type { MonthRecap } from '@/domain/recap';
import { t, tf } from '@/i18n';
import { monthName } from '@/lib/date';
import { usePhotoTransition } from '@/lib/motion';
import { useTheme } from '@/theme';
import { Icon } from '../ui/icon';
import { Card } from '../ui/surface';
import { Text } from '../ui/text';

/**
 * "Your September - 12 memories, 9 photographs", in the first week of October
 * (domain/recap.ts). A strip of the month's photographs when it has any, so
 * the card shows what it is offering instead of describing it.
 */
export function MonthRecapCard({ recap, onOpen }: { recap: MonthRecap; onOpen: () => void }) {
  const theme = useTheme();
  const photoFade = usePhotoTransition();
  const strip = recap.photos.slice(0, 4);

  return (
    <Card onPress={onOpen} padded={false}>
      {strip.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {strip.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.thumbnailUrl ?? photo.url }}
              style={{ flex: 1, aspectRatio: 1, backgroundColor: theme.color.surfaceMuted }}
              contentFit="cover"
              transition={photoFade}
            />
          ))}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
        }}
      >
        <Icon name="recap" tone="primary" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="cardTitle">{tf('recap.title', monthName(recap.month))}</Text>
          <Text variant="caption" tone="muted">
            {tf('recap.summary', recap.events.length, countPhotos(recap))}
          </Text>
        </View>
        <Text variant="label" tone="primary">
          {t('recap.open')}
        </Text>
      </View>
    </Card>
  );
}

/** Every photograph in the month, not only the nine picked for the grid. */
export function countPhotos(recap: MonthRecap): number {
  return recap.events.reduce(
    (sum, e) => sum + e.attachments.filter((a) => a.kind === 'image').length,
    0,
  );
}
