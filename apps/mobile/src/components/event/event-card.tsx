import { Image } from 'expo-image';
import { View } from 'react-native';

import { useApp } from '@/data/store';
import { isClosedCapsule, isSealed } from '@/domain/capsules';
import { CATEGORY_BY_ID } from '@/domain/categories';
import { isPendingSurprise } from '@/domain/surprises';
import type { FamilyEvent } from '@/domain/types';
import { formatDuration } from '@/domain/voice';
import { tf } from '@/i18n';
import { eventTimeLabel, friendlyDay } from '@/lib/date';
import { coverAspect } from '@/lib/media';
import { usePhotoTransition } from '@/lib/motion';
import { useTheme } from '@/theme';
import { AvatarStack } from '../ui/avatar';
import { CategoryChip } from '../ui/chip';
import { Icon } from '../ui/icon';
import { Card } from '../ui/surface';
import { Text } from '../ui/text';
import { VisibilityBadge } from './visibility-badge';
import { NewMark } from './whats-new';

/**
 * The event card in the timeline, as the design draws it
 * (`design/screens/design_Screenshot_2026-07-01_at_20_53_15_1.png`).
 *
 * One card, two materials: the photograph fills the top and runs to the card's
 * own rounded edge, and the words sit on white below it. That white block
 * against the paper ground is the whole visual system — it is what stops the
 * screen reading as a feed and starts it reading as something mounted on a page.
 *
 * The order is the one docs/04-DESIGN-BRIEF.md fixes and design does not change:
 *   photograph · category and time · title · story · who · who can see · replies
 */
export function EventCard({
  event,
  onPress,
  isNew = false,
}: {
  event: FamilyEvent;
  onPress?: () => void;
  /** Added by somebody else since this person last looked (domain/whats-new.ts). */
  isNew?: boolean;
}) {
  const theme = useTheme();
  const photoFade = usePhotoTransition();
  const members = useApp((s) => s.members);
  const me = useApp((s) => s.session?.activeMemberId);

  // A time capsule still closed to this viewer arrives as its envelope, and
  // is drawn as one; the author's own shows when it opens.
  const sealed = isSealed(event, me);
  const ownCapsule = !sealed && isClosedCapsule(event);
  // A surprise is shown to everybody but the one it is for - so say who that is.
  const surpriseFor = isPendingSurprise(event)
    ? members.find((m) => m.id === event.hiddenFromMemberId)
    : undefined;

  const participants = event.participantMemberIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m);

  const cover = event.attachments[0];
  const extraMedia = event.attachments.length - 1;
  const voiceSeconds = (event.voiceNotes ?? []).reduce((sum, n) => sum + (n.durationSec ?? 0), 0);

  return (
    <Card onPress={onPress} padded={false}>
      {cover ? (
        <View style={{ backgroundColor: theme.color.surfaceMuted }}>
          <Image
            source={{ uri: cover.thumbnailUrl ?? cover.url }}
            style={{ width: '100%', aspectRatio: coverAspect(cover) }}
            contentFit="cover"
            transition={photoFade}
          />

          {extraMedia > 0 ? (
            <View
              style={{
                position: 'absolute',
                right: theme.spacing.md,
                bottom: theme.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.onMedia.scrim,
              }}
            >
              <Icon name="photo" size={12} color={theme.onMedia.text} />
              <Text variant="label" style={{ color: theme.onMedia.text }}>
                +{extraMedia}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {/* Category and time, on one line at the top of the white. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <CategoryChip categoryId={event.categoryId} />
          {event.isMilestone ? <Icon name="star" size={15} color={theme.color.accentText} /> : null}
          {isNew ? <NewMark /> : null}
          <View style={{ flex: 1 }} />
          {event.repeat ? <Icon name="repeat" size={14} tone="muted" /> : null}
          <Text variant="caption" tone="muted">
            {eventTimeLabel(event.startsAt, event.allDay)}
          </Text>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="title" numberOfLines={2}>
            {event.title}
          </Text>

          {sealed && event.sealedUntil ? (
            <KeepsakeLine icon="capsule">
              {tf('capsule.sealedLine', friendlyDay(event.sealedUntil))}
            </KeepsakeLine>
          ) : event.description ? (
            <Text variant="read" tone="muted" numberOfLines={2}>
              {event.description}
            </Text>
          ) : null}

          {ownCapsule && event.sealedUntil ? (
            <KeepsakeLine icon="capsule">
              {tf('capsule.ownLine', friendlyDay(event.sealedUntil))}
            </KeepsakeLine>
          ) : null}
          {surpriseFor && event.revealAt ? (
            <KeepsakeLine icon="gift">
              {tf('surprise.pendingLine', surpriseFor.displayName, friendlyDay(event.revealAt))}
            </KeepsakeLine>
          ) : null}
        </View>

        {/* Who was there — the design names them rather than leaving a row of
            initials to be decoded. */}
        {participants.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <AvatarStack
              people={participants.map((m) => ({ name: m.displayName, url: m.avatarUrl }))}
            />
            <Text variant="body" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {participants.map((m) => m.displayName).join(', ')}
            </Text>
          </View>
        ) : null}

        {/* Who can see it, and what the family said back. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <VisibilityBadge visibility={event.visibility} compact />
          </View>

          {event.reactions.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <Icon name="heart" size={14} color={theme.color.danger} />
              <Text variant="caption" tone="muted">
                {event.reactions.length}
              </Text>
            </View>
          ) : null}

          {event.commentCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <Icon name="comment" size={14} tone="muted" />
              <Text variant="caption" tone="muted">
                {event.commentCount}
              </Text>
            </View>
          ) : null}

          {/* There is somebody's voice inside - worth knowing from the list. */}
          {voiceSeconds > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <Icon name="mic" size={14} tone="muted" />
              <Text variant="caption" tone="muted">
                {formatDuration(voiceSeconds)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * One line that says what kind of keepsake this is - a sealed capsule, a
 * surprise still kept from somebody - in the accent the design keeps for
 * small confirmations, so it reads as a property of the card, not a warning.
 */
function KeepsakeLine({ icon, children }: { icon: 'capsule' | 'gift'; children: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <Icon name={icon} size={14} color={theme.color.accentText} />
      <Text variant="caption" style={{ color: theme.color.accentText, flex: 1 }} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

/** Compact row for the calendar day list and search results. */
export function EventRow({ event, onPress }: { event: FamilyEvent; onPress?: () => void }) {
  const theme = useTheme();
  const tone = theme.tone[CATEGORY_BY_ID[event.categoryId].tone];

  return (
    <Card onPress={onPress} elevation="flat" padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.md,
        }}
      >
        <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: tone.fg }} />

        <View style={{ flex: 1, gap: 2 }}>
          {/* Two lines: a family's titles are sentences, and one line cut
              "Emīlijas pirmā skolas diena" in half on a phone. */}
          <Text variant="cardTitle" numberOfLines={2}>
            {event.title}
          </Text>
          {/* The details wrap as whole pieces - never a date broken over three
              lines because the audience beside it is long. The comment count
              is the timeline card's: a bubble and a number. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: theme.spacing.sm,
              rowGap: 2,
            }}
          >
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {eventTimeLabel(event.startsAt, event.allDay)}
            </Text>
            <VisibilityBadge visibility={event.visibility} compact />
            {event.commentCount > 0 ? (
              <View
                accessible
                accessibilityLabel={tf('timeline.comments', event.commentCount)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
              >
                <Icon name="comment" size={13} tone="muted" />
                <Text variant="caption" tone="muted">
                  {event.commentCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Icon name="forward" size={16} tone="muted" />
      </View>
    </Card>
  );
}
