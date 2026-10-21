import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { StepHeader } from '@/components/onboarding/step-header';
import { ActionCard } from '@/components/ui/action-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Card, Divider, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useCurrentMember } from '@/data/store';
import { track } from '@/domain/analytics';
import type { MemberRole } from '@/domain/types';
import { t, tf } from '@/i18n';
import { notify } from '@/lib/dialog';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

const INVITE_ROLES: MemberRole[] = ['member', 'viewer'];

/**
 * STEP 4 — Add your people (`design/screens/design_Group_9_1.png`).
 *
 * The study's KPI: "families with more than one active member >40%". This
 * screen is what moves that number, which is why it sits in onboarding rather
 * than in settings. It can still be skipped — forcing an invitation puts people
 * off, and a family of one is still a family.
 *
 * Three ways in, and they are genuinely different things:
 *   - a LINK anyone can open, for the relative whose email you do not know;
 *   - a CHILD, who gets a profile and no account at all, and whose data is
 *     handed over to them later;
 *   - an INVITATION by email, which arrives addressed to a person.
 */
export default function PeopleStep() {
  const theme = useTheme();
  const router = useRouter();

  const family = useApp((s) => s.family);
  const members = useApp((s) => s.members);
  const invitations = useApp((s) => s.invitations);
  const me = useCurrentMember();
  const addChild = useApp((s) => s.addChild);
  const inviteMember = useApp((s) => s.inviteMember);

  const [sheet, setSheet] = useState<'child' | 'adult' | null>(null);
  const [childName, setChildName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('member');

  const others = members.filter((m) => m.id !== me?.id);

  async function saveChild() {
    await addChild(childName);
    setChildName('');
    setSheet(null);
  }

  function sendInvite() {
    inviteMember({ email: email.trim(), role, groupIds: [] });
    setEmail('');
    setSheet(null);
  }

  function shareLink() {
    // Against a live server the code is real — `inviteMember` creates the
    // invitation and swaps in the server's code. What is still missing is the
    // deep link: this shares a code to read out, not a link to tap.
    const invitation = inviteMember({ role: 'member', groupIds: [] });
    const message = `Join our family on FamStory: ${invitation.code}`;

    // Share.share is a no-op on react-native-web, which is the build design
    // reviews run in — so the code is shown outright when sharing cannot open.
    void Share.share({ message }).catch(() =>
      notify(t('family.inviteByLink'), invitation.code),
    );
  }

  function next() {
    track({ name: 'onboarding_step_completed', step: 'people' });
    router.push('/(onboarding)/first-event');
  }

  return (
    <Screen edges={['top', 'bottom']} scroll bottomInset={120}>
      <StepHeader
        step={4}
        total={5}
        title={t('onboarding.peopleTitle')}
        subtitle={t('onboarding.peopleSubtitle')}
        onBack={() => goBack(router)}
      />

      {/* You, first — so the list is never empty and the roles are legible
          before anybody else is in it. */}
      {me ? (
        <View>
          <Row
            title={tf('onboarding.peopleYou', me.displayName)}
            subtitle={tf('onboarding.peopleYouHint', family?.name ?? '')}
            left={<Avatar name={me.displayName} url={me.avatarUrl} />}
          />
          <Divider />
        </View>
      ) : null}

      {others.length > 0 || invitations.length > 0 ? (
        <Card elevation="flat">
          <View>
            {others.map((m, i) => (
              <View key={m.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={m.displayName}
                  left={<Avatar name={m.displayName} url={m.avatarUrl} size="sm" />}
                  right={<RoleBadge role={m.role} />}
                />
              </View>
            ))}

            {invitations.map((inv, i) => (
              <View key={inv.id}>
                {others.length > 0 || i > 0 ? <Divider /> : null}
                <Row
                  title={inv.email ?? inv.code}
                  subtitle={inv.code}
                  left={<Icon name="mail" tone="muted" />}
                  right={<RoleBadge role={inv.role} />}
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <ActionCard
          icon="link"
          title={t('onboarding.shareLink')}
          hint={t('onboarding.shareLinkHint')}
          onPress={shareLink}
        />
        <ActionCard
          icon="smile"
          tone="accent"
          title={t('onboarding.addChild')}
          hint={t('onboarding.addChildHint')}
          onPress={() => setSheet('child')}
        />
        <ActionCard
          icon="mail"
          title={t('onboarding.inviteAdult')}
          hint={t('onboarding.inviteAdultHint')}
          onPress={() => setSheet('adult')}
        />
      </View>

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button label={t('onboarding.continue')} size="lg" onPress={next} />
        <Button label={t('onboarding.skipForNow')} variant="ghost" onPress={next} />
      </View>

      {/* --- A child: a profile, nothing sent --- */}
      <Sheet
        visible={sheet === 'child'}
        title={t('onboarding.addChild')}
        onClose={() => setSheet(null)}
        footer={
          <Button
            label={t('common.add')}
            disabled={childName.trim().length < 2}
            onPress={saveChild}
          />
        }
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" tone="muted">
            {t('onboarding.addChildHint')}
          </Text>
          <Field
            label={t('onboarding.childName')}
            placeholder={t('onboarding.childNamePlaceholder')}
            value={childName}
            onChangeText={setChildName}
            autoFocus
            maxLength={60}
          />
        </View>
      </Sheet>

      {/* --- An adult: an invitation --- */}
      <Sheet
        visible={sheet === 'adult'}
        title={t('onboarding.inviteAdult')}
        onClose={() => setSheet(null)}
        footer={
          <Button
            label={t('family.inviteByEmail')}
            icon="send"
            disabled={!email.includes('@')}
            onPress={sendInvite}
          />
        }
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" tone="muted">
            {t('onboarding.inviteAdultHint')}
          </Text>

          <Field
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />

          <View>
            {INVITE_ROLES.map((r, i) => (
              <View key={r}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={t(`role.${r}` as Parameters<typeof t>[0])}
                  subtitle={t(`role.${r}Hint` as Parameters<typeof t>[0])}
                  onPress={() => setRole(r)}
                  right={role === r ? <Icon name="check" tone="primary" /> : undefined}
                />
              </View>
            ))}
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
