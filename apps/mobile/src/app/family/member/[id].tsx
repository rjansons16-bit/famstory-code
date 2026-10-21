import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { GiftIdeas } from '@/components/family/gift-ideas';
import { MemberInterests } from '@/components/family/member-interests';
import { MemorialSection } from '@/components/family/memorial';
import { QrCode } from '@/components/family/qr-code';
import { WishList } from '@/components/family/wish-list';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chip, RoleBadge } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Card, Header, Row, SectionHeader, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { getApi } from '@/data/backend';
import { useApp, useCurrentMember } from '@/data/store';
import { groupLabel } from '@/domain/groups';
import type { MemberRole } from '@/domain/types';
import { canManageMember } from '@/domain/visibility';
import { t, tf } from '@/i18n';
import { friendlyDay, fullDayLabel, lifeSpan, timeOfDay } from '@/lib/date';
import { confirm, notify } from '@/lib/dialog';
import { goBack } from '@/lib/navigation';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme';

const ROLES: MemberRole[] = ['admin', 'member', 'child', 'viewer'];

export default function MemberDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const member = useApp((s) => s.members.find((m) => m.id === id));
  const members = useApp((s) => s.members);
  const groups = useApp((s) => s.groups);
  const events = useApp((s) => s.events);
  const updateMemberRole = useApp((s) => s.updateMemberRole);
  const removeMember = useApp((s) => s.removeMember);
  const setAvatar = useApp((s) => s.setAvatar);
  const familyId = useApp((s) => s.family?.id);
  const blocked = useApp((s) => s.blockedMemberIds);
  const blockMember = useApp((s) => s.blockMember);
  const unblockMember = useApp((s) => s.unblockMember);
  const me = useCurrentMember();
  const [reset, setReset] = useState<{ link: string; expiresAt: string } | null>(null);
  const [making, setMaking] = useState(false);

  if (!member || !me) return <Screen edges={['top']} />;

  /**
   * Anybody may block anybody - an admin included - but themselves and a
   * child profile, which writes nothing (docs/02-DATA-MODEL.md, Blocks).
   */
  const canBlock = member.id !== me.id && member.role !== 'child' && member.status === 'active';
  const isBlocked = blocked.includes(member.id);

  async function confirmBlock() {
    if (!member) return;
    const ok = await confirm({
      title: t('block.confirmTitle'),
      message: tf('block.confirm', member.displayName),
      confirmLabel: t('block.action'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) blockMember(member.id);
  }

  /**
   * A way back in for somebody who forgot their password (item 35).
   *
   * Only an admin, only for another adult with an account - a child profile
   * has no password - and the person is told the link exists the moment it is
   * made. See apps/api/src/modules/identity/password-reset.service.ts for why
   * that last part is the one that matters.
   */
  const canReset =
    me.role === 'admin' && member.id !== me.id && member.role !== 'child' && Boolean(member.userId);

  async function makeResetLink() {
    const api = getApi();
    if (!api || !familyId || !member) {
      notify(t('member.resetTitle'), t('member.resetOnlyLive'));
      return;
    }

    setMaking(true);
    try {
      setReset(await api.createPasswordReset(familyId, member.id));
    } catch (error) {
      notify(t('member.resetTitle'), error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setMaking(false);
    }
  }

  /** Your own photograph; a child's by the parent who manages it; anybody's by an admin. */
  const canEditPhoto =
    me.id === member.id ||
    me.role === 'admin' ||
    (member.role === 'child' && member.managedByMemberId === me.id);

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify(t('event.mediaPermissionTitle'), t('event.mediaPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0] || !member) return;
    setAvatar(member.id, result.assets[0].uri);
  }

  const manageable = canManageMember(me, member);
  const manager = member.managedByMemberId
    ? members.find((m) => m.id === member.managedByMemberId)
    : undefined;
  const memberGroups = groups.filter((g) => g.memberIds.includes(member.id));
  const involvedIn = events.filter((e) => e.participantMemberIds.includes(member.id)).length;

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={member.displayName} onBack={() => goBack(router)} />

      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        {canEditPhoto ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={member.avatarUrl ? t('avatar.change') : t('avatar.add')}
            onPress={() => void pickPhoto()}
            give="round"
          >
            <Avatar name={member.displayName} url={member.avatarUrl} size="xl" />
            <View
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: theme.size.avatarSm,
                height: theme.size.avatarSm,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.color.surface,
                borderWidth: 1,
                borderColor: theme.color.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="camera" size={16} tone="muted" />
            </View>
          </Touchable>
        ) : (
          <Avatar name={member.displayName} url={member.avatarUrl} size="xl" />
        )}
        <Text variant="title">{member.displayName}</Text>
        {member.diedOn ? (
          <Text variant="caption" tone="muted">
            {lifeSpan(member.birthDate, member.diedOn)}
          </Text>
        ) : (
          <>
            <RoleBadge role={member.role} />
            {member.birthDate ? (
              <Text variant="caption" tone="muted">
                {friendlyDay(member.birthDate)}
              </Text>
            ) : null}
          </>
        )}
        {isBlocked ? (
          <Text variant="caption" tone="muted" align="center">
            {tf('block.note', member.displayName)}
          </Text>
        ) : null}
      </View>

      <MemorialSection member={member} me={me} place="top" />

      {/* --- Child profile: who manages it --- */}
      {member.role === 'child' ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name="shield" tone="primary" />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{t('role.child')}</Text>
              <Text variant="caption" tone="muted">
                {manager ? `${t('role.childHint')} · ${manager.displayName}` : t('role.childHint')}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* --- Groups --- */}
      <View>
        <SectionHeader title={t('family.groups')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {memberGroups.length === 0 ? (
            <Text variant="caption" tone="muted">
              —
            </Text>
          ) : (
            memberGroups.map((g) => <Chip key={g.id} label={groupLabel(g)} icon="group" />)
          )}
        </View>
      </View>

      {/* --- What they like: for the gift ideas, and to know them by --- */}
      <MemberInterests member={member} me={me} />

      {/* --- Stats --- */}
      <Card elevation="flat">
        <Row
          title={t('timeline.title')}
          left={<Icon name="timeline" tone="muted" />}
          right={<Text variant="heading">{involvedIn}</Text>}
        />
      </Card>

      {/* --- Their story, and growing up ---
          A life told a question at a time (for anyone, and most of all a
          grandparent), and the same moment of theirs year after year. */}
      <Card padded={false}>
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          <Row
            title={t('lifestory.title')}
            subtitle={t('lifestory.hint')}
            left={<Icon name="book" tone="muted" />}
            right={<Icon name="forward" size={16} tone="muted" />}
            onPress={() => router.push(`/story/${member.id}`)}
          />
          <Row
            title={t('growth.title')}
            subtitle={t('growth.hint')}
            left={<Icon name="growth" tone="muted" />}
            right={<Icon name="forward" size={16} tone="muted" />}
            onPress={() => router.push(`/growth/${member.id}`)}
          />
        </View>
      </Card>

      {/* --- What to give them, without them finding out --- */}
      {!member.diedOn ? <WishList member={member} /> : null}
      <GiftIdeas member={member} />

      {/* --- Change role --- */}
      {manageable ? (
        <View>
          <SectionHeader title={t('role.member')} />
          <Card elevation="flat">
            {ROLES.map((r, i) => (
              <View key={r}>
                {i > 0 ? <View style={{ height: 1, backgroundColor: theme.color.border }} /> : null}
                <Row
                  title={t(`role.${r}` as Parameters<typeof t>[0])}
                  subtitle={t(`role.${r}Hint` as Parameters<typeof t>[0])}
                  onPress={() => updateMemberRole(member.id, r)}
                  right={member.role === r ? <Icon name="check" tone="primary" /> : undefined}
                />
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* --- A way back in, for an adult who forgot their password --- */}
      {canReset ? (
        <View>
          <SectionHeader title={t('member.resetTitle')} />
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="caption" tone="muted">
                {t('member.resetHint')}
              </Text>

              {reset ? (
                <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
                  <QrCode value={reset.link} size={200} />
                  <Text variant="caption" tone="muted" align="center">
                    {tf(
                      'member.resetExpires',
                      `${fullDayLabel(new Date(reset.expiresAt))} ${timeOfDay(reset.expiresAt)}`,
                    )}
                  </Text>
                  <Button
                    label={t('member.resetShare')}
                    icon="share"
                    variant="secondary"
                    onPress={() => void shareText(reset.link, t('member.resetTitle'))}
                  />
                </View>
              ) : (
                <Button
                  label={t('member.resetCreate')}
                  icon="private"
                  variant="secondary"
                  loading={making}
                  onPress={() => void makeResetLink()}
                />
              )}
            </View>
          </Card>
        </View>
      ) : null}

      <MemorialSection member={member} me={me} place="bottom" />

      {/* --- Blocking: theirs to lift here, as it was made here or on an entry --- */}
      {canBlock ? (
        <Button
          label={isBlocked ? t('block.undo') : t('block.action')}
          variant="secondary"
          icon="block"
          onPress={() => (isBlocked ? unblockMember(member.id) : void confirmBlock())}
        />
      ) : null}

      {manageable && member.id !== me.id ? (
        <Button
          label={t('family.removeMember')}
          variant="danger"
          icon="delete"
          onPress={() => {
            removeMember(member.id);
            goBack(router);
          }}
        />
      ) : null}
    </Screen>
  );
}
