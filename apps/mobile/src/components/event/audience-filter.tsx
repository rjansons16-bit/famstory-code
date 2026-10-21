import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { useApp, useCurrentMember } from '@/data/store';
import { groupLabel } from '@/domain/groups';
import type { FamilyEvent } from '@/domain/types';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Chip } from '../ui/chip';

/**
 * The audience filter — "All · Mine · Parents · Children · Grandparents".
 *
 * It sits on both the timeline and the calendar, which is why it lives here
 * rather than in either of them: two copies of a filter that decides who can
 * see what is two chances to get it wrong in one of them only.
 *
 * A group chip answers "what would this group see", so `family` events count
 * for every group — otherwise the most-shared events would vanish from every
 * filter, which is the opposite of what the chip promises.
 */
export const ALL = 'all';
export const MINE = 'mine';

export function useAudienceFilters() {
  const groups = useApp((s) => s.groups);

  return useMemo(
    () => [
      { value: ALL, label: t('timeline.filterEveryone') },
      { value: MINE, label: t('timeline.filterMine') },
      ...groups.map((g) => ({ value: g.id, label: groupLabel(g) })),
    ],
    [groups],
  );
}

export function useFilteredByAudience(events: FamilyEvent[], filter: string): FamilyEvent[] {
  const me = useCurrentMember();

  return useMemo(() => {
    if (filter === ALL) return events;
    if (filter === MINE) return events.filter((e) => e.authorMemberId === me?.id);

    return events.filter(
      (e) =>
        e.visibility.kind === 'family' ||
        (e.visibility.kind === 'groups' && (e.visibility.groupIds ?? []).includes(filter)),
    );
  }, [events, filter, me?.id]);
}

/**
 * Pills, as the design draws them. The selected one is not a solid green
 * button — it is a paler fill with ink on it, so the row reads as a set of
 * choices rather than one shouted answer.
 */
export function AudienceFilterRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const theme = useTheme();
  const filters = useAudienceFilters();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
      }}
    >
      {filters.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value === o.value}
          fg={value === o.value ? theme.color.text : theme.color.textMuted}
          bg={value === o.value ? theme.color.primarySoft : theme.color.surfaceMuted}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ScrollView>
  );
}
