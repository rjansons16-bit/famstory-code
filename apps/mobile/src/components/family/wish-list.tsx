import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useApp, useCurrentMember } from '@/data/store';
import type { Member, Wish } from '@/domain/types';
import { MAX_WISH_LENGTH, mayClaim, wishesVisibleTo } from '@/domain/wishes';
import { t, tf } from '@/i18n';
import { useTheme } from '@/theme';
import { Button, IconButton } from '../ui/button';
import { Chip } from '../ui/chip';
import { Field } from '../ui/input';
import { Card, Divider, SectionHeader } from '../ui/surface';
import { Text } from '../ui/text';

/**
 * A person's wish list, on their profile (docs/07-IMPROVEMENTS.md item 51).
 *
 * The same component for both sides of the rule, and the rule is spelled out
 * in the first line of the card, because it is the reason anybody writes here
 * at all: on your own profile it says you see only your own lines; on
 * somebody else's it says they will not see what you add, nor who is getting
 * what. The server keeps that promise (wishes.service.ts); `wishesVisibleTo`
 * keeps it for the sample family, which has no server.
 */
export function WishList({ member }: { member: Member }) {
  const theme = useTheme();
  const me = useCurrentMember();
  const members = useApp((s) => s.members);
  const stored = useApp((s) => s.wishes[member.id]);
  const loadWishes = useApp((s) => s.loadWishes);
  const addWish = useApp((s) => s.addWish);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    void loadWishes(member.id);
  }, [member.id, loadWishes]);

  const list = useMemo(
    () => wishesVisibleTo(stored ?? [], member.id, me?.id),
    [stored, member.id, me?.id],
  );

  if (!me) return null;
  const isOwner = me.id === member.id;
  // Children act through their parents; everybody else, grandparents
  // included, may write - they are the ones buying.
  const canWrite = me.role !== 'child';
  const clean = draft.trim();

  function add() {
    if (clean.length < 2) return;
    addWish(member.id, clean);
    setDraft('');
  }

  return (
    <View>
      <SectionHeader title={t('wish.title')} />
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="caption" tone="muted">
            {isOwner ? t('wish.ownHint') : tf('wish.othersHint', member.displayName)}
          </Text>

          {list.length === 0 ? (
            <Text variant="body" tone="muted">
              {t('wish.empty')}
            </Text>
          ) : (
            list.map((wish, i) => (
              <View key={wish.id}>
                {i > 0 ? <Divider /> : null}
                <WishRow
                  wish={wish}
                  owner={member}
                  viewer={me}
                  nameOf={(id) => members.find((m) => m.id === id)?.displayName ?? '—'}
                />
              </View>
            ))
          )}

          {canWrite ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Field
                placeholder={t('wish.placeholder')}
                accessibilityLabel={t('wish.placeholder')}
                value={draft}
                onChangeText={setDraft}
                maxLength={MAX_WISH_LENGTH}
                returnKeyType="done"
                onSubmitEditing={add}
              />
              <Button
                label={t('common.add')}
                icon="add"
                variant="secondary"
                disabled={clean.length < 2}
                onPress={add}
              />
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function WishRow({
  wish,
  owner,
  viewer,
  nameOf,
}: {
  wish: Wish;
  owner: Member;
  viewer: Member;
  nameOf: (memberId: string) => string;
}) {
  const theme = useTheme();
  const removeWish = useApp((s) => s.removeWish);
  const toggleWishClaim = useApp((s) => s.toggleWishClaim);

  const byFamily = wish.addedByMemberId !== owner.id;
  const mine = wish.claimedByMemberId === viewer.id;
  const claimable = viewer.role !== 'child' && mayClaim(wish, owner.id, viewer.id);
  const removable = wish.addedByMemberId === viewer.id || viewer.role === 'admin';

  const note = wish.claimedByMemberId
    ? mine
      ? t('wish.claimedByYou')
      : tf('wish.claimedBy', nameOf(wish.claimedByMemberId))
    : byFamily
      ? tf('wish.suggestedBy', nameOf(wish.addedByMemberId))
      : undefined;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{wish.text}</Text>
        {note ? (
          <Text variant="caption" tone={wish.claimedByMemberId ? 'primary' : 'muted'}>
            {note}
          </Text>
        ) : null}
      </View>

      {claimable ? (
        <Chip
          label={mine ? t('wish.release') : t('wish.claim')}
          icon={mine ? 'close' : 'gift'}
          selected={mine}
          onPress={() => toggleWishClaim(owner.id, wish.id)}
        />
      ) : null}
      {removable ? (
        <IconButton
          name="delete"
          tone="muted"
          accessibilityLabel={t('wish.remove')}
          onPress={() => removeWish(owner.id, wish.id)}
        />
      ) : null}
    </View>
  );
}
