import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { getApi } from '@/data/backend';
import { useApp } from '@/data/store';
import type { CalendarFeed } from '@/domain/types';
import { t, tf } from '@/i18n';
import { friendlyDay, timeOfDay } from '@/lib/date';
import { confirm, notify } from '@/lib/dialog';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme';
import { Button } from '../ui/button';
import { Sheet } from '../ui/feedback';
import { Icon } from '../ui/icon';
import { Row } from '../ui/surface';
import { Text } from '../ui/text';

/**
 * THE FAMILY IN THE PHONE'S OWN CALENDAR (docs/07-IMPROVEMENTS.md item 54).
 *
 * One read-only address per person, which the phone's calendar subscribes
 * to. It carries exactly what this person can see in the app - the server
 * runs the timeline's own filter on every fetch - and the birthdays.
 *
 * "Add to my calendar" opens the webcal:// form, which Apple's calendar and
 * Outlook take straight in; Google Calendar wants the https:// one pasted
 * into "From URL", which is what the copy is for. The address is a key, so
 * the sheet also makes a new one: the way to cut off a phone that was lost.
 */
export function CalendarFeedRow() {
  const theme = useTheme();
  const familyId = useApp((s) => s.family?.id);
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [busy, setBusy] = useState(false);

  async function show() {
    setOpen(true);
    const api = getApi();
    if (!api || !familyId || feed) return;
    setBusy(true);
    try {
      setFeed(await api.calendarFeed(familyId));
    } catch (error) {
      notify(t('calendarFeed.title'), error instanceof Error ? error.message : t('auth.errorGeneric'));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const api = getApi();
    if (!api || !familyId) return;
    const ok = await confirm({
      title: t('calendarFeed.reset'),
      message: t('calendarFeed.resetHint'),
      confirmLabel: t('calendarFeed.reset'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setFeed(await api.resetCalendarFeed(familyId));
    } catch (error) {
      notify(t('calendarFeed.title'), error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  const live = Boolean(getApi());

  return (
    <>
      <Row
        title={t('calendarFeed.title')}
        left={<Icon name="subscribe" tone="muted" />}
        right={<Icon name="forward" size={16} tone="muted" />}
        onPress={() => void show()}
      />

      <Sheet visible={open} title={t('calendarFeed.title')} onClose={() => setOpen(false)} scroll>
        <View style={{ gap: theme.spacing.lg }}>
          <Text variant="body" tone="muted">
            {t('calendarFeed.hint')}
          </Text>

          {!live ? (
            <Text variant="body">{t('calendarFeed.onlyLive')}</Text>
          ) : busy && !feed ? (
            <ActivityIndicator color={theme.color.primary} />
          ) : feed ? (
            <View style={{ gap: theme.spacing.md }}>
              <Button
                label={t('calendarFeed.open')}
                icon="calendar"
                onPress={() => void Linking.openURL(feed.webcalUrl).catch(() => undefined)}
              />
              <Button
                label={t('calendarFeed.copy')}
                icon="link"
                variant="secondary"
                onPress={() =>
                  void shareText(feed.url, t('calendarFeed.title')).then((outcome) => {
                    if (outcome === 'copied') notify(t('calendarFeed.title'), t('calendarFeed.copied'));
                  })
                }
              />
              <Text variant="caption" tone="muted" selectable>
                {feed.url}
              </Text>
              <Text variant="caption" tone="muted">
                {feed.lastFetchedAt
                  ? tf(
                      'calendarFeed.lastFetched',
                      `${friendlyDay(feed.lastFetchedAt)} ${timeOfDay(feed.lastFetchedAt)}`,
                    )
                  : t('calendarFeed.never')}
              </Text>
              <Button
                label={t('calendarFeed.reset')}
                icon="close"
                variant="ghost"
                loading={busy}
                onPress={() => void reset()}
              />
            </View>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
