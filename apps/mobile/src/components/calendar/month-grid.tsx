import { Image } from 'expo-image';
import { View } from 'react-native';

import { birthdaysOn } from '@/domain/birthdays';
import { specialDayName, specialDayOn } from '@/domain/special-days';
import type { FamilyEvent, Member } from '@/domain/types';
import { t } from '@/i18n';
import { isSameDay, isSameMonth, isToday, monthGrid, toDate, weekdayInitials } from '@/lib/date';
import { useTheme } from '@/theme';
import { Icon } from '../ui/icon';
import { Text } from '../ui/text';
import { Touchable } from '../ui/touchable';

/**
 * Is this event a memory or a reminder?
 *
 * The design splits the calendar in two — a day with a memory shows the
 * photograph, a day with a reminder shows a dot — and never asks the user which
 * one they are making. So it is derived, not a field: something that already
 * happened is a memory, something ahead of you is a reminder.
 *
 * That reading matches both examples in the design ("Beach afternoon · memory"
 * in the past, "Grandma's name day · reminder" in the future) and it means the
 * composer stays one screen instead of two.
 */
export function isMemory(event: FamilyEvent, now: Date = new Date()): boolean {
  return toDate(event.startsAt).getTime() <= now.getTime();
}

/**
 * THE MONTH GRID.
 *
 * The day cell carries the photograph itself rather than a coloured dot. That
 * is the design's best idea in this screen: a month of a family's life reads as
 * a sheet of small pictures, which no calendar competitor looks like — and it
 * solves a problem the dots had, because ten category hues cannot be told apart
 * at 5px however carefully they are chosen.
 *
 * Dots survive for reminders, where there is nothing to show and the point is
 * only "something is here".
 */
export function MonthGrid({
  month,
  events,
  members = [],
  selected,
  onSelect,
}: {
  month: Date;
  events: FamilyEvent[];
  /**
   * The family, for the birthdays. Nobody types those in — they are computed
   * from the member list (domain/birthdays.ts), which is why they arrive here
   * as people rather than as events.
   */
  members?: Member[];
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  const theme = useTheme();
  const days = monthGrid(month);
  const initials = weekdayInitials();

  function eventsOn(day: Date) {
    return events.filter((e) => isSameDay(toDate(e.startsAt), day));
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row' }}>
        {initials.map((w, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="label" tone="muted">
              {w}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((day) => {
          const dayEvents = eventsOn(day);
          const inMonth = isSameMonth(day, month);
          const isSelected = isSameDay(day, selected);
          const today = isToday(day);

          // The first memory with a photo becomes the day's face.
          const cover = dayEvents.find((e) => isMemory(e) && e.attachments[0])?.attachments[0];
          const hasReminder = dayEvents.some((e) => !isMemory(e));
          const hasBirthday = birthdaysOn(members, day).length > 0;
          // Mother's Day, Midsummer... (domain/special-days.ts) - nobody's
          // entry, so a mark of its own in the other corner.
          const special = specialDayOn(day);
          const marks = [
            hasBirthday ? t('birthday.label') : null,
            special ? specialDayName(special) : null,
          ].filter(Boolean);

          return (
            <Touchable
              key={day.toISOString()}
              onPress={() => onSelect(day)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={marks.length > 0 ? `${day.getDate()}, ${marks.join(', ')}` : undefined}
              style={{
                width: `${100 / 7}%`,
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              {special ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '12%',
                    opacity: inMonth ? 1 : 0.45,
                  }}
                >
                  <Icon name="specialDay" size={12} tone="muted" />
                </View>
              ) : null}

              {/* The one mark that is not about an entry: somebody in this
                  family was born on this day. Outside the 38px circle, which
                  clips its children so a photograph stays a square. */}
              {hasBirthday ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: '12%',
                    opacity: inMonth ? 1 : 0.45,
                  }}
                >
                  <Icon name="gift" size={12} tone="primary" />
                </View>
              ) : null}

              <View
                style={{
                  width: 38,
                  height: 38,
                  // A photo day is a rounded square, not a circle: a face in a
                  // 38px circle loses its edges, and the square reads as a print.
                  borderRadius: cover ? theme.radius.sm : theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  // The design marks the chosen day with a RING, not a filled
                  // disc: a solid green circle over a photograph hides the very
                  // thing the cell is there to show.
                  backgroundColor: today && !isSelected ? theme.color.primarySoft : 'transparent',
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: theme.color.primary,
                  opacity: inMonth ? 1 : 0.45,
                }}
              >
                {cover ? (
                  <Image
                    source={{ uri: cover.thumbnailUrl ?? cover.url }}
                    style={{ position: 'absolute', width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : null}

                <Text
                  variant="body"
                  style={{
                    // Over a photograph the number needs its own contrast; the
                    // scrim-free version would disappear on a bright picture.
                    color: cover
                      ? theme.onMedia.text
                      : !inMonth
                        ? theme.color.textMuted
                        : isSelected || today
                          ? theme.color.primary
                          : theme.color.text,
                    fontWeight: today || isSelected ? '700' : '400',
                    textShadowColor: cover ? 'rgba(0,0,0,0.55)' : undefined,
                    textShadowRadius: cover ? 4 : 0,
                  }}
                >
                  {day.getDate()}
                </Text>
              </View>

              {/* A dot only where there is nothing to show. */}
              <View style={{ height: 5, justifyContent: 'center' }}>
                {hasReminder ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: theme.color.primary,
                      opacity: inMonth ? 1 : 0.4,
                    }}
                  />
                ) : null}
              </View>
            </Touchable>
          );
        })}
      </View>

      {/* The legend the design puts under the grid — two kinds, named. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.lg,
          paddingTop: theme.spacing.xs,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.surfaceMuted,
            }}
          />
          <Text variant="caption" tone="muted">
            {t('calendar.legendMemory')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <View
            style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: theme.color.primary }}
          />
          <Text variant="caption" tone="muted">
            {t('calendar.legendReminder')}
          </Text>
        </View>
      </View>
    </View>
  );
}
