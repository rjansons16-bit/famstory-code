import { useRouter } from 'expo-router';
import { RefreshControl, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/icon';
import { Card, Header, Row, Screen } from '@/components/ui/surface';
import { useApp, useBell } from '@/data/store';
import { track } from '@/domain/analytics';
import { describeNotification } from '@/domain/notifications';
import type { NotificationKind } from '@/domain/types';
import { usePullToRefresh } from '@/hooks/use-sync';
import { t } from '@/i18n';
import { friendlyDay } from '@/lib/date';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

const ICON: Record<NotificationKind, IconName> = {
  event_reminder: 'bell',
  event_created: 'add',
  comment_added: 'comment',
  member_joined: 'family',
  password_reset_created: 'private',
  invitation_received: 'mail',
  conflict_detected: 'warning',
  capsule_opened: 'capsule',
  surprise_ready: 'gift',
  special_day: 'specialDay',
  content_reported: 'warning',
};

/**
 * A sentence's own full stop, dropped before the "·" that follows it: not
 * "18. novembris. · Šodien". An ellipsis ("...") is kept as written.
 */
function withoutFullStop(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith('.') && !trimmed.endsWith('..') ? trimmed.slice(0, -1) : trimmed;
}

export default function Notifications() {
  const theme = useTheme();
  const router = useRouter();

  const notifications = useBell();
  const markRead = useApp((s) => s.markNotificationRead);
  const markAllRead = useApp((s) => s.markAllNotificationsRead);
  const { refreshing, onRefresh } = usePullToRefresh();

  return (
    <Screen
      edges={['top', 'bottom']}
      scroll
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.color.textMuted}
          colors={[theme.color.primary]}
        />
      }
    >
      <Header
        title={t('notifications.title')}
        onBack={() => goBack(router)}
        right={
          notifications.some((n) => !n.readAt) ? (
            // What it does - not "Done", which reads as "close this screen".
            <Chip label={t('notifications.markAllRead')} icon="check" onPress={markAllRead} />
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon="bell" title={t('notifications.empty')} />
      ) : (
        <Card elevation="flat">
          {notifications.map((n, i) => {
            const text = describeNotification(n);
            return (
              <View key={n.id}>
                {i > 0 ? <View style={{ height: 1, backgroundColor: theme.color.border }} /> : null}
                <Row
                  title={text.title}
                  subtitle={
                    text.body
                      ? `${withoutFullStop(text.body)} · ${friendlyDay(n.createdAt)}`
                      : friendlyDay(n.createdAt)
                  }
                  left={
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: theme.radius.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor:
                          n.kind === 'conflict_detected'
                            ? theme.color.dangerSoft
                            : theme.color.primarySoft,
                      }}
                    >
                      <Icon
                        name={ICON[n.kind]}
                        size={18}
                        tone={n.kind === 'conflict_detected' ? 'danger' : 'primary'}
                      />
                    </View>
                  }
                  right={
                    !n.readAt ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: theme.color.primary,
                        }}
                      />
                    ) : undefined
                  }
                  onPress={() => {
                    markRead(n.id);
                    if (n.kind === 'special_day' && n.dayKey) {
                      track({ name: 'special_day_opened', day: n.dayKey });
                      router.push(`/special-day/${n.dayKey}`);
                    } else if (n.eventId) router.push(`/event/${n.eventId}`);
                  }}
                />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
