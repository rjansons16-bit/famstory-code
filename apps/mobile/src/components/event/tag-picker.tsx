import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useApp } from '@/data/store';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Chip } from '../ui/chip';
import { Field } from '../ui/input';
import { Text } from '../ui/text';

/**
 * TAGS — the family's own words, next to the structured event type.
 *
 * The design shows a row of chips ("First steps", "Holiday", "School") and a
 * "+ Tag" affordance. The chips are not a fixed list: they are what this family
 * has used before, which is why the first event a family creates offers none
 * and the tenth offers the vocabulary they built.
 *
 * WHY THIS IS NOT THE CATEGORY. The category is closed, shared across every
 * family, and what the archive and yearly summary are built on — the study
 * calls that structure a differentiator. A tag is open and local. Collapsing
 * them into one control would trade a differentiator for a text field.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const theme = useTheme();
  const events = useApp((s) => s.events);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  /** Every tag this family has used, most recent first, plus whatever is on this event. */
  const known = useMemo(() => {
    const seen = new Set<string>(value);
    for (const e of events) for (const tag of e.tags ?? []) seen.add(tag);
    return [...seen];
  }, [events, value]);

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((x) => x !== tag) : [...value, tag]);
  }

  function commit() {
    const tag = draft.trim();
    // Case-insensitive: "School" and "school" are the same word, and two chips
    // that read identically would look like a bug.
    const existing = known.find((k) => k.toLowerCase() === tag.toLowerCase());
    if (tag && !existing) onChange([...value, tag]);
    else if (existing && !value.includes(existing)) onChange([...value, existing]);
    setDraft('');
    setAdding(false);
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="body" tone="muted">
        {t('event.tagsLabel')}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {known.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            selected={value.includes(tag)}
            onPress={() => toggle(tag)}
          />
        ))}
        {!adding ? <Chip label={t('event.tagAdd')} onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <Field
          label={t('event.tagNew')}
          placeholder={t('event.tagPlaceholder')}
          value={draft}
          onChangeText={setDraft}
          autoFocus
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={commit}
          onBlur={commit}
        />
      ) : null}
    </View>
  );
}
