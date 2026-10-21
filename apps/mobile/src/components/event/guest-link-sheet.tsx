import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { getApi } from '@/data/backend';
import { useApp } from '@/data/store';
import type { FamilyEvent, GuestLink } from '@/domain/types';
import { t, tf } from '@/i18n';
import { friendlyDay, timeOfDay } from '@/lib/date';
import { notify } from '@/lib/dialog';
import { shareText } from '@/lib/share';
import { useTheme } from '@/theme';
import { QrCode } from '../family/qr-code';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { Sheet } from '../ui/feedback';
import { Icon } from '../ui/icon';
import { Card, Divider, Row } from '../ui/surface';
import { Text } from '../ui/text';

const LIFETIMES = [1, 7, 30] as const;

/**
 * ONE EVENT, FOR SOMEBODY OUTSIDE THE FAMILY.
 *
 * The one deliberate way anything leaves the family, so the sheet says what
 * the guest will and will not see before anything is made, warns when a
 * child is in it, makes links that expire, and lists the ones still open -
 * with how often each was opened - so they can be withdrawn. The server
 * decides who may do this (the author, or an admin) and keeps only a hash.
 */
export function GuestLinkSheet({
  event,
  visible,
  onClose,
}: {
  event: FamilyEvent;
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const familyId = useApp((s) => s.family?.id);
  const members = useApp((s) => s.members);
  const [days, setDays] = useState<(typeof LIFETIMES)[number]>(7);
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);
  const [links, setLinks] = useState<GuestLink[]>([]);
  const [busy, setBusy] = useState(false);

  const live = Boolean(getApi());
  const hasChild = event.participantMemberIds.some(
    (id) => members.find((m) => m.id === id)?.role === 'child',
  );

  useEffect(() => {
    const api = getApi();
    if (!visible || !api || !familyId) return;
    let cancelled = false;
    void api
      .listGuestLinks(familyId, event.id)
      .then((list) => {
        if (!cancelled) setLinks(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, event.id, made]);

  async function make() {
    const api = getApi();
    if (!api || !familyId) return;
    setBusy(true);
    try {
      setMade(await api.createGuestLink(familyId, event.id, days));
    } catch (error) {
      notify(t('guest.share'), error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(linkId: string) {
    const api = getApi();
    if (!api || !familyId) return;
    try {
      await api.revokeGuestLink(familyId, linkId);
      setLinks((current) => current.filter((l) => l.id !== linkId));
      if (made) setMade(null);
    } catch (error) {
      notify(t('guest.share'), error instanceof Error ? error.message : t('auth.errorGeneric'));
    }
  }

  const until = (iso: string) => `${friendlyDay(iso)} ${timeOfDay(iso)}`;

  return (
    <Sheet visible={visible} title={t('guest.share')} onClose={onClose} scroll>
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="body" tone="muted">
          {t('guest.shareHint')}
        </Text>

        {hasChild ? (
          <Card elevation="flat">
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
              <Icon name="shield" tone="primary" />
              <Text variant="caption" style={{ flex: 1 }}>
                {t('guest.childWarning')}
              </Text>
            </View>
          </Card>
        ) : null}

        {!live ? (
          <Text variant="body">{t('guest.onlyLive')}</Text>
        ) : made ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            <QrCode value={made.url} size={200} />
            <Text variant="caption" tone="muted" align="center" selectable>
              {made.url}
            </Text>
            <Text variant="caption" tone="muted">
              {tf('guest.expires', until(made.expiresAt))}
            </Text>
            <Button
              label={t('member.resetShare')}
              icon="share"
              onPress={() => void shareText(made.url, event.title)}
            />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {LIFETIMES.map((n) => (
                <Chip key={n} label={tf('guest.days', n)} selected={days === n} onPress={() => setDays(n)} />
              ))}
            </View>
            <Button label={t('guest.make')} icon="link" loading={busy} onPress={() => void make()} />
          </View>
        )}

        {live && links.length > 0 ? (
          <View>
            <Text variant="body" tone="muted" style={{ marginBottom: theme.spacing.sm }}>
              {t('guest.active')}
            </Text>
            {links.map((link, i) => (
              <View key={link.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={tf('guest.expires', until(link.expiresAt))}
                  subtitle={link.viewCount > 0 ? tf('guest.views', link.viewCount) : t('guest.notOpened')}
                  left={<Icon name="link" tone="muted" />}
                  right={
                    <Chip label={t('guest.revoke')} icon="close" onPress={() => void withdraw(link.id)} />
                  }
                />
              </View>
            ))}
          </View>
        ) : busy ? (
          <ActivityIndicator color={theme.color.primary} />
        ) : null}
      </View>
    </Sheet>
  );
}
