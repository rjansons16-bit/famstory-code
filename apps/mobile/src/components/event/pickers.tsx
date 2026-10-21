import { ScrollView, View } from 'react-native';

import { useApp, useCurrentMember } from '@/data/store';
import { CATEGORIES } from '@/domain/categories';
import { groupLabel } from '@/domain/groups';
import type { CategoryId, Member, RepeatRule, Visibility } from '@/domain/types';
import { t, tf } from '@/i18n';
import {
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  friendlyDay,
  reminderLabel,
  repeatLabel,
} from '@/lib/date';
import { useTheme } from '@/theme';
import { Avatar } from '../ui/avatar';
import { Button, IconButton } from '../ui/button';
import { CategoryChip, Chip } from '../ui/chip';
import { Sheet } from '../ui/feedback';
import { Icon } from '../ui/icon';
import { Divider, Row } from '../ui/surface';
import { Text } from '../ui/text';

// The date and time picker lives in ../calendar/date-picker.tsx.

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export function CategoryPickerSheet({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: CategoryId;
  onClose: () => void;
  onChange: (id: CategoryId) => void;
}) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} title={t('event.categoryLabel')} onClose={onClose}>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
      >
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c.id}
            categoryId={c.id}
            selected={value === c.id}
            onPress={() => {
              onChange(c.id);
              onClose();
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

/**
 * A list, not a row of chips.
 *
 * The composer is written as a form — the event type and the date are fields
 * holding the current answer — and the reminder was the one question still
 * asked as six pills competing for a horizontal scroll it did not need.
 */
export function ReminderPickerSheet({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: number | undefined;
  onClose: () => void;
  onChange: (minutes: number | undefined) => void;
}) {
  return (
    <Sheet visible={visible} title={t('event.reminderLabel')} onClose={onClose}>
      {REMINDER_OPTIONS.map((minutes, i) => (
        <View key={String(minutes)}>
          {i > 0 ? <Divider /> : null}
          <Row
            title={reminderLabel(minutes)}
            right={value === minutes ? <Icon name="check" tone="primary" /> : undefined}
            onPress={() => {
              onChange(minutes);
              onClose();
            }}
          />
        </View>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Repeat
// ---------------------------------------------------------------------------

/**
 * How often, and until when. The rule is one tap; the end date is optional
 * and opens the date picker - most repeating things (a practice, a lesson)
 * are entered once and ended later with "stop repeating from here".
 */
export function RepeatPickerSheet({
  visible,
  value,
  until,
  onClose,
  onChange,
  onPickUntil,
  onClearUntil,
}: {
  visible: boolean;
  value: RepeatRule | undefined;
  until: string | undefined;
  onClose: () => void;
  onChange: (rule: RepeatRule | undefined) => void;
  onPickUntil: () => void;
  onClearUntil: () => void;
}) {
  const theme = useTheme();

  return (
    <Sheet
      visible={visible}
      title={t('repeat.label')}
      onClose={onClose}
      footer={<Button label={t('common.done')} onPress={onClose} />}
    >
      {REPEAT_OPTIONS.map((rule, i) => (
        <View key={String(rule)}>
          {i > 0 ? <Divider /> : null}
          <Row
            title={repeatLabel(rule)}
            left={<Icon name={rule ? 'repeat' : 'close'} tone="muted" />}
            right={value === rule ? <Icon name="check" tone="primary" /> : undefined}
            onPress={() => onChange(rule)}
          />
        </View>
      ))}

      {value ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Divider />
          <Row
            title={t('repeat.until')}
            subtitle={until ? friendlyDay(until) : t('repeat.untilNone')}
            left={<Icon name="calendar" tone="muted" />}
            right={
              until ? (
                <IconButton name="close" accessibilityLabel={t('repeat.untilNone')} onPress={onClearUntil} />
              ) : (
                <Icon name="forward" size={16} tone="muted" />
              )
            }
            onPress={onPickUntil}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export function ParticipantPickerSheet({
  visible,
  selectedIds,
  onClose,
  onChange,
}: {
  visible: boolean;
  selectedIds: string[];
  onClose: () => void;
  onChange: (ids: string[]) => void;
}) {
  const members = useApp((s) => s.members).filter((m) => m.status === 'active');

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  return (
    <Sheet
      visible={visible}
      title={t('event.participantsLabel')}
      onClose={onClose}
      footer={<Button label={t('common.done')} onPress={onClose} />}
    >
      <ScrollView style={{ maxHeight: 380 }}>
        {members.map((m) => (
          <Row
            key={m.id}
            title={m.displayName}
            left={<Avatar name={m.displayName} url={m.avatarUrl} />}
            right={selectedIds.includes(m.id) ? <Icon name="check" tone="primary" /> : undefined}
            onPress={() => toggle(m.id)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Visibility
//
// The most important sheet in the app. The study names visibility control as
// the main differentiator, and a KPI measures it separately (">25% of active
// families use the visibility/group features").
//
// Design requirement: every option explains its CONSEQUENCE, not just its name.
// "Specific groups" says nothing. "Parents — Anna, Martin" says something.
// ---------------------------------------------------------------------------

/**
 * WHO CAN SEE THIS — the product's one real differentiator, and the screen the
 * design spends the most care on.
 *
 * Three choices, not four. The old sheet offered "groups" and "people" as
 * separate kinds, which forced a user who wanted *the grandparents plus my
 * sister* to pick one and give up the other. The design merges them into
 * "Custom — choose groups & people", and the data model follows: `custom`
 * carries both lists at once.
 *
 * THE COUNT IS THE POINT. "Visible to 3 of 4 members" turns an abstract choice
 * into a fact about people. Without it a user ticks boxes and hopes; with it
 * they can see that ticking "Grandparents" reached one person, not three.
 */
export function VisibilityPickerSheet({
  visible,
  value,
  participants,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: Visibility;
  participants: Member[];
  onClose: () => void;
  onChange: (v: Visibility) => void;
}) {
  const theme = useTheme();
  const family = useApp((s) => s.family);
  const groups = useApp((s) => s.groups);
  const members = useApp((s) => s.members).filter((m) => m.status === 'active');
  const me = useCurrentMember();

  const hasChild = participants.some((m) => m.role === 'child');

  // `groups` and `members` are the old kinds; both are custom with one list empty.
  const isCustom = value.kind === 'custom' || value.kind === 'groups' || value.kind === 'members';
  const pickedGroups = value.groupIds ?? [];
  const pickedMembers = value.memberIds ?? [];

  /**
   * How many people this actually reaches.
   *
   * Counted over real members rather than by adding up the ticks: a person in
   * two chosen groups is one person, and the author always sees their own event
   * whether or not they appear on any list.
   */
  const reach = members.filter(
    (m) =>
      m.id === me?.id ||
      pickedMembers.includes(m.id) ||
      m.groupIds.some((gid) => pickedGroups.includes(gid)),
  ).length;

  function toggleGroup(id: string) {
    onChange({
      kind: 'custom',
      groupIds: pickedGroups.includes(id)
        ? pickedGroups.filter((x) => x !== id)
        : [...pickedGroups, id],
      memberIds: pickedMembers,
    });
  }

  function toggleMember(id: string) {
    onChange({
      kind: 'custom',
      groupIds: pickedGroups,
      memberIds: pickedMembers.includes(id)
        ? pickedMembers.filter((x) => x !== id)
        : [...pickedMembers, id],
    });
  }

  return (
    <Sheet
      visible={visible}
      title={t('visibility.title')}
      onClose={onClose}
      footer={<Button label={t('common.done')} onPress={onClose} />}
    >
      <ScrollView style={{ maxHeight: 460 }}>
        {hasChild ? (
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.accentSoft,
              marginBottom: theme.spacing.md,
            }}
          >
            <Icon name="shield" size={16} color={theme.color.primary} />
            <Text variant="caption" style={{ flex: 1 }}>
              {t('visibility.childWarning')}
            </Text>
          </View>
        ) : null}

        <Row
          title={t('visibility.family')}
          subtitle={tf('visibility.familyHint', family?.name ?? '')}
          left={<Icon name="visibility" tone="muted" />}
          right={value.kind === 'family' ? <Icon name="check" tone="primary" /> : undefined}
          onPress={() => onChange({ kind: 'family' })}
        />

        <Row
          title={t('visibility.private')}
          subtitle={t('visibility.privateShort')}
          left={<Icon name="private" tone="muted" />}
          right={value.kind === 'private' ? <Icon name="check" tone="primary" /> : undefined}
          onPress={() => onChange({ kind: 'private' })}
        />

        <Row
          title={t('visibility.custom')}
          subtitle={t('visibility.customHint')}
          left={<Icon name="group" tone="muted" />}
          right={isCustom ? <Icon name="check" tone="primary" /> : undefined}
          onPress={() =>
            onChange({ kind: 'custom', groupIds: pickedGroups, memberIds: pickedMembers })
          }
        />

        {isCustom ? (
          <View style={{ paddingTop: theme.spacing.sm, gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="body" tone="muted">
                {t('visibility.groupsLabel')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {groups.map((g) => (
                  <Chip
                    key={g.id}
                    label={`${groupLabel(g)} · ${g.memberIds.length}`}
                    selected={pickedGroups.includes(g.id)}
                    onPress={() => toggleGroup(g.id)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="body" tone="muted">
                {t('visibility.peopleLabel')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {members
                  .filter((m) => m.id !== me?.id)
                  .map((m) => (
                    <Chip
                      key={m.id}
                      label={m.displayName}
                      selected={pickedMembers.includes(m.id)}
                      onPress={() => toggleMember(m.id)}
                    />
                  ))}
              </View>
            </View>

            {/* The consequence, in people rather than in ticks. */}
            <Text variant="caption" tone={reach > 1 ? 'muted' : 'danger'}>
              {reach > 1
                ? tf('visibility.visibleToCount', reach, members.length)
                : t('visibility.visibleToNobody')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
