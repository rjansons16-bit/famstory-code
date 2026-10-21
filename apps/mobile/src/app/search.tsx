import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { EventRow } from '@/components/event/event-card';
import { CategoryChip, Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/feedback';
import { Field } from '@/components/ui/input';
import { Header, Screen } from '@/components/ui/surface';
import { getApi } from '@/data/backend';
import { useApp, useVisibleEvents } from '@/data/store';
import { isSealed } from '@/domain/capsules';
import { CATEGORIES } from '@/domain/categories';
import type { CategoryId, FamilyEvent } from '@/domain/types';
import { canSee } from '@/domain/visibility';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { goBack } from '@/lib/navigation';

/** Wait this long after the last keystroke before asking the server. */
const SEARCH_DELAY_MS = 300;

/** A strip of chips keeps its own height; the list below takes the rest. */
const STRIP = { flexGrow: 0, flexShrink: 0 } as const;

/**
 * SEARCH - across the whole chronicle, not just what happens to be loaded.
 *
 * The timeline holds the newest fifty events and loads older ones as it is
 * scrolled, so a search that only filtered what was on the phone missed
 * everything from before - exactly the years a chronicle is for. With a
 * server, the words, the kind, the person and the year are asked of it (and
 * it applies visibility itself); what is already loaded answers at once while
 * it does, including the family's own tags, which the server does not search.
 *
 * By person and by year, because that is how a family remembers: "the one
 * with Grandma", "the summer of 2019".
 */
export default function Search() {
  const theme = useTheme();
  const router = useRouter();
  const loaded = useVisibleEvents();
  const members = useApp((s) => s.members);
  const familyId = useApp((s) => s.family?.id);
  const mergeEvents = useApp((s) => s.mergeEvents);
  const me = useApp((s) => s.members.find((m) => m.id === s.session?.activeMemberId));

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [remote, setRemote] = useState<FamilyEvent[]>([]);
  const [asking, setAsking] = useState(false);

  const q = query.trim().toLowerCase();
  const filtering = q.length > 0 || category !== null || person !== null || year !== null;

  // The years there is anything in, newest first - the chips only offer
  // what can be found.
  const years = useMemo(
    () =>
      [...new Set(loaded.map((e) => new Date(e.startsAt).getFullYear()))].sort((a, b) => b - a),
    [loaded],
  );
  const people = useMemo(
    () => members.filter((m) => m.status === 'active' && loaded.some((e) => e.participantMemberIds.includes(m.id))),
    [members, loaded],
  );

  useEffect(() => {
    const api = getApi();
    // Nothing to ask for, or nobody to ask: what is loaded is the answer.
    if (!api || !familyId || !filtering || (q.length > 0 && q.length < 2)) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setAsking(true);
      api
        .listEvents(familyId, {
          q: q || undefined,
          categoryId: category ?? undefined,
          participantId: person ?? undefined,
          from: year ? new Date(year, 0, 1).toISOString() : undefined,
          to: year ? new Date(year + 1, 0, 1).toISOString() : undefined,
          limit: 50,
        })
        .then((page) => {
          if (!cancelled) setRemote(page.items);
        })
        .catch(() => {
          // Offline: what is loaded is still an answer.
        })
        .finally(() => {
          if (!cancelled) setAsking(false);
        });
    }, SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [familyId, filtering, q, category, person, year]);

  const results = useMemo(() => {
    const matches = (e: FamilyEvent) => {
      if (category && e.categoryId !== category) return false;
      if (person && !e.participantMemberIds.includes(person)) return false;
      if (year && new Date(e.startsAt).getFullYear() !== year) return false;
      if (!q) return true;
      // Only the title of a capsule still closed to this reader: its words and
      // tags are what the envelope keeps (the server searches the same way).
      if (isSealed(e, me?.id)) return e.title.toLowerCase().includes(q);
      return (
        e.title.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q) ||
        (e.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    };

    const byId = new Map<string, FamilyEvent>();
    for (const e of loaded.filter(matches)) byId.set(e.id, e);
    // The server has already applied visibility; canSee again all the same,
    // because nothing reaches a screen in this app without it.
    for (const e of remote) if (!byId.has(e.id) && matches(e) && me && canSee(e, me)) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  }, [loaded, remote, q, category, person, year, me]);

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}>
        <Header title={t('common.search')} onBack={() => goBack(router)} />
        <Field
          placeholder={t('common.search')}
          accessibilityLabel={t('common.search')}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {/* The strips keep their height (flexGrow/flexShrink 0, as the
          timeline's audience filter does): a ScrollView shrinks by default,
          and with a long list of results below, the chips were squeezed to a
          few pixels. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={STRIP}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
        }}
      >
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c.id}
            categoryId={c.id}
            selected={category === c.id}
            onPress={() => setCategory(category === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>

      {people.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={STRIP}
          contentContainerStyle={{
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
            alignItems: 'center',
          }}
        >
          {people.map((m) => (
            <Chip
              key={m.id}
              label={m.displayName}
              icon="profile"
              selected={person === m.id}
              onPress={() => setPerson(person === m.id ? null : m.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {years.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={STRIP}
          contentContainerStyle={{
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
          }}
        >
          {years.map((y) => (
            <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(year === y ? null : y)} />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
          gap: theme.spacing.sm,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {asking && results.length === 0 ? <ActivityIndicator color={theme.color.primary} /> : null}
        {!asking && results.length === 0 ? (
          <EmptyState icon="search" title={t('timeline.emptyTitle')} />
        ) : (
          results.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              onPress={() => {
                // Found by the server, perhaps from years the timeline has not
                // loaded: put it where the event screen will look for it.
                mergeEvents([e]);
                router.push(`/event/${e.id}`);
              }}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
