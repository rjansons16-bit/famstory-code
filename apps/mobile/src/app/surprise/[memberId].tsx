import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VoiceNote } from '@/components/event/voice-note';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useCurrentMember, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { wishesFor } from '@/domain/surprises';
import type { FamilyEvent } from '@/domain/types';
import { can } from '@/domain/visibility';
import { t, tf } from '@/i18n';
import { friendlyDay } from '@/lib/date';
import { coverAspect } from '@/lib/media';
import { usePhotoTransition } from '@/lib/motion';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * THE BOOK OF BIRTHDAY WISHES (domain/surprises.ts).
 *
 * Before the day, the family sees what the others have written and adds
 * theirs; the one it is for cannot open this at all - the server does not
 * send them a single wish until the morning. On the morning, it is their book:
 * every wish in the order it was written, with its photograph and its voice.
 */
export default function SurpriseBook() {
  const router = useRouter();
  // Fixed when the book is opened: render must not read the clock.
  const [openedAt] = useState(() => Date.now());
  const { memberId, at } = useLocalSearchParams<{ memberId: string; at?: string }>();
  const members = useApp((s) => s.members);
  const visible = useVisibleEvents();
  const me = useCurrentMember();

  const person = members.find((m) => m.id === memberId);
  const day = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : null;
  // Keyed on `at`, the day as text: a Date is a new object on every render.
  const wishes = useMemo(() => {
    const on = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : null;
    return person && on ? wishesFor(visible, person.id, on) : [];
  }, [visible, person, at]);

  const isTheirBook = !!me && me.id === memberId;
  const stillSecret = !!day && day.getTime() > openedAt;

  // Opened by the one it is for: the only moment this feature exists for.
  const opened = isTheirBook && !stillSecret && wishes.length > 0;
  useEffect(() => {
    if (opened) track({ name: 'surprise_opened', wishes: wishes.length });
  }, [opened, wishes.length]);

  if (!person || !day) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="—" onBack={() => goBack(router)} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={tf('surprise.bookTitle', person.displayName)} onBack={() => goBack(router)} />

      {stillSecret ? (
        <Text variant="body" tone="muted">
          {tf('surprise.bookHint', person.displayName, friendlyDay(day.toISOString()))}
        </Text>
      ) : null}

      {wishes.length === 0 ? (
        <Text variant="body" tone="muted">
          {t('surprise.nobodyYet')}
        </Text>
      ) : null}

      {wishes.map((wish) => (
        <Wish key={wish.id} wish={wish} onOpen={() => router.push(`/event/${wish.id}`)} />
      ))}

      {stillSecret && !isTheirBook && me && can(me, 'event.create') ? (
        <Button
          label={t('surprise.addMine')}
          icon="gift"
          onPress={() =>
            router.push(
              `/event/new?surpriseFor=${person.id}&revealAt=${encodeURIComponent(day.toISOString())}`,
            )
          }
        />
      ) : null}
    </Screen>
  );
}

/** One wish: who wrote it, what they said, and what they showed or told. */
function Wish({ wish, onOpen }: { wish: FamilyEvent; onOpen: () => void }) {
  const theme = useTheme();
  const photoFade = usePhotoTransition();
  const author = useApp((s) => s.members.find((m) => m.id === wish.authorMemberId));
  const photo = wish.attachments[0];

  return (
    <Card onPress={onOpen} padded={false}>
      {photo ? (
        <Image
          source={{ uri: photo.thumbnailUrl ?? photo.url }}
          style={{ width: '100%', aspectRatio: coverAspect(photo) }}
          contentFit="cover"
          transition={photoFade}
        />
      ) : null}
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Avatar name={author?.displayName ?? '?'} url={author?.avatarUrl} size="sm" />
          <Text variant="heading">{author?.displayName}</Text>
        </View>
        <Text variant="title">{wish.title}</Text>
        {wish.description ? <Text variant="read">{wish.description}</Text> : null}
        {(wish.voiceNotes ?? []).map((note) => (
          <VoiceNote key={note.id} note={note} />
        ))}
      </View>
    </Card>
  );
}
