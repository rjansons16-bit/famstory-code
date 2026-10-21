import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Card, Divider, Header, Row, Screen, SectionHeader } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useCurrentMember } from '@/data/store';
import {
  isSpecialDayKey,
  nextSpecialDay,
  specialDayHint,
  specialDayIdeas,
  specialDayName,
  whoGetsPresents,
  type SpecialDayKey,
} from '@/domain/special-days';
import { t } from '@/i18n';
import { inDaysLabel, weekdayAndDay } from '@/lib/date';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * ONE OF THE FAMILY'S DAYS - Mother's Day, Midsummer, Christmas Eve
 * (domain/special-days.ts, docs/07-IMPROVEMENTS.md item 92).
 *
 * Opened from the timeline a week ahead, from the calendar, and from the
 * reminder three days before. It says when, and offers a few ideas; on a day
 * that comes with presents, it lists whose page to look at - that is where
 * their wish list and gift ideas are. Two of the ideas lead somewhere in the
 * app: the wish lists at Christmas, the year's film on New Year's Eve.
 */
export default function SpecialDayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const me = useCurrentMember();
  const members = useApp((s) => s.members);

  const day = useMemo(() => (isSpecialDayKey(key) ? nextSpecialDay(key) : null), [key]);
  const people = useMemo(
    () => (isSpecialDayKey(key) ? whoGetsPresents(key, members, me) : []),
    [key, members, me],
  );

  if (!day) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="" onBack={() => goBack(router)} />
        <EmptyState icon="specialDay" title={t('calendar.noEventsDay')} />
      </Screen>
    );
  }

  const leadsTo = inAppLink(day.key);

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={specialDayName(day.key)} onBack={() => goBack(router)} />

      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <View
          style={{
            width: theme.size.avatarXl,
            height: theme.size.avatarXl,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="specialDay" size={32} tone="primary" />
        </View>
        <Text variant="title" align="center">
          {specialDayName(day.key)}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {`${weekdayAndDay(day.day)} · ${inDaysLabel(day.inDays)}`}
        </Text>
        <Text variant="caption" tone="muted" align="center">
          {specialDayHint(day.key)}
        </Text>
      </View>

      <View>
        <SectionHeader title={t('special.ideas')} />
        <Card padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            {specialDayIdeas(day.key).map((idea, i) => (
              <View key={idea}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={idea}
                  left={<Icon name={i === 0 && leadsTo ? leadsTo.icon : 'sparkle'} tone="muted" />}
                  right={
                    i === 0 && leadsTo ? <Icon name="forward" size={16} tone="muted" /> : undefined
                  }
                  onPress={i === 0 && leadsTo ? () => router.push(leadsTo.href) : undefined}
                />
              </View>
            ))}
          </View>
        </Card>
      </View>

      {people.length > 0 ? (
        <View>
          <SectionHeader title={t('special.people')} />
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {people.map((person, i) => (
                <View key={person.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row
                    title={person.displayName}
                    left={<Avatar name={person.displayName} url={person.avatarUrl} size="sm" />}
                    right={<Icon name="gift" size={18} tone="primary" />}
                    onPress={() => router.push(`/family/member/${person.id}`)}
                  />
                </View>
              ))}
            </View>
          </Card>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            {t('special.peopleHint')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

/** The day whose first idea is something the app already has. */
function inAppLink(
  key: SpecialDayKey,
): { href: '/(tabs)/family' | '/film'; icon: 'wish' | 'film' } | null {
  if (key === 'christmas-eve') return { href: '/(tabs)/family', icon: 'wish' };
  if (key === 'new-years-eve') return { href: '/film', icon: 'film' };
  return null;
}
