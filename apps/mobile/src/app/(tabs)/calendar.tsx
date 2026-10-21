import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { MonthGrid, isMemory } from '@/components/calendar/month-grid';
import {
  ALL,
  AudienceFilterRow,
  useFilteredByAudience,
} from '@/components/event/audience-filter';
import { IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { BirthdayRow } from '@/components/family/birthdays';
import { useApp, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { birthdaysOn } from '@/domain/birthdays';
import { specialDayHint, specialDayName, specialDayOn } from '@/domain/special-days';
import { CATEGORY_BY_ID } from '@/domain/categories';
import { expandBetween } from '@/domain/recurrence';
import type { FamilyEvent } from '@/domain/types';
import { usePullToRefresh } from '@/hooks/use-sync';
import { t } from '@/i18n';
import {
  friendlyDay,
  isSameDay,
  monthGrid,
  monthLabel,
  repeatLabel,
  startOfDay,
  timeOfDay,
  toDate,
} from '@/lib/date';
import { useTheme } from '@/theme';

/**
 * CALENDAR (`design/screens/design_Screenshot_2026-07-02_at_19_00_56_1.png`).
 *
 * The month is the header — there is no second title above it, because the tab
 * bar has already said which screen this is. Under the grid, the chosen day's
 * events as cards: a photograph for a memory, a coloured dot for a reminder,
 * and the kind spelled out next to the time so the difference is never left to
 * a shape alone.
 */
export default function Calendar() {
  const theme = useTheme();
  const router = useRouter();
  const all = useVisibleEvents();
  const members = useApp((s) => s.members);
  const { refreshing, onRefresh } = usePullToRefresh();

  const [filter, setFilter] = useState(ALL);
  const events = useFilteredByAudience(all, filter);

  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));

  // A series is one event; the grid needs every occurrence that falls on the
  // six weeks it shows (domain/recurrence.ts). A one-off passes through as it is.
  const shown = useMemo(() => {
    const days = monthGrid(month);
    const end = new Date(days[days.length - 1]);
    end.setDate(end.getDate() + 1);
    return expandBetween(events, days[0], end);
  }, [events, month]);

  const dayEvents = useMemo(() => {
    const end = new Date(selected);
    end.setDate(end.getDate() + 1);
    return expandBetween(events, selected, end)
      .filter((e) => isSameDay(toDate(e.startsAt), selected))
      .sort((a, b) => +toDate(a.startsAt) - +toDate(b.startsAt));
  }, [events, selected]);

  // Not filtered by audience: a birthday belongs to a person, not to an
  // event somebody chose an audience for.
  const dayBirthdays = useMemo(() => birthdaysOn(members, selected), [members, selected]);
  // Mother's Day, Midsummer... on this date (domain/special-days.ts).
  const daySpecial = specialDayOn(selected);

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <Screen padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        <IconButton name="back" accessibilityLabel={t('calendar.previousMonth')} onPress={() => shiftMonth(-1)} />
        <Text variant="heading" align="center" style={{ flex: 1, textTransform: 'capitalize' }}>
          {monthLabel(month)}
        </Text>
        <IconButton name="forward" accessibilityLabel={t('calendar.nextMonth')} onPress={() => shiftMonth(1)} />
      </View>

      <AudienceFilterRow value={filter} onChange={setFilter} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl * 2,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.color.textMuted}
            colors={[theme.color.primary]}
          />
        }
      >
        <MonthGrid
          month={month}
          events={shown}
          members={members}
          selected={selected}
          onSelect={setSelected}
        />

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" tone="muted">
            {friendlyDay(selected.toISOString())}
          </Text>

          {daySpecial ? (
            <Card
              padded={false}
              onPress={() => {
                track({ name: 'special_day_opened', day: daySpecial });
                router.push(`/special-day/${daySpecial}`);
              }}
            >
              {/* Drawn like a birthday's row, not an entry's: nobody wrote it. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  padding: theme.spacing.md,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: theme.radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.primarySoft,
                  }}
                >
                  <Icon name="specialDay" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{specialDayName(daySpecial)}</Text>
                  <Text variant="label" tone="muted" numberOfLines={2}>
                    {specialDayHint(daySpecial)}
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}

          {dayBirthdays.map((birthday) => (
            <BirthdayRow
              key={birthday.member.id}
              birthday={birthday}
              onPress={() => router.push(`/family/member/${birthday.member.id}`)}
            />
          ))}

          {dayEvents.length === 0 && dayBirthdays.length === 0 && !daySpecial ? (
            <Text variant="body" tone="muted">
              {t('calendar.noEventsDay')}
            </Text>
          ) : (
            dayEvents.map((e) => (
              <DayRow
                key={`${e.id}:${e.occurrenceDay ?? ''}`}
                event={e}
                // An occurrence opens the series, on the day it was tapped.
                onPress={() =>
                  router.push(e.occurrenceDay ? `/event/${e.id}?on=${e.occurrenceDay}` : `/event/${e.id}`)
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * A day's event as the design draws it: the photograph if there is one,
 * otherwise the category's colour as a dot — and underneath, the time followed
 * by the word "memory" or "reminder".
 */
function DayRow({ event, onPress }: { event: FamilyEvent; onPress: () => void }) {
  const theme = useTheme();
  const cover = event.attachments[0];
  const memory = isMemory(event);
  const tone = theme.tone[CATEGORY_BY_ID[event.categoryId].tone];

  return (
    <Card onPress={onPress} padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.md,
        }}
      >
        {cover ? (
          <Image
            source={{ uri: cover.thumbnailUrl ?? cover.url }}
            style={{
              width: 56,
              height: 56,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.surfaceMuted,
            }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={{ width: 56, alignItems: 'center' }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: theme.radius.pill,
                backgroundColor: tone.fg,
              }}
            />
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {event.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            {event.repeat ? <Icon name="repeat" size={14} tone="muted" /> : null}
            <Text variant="body" tone="muted" style={{ flexShrink: 1 }}>
              {event.allDay ? t('calendar.allDay') : timeOfDay(event.startsAt)} ·{' '}
              {event.repeat
                ? repeatLabel(event.repeat)
                : memory
                  ? t('calendar.legendMemory')
                  : t('calendar.legendReminder')}
            </Text>
          </View>
        </View>

        <Icon name="forward" size={18} tone="muted" />
      </View>
    </Card>
  );
}
