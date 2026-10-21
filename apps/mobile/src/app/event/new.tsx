import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DatePickerSheet } from '@/components/calendar/date-picker';
import {
  CategoryPickerSheet,
  ParticipantPickerSheet,
  ReminderPickerSheet,
  RepeatPickerSheet,
  VisibilityPickerSheet,
} from '@/components/event/pickers';
import { AvatarStack } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { TagPicker } from '@/components/event/tag-picker';
import { lifeQuestionText } from '@/components/event/life-story-text';
import { VoiceNote } from '@/components/event/voice-note';
import { promptText } from '@/components/event/weekly-question';
import { Sheet, SuggestionBanner } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Field, SwitchRow } from '@/components/ui/input';
import { SelectBox } from '@/components/ui/select-box';
import { Card, Divider, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useLocale } from '@/data/locale';
import { persistedDraft } from '@/data/persist';
import { useApp, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { COMING_OF_AGE, capsuleOptions, openingMoment } from '@/domain/capsules';
import { CATEGORY_BY_ID, suggestCategory } from '@/domain/categories';
import { conflictKey, findConflict } from '@/domain/conflicts';
import { chapterOf, isLifeStoryKey } from '@/domain/lifestory';
import { limitsFor, isWithinLimit } from '@/domain/plans';
import { isPromptKey } from '@/domain/prompts';
import type { CategoryId, FamilyEvent, RepeatRule, Visibility } from '@/domain/types';
import { defaultVisibilityFor } from '@/domain/visibility';
import { VOICE_NOTE_MAX_SECONDS, appendDictation, formatDuration, speechLanguage } from '@/domain/voice';
import { t, tf } from '@/i18n';
import {
  eventTimeLabel,
  friendlyDay,
  reminderAlreadyDue,
  reminderLabel,
  repeatLabel,
  timeOfDay,
} from '@/lib/date';
import { confirm, notify } from '@/lib/dialog';
import {
  dictationAvailability,
  dictationNoticeSeen,
  rememberDictationNotice,
  useDictation,
} from '@/lib/dictation';
import { MIN_TEXT_LENGTH, isLongEnough } from '@/lib/form';
import { goBack } from '@/lib/navigation';
import { recorderAvailability, useVoiceRecorder, type Recording } from '@/lib/recorder';
import { askForReviewAfter } from '@/lib/review';
import { useTheme } from '@/theme';

/**
 * EVENT COMPOSER — the most important flow in the product.
 *
 * User flow 3 in the feasibility study fixes the order of the steps:
 *   title -> date -> description -> photos -> participants -> visibility -> save
 *
 * That order is kept here. Visibility sits BEFORE the save button, not hidden
 * under "advanced settings" — a deliberate product decision.
 *
 * DESIGN NOTE: this screen must not look like a form. It should look like a
 * note. If it feels like filling in paperwork, events per month will not reach
 * the KPI (5-10).
 */
export default function NewEvent() {
  const theme = useTheme();
  const router = useRouter();

  // `?edit=<id>` turns this screen into the edit screen. One composer, two
  // modes — a separate edit screen would drift out of sync with this one the
  // first time a field is added.
  const params = useLocalSearchParams<{
    edit?: string;
    prompt?: string;
    surpriseFor?: string;
    revealAt?: string;
    lifestory?: string;
    about?: string;
  }>();
  const { edit, prompt } = params;
  // Answering the question of the week: the question is the first line, and
  // the entry remembers which question it answers (domain/prompts.ts).
  const answering = !edit && isPromptKey(prompt) ? prompt : undefined;

  const members = useApp((s) => s.members);
  const groups = useApp((s) => s.groups);
  const events = useApp((s) => s.events);
  const family = useApp((s) => s.family);
  const addEvent = useApp((s) => s.addEvent);
  const updateEvent = useApp((s) => s.updateEvent);
  const registerPush = useApp((s) => s.registerPush);
  // Where a new event's reminder starts (Profile → reminder timing).
  const defaultReminder = useApp((s) => s.session?.user.defaultReminderMinutes);
  const meId = useApp((s) => s.session?.activeMemberId);
  const healthConsent = useApp((s) => s.session?.user.healthConsent);
  const setHealthConsent = useApp((s) => s.setHealthConsent);

  const existing = edit ? events.find((e) => e.id === edit) : undefined;
  const isEditing = Boolean(existing);

  const parentsGroupId = groups.find((g) => g.isSystem && g.icon === 'parents')?.id;

  // When this screen opened: render must not read the clock (React Compiler
  // keeps it pure), and a moment fixed at opening is all these checks need.
  const [openedAt] = useState(() => Date.now());

  // A birthday wish (domain/surprises.ts): kept from its person until the
  // morning of their day. Only for a new entry, and only a moment still ahead.
  const surpriseTarget =
    !edit && params.surpriseFor && params.revealAt && Date.parse(params.revealAt) > openedAt
      ? members.find((m) => m.id === params.surpriseFor)
      : undefined;
  const revealAt = surpriseTarget ? params.revealAt : undefined;
  // An answer for somebody's life story (domain/lifestory.ts): about them,
  // with the question's key.
  const lifeKey = !edit && isLifeStoryKey(params.lifestory) ? params.lifestory : undefined;
  const lifeAbout = lifeKey ? members.find((m) => m.id === params.about) : undefined;
  // Something already fills the title and the people: no stale draft over it.
  const guided = Boolean(answering || surpriseTarget || lifeKey);
  const startingPeople = surpriseTarget ? [surpriseTarget] : lifeAbout ? [lifeAbout] : [];

  const [title, setTitle] = useState(
    existing?.title ??
      (answering
        ? promptText(answering)
        : lifeKey
          ? lifeQuestionText(lifeKey)
          : surpriseTarget
            ? tf('surprise.defaultTitle', surpriseTarget.displayName)
            : ''),
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [startsAt, setStartsAt] = useState(() => {
    if (existing) return existing.startsAt;
    // A wish belongs on the day it is for.
    if (revealAt) return revealAt;
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString();
  });
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [categoryId, setCategoryId] = useState<CategoryId>(
    existing?.categoryId ?? (surpriseTarget ? 'celebration' : 'other'),
  );
  const [participantIds, setParticipantIds] = useState<string[]>(
    existing?.participantMemberIds ?? startingPeople.map((m) => m.id),
  );
  // The same safe default as picking the people by hand: a child among them
  // narrows it to the parents.
  const [visibility, setVisibility] = useState<Visibility>(
    existing?.visibility ?? defaultVisibilityFor(startingPeople, parentsGroupId),
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(
    existing ? existing.reminder?.minutesBefore : defaultReminder,
  );
  // Still the account's default rather than something the author picked here.
  const [reminderPicked, setReminderPicked] = useState(isEditing);
  const [repeat, setRepeat] = useState<RepeatRule | undefined>(existing?.repeat);
  const [repeatUntil, setRepeatUntil] = useState<string | undefined>(existing?.repeatUntil);
  const [isMilestone, setIsMilestone] = useState(existing?.isMilestone ?? false);
  const [attachments, setAttachments] = useState<FamilyEvent['attachments']>(
    existing?.attachments ?? [],
  );
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [voiceNotes, setVoiceNotes] = useState<FamilyEvent['attachments']>(
    existing?.voiceNotes ?? [],
  );
  // A time capsule: when it opens, or undefined for an ordinary entry.
  const [sealedUntil, setSealedUntil] = useState<string | undefined>(existing?.sealedUntil);
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  // The clash somebody chose to keep: the same one is not raised again, a
  // different one is (domain/conflicts.ts, conflictKey).
  const [keptConflict, setKeptConflict] = useState<string | null>(null);

  const [sheet, setSheet] = useState<
    | 'date'
    | 'category'
    | 'participants'
    | 'visibility'
    | 'reminder'
    | 'repeat'
    | 'until'
    | 'capsule'
    | 'capsuleDay'
    | null
  >(null);
  const [draftRestored, setDraftRestored] = useState(false);

  /**
   * DRAFT RECOVERY.
   *
   * On a phone an interruption is the normal case: a call, another app, a
   * child. Losing a half-written memory to that is the kind of thing a user
   * forgives once.
   *
   * Only the text is kept — see persist.ts. Restoring pickers would mean
   * silently re-applying a visibility the user cannot see on screen, and
   * visibility is the one thing in this product that must never be a surprise.
   */
  useEffect(() => {
    // Editing loads the real event; a stale draft must not overwrite it. Nor
    // does a draft overwrite the question somebody came here to answer.
    if (isEditing || guided) return;

    let cancelled = false;
    void persistedDraft.read().then((draft) => {
      if (cancelled || !draft) return;
      if (!draft.title && !draft.description) return;
      setTitle(draft.title);
      setDescription(draft.description);
      setDraftRestored(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isEditing, guided]);

  useEffect(() => {
    if (isEditing) return;
    if (!title && !description) return;

    // Written on every keystroke. The store is small and the write is async, so
    // this is cheap — and debouncing would lose the last few characters, which
    // is exactly the case this exists for.
    void persistedDraft.write({ title, description, savedAt: new Date().toISOString() });
  }, [isEditing, title, description]);

  const participants = participantIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m);

  // --- MVP "AI": category suggestion from the text ---
  const suggested = useMemo(() => suggestCategory(title, description), [title, description]);
  const showSuggestion =
    !isEditing &&
    suggested !== null &&
    suggested !== categoryId &&
    categoryId === 'other' &&
    !dismissedSuggestion;

  // --- Somebody in it already has something then ---
  // Only among what this person can see: a warning built from a hidden event
  // would give that event away.
  const visible = useVisibleEvents();
  const conflict = useMemo(
    () => findConflict(visible, { id: existing?.id, startsAt, allDay, participantMemberIds: participantIds }),
    [visible, existing?.id, startsAt, allDay, participantIds],
  );
  const conflictShown = conflict && conflictKey(conflict) !== keptConflict ? conflict : null;
  const conflictShownKey = conflictShown ? conflictKey(conflictShown) : null;
  const conflictNames = (conflictShown?.memberIds ?? [])
    .map((id) => members.find((m) => m.id === id)?.displayName)
    .filter((name): name is string => !!name);
  const conflictMessage = conflictShown
    ? tf(
        'ai.conflict',
        conflictShown.events.map((e) => `“${e.title}”, ${timeOfDay(e.startsAt)}`).join('; '),
        conflictNames.length > 1
          ? tf('common.and', conflictNames.slice(0, -1).join(', '), conflictNames[conflictNames.length - 1])
          : (conflictNames[0] ?? ''),
      )
    : '';

  // Acceptance means nothing without how often each was shown (docs/00-PLAN.md,
  // the AI add-on decision). Once per suggestion, not once per render.
  const categoryShown = showSuggestion ? suggested : null;
  useEffect(() => {
    if (categoryShown) track({ name: 'suggestion_shown', kind: 'category' });
  }, [categoryShown]);
  useEffect(() => {
    if (conflictShownKey) track({ name: 'suggestion_shown', kind: 'conflict', confidence: 1 });
  }, [conflictShownKey]);

  const limits = limitsFor(family?.plan ?? 'free');

  // --- Voice: a note recorded here, and dictation into the words ---
  // domain/voice.ts says what each is and where its sound goes.
  const locale = useLocale((s) => s.locale);
  const canRecord = recorderAvailability();
  const canDictate = dictationAvailability() === 'ready';
  const recorder = useVoiceRecorder(addRecording);
  const dictation = useDictation();
  const [dictating, setDictating] = useState<'title' | 'description' | null>(null);
  // Which listening session is the current one: an old one that ends after a
  // new one began must not clear the new one's field.
  const dictationSession = useRef(0);

  function addRecording(recording: Recording) {
    track({ name: 'voice_note_recorded', seconds: recording.durationSec });
    setVoiceNotes((current) => [
      ...current,
      {
        id: `local_voice_${Date.now()}`,
        kind: 'audio',
        url: recording.uri,
        durationSec: recording.durationSec,
        mimeType: recording.mimeType,
      },
    ]);
  }

  async function startRecording() {
    if (voiceNotes.length >= limits.maxVoiceNotesPerEvent) {
      track({ name: 'paywall_shown', trigger: 'voice_limit' });
      router.push('/premium');
      return;
    }
    // One thing listens at a time.
    dictation.stop();
    const outcome = await recorder.start();
    if (outcome === 'denied') notify(t('voice.permissionTitle'), t('voice.permissionBody'));
    else if (outcome === 'failed') notify(t('voice.failed'));
  }

  async function toggleDictation(field: 'title' | 'description') {
    if (dictation.listening) {
      dictation.stop();
      if (dictating === field) return;
    }

    // Before the first time on this device: the sound leaves for Google or
    // Apple, and that is a thing to know before pressing, not after.
    if (!dictationNoticeSeen()) {
      const agreed = await confirm({
        title: t('dictation.noticeTitle'),
        message: t('dictation.noticeBody'),
        confirmLabel: t('dictation.noticeOk'),
        cancelLabel: t('common.cancel'),
      });
      if (!agreed) return;
      rememberDictationNotice();
    }

    const session = ++dictationSession.current;
    const started = dictation.start(
      speechLanguage(locale),
      (phrase) => {
        if (field === 'title') setTitle((current) => appendDictation(current, phrase).slice(0, 120));
        else setDescription((current) => appendDictation(current, phrase));
      },
      (how) => {
        if (dictationSession.current !== session) return;
        setDictating(null);
        if (how === 'failed') notify(t('dictation.failed'));
      },
    );

    if (!started) {
      notify(t('dictation.failed'));
      return;
    }
    setDictating(field);
    track({ name: 'dictation_used', field });
  }

  /** The Dictate / Stop on a field's label line, where the browser can do it. */
  function dictationButton(field: 'title' | 'description') {
    if (!canDictate || recorder.recording) return undefined;
    const active = dictating === field && dictation.listening;
    return (
      <Touchable
        accessibilityRole="button"
        onPress={() => void toggleDictation(field)}
        hitSlop={8}
        give="row"
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
      >
        <Icon name="mic" size={16} tone={active ? 'danger' : 'primary'} />
        <Text variant="label" tone={active ? 'danger' : 'primary'}>
          {active ? t('dictation.stop') : t('dictation.start')}
        </Text>
      </Touchable>
    );
  }

  const listeningTo = dictation.listening ? dictating : null;
  // Editing an existing event never counts against the plan limit.
  const canAddMore = isEditing || isWithinLimit(events.length, limits.maxEvents);
  const valid = isLongEnough(title);
  const [triedToSave, setTriedToSave] = useState(false);
  const form = useRef<ScrollView>(null);

  /** When a child joins the participants, visibility narrows automatically. */
  function updateParticipants(ids: string[]) {
    setParticipantIds(ids);
    const next = ids
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => !!m);
    // Only if the user has not already chosen a visibility themselves.
    if (visibility.kind === 'family') {
      setVisibility(defaultVisibilityFor(next, parentsGroupId));
    }
  }

  // A default reminder whose moment has already gone - a memory written down
  // after the day, or "a day before" something an hour away - would ring the
  // moment it was saved. It gives way to the date, and comes back when the
  // date moves far enough ahead; one the author picked here is kept as is.
  // What the row shows is what is saved.
  const reminder =
    reminderPicked || !reminderAlreadyDue(startsAt, reminderMinutes) ? reminderMinutes : undefined;

  function save() {
    // Pressable always, and the press explains — see lib/form.ts. The title is
    // at the top and Save is also at the bottom, so the form scrolls back up to
    // where the explanation is.
    if (!valid) {
      setTriedToSave(true);
      form.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    if (!canAddMore) {
      track({ name: 'paywall_shown', trigger: 'events_limit' });
      router.push('/premium');
      return;
    }

    // Health information needs its author's explicit consent first (GDPR
    // Art. 9; the server refuses without it). Asked on the save that needs
    // it - a category picked by hand or a suggestion accepted - and then the
    // same save goes on. Editing an entry already about health does not ask.
    if (categoryId === 'health' && healthConsent === false && existing?.categoryId !== 'health') {
      void askHealthConsent().then((given) => {
        if (given) commit();
      });
      return;
    }
    commit();
  }

  async function askHealthConsent(): Promise<boolean> {
    const yes = await confirm({
      title: t('health.consentTitle'),
      message: t('health.consentBody'),
      confirmLabel: t('health.agree'),
      cancelLabel: t('health.other'),
    });
    if (!yes) return false;
    if (await setHealthConsent(true)) return true;
    notify(t('health.consentTitle'), t('health.failed'));
    return false;
  }

  function commit() {
    if (existing) {
      updateEvent(existing.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt,
        allDay,
        categoryId,
        participantMemberIds: participantIds,
        visibility,
        attachments,
        voiceNotes,
        tags,
        isMilestone,
        // Only what changed: a reminder written again on every save would be
        // sent again after it had already gone out.
        ...(reminderMinutes !== existing.reminder?.minutesBefore
          ? {
              reminder:
                reminderMinutes === undefined
                  ? undefined
                  : {
                      id: existing.reminder?.id ?? `rem_${existing.id}`,
                      eventId: existing.id,
                      minutesBefore: reminderMinutes,
                      enabled: true,
                    },
            }
          : null),
        ...(repeat !== existing.repeat ? { repeat } : null),
        ...(repeatUntil !== existing.repeatUntil ? { repeatUntil } : null),
        ...(sealedUntil !== existing.sealedUntil ? { sealedUntil } : null),
      });
    } else {
      addEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt,
        allDay,
        categoryId,
        participantMemberIds: participantIds,
        visibility,
        attachments,
        voiceNotes,
        tags,
        isMilestone,
        reminderMinutesBefore: reminder,
        repeat,
        repeatUntil: repeat ? repeatUntil : undefined,
        promptKey: answering ?? lifeKey,
        sealedUntil,
        ...(surpriseTarget && revealAt ? { surpriseFor: surpriseTarget.id, revealAt } : null),
      });
      if (lifeKey) track({ name: 'lifestory_answered', chapter: chapterOf(lifeKey) });
      // The fifth entry somebody wrote themselves is the moment to ask for a
      // rating (lib/review.ts).
      askForReviewAfter(events.filter((e) => e.authorMemberId === meId).length + 1);
    }

    // A reminder is the moment the phone's "may FamStory send you
    // notifications?" makes sense - asked here, once, never at the first
    // launch (lib/push.ts). Nothing happens if it was already answered.
    const remindsNow = existing
      ? reminderMinutes !== undefined && reminderMinutes !== existing.reminder?.minutesBefore
      : reminder !== undefined;
    if (remindsNow) void registerPush(true);

    // The draft belonged to this event and is now saved for real.
    void persistedDraft.clear();
    goBack(router);
  }

  /**
   * Picking photos.
   *
   * The picker runs and the chosen images appear on the card immediately. What
   * is NOT here is the upload: the URI is a local file, so the attachment lives
   * on this device only and would not reach another family member.
   *
   * That split is deliberate. Uploading needs the presigned-URL endpoints from
   * docs/05-API.md and an S3-compatible bucket, neither of which exists yet —
   * but the picking, the limit, the thumbnails and the remove button are all UI
   * that design has to style, and none of it should wait for a bucket.
   */
  async function addMedia() {
    const remaining = limits.maxAttachmentsPerEvent - attachments.length;
    if (remaining <= 0) {
      track({ name: 'paywall_shown', trigger: 'media_limit' });
      router.push('/premium');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify(t('event.mediaPermissionTitle'), t('event.mediaPermissionBody'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled) return;

    setAttachments((current) => [
      ...current,
      ...result.assets.map((asset, i) => ({
        // Local until the event is saved: the upload needs an event id to
        // attach to, so the bytes go up in `addEvent` / `updateEvent` and this
        // id is replaced by the server's (data/uploads.ts).
        id: `local_${Date.now()}_${i}`,
        kind: 'image' as const,
        url: asset.uri,
        thumbnailUrl: asset.uri,
        width: asset.width,
        height: asset.height,
      })),
    ]);
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      {/* --- Header --- */}
      {/* Back, the name of what you are doing, and Save as a word — the design
          does not put the primary action in a coloured pill up here. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.sm,
          paddingRight: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.color.border,
        }}
      >
        <IconButton
          name="back"
          accessibilityLabel={t('common.cancel')}
          onPress={() => goBack(router)}
        />
        <Text variant="heading" align="center" style={{ flex: 1 }}>
          {isEditing
            ? t('event.edit')
            : surpriseTarget
              ? t('surprise.askTitle')
              : lifeKey
                ? t('lifestory.title')
                : t('event.new')}
        </Text>
        <Touchable accessibilityRole="button" onPress={save} hitSlop={8} give="row">
          {/* Muted until the event has a title, but still pressable: pressing
              it early says what is missing instead of doing nothing. */}
          <Text variant="button" tone={valid ? 'primary' : 'muted'}>
            {t('common.save')}
          </Text>
        </Touchable>
      </View>

      <ScrollView
        ref={form}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {answering ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="question" size={18} tone="primary" />
            <Text variant="label" tone="primary">
              {t('prompts.answering')}
            </Text>
          </View>
        ) : null}
        {surpriseTarget && revealAt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="gift" size={18} tone="primary" />
            <Text variant="label" tone="primary" style={{ flex: 1 }}>
              {tf('surprise.composerNote', surpriseTarget.displayName, friendlyDay(revealAt))}
            </Text>
          </View>
        ) : null}
        {lifeKey && lifeAbout ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="book" size={18} tone="primary" />
            <Text variant="label" tone="primary" style={{ flex: 1 }}>
              {tf('lifestory.composerNote', lifeAbout.displayName)}
            </Text>
          </View>
        ) : null}

        {/* --- What happened --- */}
        <Field
          label={t('event.titleLabel')}
          placeholder={t('event.titlePlaceholder')}
          value={title}
          onChangeText={setTitle}
          autoFocus
          maxLength={120}
          error={triedToSave && !valid ? tf('event.titleTooShort', MIN_TEXT_LENGTH) : undefined}
          hint={listeningTo === 'title' ? t('dictation.listening') : undefined}
          accessory={dictationButton('title')}
        />

        {/* Restoring text without saying so would read as the app typing by
            itself. The discard option matters as much as the restore. */}
        {draftRestored ? (
          <SuggestionBanner
            message={t('event.draftRestored')}
            acceptLabel={t('common.done')}
            dismissLabel={t('event.draftDiscard')}
            onAccept={() => setDraftRestored(false)}
            onDismiss={() => {
              setTitle('');
              setDescription('');
              setDraftRestored(false);
              void persistedDraft.clear();
            }}
          />
        ) : null}

        {showSuggestion && suggested ? (
          <SuggestionBanner
            message={tf('ai.categorySuggestion', t(CATEGORY_BY_ID[suggested].labelKey as Parameters<typeof t>[0]))}
            onAccept={() => {
              setCategoryId(suggested);
              track({ name: 'suggestion_accepted', kind: 'category' });
            }}
            onDismiss={() => {
              setDismissedSuggestion(true);
              track({ name: 'suggestion_rejected', kind: 'category' });
            }}
          />
        ) : null}

        <Field
          label={t('event.descriptionLabel')}
          placeholder={t('event.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          multiline
          // Half of what the server takes (api common/input.ts), so dictation
          // added to a full field still saves.
          maxLength={10000}
          hint={listeningTo === 'description' ? t('dictation.listening') : undefined}
          accessory={dictationButton('description')}
        />

        {/* --- When --- */}
        <View style={{ gap: theme.spacing.md }}>
          <SelectBox
            label={t('event.dateLabel')}
            icon="calendar"
            value={eventTimeLabel(startsAt, allDay)}
            onPress={() => setSheet('date')}
          />
          <SwitchRow title={t('event.allDay')} value={allDay} onValueChange={setAllDay} />
          {/* A practice, a lesson, rent: one event, not thirty. */}
          <SelectBox
            label={t('repeat.label')}
            icon="repeat"
            value={
              repeat && repeatUntil
                ? `${repeatLabel(repeat)} · ${tf('repeat.untilDay', friendlyDay(repeatUntil))}`
                : repeatLabel(repeat)
            }
            onPress={() => setSheet('repeat')}
          />
        </View>

        {/* --- Event type ---
            A field with the current answer in it, not ten chips competing for
            the top of the screen. The chips still exist, behind this box. */}
        <SelectBox
          label={t('event.categoryLabel')}
          value={t(CATEGORY_BY_ID[categoryId].labelKey as Parameters<typeof t>[0])}
          onPress={() => setSheet('category')}
        />

        {/* --- Tags: the family's own words, next to the structured type --- */}
        <TagPicker value={tags} onChange={setTags} />

        {/* --- Who is in it --- */}
        <Card elevation="flat" padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <Row
              title={t('event.participantsLabel')}
              left={<Icon name="family" tone="muted" />}
              right={
                participants.length > 0 ? (
                  <AvatarStack
                    people={participants.map((m) => ({ name: m.displayName, url: m.avatarUrl }))}
                  />
                ) : (
                  <Icon name="add" tone="muted" />
                )
              }
              onPress={() => setSheet('participants')}
            />
          </View>
        </Card>

        {/* Under the people, where the eye is when it appears; the time it
            is about is one tap away. It never moves anything by itself. */}
        {conflictShown && conflictShownKey ? (
          <SuggestionBanner
            message={conflictMessage}
            acceptLabel={t('ai.conflictChangeTime')}
            dismissLabel={t('ai.conflictKeep')}
            onAccept={() => {
              track({ name: 'suggestion_accepted', kind: 'conflict' });
              setSheet('date');
            }}
            onDismiss={() => {
              track({ name: 'suggestion_rejected', kind: 'conflict' });
              setKeptConflict(conflictShownKey);
            }}
          />
        ) : null}

        {/* --- Photos and video --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="body" tone="muted" style={{ flex: 1 }}>
              {t('event.mediaLabel')}
            </Text>
            {/* The free plan's limit, where Premium becomes concrete. */}
            <Text variant="body" tone="muted">
              {attachments.length} / {limits.maxAttachmentsPerEvent}
            </Text>
          </View>

          {attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing.sm }}
            >
              {attachments.map((attachment) => (
                <View key={attachment.id}>
                  <Image
                    source={{ uri: attachment.thumbnailUrl ?? attachment.url }}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.color.surfaceMuted,
                    }}
                    contentFit="cover"
                  />
                  <Touchable
                    accessibilityRole="button"
                    accessibilityLabel={t('event.mediaRemove')}
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((a) => a.id !== attachment.id),
                      )
                    }
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 24,
                      height: 24,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.color.background,
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...theme.shadow.card,
                    }}
                  >
                    <Icon name="close" size={14} tone="muted" />
                  </Touchable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {/* A dashed square sitting in the row it adds to — the design does
              not put a full-width button under the photographs. */}
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={t('event.mediaAddMore')}
            onPress={addMedia}
            style={{
              width: 88,
              height: 88,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.color.textMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="add" size={24} tone="muted" />
          </Touchable>
        </View>

        {/* --- Voice notes ---
            Told rather than typed: the grandparent who will talk for four
            minutes and never write four sentences. Kept with the event and
            seen by the same people as its photographs. */}
        {canRecord !== 'unsupported' || voiceNotes.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="body" tone="muted" style={{ flex: 1 }}>
                {t('voice.title')}
              </Text>
              <Text variant="body" tone="muted">
                {voiceNotes.length} / {limits.maxVoiceNotesPerEvent}
              </Text>
            </View>

            {voiceNotes.map((note) => (
              <VoiceNote
                key={note.id}
                note={note}
                onRemove={() => setVoiceNotes((current) => current.filter((n) => n.id !== note.id))}
              />
            ))}

            {recorder.recording ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.color.dangerSoft,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.color.danger,
                  }}
                />
                <Text variant="body" style={{ flex: 1 }}>
                  {tf(
                    'voice.recording',
                    formatDuration(recorder.elapsed),
                    formatDuration(VOICE_NOTE_MAX_SECONDS),
                  )}
                </Text>
                <Touchable accessibilityRole="button" onPress={recorder.cancel} hitSlop={8} give="row">
                  <Text variant="label" tone="muted">
                    {t('common.cancel')}
                  </Text>
                </Touchable>
                <Button label={t('voice.stop')} icon="stop" onPress={recorder.stop} />
              </View>
            ) : canRecord === 'ready' ? (
              <Button
                label={t('voice.record')}
                icon="mic"
                variant="secondary"
                onPress={() => void startRecording()}
              />
            ) : (
              <Text variant="caption" tone="muted">
                {canRecord === 'insecure' ? t('voice.needsSecure') : t('voice.unsupported')}
              </Text>
            )}
          </View>
        ) : null}

        {/* --- Who can see it --- */}
        <Card elevation="flat" padded={false}>
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <Row
              title={t('event.visibilityLabel')}
              subtitle={
                visibility.kind === 'family'
                  ? tf('visibility.familyHint', family?.name ?? '')
                  : visibility.kind === 'private'
                    ? t('visibility.privateHint')
                    : t('visibility.customHint')
              }
              left={
                <Icon
                  name={visibility.kind === 'private' ? 'private' : 'visibility'}
                  tone={visibility.kind === 'family' ? 'muted' : 'primary'}
                />
              }
              right={<Icon name="forward" size={16} tone="muted" />}
              onPress={() => setSheet('visibility')}
            />
          </View>
        </Card>

        {/* --- Reminder --- */}
        <View style={{ gap: theme.spacing.sm }}>
          <SelectBox
            label={t('event.reminderLabel')}
            icon="clock"
            value={reminderLabel(reminder)}
            onPress={() => setSheet('reminder')}
          />
        </View>

        {/* --- Milestone --- */}
        <Card elevation="flat">
          <SwitchRow
            title={t('event.milestoneLabel')}
            subtitle={t('event.milestoneHint')}
            value={isMilestone}
            onValueChange={setIsMilestone}
          />
        </Card>

        {/* --- Time capsule ---
            Not for a surprise, which already has its own day; and on an edit
            only the author's, since when it opens is theirs to say. */}
        {!surpriseTarget && (!existing || existing.authorMemberId === meId) ? (
          <View style={{ gap: theme.spacing.sm }}>
            <SelectBox
              label={t('capsule.title')}
              icon="capsule"
              value={sealedUntil ? tf('capsule.opensOn', friendlyDay(sealedUntil)) : t('capsule.off')}
              onPress={() => setSheet('capsule')}
            />
            {sealedUntil ? (
              <Text variant="caption" tone="muted">
                {t('capsule.hint')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button label={t('common.save')} size="lg" onPress={save} />
      </ScrollView>

      {/* --- Sheets --- */}
      <DatePickerSheet
        visible={sheet === 'date'}
        value={startsAt}
        allDay={allDay}
        onClose={() => setSheet(null)}
        onChange={setStartsAt}
      />
      <CategoryPickerSheet
        visible={sheet === 'category'}
        value={categoryId}
        onClose={() => setSheet(null)}
        onChange={setCategoryId}
      />
      <ParticipantPickerSheet
        visible={sheet === 'participants'}
        selectedIds={participantIds}
        onClose={() => setSheet(null)}
        onChange={updateParticipants}
      />
      <ReminderPickerSheet
        visible={sheet === 'reminder'}
        value={reminder}
        onClose={() => setSheet(null)}
        onChange={(minutes) => {
          setReminderMinutes(minutes);
          setReminderPicked(true);
        }}
      />
      <RepeatPickerSheet
        visible={sheet === 'repeat'}
        value={repeat}
        until={repeatUntil}
        onClose={() => setSheet(null)}
        onChange={(rule) => {
          setRepeat(rule);
          if (!rule) setRepeatUntil(undefined);
        }}
        onPickUntil={() => setSheet('until')}
        onClearUntil={() => setRepeatUntil(undefined)}
      />
      {/* The last day it may happen on; a day, so no time of its own. */}
      <DatePickerSheet
        visible={sheet === 'until'}
        title={t('repeat.until')}
        value={repeatUntil ?? startsAt}
        allDay
        onClose={() => setSheet('repeat')}
        onChange={(day) => setRepeatUntil(day)}
      />
      <Sheet visible={sheet === 'capsule'} title={t('capsule.title')} onClose={() => setSheet(null)}>
        <Row
          title={t('capsule.off')}
          right={!sealedUntil ? <Icon name="check" tone="primary" /> : undefined}
          onPress={() => {
            setSealedUntil(undefined);
            setSheet(null);
          }}
        />
        {capsuleOptions(members).map((option) => (
          <View key={option.key}>
            <Divider />
            <Row
              title={
                option.member
                  ? tf('capsule.atAge', option.member.displayName, COMING_OF_AGE)
                  : option.years === 1
                    ? t('capsule.inAYear')
                    : tf('capsule.inYears', option.years ?? 0)
              }
              subtitle={friendlyDay(option.at.toISOString())}
              onPress={() => {
                setSealedUntil(option.at.toISOString());
                setSheet(null);
              }}
            />
          </View>
        ))}
        <Divider />
        <Row
          title={t('capsule.otherDay')}
          right={<Icon name="forward" size={16} tone="muted" />}
          onPress={() => setSheet('capsuleDay')}
        />
      </Sheet>
      <DatePickerSheet
        visible={sheet === 'capsuleDay'}
        title={t('capsule.title')}
        value={sealedUntil ?? new Date(openedAt + 365 * 86_400_000).toISOString()}
        allDay
        onClose={() => setSheet(null)}
        onChange={(day) => {
          // Only a day ahead: a capsule that opens today is not a capsule.
          const at = openingMoment(new Date(day));
          if (at.getTime() > Date.now()) setSealedUntil(at.toISOString());
        }}
      />
      <VisibilityPickerSheet
        visible={sheet === 'visibility'}
        value={visibility}
        participants={participants}
        onClose={() => setSheet(null)}
        onChange={(v) => {
          track({ name: 'visibility_changed', from: visibility.kind, to: v.kind });
          setVisibility(v);
        }}
      />
    </Screen>
  );
}
