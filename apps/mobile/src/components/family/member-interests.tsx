import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { cleanInterests, mayEditInterests, type InterestKey } from '@/domain/interests';
import type { Member } from '@/domain/types';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Button } from '../ui/button';
import { Card, SectionHeader } from '../ui/surface';
import { Text } from '../ui/text';
import { InterestChips, InterestPicker } from './interest-picker';

/**
 * What somebody likes, on their page (domain/interests.ts).
 *
 * Your own are changed with the rest of your profile. A child's profile has
 * no account to say it from, so the adult who manages it - or an admin -
 * changes them here, and the server writes that down like any other change
 * to a child's profile. Anybody else only reads them; with nothing chosen
 * there is nothing to show them.
 */
export function MemberInterests({ member, me }: { member: Member; me: Member }) {
  const theme = useTheme();
  const router = useRouter();
  const setChildInterests = useApp((s) => s.setChildInterests);
  const [editing, setEditing] = useState<InterestKey[] | null>(null);

  const interests = cleanInterests(member.interests);
  const own = me.id === member.id;
  const forChild = !own && mayEditInterests(me, member);

  if (member.diedOn) return null;
  if (!own && !forChild && interests.length === 0) return null;

  function save(next: InterestKey[]) {
    setChildInterests(member.id, next);
    track({ name: 'interests_saved', count: next.length, where: 'child' });
    setEditing(null);
  }

  return (
    <View>
      <SectionHeader title={t('interests.section')} />
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          {editing ? (
            <>
              <InterestPicker value={editing} onChange={setEditing} />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Button label={t('common.save')} onPress={() => save(editing)} style={{ flex: 1 }} />
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  onPress={() => setEditing(null)}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : (
            <>
              {interests.length > 0 ? (
                <InterestChips interests={interests} />
              ) : (
                <Text variant="body" tone="muted">
                  {own ? t('interests.ownEmpty') : t('interests.none')}
                </Text>
              )}
              {member.role === 'child' ? (
                <Text variant="caption" tone="muted">
                  {t('interests.childHint')}
                </Text>
              ) : null}
              {own || forChild ? (
                <Button
                  label={interests.length > 0 ? t('interests.edit') : t('interests.add')}
                  icon="interests"
                  variant="secondary"
                  onPress={() => (own ? router.push('/profile/edit') : setEditing([...interests]))}
                />
              ) : null}
            </>
          )}
        </View>
      </Card>
    </View>
  );
}
