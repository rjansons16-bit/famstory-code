import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { CATEGORY_BY_ID } from '@/domain/categories';
import type { YearSeries } from '@/domain/yearly';
import { tf } from '@/i18n';
import { usePhotoTransition } from '@/lib/motion';
import { useTheme } from '@/theme';
import { Card } from '../ui/surface';
import { Text } from '../ui/text';
import { Touchable } from '../ui/touchable';

/**
 * ONE THING, YEAR AFTER YEAR (domain/yearly.ts): its name, then a strip of
 * years, each with that year's first photograph - or, where there is none,
 * the colour of what kind of event it was, so a year without a picture still
 * holds its place in the row. A tap opens that year's entry.
 */
export function YearSeriesCard({ series, showAge = false }: { series: YearSeries; showAge?: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const photoFade = usePhotoTransition();
  const tile = theme.size.yearTile;

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
          <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
            {series.label}
          </Text>
          <Text variant="caption" tone="muted">
            {tf('traditions.years', series.years.length)}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {series.years.map((entry) => {
              const first = entry.events[0];
              const tone = theme.tone[CATEGORY_BY_ID[first.categoryId].tone];
              return (
                <Touchable
                  key={entry.year}
                  accessibilityRole="button"
                  accessibilityLabel={`${series.label}, ${entry.year}`}
                  onPress={() => router.push(`/event/${first.id}`)}
                  style={{ gap: theme.spacing.xs, width: tile }}
                >
                  {entry.cover ? (
                    <Image
                      source={{ uri: entry.cover.thumbnailUrl ?? entry.cover.url }}
                      style={{ width: tile, height: tile, borderRadius: theme.radius.md }}
                      contentFit="cover"
                      transition={photoFade}
                    />
                  ) : (
                    <View
                      style={{
                        width: tile,
                        height: tile,
                        borderRadius: theme.radius.md,
                        backgroundColor: tone.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="title" style={{ color: tone.fg }}>
                        {String(entry.year).slice(2)}
                      </Text>
                    </View>
                  )}
                  <Text variant="label">{entry.year}</Text>
                  {showAge && entry.age !== undefined && entry.age >= 0 ? (
                    <Text variant="caption" tone="muted">
                      {tf('family.age', entry.age)}
                    </Text>
                  ) : null}
                </Touchable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Card>
  );
}
