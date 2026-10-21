import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';

import { GuestLinkSheet } from '@/components/event/guest-link-sheet';
import { lifeQuestionText } from '@/components/event/life-story-text';
import { promptText } from '@/components/event/weekly-question';
import { VisibilityBadge } from '@/components/event/visibility-badge';
import { VoiceNote } from '@/components/event/voice-note';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { CategoryChip } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/icon';
import { Card, Divider, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp, useCurrentMember } from '@/data/store';
import { isClosedCapsule, isSealed } from '@/domain/capsules';
import { isLifeStoryKey } from '@/domain/lifestory';
import type { ReactionKind } from '@/domain/types';
import { isPromptKey } from '@/domain/prompts';
import { isPendingSurprise } from '@/domain/surprises';
import { asOccurrence, occurrencesBetween, timelinePlace } from '@/domain/recurrence';
import { canDeleteEvent, canEditEvent, can } from '@/domain/visibility';
import { t, tf } from '@/i18n';
import { eventTimeLabel, friendlyDay, reminderLabel, repeatLabel, timeOfDay } from '@/lib/date';
import { confirm, notify } from '@/lib/dialog';
import { coverAspect } from '@/lib/media';
import { usePhotoTransition } from '@/lib/motion';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/**
 * The reactions, and the words for them.
 *
 * The label is not optional: these four buttons carry an icon and a number and
 * nothing else, so without it a screen reader announces "button, 1" four times
 * on the screen where a family says the only thing it came to say.
 */
const REACTIONS: {
  kind: ReactionKind;
  icon: 'heart' | 'smile' | 'clap' | 'wow';
  labelKey: Parameters<typeof t>[0];
}[] = [
  { kind: 'heart', icon: 'heart', labelKey: 'reaction.heart' },
  { kind: 'smile', icon: 'smile', labelKey: 'reaction.smile' },
  { kind: 'clap', icon: 'clap', labelKey: 'reaction.clap' },
  { kind: 'wow', icon: 'wow', labelKey: 'reaction.wow' },
];

/**
 * EVENT DETAIL — where a memory is read
 * (`design/screens/design_Screenshot_2026-07-02_at_19_02_06_1.png`).
 *
 * The photograph takes the top of the screen, edge to edge, and the controls
 * float on it: the design gives the memory the whole width before it gives you
 * anything to read. Everything after that is one column on the paper.
 */
