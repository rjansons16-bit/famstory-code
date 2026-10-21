import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Chip, RoleBadge } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Card, Divider, Header, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp, useCurrentMember } from '@/data/store';
import { groupLabel } from '@/domain/groups';
import { can } from '@/domain/visibility';
import { usePullToRefresh } from '@/hooks/use-sync';
import { t, tf } from '@/i18n';
import { lifeSpan, yearsSince } from '@/lib/date';
import { useTheme } from '@/theme';

export default function FamilyTab() {
  const theme = useTheme();
  const router = useRouter();

  const family = useApp((s) => s.family);
  const members = useApp((s) => s.members);
  const groups = useApp((s) => s.groups);
  const invitations = useApp((s) => s.invitations);
  const me = useCurrentMember();
  const { refreshing, onRefresh } = usePullToRefresh();

  // The living first; the people the family remembers keep a place of their
  // own at the end, rather than vanishing or sitting among the invitations.
  const active = members.filter((m) => m.status === 'active' && !m.diedOn);
  const remembered = members.filter((m) => m.status === 'active' && m.diedOn);
  // The groups screen lists only active members, so the count here has to mean
  // the same thing. Counting the raw id list said "2 members" over a group that
  // showed one face, because an invited person is in the group before they are
  // in the family.
  const activeIds = new Set(active.map((m) => m.id));
  const canInvite = me ? can(me, 'member.invite') : false;
  const canManageGroups = me ? can(me, 'group.manage') : false;
  const canRename = !!family && !!me && can(me, 'family.edit');

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <Header
          title={family?.name ?? t('family.title')}
          right={
            canRename ? (
              <IconButton
                name="edit"
                accessibilityLabel={t('family.rename')}
                onPress={() => router.push('/family/edit')}
              />
            ) : undefined
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.xl,
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
        {/* An invitation is the one thing this screen exists to make easy —
            the design gives it a band of its own above everything else. */}
        {canInvite ? (
          <Touchable
            accessibilityRole="button"
            onPress={() => router.push('/family/invite')}
            give="card"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.lg,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.color.surfaceMuted,
            }}
          >
            <Icon name="link" tone="primary" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" tone="primary">
                {t('family.inviteTitle')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('family.inviteHint')}
              </Text>
            </View>
            <Icon name="forward" size={18} tone="muted" />
          </Touchable>
        ) : null}

        {/* --- Members ---
            On the paper with hairlines between them. White is for things you
            can open; a person is a row, not an object. */}
        <View>
          <Text variant="body" tone="muted" style={{ marginBottom: theme.spacing.sm }}>
            {t('family.members')} · {active.length}
          </Text>

          {active.map((m, i) => (
            <View key={m.id}>
              {i > 0 ? <Divider /> : null}
              <Row
                title={
                  m.role === 'child' && m.birthDate
                    ? `${m.displayName}  · ${tf('family.age', yearsSince(m.birthDate))}`
                    : m.displayName
                }
                left={<Avatar name={m.displayName} url={m.avatarUrl} />}
                right={<RoleBadge role={m.role} />}
                onPress={() => router.push(`/family/member/${m.id}`)}
              />
            </View>
          ))}
        </View>

        {/* --- In memory --- */}
        {remembered.length > 0 ? (
          <View>
            <Text variant="body" tone="muted" style={{ marginBottom: theme.spacing.sm }}>
              {t('memorial.title')}
            </Text>
            {remembered.map((m, i) => (
              <View key={m.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={m.displayName}
                  subtitle={lifeSpan(m.birthDate, m.diedOn)}
                  left={<Avatar name={m.displayName} url={m.avatarUrl} />}
                  right={<Icon name="memorial" tone="muted" />}
                  onPress={() => router.push(`/family/member/${m.id}`)}
                />
              </View>
            ))}
          </View>
        ) : null}

        {/* --- Pending invitations ---
            The invitations, and only they: a person who has not accepted has
            no member row until they do (docs/02-DATA-MODEL.md, Invitations). */}
        {invitations.length > 0 ? (
          <View>
            <Text variant="body" tone="muted" style={{ marginBottom: theme.spacing.sm }}>
              {t('family.pendingInvites')}
            </Text>
            <Card elevation="flat">
              {invitations.map((inv) => (
                <Row
                  key={inv.id}
                  title={inv.email ?? inv.code}
                  subtitle={inv.code}
                  left={<Icon name="mail" tone="muted" />}
                  right={<RoleBadge role={inv.role} />}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {/* --- Groups ---
            These ARE objects: a group is a thing you open and edit, so it gets
            a card of its own. */}
        <View style={{ gap: theme.spacing.md }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <Text variant="body" tone="muted" style={{ flex: 1 }}>
              {t('family.groups')} · {groups.length}
            </Text>
            {canManageGroups ? (
              <Chip
                label={t('family.newGroup')}
                icon="add"
                onPress={() => router.push('/family/groups')}
              />
            ) : null}
          </View>

          {groups.map((g) => (
            <Card key={g.id} onPress={() => router.push('/family/groups')} padded={false}>
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                <Row
                  title={groupLabel(g)}
                  left={<Icon name="group" tone="muted" />}
                  right={
                    <Text variant="body" tone="muted">
                      {tf(
                        'family.memberCount',
                        g.memberIds.filter((id) => activeIds.has(id)).length,
                      )}
                    </Text>
                  }
                />
              </View>
            </Card>
          ))}

          <Text variant="caption" tone="muted">
            {t('family.groupsHint')}
          </Text>
        </View>

        {/* --- Our story ---
            The keepsakes that look across the whole chronicle rather than at
            one day of it (docs/07-IMPROVEMENTS.md items 78-81). */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" tone="muted">
            {t('keepsakes.title')}
          </Text>
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <Row
                title={t('traditions.title')}
                subtitle={t('traditions.hint')}
                left={<Icon name="tradition" tone="muted" />}
                right={<Icon name="forward" size={16} tone="muted" />}
                onPress={() => router.push('/traditions')}
              />
              <Divider />
              <Row
                title={tf('film.title', filmYearNow())}
                subtitle={t('film.hint')}
                left={<Icon name="film" tone="muted" />}
                right={<Icon name="forward" size={16} tone="muted" />}
                onPress={() => router.push('/film')}
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The year the film row names: this one, or last year's while January has barely begun. */
function filmYearNow(now: Date = new Date()): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}
