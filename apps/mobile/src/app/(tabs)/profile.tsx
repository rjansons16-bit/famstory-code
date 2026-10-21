import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import { ReminderPickerSheet } from '@/components/event/pickers';
import { CalendarFeedRow } from '@/components/family/calendar-feed';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Chip, RoleBadge } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Card, Divider, Header, Row, SectionHeader, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useAppearance } from '@/data/appearance';
import { isLive } from '@/data/backend';
import { LOCALE_NAMES, LOCALES, useLocale } from '@/data/locale';
import { useApp, useCurrentMember, useVisibleEvents } from '@/data/store';
import { limitsFor, limitPressure } from '@/domain/plans';
import { t, tf } from '@/i18n';
import { reminderLabel } from '@/lib/date';
import { canLeaveDemo, leaveDemo } from '@/lib/demo-exit';
import { install, useInstallOffer } from '@/lib/install';
import { toFrontDoor } from '@/lib/navigation';
import { useTheme } from '@/theme';

export default function Profile() {
  const theme = useTheme();
  const router = useRouter();

  const session = useApp((s) => s.session);
  const family = useApp((s) => s.family);
  const events = useApp((s) => s.events);
  const visible = useVisibleEvents();
  const me = useCurrentMember();
  const signOut = useApp((s) => s.signOut);

  const plan = family?.plan ?? 'free';
  const limits = limitsFor(plan);
  const pressure = limitPressure(events.length, limits.maxEvents);

  const milestones = visible.filter((e) => e.isMilestone).length;

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <Header title={t('tab.profile')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Who you are ---
            The design sets this on one line: the face, the name beside it, and
            the way to change either at the far right
            (`design/screens/design_Group_8_1.png`). A centred portrait with the
            email underneath belongs on a social profile, and this is not one. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <Avatar
            name={session?.user.displayName ?? '?'}
            url={me?.avatarUrl ?? session?.user.avatarUrl}
            size="lg"
          />

          {/* The role under the address, not beside it: beside it, a phone
              had room for "anna.berg…" and no more. */}
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Text variant="heading">{session?.user.displayName}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {session?.user.email}
            </Text>
            {me ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <RoleBadge role={me.role} />
              </View>
            ) : null}
          </View>

          <IconButton
            name="edit"
            accessibilityLabel={t('common.edit')}
            onPress={() => router.push('/profile/edit')}
          />
        </View>

        {/* --- Family stats --- */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <StatCard value={visible.length} label={t('timeline.title')} />
          <StatCard value={milestones} label={t('timeline.filterMilestones')} />
        </View>

        {/* The demo keeps nothing - said where somebody looks for their
            account, with the way to a family of their own. */}
        {isLive() ? null : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" tone="muted">
              {t('demo.notice')}
            </Text>
            {canLeaveDemo() ? (
              <Button label={t('demo.startReal')} variant="secondary" onPress={() => leaveDemo('profile')} />
            ) : null}
          </View>
        )}

        {/* --- Plan --- */}
        <View>
          <SectionHeader title={t('premium.planTitle')} />
          <Card>
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Icon name="premium" tone={plan === 'premium' ? 'primary' : 'muted'} />
                <Text variant="heading" style={{ flex: 1 }}>
                  {plan === 'premium' ? t('premium.title') : t('premium.freePlan')}
                </Text>
                {plan === 'free' ? (
                  <Chip
                    label={t('premium.cta')}
                    selected
                    onPress={() => router.push('/premium')}
                  />
                ) : null}
              </View>

              {plan === 'free' ? (
                <View style={{ gap: theme.spacing.xs }}>
                  <Text variant="caption" tone="muted">
                    {tf('premium.eventsUsed', events.length, limits.maxEvents)}
                  </Text>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: theme.color.surfaceMuted,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(pressure * 100)}%`,
                        height: '100%',
                        backgroundColor:
                          pressure >= 0.8 ? theme.color.warning : theme.color.primary,
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          </Card>
        </View>

        {/*
          THE ROW LIST, as the design lays it out.

          One card, one divider between rows, values on the right where a row
          has one — "1 day before", "PDF · DOCX". A row that shows its current
          value answers the question without being opened, which is most of what
          a settings screen is for.
        */}
        <View>
          <SectionHeader title={t('settings.title')} />
          {/* No card. The design keeps settings on the paper itself and lets
              the hairlines do the dividing — white is reserved for content. */}
          <View>
            <Row
              title={t('settings.accountSignIn')}
              left={<Icon name="profile" tone="muted" />}
              right={<Icon name="forward" size={16} tone="muted" />}
              onPress={() => router.push('/settings')}
            />
            <Divider />
            <Row
              title={t('settings.notifications')}
              left={<Icon name="bell" tone="muted" />}
              right={<Icon name="forward" size={16} tone="muted" />}
              onPress={() => router.push('/settings')}
            />
            <Divider />
            <ReminderTimingRow />
            <Divider />
            <CalendarFeedRow />
            <Divider />
            <LanguageRow />
            <Divider />
            <DarkModeRow />
            <Divider />
            <UsageStatsRow />
            <InstallRow />
            <Divider />
            <Row
              title={t('settings.exportData')}
              left={<Icon name="download" tone="muted" />}
              right={<Icon name="forward" size={16} tone="muted" />}
              onPress={() => router.push('/settings')}
            />
            <Divider />
            <Row
              title={t('settings.signOut')}
              left={<Icon name="logout" tone="danger" />}
              danger
              onPress={() => {
                signOut();
                // The sign-in in the app, the welcome page in a browser.
                toFrontDoor(router);
              }}
            />
          </View>
        </View>

      </ScrollView>
    </Screen>
  );
}

/**
 * The switch the design draws, and a way back to the device's own setting.
 *
 * It shows the theme the app is IN, whichever way it got there: with the phone
 * set to dark and nothing chosen here, the switch is on. Flipping it is a
 * choice that then holds regardless of the phone, which is why the way back
 * appears right under it for as long as the choice is in force.
 */
/**
 * THE LANGUAGE.
 *
 * Each language names itself - "Latviešu", not "Latvian" - because the person
 * who needs this row is the person who cannot read the current one.
 *
 * A sheet rather than a toggle: a toggle with two unnamed states says nothing
 * about what it will switch to, and this row exists for somebody who is
 * already looking at words they do not understand.
 */
/**
 * Where a new event's reminder starts. The composer opens on this and the
 * author can still change it per event; kept on the account (User on the
 * server), so a second phone starts in the same place.
 */
function ReminderTimingRow() {
  const theme = useTheme();
  const minutes = useApp((s) => s.session?.user.defaultReminderMinutes);
  const setDefaultReminder = useApp((s) => s.setDefaultReminder);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Row
        title={t('settings.reminderTiming')}
        left={<Icon name="clock" tone="muted" />}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Text variant="caption" tone="muted">
              {reminderLabel(minutes)}
            </Text>
            <Icon name="forward" size={16} tone="muted" />
          </View>
        }
        onPress={() => setOpen(true)}
      />
      <ReminderPickerSheet
        visible={open}
        value={minutes}
        onClose={() => setOpen(false)}
        onChange={setDefaultReminder}
      />
    </>
  );
}

function LanguageRow() {
  const theme = useTheme();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Row
        title={t('settings.language')}
        left={<Icon name="language" tone="muted" />}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Text variant="caption" tone="muted">
              {LOCALE_NAMES[locale]}
            </Text>
            <Icon name="forward" size={16} tone="muted" />
          </View>
        }
        onPress={() => setOpen(true)}
      />

      <Sheet visible={open} title={t('settings.language')} onClose={() => setOpen(false)}>
        {LOCALES.map((option) => (
          <Row
            key={option}
            title={LOCALE_NAMES[option]}
            right={option === locale ? <Icon name="check" tone="primary" /> : undefined}
            onPress={() => {
              setLocale(option);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

function DarkModeRow() {
  const theme = useTheme();
  const preference = useAppearance((s) => s.preference);
  const setPreference = useAppearance((s) => s.setPreference);
  const following = preference === 'system';

  return (
    <View>
      <Row
        title={t('settings.darkMode')}
        subtitle={following ? t('settings.followsSystem') : undefined}
        left={<Icon name="moon" tone="muted" />}
        right={
          <Switch
            accessibilityLabel={t('settings.darkMode')}
            value={theme.mode === 'dark'}
            onValueChange={(on) => setPreference(on ? 'dark' : 'light')}
            trackColor={{ true: theme.color.primary, false: theme.color.border }}
            thumbColor={theme.color.surface}
          />
        }
      />
      {following ? null : (
        <Touchable
          accessibilityRole="button"
          onPress={() => setPreference('system')}
          give="row"
          hitSlop={8}
          // Under the title, past the icon and the gap beside it.
          style={{
            alignSelf: 'flex-start',
            marginLeft: theme.size.icon + theme.spacing.md,
            marginTop: -theme.spacing.xs,
            paddingBottom: theme.spacing.sm,
          }}
        >
          <Text variant="caption" tone="primary">
            {t('settings.followDeviceAgain')}
          </Text>
        </Touchable>
      )}
    </View>
  );
}

/**
 * THE COUNTING SWITCH (data/telemetry.ts).
 *
 * On by default and plain about what it is: the numbers the beta is judged
 * on, with no person in them. Kept on the account, so turning it off here
 * turns it off on every device - and the server refuses the events itself.
 */
function UsageStatsRow() {
  const theme = useTheme();
  const on = useApp((s) => s.session?.user.shareUsageStats !== false);
  const setShareUsageStats = useApp((s) => s.setShareUsageStats);

  return (
    <Row
      title={t('settings.usageStats')}
      subtitle={t('settings.usageStatsHint')}
      left={<Icon name="shield" tone="muted" />}
      right={
        <Switch
          accessibilityLabel={t('settings.usageStats')}
          value={on}
          onValueChange={setShareUsageStats}
          trackColor={{ true: theme.color.primary, false: theme.color.border }}
          thumbColor={theme.color.surface}
        />
      }
    />
  );
}

/**
 * THE WEB APP AS AN APP OF ITS OWN (lib/install.web.ts): on a computer or a
 * phone, from the browser, with no store. Only while there is something to
 * do - a prompt the browser has offered, or Safari's Share menu to point at.
 * Installed, or in a browser that installs nothing, the row is not there.
 */
function InstallRow() {
  const offer = useInstallOffer();
  if (offer !== 'prompt' && offer !== 'ios') return null;

  return (
    <>
      <Divider />
      <Row
        title={t('install.title')}
        subtitle={offer === 'ios' ? t('install.ios') : t('install.hint')}
        left={<Icon name="desktop" tone="muted" />}
        right={offer === 'prompt' ? <Icon name="forward" size={16} tone="muted" /> : undefined}
        onPress={offer === 'prompt' ? () => void install() : undefined}
      />
    </>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <Text variant="display" tone="primary">
        {value}
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        {label}
      </Text>
    </Card>
  );
}
