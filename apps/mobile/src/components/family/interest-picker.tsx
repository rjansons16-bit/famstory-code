import { View } from 'react-native';

import {
  INTEREST_KEYS,
  MAX_INTERESTS,
  interestLabel,
  toggleInterest,
  type InterestKey,
} from '@/domain/interests';
import { tf } from '@/i18n';
import { useTheme } from '@/theme';
import { Chip } from '../ui/chip';
import { Text } from '../ui/text';

/**
 * The things a person can like, as chips to tap (domain/interests.ts): where
 * somebody says what they like - onboarding, their profile - and where a
 * parent says it for a child. A fixed list rather than a text box, so what
 * is kept about a person is a word from it and nothing else.
 */
export function InterestPicker({
  value,
  onChange,
}: {
  value: readonly InterestKey[];
  onChange: (next: InterestKey[]) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {INTEREST_KEYS.map((key) => {
          const selected = value.includes(key);
          return (
            <Chip
              key={key}
              label={interestLabel(key)}
              icon={selected ? 'check' : undefined}
              selected={selected}
              onPress={() => onChange(toggleInterest(value, key))}
            />
          );
        })}
      </View>
      {/* Tapping a thirteenth does nothing; the count says why. */}
      <Text variant="caption" tone="muted">
        {value.length > 0
          ? tf('interests.chosen', value.length, MAX_INTERESTS)
          : tf('interests.limit', MAX_INTERESTS)}
      </Text>
    </View>
  );
}

/** Somebody's interests, to read: the chips they chose, in their order. */
export function InterestChips({ interests }: { interests: readonly InterestKey[] }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {interests.map((key) => (
        <Chip key={key} label={interestLabel(key)} icon="interests" />
      ))}
    </View>
  );
}
