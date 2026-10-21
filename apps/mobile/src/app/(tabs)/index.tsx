import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native';

import {
  ALL,
  AudienceFilterRow,
  useFilteredByAudience,
} from '@/components/event/audience-filter';
import { EventCard } from '@/components/event/event-card';
import { OnThisDay } from '@/components/event/on-this-day';
import { MonthRecapCard } from '@/components/event/month-recap-card';
import { WeeklyQuestionCard } from '@/components/event/weekly-question';
import { WhatsNewBanner } from '@/components/event/whats-new';
import { UpcomingBirthdays } from '@/components/family/birthdays';
import { ActionCard } from '@/components/ui/action-card';
import { IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import {
  useApp,
  useCurrentMember,
  useOnThisDay,
  useTimelineEvents,
  useUnreadCount,
  useVisibleEvents,
  useWhatsNew,
} from '@/data/store';
import { hasAnswered, promptForWeek } from '@/domain/prompts';
import { monthKey, monthRecap, recapToOffer } from '@/domain/recap';
import { timelinePlace } from '@/domain/recurrence';
import { can } from '@/domain/visibility';
import { track } from '@/domain/analytics';
import { upcomingBirthdays } from '@/domain/birthdays';
import { GIFT_IDEAS_WINDOW_DAYS } from '@/domain/gifts';
import { specialDayHint, specialDayName, upcomingSpecialDays } from '@/domain/special-days';
import { booksFor, surprisesToAsk } from '@/domain/surprises';
import type { FamilyEvent } from '@/domain/types';
import { useLayout } from '@/hooks/use-layout';
import { usePullToRefresh } from '@/hooks/use-sync';
import { t, tf } from '@/i18n';
import { friendlyDay, inDaysLabel, timelineSection } from '@/lib/date';
import { useTheme } from '@/theme';

/**
 * TIMELINE — the home screen.
 *
 * A deliberate decision: the timeline comes first, NOT the calendar.
 * The study lists "insufficient differentiation" as an elevated risk — if the
 * first thing a user sees is a month grid, the product is a calendar. If the
 * first thing is the family story with photographs, it is something else.
 */
export default function Timeline() {
  const theme = useTheme();
  const router = useRouter();

  const family = useApp((s) => s.family);
  // Each repeating series once, at its next occurrence (domain/recurrence.ts).
  const events = useTimelineEvents();
  const onThisDay = useOnThisDay();
  const unread = useUnreadCount();
  // What everyone else in the family has added since the app was opened.
  const { refreshing, onRefresh } = usePullToRefresh();
  // The chronicle arrives fifty at a time; the rest as the list nears its end.
  const loadMoreEvents = useApp((s) => s.loadMoreEvents);
  const loadingMore = useApp((s) => s.loadingMore);

  // What the others added since the previous visit. `onlyNew` narrows the
  // list to exactly those; it lets go by itself once they have all been
  // opened, rather than leaving an empty timeline behind a filter.
  const whatsNew = useWhatsNew();
  const newSince = useApp((s) => s.newSince);
  const [onlyNew, setOnlyNew] = useState(false);
  const showingOnlyNew = onlyNew && whatsNew.length > 0;
  const newIds = useMemo(() => new Set(whatsNew.map((e) => e.id)), [whatsNew]);

  // The question of the week (domain/prompts.ts): for whoever can write, until
  // they have answered it or said "not now" - which holds for this session,
  // not for the week, because tomorrow may be the day they have the time.
  const me = useCurrentMember();
  const allVisible = useVisibleEvents();
  const [skippedPrompt, setSkippedPrompt] = useState<string | null>(null);
  const prompt = family ? promptForWeek(family.createdAt) : null;
  const askQuestion =
    prompt !== null &&
    me !== null &&
    can(me, 'event.create') &&
    skippedPrompt !== prompt &&
    !hasAnswered(allVisible, prompt, me.id);
  // Last month, looked back on - offered in the first week of this one
  // (domain/recap.ts), until it is opened or put aside.
  const [skippedRecap, setSkippedRecap] = useState(false);
  const recap = useMemo(() => {
    const month = recapToOffer(allVisible);
    return month ? monthRecap(allVisible, month) : null;
  }, [allVisible]);
  const trackedRecap = useRef(false);
  useEffect(() => {
    if (!recap || trackedRecap.current) return;
    trackedRecap.current = true;
    track({ name: 'recap_shown', month: monthKey(recap.month) });
  }, [recap]);

  const trackedPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (!askQuestion || !prompt || trackedPrompt.current === prompt) return;
    trackedPrompt.current = prompt;
    track({ name: 'weekly_question_shown', key: prompt });
  }, [askQuestion, prompt]);

  // Once per visit with something to show - not per render, and not again as
  // each one is opened. Whether people act on the line is the whole question.
  const trackedVisit = useRef<string | null>(null);
  useEffect(() => {
    if (!newSince || whatsNew.length === 0 || trackedVisit.current === newSince) return;
    trackedVisit.current = newSince;
    track({ name: 'whats_new_shown', count: whatsNew.length });
  }, [newSince, whatsNew.length]);

  // The one forward-looking thing on a screen about the past, and the reason
  // onboarding asks for a birthday at all.
  const members = useApp((s) => s.members);
  const birthdays = useMemo(() => upcomingBirthdays(members), [members]);

  // Birthday surprises (domain/surprises.ts): the family is asked to write in
  // the two weeks before somebody's day - never the one it is for - and on the
  // morning, the wishes are theirs to open.
  const surpriseAsks = useMemo(
    () => (me && can(me, 'event.create') ? surpriseToAskFor(members, allVisible, me.id) : []),
    [members, allVisible, me],
  );
  const myBooks = useMemo(() => booksFor(allVisible, me?.id), [allVisible, me]);

  // Gift ideas for the nearest birthday in the next two weeks that is not
  // your own (domain/gifts.ts) - the ideas themselves are on their page.
  // Children's profiles do not buy.
  const giftFor = useMemo(() => {
    if (!me || me.role === 'child') return null;
    return (
      upcomingBirthdays(members, { withinDays: GIFT_IDEAS_WINDOW_DAYS }).find(
        (b) => b.member.id !== me.id,
      ) ?? null
    );
  }, [members, me]);

  // Mother's Day, Midsummer, Christmas Eve... the nearest one within a week
  // (domain/special-days.ts). Nothing is stored; the date is today's.
  const specialDay = useMemo(() => upcomingSpecialDays()[0] ?? null, []);

  /**
   * FILTERS BY AUDIENCE, NOT BY CONTENT.
   *
   * The design filters the timeline by who an event is for — All, Mine, then a
   * chip per group. That is a better fit than the content filters it replaces
   * (milestones / mine): it puts the visibility model on the home screen, so
   * the product's one real differentiator becomes something you can touch
   * rather than a badge you read.
   *
   * "Grandparents" answers a question a parent actually has — *what have the
   * grandparents been able to see?* — and no competitor can answer it.
   */
  const [filter, setFilter] = useState(ALL);
  const newPlaced = useMemo(() => whatsNew.map((e) => timelinePlace(e)), [whatsNew]);
  const filtered = useFilteredByAudience(showingOnlyNew ? newPlaced : events, filter);

  /**
   * Grouped by how recent, not by month name — see `timelineSection`.
   * "Today" is how a person remembers; "September 2026" is how an archive is filed.
   */
  const sections = useMemo(() => {
    const buckets = new Map<string, { label: string; future: boolean; data: FamilyEvent[] }>();
    for (const event of filtered) {
      const { key, label, future } = timelineSection(event.startsAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.data.push(event);
      else buckets.set(key, { label, future, data: [event] });
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({
        title: v.label,
        // The past reads newest first. What is still ahead reads SOONEST first
        // — a "Coming up" that opens three weeks out and counts back towards
        // tomorrow is a list nobody can act on. `filtered` arrives newest
        // first, so reversing this one bucket is the whole fix.
        data: v.future ? [...v.data].reverse() : v.data,
      }));
  }, [filtered]);

  // On a wide computer screen, two cards to a row (hooks/use-layout.ts). The
  // sections stay the same; each one's cards are paired, in order, so a row
  // reads left to right the way the column read top to bottom.
  const { columns } = useLayout();
  const rows = useMemo(
    () => sections.map((section) => ({ title: section.title, data: inRows(section.data, columns) })),
    [sections, columns],
  );

  function open(item: FamilyEvent) {
    track({ name: 'event_viewed', eventId: item.id });
    // A series opens on the occurrence it is shown at.
    router.push(item.occurrenceDay ? `/event/${item.id}?on=${item.occurrenceDay}` : `/event/${item.id}`);
  }

  return (
    <Screen padded={false} wide={columns === 2}>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <Header
          title={family?.name ?? t('timeline.title')}
          right={
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                name="search"
                accessibilityLabel={t('common.search')}
                onPress={() => router.push('/search')}
              />
              <IconButton
                name="bell"
                badge={unread > 0}
                accessibilityLabel={t('notifications.title')}
                onPress={() => router.push('/notifications')}
              />
            </View>
          }
        />
      </View>

      <AudienceFilterRow
        value={filter}
        onChange={(next) => {
          setFilter(next);
          track({ name: 'timeline_filtered', filter: next });
        }}
      />

      <SectionList
        sections={rows}
        keyExtractor={(row) => row.map((e) => `${e.id}:${e.occurrenceDay ?? ''}`).join('|')}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl * 2,
          gap: theme.spacing.md,
        }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        // Only the full chronicle has an older page; "only what is new" is
        // already everything it will ever be.
        onEndReached={showingOnlyNew ? undefined : () => void loadMoreEvents()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={theme.color.primary} style={{ marginTop: theme.spacing.lg }} />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.color.textMuted}
            colors={[theme.color.primary]}
          />
        }
        ListHeaderComponent={
          // One gap between everything above the chronicle. Each card had
          // brought its own margin, or none: the "3 new since" line sat right
          // on the card under it (the owner, 2026-10-01).
          <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.md }}>
            <WhatsNewBanner
              count={whatsNew.length}
              since={newSince}
              onlyNew={showingOnlyNew}
              onToggle={() => {
                if (!showingOnlyNew) track({ name: 'whats_new_opened', count: whatsNew.length });
                setOnlyNew(!showingOnlyNew);
              }}
            />
            {/* Only on the unfiltered timeline. Under a group filter the strip
                would contradict the audience the user just chose, and under
                "only what is new" it would be in the way of it. */}
            {filter === ALL && !showingOnlyNew ? (
              <>
                {recap && !skippedRecap ? (
                  <MonthRecapCard
                    recap={recap}
                    onOpen={() => {
                      track({ name: 'recap_opened', month: monthKey(recap.month) });
                      setSkippedRecap(true);
                      router.push(`/recap?month=${monthKey(recap.month)}`);
                    }}
                  />
                ) : null}
                {myBooks.map((book) => (
                  <ActionCard
                    key={book.revealAt}
                    icon="gift"
                    tone="accent"
                    title={t('surprise.readyTitle')}
                    hint={tf('surprise.readyBody', book.wishes.length)}
                    onPress={() =>
                      router.push(`/surprise/${me?.id}?at=${encodeURIComponent(book.revealAt)}`)
                    }
                  />
                ))}
                {surpriseAsks.map((ask) => (
                  <ActionCard
                    key={ask.birthday.member.id}
                    icon="gift"
                    tone="accent"
                    title={`${t('surprise.askTitle')} · ${ask.birthday.member.displayName}`}
                    hint={
                      ask.wishes.length > 0
                        ? `${tf('surprise.askBody', ask.birthday.member.displayName, friendlyDay(ask.revealAt))} ${tf('surprise.written', ask.wishes.length)}`
                        : tf('surprise.askBody', ask.birthday.member.displayName, friendlyDay(ask.revealAt))
                    }
                    onPress={() =>
                      router.push(
                        `/surprise/${ask.birthday.member.id}?at=${encodeURIComponent(ask.revealAt)}`,
                      )
                    }
                  />
                ))}
                {askQuestion && prompt ? (
                  <WeeklyQuestionCard
                    promptKey={prompt}
                    onAnswer={() => {
                      track({ name: 'weekly_question_opened', key: prompt });
                      router.push(`/event/new?prompt=${prompt}`);
                    }}
                    onDismiss={() => setSkippedPrompt(prompt)}
                  />
                ) : null}
                {specialDay || giftFor ? (
                  <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
                    {specialDay ? (
                      <ActionCard
                        icon="specialDay"
                        tone="accent"
                        title={tf(
                          'special.when',
                          specialDayName(specialDay.key),
                          inDaysLabel(specialDay.inDays),
                        )}
                        hint={specialDayHint(specialDay.key)}
                        onPress={() => {
                          track({ name: 'special_day_opened', day: specialDay.key });
                          router.push(`/special-day/${specialDay.key}`);
                        }}
                      />
                    ) : null}
                    {giftFor ? (
                      <ActionCard
                        icon="gift"
                        title={tf('gift.cardTitle', giftFor.member.displayName)}
                        hint={tf('gift.cardHint', inDaysLabel(giftFor.inDays))}
                        onPress={() => {
                          track({ name: 'birthday_opened', inDays: giftFor.inDays });
                          router.push(`/family/member/${giftFor.member.id}`);
                        }}
                      />
                    ) : null}
                  </View>
                ) : null}
                <UpcomingBirthdays
                birthdays={birthdays}
                onSelect={(birthday) => {
                  track({ name: 'birthday_opened', inDays: birthday.inDays });
                  router.push(`/family/member/${birthday.member.id}`);
                }}
              />
                <OnThisDay
                  events={onThisDay}
                  onSelect={(event) => {
                    track({ name: 'event_viewed', eventId: event.id });
                    router.push(`/event/${event.id}`);
                  }}
                />
              </>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            variant="body"
            tone="muted"
            style={{ marginTop: theme.spacing.xl, marginBottom: theme.spacing.md }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item: row }) =>
          row.length === 1 && columns === 1 ? (
            <EventCard event={row[0]} isNew={newIds.has(row[0].id)} onPress={() => open(row[0])} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
              {row.map((item) => (
                <View key={`${item.id}:${item.occurrenceDay ?? ''}`} style={{ flex: 1, minWidth: 0 }}>
                  <EventCard event={item} isNew={newIds.has(item.id)} onPress={() => open(item)} />
                </View>
              ))}
              {/* The last row of a section with an odd number keeps the
                  column's width rather than stretching one card across both. */}
              {row.length < columns ? <View style={{ flex: 1 }} /> : null}
            </View>
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="timeline"
            title={t('timeline.emptyTitle')}
            body={t('timeline.emptyBody')}
            actionLabel={t('timeline.emptyAction')}
            onAction={() => router.push('/event/new')}
          />
        }
      />
    </Screen>
  );
}

/** A section's events, `columns` to a row, in order. */
function inRows(events: FamilyEvent[], columns: 1 | 2): FamilyEvent[][] {
  if (columns === 1) return events.map((event) => [event]);
  const rows: FamilyEvent[][] = [];
  for (let i = 0; i < events.length; i += columns) rows.push(events.slice(i, i + columns));
  return rows;
}

/** At most two at a time: a family with birthdays close together still has a timeline. */
function surpriseToAskFor(...args: Parameters<typeof surprisesToAsk>) {
  return surprisesToAsk(...args).slice(0, 2);
}