export default function EventDetail() {
  const theme = useTheme();
  const photoFade = usePhotoTransition();
  const router = useRouter();
  // `on` is the day of one occurrence, when this was opened from a series in
  // the calendar or the timeline.
  const { id, on } = useLocalSearchParams<{ id: string; on?: string }>();

  const series = useApp((s) => s.events.find((e) => e.id === id));
  // The occurrence being looked at, for a series: its own date and time.
  const event = useMemo(() => {
    if (!series?.repeat) return series;
    if (on) {
      const [y, m, d] = on.split('-').map(Number);
      const found = occurrencesBetween(
        series,
        new Date(y, m - 1, d - 1),
        new Date(y, m - 1, d + 2),
      ).find((o) => o.day === on);
      if (found) return asOccurrence(series, found);
    }
    return timelinePlace(series);
  }, [series, on]);
  const loadComments = useApp((s) => s.loadComments);
  const markEventOpened = useApp((s) => s.markEventOpened);
  const viewerId = useApp((s) => s.session?.activeMemberId);
  // A time capsule still closed to this viewer is only its envelope: nothing
  // inside to read, and no conversation to load - the server would refuse it.
  const envelope = series ? isSealed(series, viewerId) : false;

  // Comments are not part of the timeline load — fifty events would be fifty
  // requests for conversations nobody has scrolled to. They arrive when the
  // event is opened. A no-op on the mock backend, where they are already here.
  // Opening it is also what makes it no longer "new" (domain/whats-new.ts).
  useEffect(() => {
    if (!id) return;
    if (!envelope) void loadComments(id);
    markEventOpened(id);
  }, [id, envelope, loadComments, markEventOpened]);
  const members = useApp((s) => s.members);
  const allComments = useApp((s) => s.comments);
  // Whom this person blocked: what they wrote is not shown here (docs/02-DATA-MODEL.md, Blocks).
  const blocked = useApp((s) => s.blockedMemberIds);
  const comments = useMemo(
    () => allComments.filter((c) => c.eventId === id && !blocked.includes(c.authorMemberId)),
    [allComments, id, blocked],
  );
  const addComment = useApp((s) => s.addComment);
  const blockMember = useApp((s) => s.blockMember);
  const toggleReaction = useApp((s) => s.toggleReaction);
  const deleteEvent = useApp((s) => s.deleteEvent);
  const skipOccurrence = useApp((s) => s.skipOccurrence);
  const stopRepeatingFrom = useApp((s) => s.stopRepeatingFrom);
  const me = useCurrentMember();

  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!event || !me || blocked.includes(event.authorMemberId)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <IconButton name="back" accessibilityLabel={t('common.back')} onPress={() => goBack(router)} />
        <Text variant="body" tone="muted">
          {event && me ? t('block.hidden') : '—'}
        </Text>
      </Screen>
    );
  }

  const author = members.find((m) => m.id === event.authorMemberId);
  const reactions = event.reactions.filter((r) => !blocked.includes(r.memberId));
  const participants = event.participantMemberIds
    .map((pid) => members.find((m) => m.id === pid))
    .filter((m): m is NonNullable<typeof m> => !!m);

  const myReaction = event.reactions.find((r) => r.memberId === me.id);
  const cover = event.attachments[0];
  const rest = event.attachments.slice(1);
  // Nobody edits what they may not read (the server refuses it too).
  const canEdit = canEditEvent(event, me) && !isSealed(event, me.id);
  const canDelete = canDeleteEvent(event, me);
  // Handing an event to somebody outside the family is the author's call, or
  // an admin's - not anybody who merely can see it. The server holds the same line.
  const canShareOutside = event.authorMemberId === me.id || me.role === 'admin';

  const sealed = isSealed(event, me.id);
  // Somebody else's entry can be reported (App Review 1.2). Your own you can
  // delete, and a sealed capsule is not anybody's to read yet.
  const canReport = event.authorMemberId !== me.id && !sealed;
  const ownCapsule = !sealed && isClosedCapsule(event);
  const surpriseFor = isPendingSurprise(event)
    ? members.find((m) => m.id === event.hiddenFromMemberId)
    : undefined;
  // An heirloom sticker lives for a century: never on something that is not
  // yet the family's to read. The server refuses it too.
  const canSticker = canShareOutside && !isClosedCapsule(event) && !isPendingSurprise(event);

  async function confirmDelete() {
    setMenuOpen(false);
    const ok = await confirm({
      title: t('common.delete'),
      message: t('event.deleteConfirm'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;

    // The undo bar takes it from here — mounted at the root, so it survives
    // this screen going away.
    deleteEvent(event!.id);
    goBack(router);
  }

  /** The author, out of this person's view - and this entry with them, so back it goes. */
  async function confirmBlock() {
    setMenuOpen(false);
    if (!author) return;
    const ok = await confirm({
      title: t('block.confirmTitle'),
      message: tf('block.confirm', author.displayName),
      confirmLabel: t('block.action'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    blockMember(author.id);
    goBack(router);
  }

  /** One occurrence out, or the series ended before it. Both leave the past alone. */
  function changeSeries(action: 'skip' | 'stop') {
    setMenuOpen(false);
    const day = event!.occurrenceDay;
    if (!day) return;
    if (action === 'skip') skipOccurrence(event!.id, day);
    else stopRepeatingFrom(event!.id, day);
    notify(event!.title, action === 'skip' ? t('repeat.skipped') : t('repeat.stopped'));
    goBack(router);
  }

  return (
    <Screen edges={cover ? ['bottom'] : ['top', 'bottom']} padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          // Room for the comment pill, which floats over the end of the column.
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
          showsVerticalScrollIndicator={false}
        >
          {cover ? (
            <View style={{ backgroundColor: theme.color.surfaceMuted }}>
              <Image
                source={{ uri: cover.url }}
                style={{ width: '100%', aspectRatio: coverAspect(cover, theme.media.detail) }}
                contentFit="cover"
                transition={photoFade}
              />
            </View>
          ) : null}

          {/* Back and the menu. Over a photograph they wear a white disc so they
              stay legible whatever the picture is doing underneath. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: theme.spacing.lg,
              ...(cover
                ? { position: 'absolute', top: theme.spacing.xxl, left: 0, right: 0 }
                : { paddingTop: theme.spacing.sm }),
            }}
          >
            <DiscButton
              name="back"
              label={t('common.back')}
              onDisc={!!cover}
              onPress={() => goBack(router)}
            />
            {canEdit || canDelete || canShareOutside || canReport ? (
              <DiscButton
                name="more"
                label={t('common.more')}
                onDisc={!!cover}
                onPress={() => setMenuOpen(true)}
              />
            ) : null}
          </View>

          <View
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.lg,
              gap: theme.spacing.lg,
            }}
          >
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <CategoryChip categoryId={event.categoryId} />
                {event.isMilestone ? (
                  <Icon name="star" size={16} color={theme.color.accentText} />
                ) : null}
                <View style={{ flex: 1 }} />
                <Text variant="caption" tone="muted">
                  {eventTimeLabel(event.startsAt, event.allDay)}
                  {event.endsAt && !event.allDay ? ` – ${timeOfDay(event.endsAt)}` : ''}
                </Text>
              </View>

              {/* The question it answers, when it answers one - the title may
                  have been changed, and the question is part of the story. */}
              {isPromptKey(event.promptKey) ? (
                <Text variant="caption" tone="primary">
                  {tf('prompts.answerTo', promptText(event.promptKey))}
                </Text>
              ) : null}
              {isLifeStoryKey(event.promptKey) ? (
                <Text variant="caption" tone="primary">
                  {tf('prompts.answerTo', lifeQuestionText(event.promptKey))}
                </Text>
              ) : null}

              {/* The one place Fraunces earns its keep: what the family wrote. */}
              <Text variant="title">{event.title}</Text>

              {/* Who was there and who can see it, on one line — the design puts
                  them side by side because they answer the same question from
                  two ends. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                {participants.length > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <AvatarStack
                      people={participants.map((m) => ({ name: m.displayName, url: m.avatarUrl }))}
                    />
                    <Text variant="body" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                      {participants.map((m) => m.displayName).join(', ')}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <VisibilityBadge visibility={event.visibility} compact />
              </View>
            </View>

            {sealed && event.sealedUntil ? (
              <Card elevation="flat">
                <View style={{ gap: theme.spacing.sm, alignItems: 'flex-start' }}>
                  <Icon name="capsule" size={28} color={theme.color.accentText} />
                  <Text variant="heading">{tf('capsule.opensOn', friendlyDay(event.sealedUntil))}</Text>
                  {author ? (
                    <Text variant="body" tone="muted">
                      {tf('capsule.sealedBy', author.displayName)}
                    </Text>
                  ) : null}
                  <Text variant="body" tone="muted">
                    {t('capsule.envelopeBody')}
                  </Text>
                </View>
              </Card>
            ) : null}
            {ownCapsule && event.sealedUntil ? (
              <KeepsakeNote icon="capsule">
                {tf('capsule.ownLine', friendlyDay(event.sealedUntil))}
              </KeepsakeNote>
            ) : null}
            {surpriseFor && event.revealAt ? (
              <KeepsakeNote icon="gift">
                {tf('surprise.pendingLine', surpriseFor.displayName, friendlyDay(event.revealAt))}
              </KeepsakeNote>
            ) : null}

            {event.description ? <Text variant="read">{event.description}</Text> : null}

            {/* Told rather than written - right under the words, where the
                story is. */}
            {event.voiceNotes && event.voiceNotes.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                {event.voiceNotes.map((note) => (
                  <VoiceNote key={note.id} note={note} />
                ))}
              </View>
            ) : null}

            {/* The rest of the set. Each keeps its own shape — a portrait stays
                a portrait instead of being cropped into everyone else's box. */}
            {rest.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {rest.map((a) => (
                    <Image
                      key={a.id}
                      source={{ uri: a.url }}
                      style={{
                        height: theme.size.mediaStrip,
                        width: theme.size.mediaStrip * coverAspect(a, theme.media.detail),
                        borderRadius: theme.radius.lg,
                        backgroundColor: theme.color.surfaceMuted,
                      }}
                      contentFit="cover"
                      transition={photoFade}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : null}

            {event.repeat ? (
              <Card elevation="flat">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Icon name="repeat" size={16} tone="muted" />
                  <Text variant="body" tone="muted" style={{ flex: 1 }}>
                    {event.repeatUntil
                      ? `${repeatLabel(event.repeat)} · ${tf('repeat.untilDay', friendlyDay(event.repeatUntil))}`
                      : repeatLabel(event.repeat)}
                  </Text>
                </View>
              </Card>
            ) : null}

            {event.reminder?.enabled ? (
              <Card elevation="flat">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Icon name="bell" size={16} tone="muted" />
                  <Text variant="body" tone="muted">
                    {reminderLabel(event.reminder.minutesBefore)}
                  </Text>
                </View>
              </Card>
            ) : null}

            {sealed ? null : (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {REACTIONS.map((r) => {
                const count = reactions.filter((x) => x.kind === r.kind).length;
                const mine = myReaction?.kind === r.kind;
                return (
                  <Touchable
                    key={r.kind}
                    accessibilityRole="button"
                    accessibilityLabel={
                      count > 0 ? `${t(r.labelKey)} · ${count}` : t(r.labelKey)
                    }
                    accessibilityState={{ selected: mine }}
                    onPress={() => toggleReaction(event.id, r.kind)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radius.pill,
                      backgroundColor: mine ? theme.color.primarySoft : theme.color.surfaceMuted,
                    }}
                  >
                    <Icon
                      name={r.icon}
                      size={16}
                      color={mine ? theme.color.primary : theme.color.textMuted}
                    />
                    {count > 0 ? (
                      <Text variant="label" tone={mine ? 'primary' : 'muted'}>
                        {count}
                      </Text>
                    ) : null}
                  </Touchable>
                );
              })}
            </View>
            )}

            <Divider />

            {sealed ? null : (
            <View style={{ gap: theme.spacing.lg }}>
              <Text variant="body" tone="muted">
                {comments.length === 0
                  ? t('event.noComments')
                  : tf('timeline.comments', comments.length)}
              </Text>

              {comments.map((c) => {
                const cAuthor = members.find((m) => m.id === c.authorMemberId);
                return (
                  <View key={c.id} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <Avatar name={cAuthor?.displayName ?? '?'} url={cAuthor?.avatarUrl} size="sm" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.spacing.sm,
                        }}
                      >
                        <Text variant="heading">{cAuthor?.displayName}</Text>
                        <Text variant="caption" tone="muted">
                          · {friendlyDay(c.createdAt)}
                        </Text>
                        {/* Somebody else's words can be reported; your own you can take back. */}
                        {c.authorMemberId !== me.id ? (
                          <Touchable
                            accessibilityRole="button"
                            onPress={() => router.push(`/report?target=comment&id=${encodeURIComponent(c.id)}`)}
                            hitSlop={8}
                            style={{ marginLeft: 'auto' }}
                          >
                            <Text variant="caption" tone="muted">
                              {t('report.comment')}
                            </Text>
                          </Touchable>
                        ) : null}
                      </View>
                      <Text variant="read">{c.body}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            )}

            <Text variant="caption" tone="muted">
              {t('event.by')} {author?.displayName}
            </Text>
          </View>
        </ScrollView>

        {/* A pill with a round send button inside it, as the design draws it —
            not a bordered form field with an icon beside it. */}
        {can(me, 'comment.create') && !sealed ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.sm,
              paddingBottom: theme.spacing.sm,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.color.surface,
                borderWidth: 1,
                borderColor: theme.color.border,
                paddingLeft: theme.spacing.lg,
                paddingRight: theme.spacing.xs,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <TextInput
                placeholder={t('event.addComment')}
                placeholderTextColor={theme.color.textMuted}
                value={draft}
                onChangeText={setDraft}
                maxLength={2000}
                style={{
                  flex: 1,
                  color: theme.color.text,
                  minHeight: theme.size.touchTarget - theme.spacing.sm,
                  ...theme.typography.body,
                }}
              />
              <Touchable
                accessibilityRole="button"
                accessibilityLabel={t('common.add')}
                give="round"
                disabled={!draft.trim()}
                onPress={() => {
                  addComment(event.id, draft);
                  setDraft('');
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: draft.trim()
                    ? theme.color.primary
                    : theme.color.surfaceMuted,
                }}
              >
                <Icon
                  name="send"
                  size={20}
                  color={draft.trim() ? theme.color.textOnPrimary : theme.color.textMuted}
                />
              </Touchable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* The "…" opens words, not more icons. */}
      <Sheet visible={menuOpen} title={event.title} onClose={() => setMenuOpen(false)}>
        <View>
          {canShareOutside ? (
            <>
              <Row
                title={t('guest.share')}
                left={<Icon name="link" tone="muted" />}
                onPress={() => {
                  setMenuOpen(false);
                  setSharing(true);
                }}
              />
              {canSticker ? (
                <>
                  <Divider />
                  <Row
                    title={t('sticker.menu')}
                    left={<Icon name="qr" tone="muted" />}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push(`/sticker/${event.id}`);
                    }}
                  />
                </>
              ) : null}
              {canEdit || canDelete ? <Divider /> : null}
            </>
          ) : null}
          {canEdit ? (
            <Row
              title={t('common.edit')}
              left={<Icon name="edit" tone="muted" />}
              onPress={() => {
                setMenuOpen(false);
                router.push(`/event/new?edit=${event.id}`);
              }}
            />
          ) : null}
          {canEdit && event.repeat && event.occurrenceDay ? (
            <>
              <Divider />
              <Row
                title={t('repeat.skipOne')}
                subtitle={t('repeat.skipOneHint')}
                left={<Icon name="skip" tone="muted" />}
                onPress={() => changeSeries('skip')}
              />
              <Divider />
              <Row
                title={t('repeat.stopHere')}
                subtitle={t('repeat.stopHereHint')}
                left={<Icon name="stop" tone="muted" />}
                onPress={() => changeSeries('stop')}
              />
            </>
          ) : null}
          {canEdit && canDelete ? <Divider /> : null}
          {canDelete ? (
            <Row
              title={t('common.delete')}
              left={<Icon name="delete" tone="danger" />}
              danger
              onPress={confirmDelete}
            />
          ) : null}
          {canReport ? (
            <>
              {canShareOutside || canEdit || canDelete ? <Divider /> : null}
              <Row
                title={t('report.event')}
                left={<Icon name="warning" tone="muted" />}
                onPress={() => {
                  setMenuOpen(false);
                  router.push(`/report?target=event&id=${encodeURIComponent(event.id)}`);
                }}
              />
            </>
          ) : null}
          {/* Not only this entry but whoever wrote it: App Review 1.2 asks for both. */}
          {event.authorMemberId !== me.id && author ? (
            <>
              <Divider />
              <Row
                title={t('block.author')}
                subtitle={author.displayName}
                left={<Icon name="block" tone="muted" />}
                onPress={() => void confirmBlock()}
              />
            </>
          ) : null}
        </View>
      </Sheet>

      <GuestLinkSheet event={event} visible={sharing} onClose={() => setSharing(false)} />
    </Screen>
  );
}

/** One line saying what kind of keepsake this is, in the accent kept for such marks. */
function KeepsakeNote({ icon, children }: { icon: IconName; children: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Icon name={icon} size={16} color={theme.color.accentText} />
      <Text variant="body" style={{ color: theme.color.accentText, flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/** A control that sits on a photograph, or plainly on the paper when there is none. */
function DiscButton({
  name,
  label,
  onDisc,
  onPress,
}: {
  name: IconName;
  label: string;
  onDisc: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  if (!onDisc) {
    return <IconButton name={name} accessibilityLabel={label} onPress={onPress} />;
  }

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: theme.size.touchTarget,
        height: theme.size.touchTarget,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.shadow.card,
      }}
    >
      <Icon name={name} size={20} />
    </Touchable>
  );
}
