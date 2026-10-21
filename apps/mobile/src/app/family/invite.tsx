import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { QrCode } from '@/components/family/qr-code';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Card, Header, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { groupLabel } from '@/domain/groups';
import type { MemberRole } from '@/domain/types';
import { t, tf } from '@/i18n';
import { notify } from '@/lib/dialog';
import { inviteLink, inviteMessage } from '@/lib/invite-link';
import { goBack } from '@/lib/navigation';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme';

const ROLES: MemberRole[] = ['member', 'child', 'viewer'];

export default function InviteMember() {
  const theme = useTheme();
  const router = useRouter();

  const groups = useApp((s) => s.groups);
  const family = useApp((s) => s.family);
  const inviteMember = useApp((s) => s.inviteMember);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function send(channel: 'email' | 'link') {
    const invitation = inviteMember({
      email: channel === 'email' ? email.trim() : undefined,
      role,
      groupIds,
    });
    setCreated(invitation.code);
    track({ name: 'invitation_sent', channel, role });

    if (channel === 'link') void share(invitation.code);
    else void mail(email.trim(), invitation.code);
  }

  /**
   * "Send by email" sends it from the person's own mail app, addressed and
   * written. The server has no mail sender, so before this the button made
   * the invitation and showed its code - and nobody received anything, while
   * the person who pressed it believed an email had gone. Where there is no
   * mail app to open, it goes the way a link does.
   */
  async function mail(to: string, code: string) {
    const name = family?.name ?? 'FamStory';
    const subject = tf('family.inviteMailSubject', name);
    const body = tf('family.inviteMailBody', name, inviteLink(code), code);
    // An address with ?, & or # in it would rewrite the rest of the link.
    if (!/^[^\s?&#]+@[^\s?&#]+$/.test(to)) {
      void share(code);
      return;
    }
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // In a browser, in this tab: a mailto: link hands over to the mail program
    // and the page stays; opened as a new tab it left an empty one behind.
    if (Platform.OS === 'web') {
      window.location.assign(url);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      void share(code);
    }
  }

  /**
   * The message carries the link AND the code.
   *
   * Some messengers strip a link they do not recognise, and a phone with the
   * app installed opens the link while a phone without it opens the page -
   * both of which work. The code underneath is the fallback for the third
   * case, where somebody is reading this on a laptop.
   */
  async function share(code: string) {
    const result = await shareText(inviteMessage(family?.name ?? 'FamStory', code), t('family.invite'));

    if (result === 'copied') notify(t('family.inviteCopied'));
    else if (result === 'failed') notify(t('family.inviteCopyFailed'), inviteLink(code));
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('family.invite')} onBack={() => goBack(router)} />

      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <Field
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            hint={t('common.optional')}
          />

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="body" tone="muted">
              {t('family.roleLabel')}
            </Text>
            {ROLES.map((r) => (
              <Row
                key={r}
                title={t(`role.${r}` as Parameters<typeof t>[0])}
                subtitle={t(`role.${r}Hint` as Parameters<typeof t>[0])}
                onPress={() => setRole(r)}
                right={role === r ? <Icon name="check" tone="primary" /> : undefined}
              />
            ))}
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" tone="muted">
              {t('family.groups')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {groups.map((g) => (
                <Chip
                  key={g.id}
                  label={groupLabel(g)}
                  selected={groupIds.includes(g.id)}
                  onPress={() => toggleGroup(g.id)}
                />
              ))}
            </View>
          </View>
        </View>
      </Card>

      {created ? (
        <Card>
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            {/* The square first: it is the fastest route in, and the one a
                grandparent can use without typing anything at all. */}
            <QrCode value={inviteLink(created)} />

            <Text variant="caption" tone="muted" align="center">
              {t('family.inviteScanHint')}
            </Text>

            <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <Text variant="caption" tone="muted">
                {t('family.inviteByCode')}
              </Text>
              <Text variant="display" tone="primary">
                {created}
              </Text>
            </View>

            <Touchable
              accessibilityRole="button"
              accessibilityLabel={t('family.inviteCopyLink')}
              onPress={() => void share(created)}
              hitSlop={8}
            >
              <Text variant="caption" tone="primary" align="center">
                {tf('family.inviteLinkIs', inviteLink(created))}
              </Text>
            </Touchable>
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={t('family.inviteByEmail')}
          icon="mail"
          disabled={!email.includes('@')}
          onPress={() => send('email')}
        />
        <Button
          label={t('family.inviteByLink')}
          icon="share"
          variant="secondary"
          onPress={() => send('link')}
        />
      </View>
    </Screen>
  );
}
