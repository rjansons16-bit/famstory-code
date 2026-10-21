import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { VoiceNote } from '@/components/event/voice-note';
import { CategoryChip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { getApi } from '@/data/backend';
import type { Attachment, GuestView } from '@/domain/types';
import { t, tf } from '@/i18n';
import { eventTimeLabel, timeOfDay } from '@/lib/date';
import { coverAspect } from '@/lib/media';
import { usePhotoTransition } from '@/lib/motion';
import { useTheme } from '@/theme';

/**
 * WHAT A GUEST SEES - one event, from a link somebody in the family made.
 *
 * No account, no sign-in, no app: the grandmother who will never install
 * anything opens a link in her browser and sees the birthday. The words, the
 * date and the photographs, and nothing else - not who was there, not who
 * else can see it, not what anybody said (apps/api/src/modules/guest).
 *
 * A link that has expired or been withdrawn says so plainly, with what to do.
 */
export default function GuestEvent() {
  const theme = useTheme();
  const photoFade = usePhotoTransition();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [view, setView] = useState<GuestView | null | undefined>(() => (getApi() ? undefined : null));

  useEffect(() => {
    const api = getApi();
    if (!api || !token) return;
    let cancelled = false;
    api
      .openGuestLink(token)
      .then((answer) => {
        if (!cancelled) setView(answer);
      })
      .catch(() => {
        if (!cancelled) setView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (view === undefined) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.color.primary} />
        </View>
      </Screen>
    );
  }

  if (view === null) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.md }}>
          <Icon name="link" size={40} tone="muted" />
          <Text variant="title" align="center">
            {t('guest.invalidTitle')}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {t('guest.invalidBody')}
          </Text>
        </View>
      </Screen>
    );
  }

  const { event } = view;
  const [cover, ...rest] = event.photos;

  return (
    <Screen edges={['top', 'bottom']} scroll>
      {view.heirloom ? (
        <Text variant="label" tone="primary">
          {t('guest.heirloom')}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {tf('guest.sharedBy', view.sharedBy, view.familyName)}
      </Text>

      {cover ? (
        <Image
          source={{ uri: cover.url }}
          style={{
            width: '100%',
            aspectRatio: coverAspect(asAttachment(cover), theme.media.detail),
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.surfaceMuted,
          }}
          contentFit="cover"
          transition={photoFade}
        />
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <CategoryChip categoryId={event.categoryId} />
          <View style={{ flex: 1 }} />
          <Text variant="caption" tone="muted">
            {eventTimeLabel(event.startsAt, event.allDay)}
            {event.endsAt && !event.allDay ? ` – ${timeOfDay(event.endsAt)}` : ''}
          </Text>
        </View>
        <Text variant="title">{event.title}</Text>
        {event.description ? <Text variant="read">{event.description}</Text> : null}
        {/* Only an heirloom sticker carries a voice; an ordinary link never does. */}
        {(event.voiceNotes ?? []).map((note) => (
          <VoiceNote
            key={note.url}
            note={{ id: note.url, kind: 'audio', url: note.url, durationSec: note.durationSec ?? undefined }}
          />
        ))}
      </View>

      {rest.map((photo) => (
        <Image
          key={photo.url}
          source={{ uri: photo.url }}
          style={{
            width: '100%',
            aspectRatio: coverAspect(asAttachment(photo), theme.media.detail),
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.surfaceMuted,
          }}
          contentFit="cover"
          transition={photoFade}
        />
      ))}

      <Text variant="caption" tone="muted" align="center">
        {t('guest.footer')}
      </Text>
    </Screen>
  );
}

/** A guest's photograph in the shape the app's own layout helpers take. */
function asAttachment(photo: GuestView['event']['photos'][number]): Attachment {
  return {
    id: photo.url,
    kind: 'image',
    url: photo.url,
    thumbnailUrl: photo.thumbnailUrl,
    width: photo.width ?? undefined,
    height: photo.height ?? undefined,
  };
}
