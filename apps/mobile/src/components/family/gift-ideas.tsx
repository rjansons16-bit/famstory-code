import { useEffect, useMemo, useRef } from 'react';
import { Linking, View } from 'react-native';

import { useApp, useCurrentMember, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { upcomingBirthdays } from '@/domain/birthdays';
import {
  GIFT_IDEAS_WINDOW_DAYS,
  giftIdeaText,
  giftIdeasFor,
  giftSearchUrl,
  type GiftIdea,
} from '@/domain/gifts';
import { interestLabel } from '@/domain/interests';
import type { Member } from '@/domain/types';
import { t, tf } from '@/i18n';
import { inDaysLabel } from '@/lib/date';
import { useTheme } from '@/theme';
import { IconButton } from '../ui/button';
import { Chip } from '../ui/chip';
import { Card, Divider, SectionHeader } from '../ui/surface';
import { Text } from '../ui/text';

/**
 * Gift ideas on somebody's page, under their wish list (domain/gifts.ts,
 * docs/07-IMPROVEMENTS.md item 91).
 *
 * Never on your own page - the family is who buys - and not for a child's
 * profile to act on. Each idea is a suggestion with two presses and nothing
 * else: "I'll get this" writes it onto the wish list as yours, where the
 * person it is for never sees it and the rest of the family sees it is
 * taken; the cart looks the words up in the browser. Nothing happens by
 * itself.
 */
export function GiftIdeas({ member }: { member: Member }) {
  const theme = useTheme();
  const me = useCurrentMember();
  const visible = useVisibleEvents();
  const wishes = useApp((s) => s.wishes[member.id]);
  const addWish = useApp((s) => s.addWish);

  const forSomebodyElse = !!me && me.id !== member.id && me.role !== 'child' && !member.diedOn;
  const ideas = useMemo(
    () =>
      forSomebodyElse
        ? giftIdeasFor({ member, viewerId: me?.id, events: visible, wishes: wishes ?? [] })
        : [],
    [forSomebodyElse, member, me?.id, visible, wishes],
  );
  const birthday = useMemo(
    () => upcomingBirthdays([member], { withinDays: GIFT_IDEAS_WINDOW_DAYS })[0],
    [member],
  );

  // Once per page, when there is something to show: whether ideas near a
  // birthday are ever taken is the question, not which ones.
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || ideas.length === 0) return;
    tracked.current = true;
    track({ name: 'gift_ideas_shown', inDays: birthday?.inDays ?? -1, ideas: ideas.length });
  }, [ideas.length, birthday]);

  if (!forSomebodyElse || ideas.length === 0) return null;

  function take(idea: GiftIdea) {
    addWish(member.id, giftIdeaText(idea), { claim: true });
    track({ name: 'gift_idea_taken', source: idea.source });
  }

  function search(idea: GiftIdea) {
    track({ name: 'gift_idea_searched', source: idea.source });
    void Linking.openURL(giftSearchUrl(giftIdeaText(idea))).catch(() => undefined);
  }

  return (
    <View>
      <SectionHeader title={t('gift.title')} />
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="caption" tone="muted">
            {birthday
              ? `${tf('birthday.turns', member.displayName, birthday.turning)} ${inDaysLabel(birthday.inDays)}. ${tf('gift.hint', member.displayName)}`
              : tf('gift.hint', member.displayName)}
          </Text>

          {ideas.map((idea, i) => (
            <View key={idea.key}>
              {i > 0 ? <Divider /> : null}
              {/* The words get the whole width; a phone has no room for them
                  beside two buttons. */}
              <View style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.sm }}>
                <Text variant="body">{giftIdeaText(idea)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <SourceLine idea={idea} />
                  </View>
                  <Chip label={t('wish.claim')} icon="gift" onPress={() => take(idea)} />
                  <IconButton
                    name="shop"
                    tone="muted"
                    accessibilityLabel={`${t('common.search')}: ${giftIdeaText(idea)}`}
                    onPress={() => search(idea)}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

/** Why this idea: what they chose, what the entries say, their age - or nothing, for the ones that suit anybody. */
function SourceLine({ idea }: { idea: GiftIdea }) {
  const text =
    idea.source === 'interest' && idea.interest
      ? tf('gift.fromInterest', interestLabel(idea.interest))
      : idea.source === 'family' && idea.interest
        ? tf('gift.fromEntries', interestLabel(idea.interest))
        : idea.source === 'age'
          ? t('gift.fromAge')
          : null;
  if (!text) return null;
  return (
    <Text variant="caption" tone="muted">
      {text}
    </Text>
  );
}
