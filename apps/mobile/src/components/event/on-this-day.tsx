import { Image } from 'expo-image';
import { ScrollView, View } from 'react-native';

import { CATEGORY_BY_ID } from '@/domain/categories';
import type { FamilyEvent } from '@/domain/types';
import { t, tf } from '@/i18n';
import { toDate, yearsSince } from '@/lib/date';
import { usePhotoTransition } from '@/lib/motion';
import { useTheme } from '@/theme';
import { Text } from '../ui/text';
import { Touchable } from '../ui/touchable';

/**
 * "ON THIS DAY" — the archive visiting the user, instead of waiting to be opened.
 *
 * The study rates retention as a **critical** risk, and between events there is
 * nothing in the product that brings a family back. This is the cheapest answer
 * to that: no new data, no notifications, no infrastructure — the same calendar
 * day in an earlier year, at the top of the timeline.
 *
 * It only renders when there is something to show. An empty strip that says
 * "nothing happened on this day" would be a daily reminder of absence, which is
 * the opposite of the point.
 *
 * Design notes:
 *   - It must NOT look like a timeline entry. Hence the strip: small, sideways,
 *     and photograph-led, against entries that run the full width.
 *   - No box. Once the timeline stopped being a wall of cards, a bordered tile
 *     here was the only framed thing left on the screen and read as pasted in.
 *     The photograph is the tile; the words sit under it.
 *   - The year gap is the whole message. "1 year ago" carries the feeling; the
 *     date does not.
 */
export function OnThisDay({
  events,
  onSelect,
}: {
  events: FamilyEvent[];
  onSelect: (event: FamilyEvent) => void;
}) {
  const theme = useTheme();
  const photoFade = usePhotoTransition();

  if (events.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
      {/* Sentence case, like "Today" and "Earlier this month" — the design
          does not shout its section labels. */}
      <Text variant="body" tone="muted">
        {t('timeline.onThisDay')}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.lg }}
      >
        {events.map((event) => {
          const yearsAgo = yearsSince(event.startsAt);
          const cover = event.attachments[0];

          return (
            <Touchable
              key={event.id}
              onPress={() => onSelect(event)}
              accessibilityRole="button"
              accessibilityLabel={`${event.title}, ${tf('timeline.yearsAgo', yearsAgo)}`}
              give="card"
              style={{ width: 132, gap: theme.spacing.sm }}
            >
              {/* Square, because a rail of uneven tiles is not a rail. This is
                  the one place a photograph is cropped on purpose. */}
              <View
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  // No photograph: the category's own colour fills the plate.
                  // An empty grey square reads as an image that failed to load.
                  backgroundColor: cover
                    ? theme.color.surfaceMuted
                    : theme.tone[CATEGORY_BY_ID[event.categoryId].tone].bg,
                  borderRadius: theme.radius.sm,
                  overflow: 'hidden',
                }}
              >
                {cover ? (
                  <Image
                    source={{ uri: cover.thumbnailUrl ?? cover.url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={photoFade}
                  />
                ) : (
                  // No photograph (item 41): the year it happened, set large
                  // in the category's own ink. An empty coloured square read as
                  // a picture that had not loaded; a year reads as the point -
                  // this strip exists to say how long ago.
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text
                      variant="display"
                      style={{ color: theme.tone[CATEGORY_BY_ID[event.categoryId].tone].fg }}
                    >
                      {toDate(event.startsAt).getFullYear()}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ gap: 2 }}>
                <Text variant="label" tone="muted" style={{ textTransform: 'uppercase' }}>
                  {tf('timeline.yearsAgo', yearsAgo)}
                </Text>
                {/* Inter, not the serif: this is a nudge back into the
                    archive, not an entry in it. */}
                <Text variant="body" numberOfLines={2}>
                  {event.title}
                </Text>
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}
