import { View } from 'react-native';

import type { PromptKey } from '@/domain/prompts';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Card } from '../ui/surface';
import { Text } from '../ui/text';

/** The words of a question, from its key. Never at module level: see i18n/index.ts. */
export function promptText(key: PromptKey): string {
  return t(`prompt.${key}` as Parameters<typeof t>[0]);
}

/**
 * This week's question, at the top of the timeline (domain/prompts.ts).
 *
 * Set in the serif the design keeps for what the family writes - the
 * question is the beginning of an entry, not a notification about one - and
 * with a way to say "not now" that does not argue.
 */
export function WeeklyQuestionCard({
  promptKey,
  onAnswer,
  onDismiss,
}: {
  promptKey: PromptKey;
  onAnswer: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Icon name="question" size={18} tone="primary" />
          <Text variant="label" tone="primary">
            {t('prompts.title')}
          </Text>
        </View>
        <Text variant="cardTitle">{promptText(promptKey)}</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={t('prompts.answer')} icon="edit" onPress={onAnswer} />
          </View>
          <Button label={t('prompts.notNow')} variant="ghost" onPress={onDismiss} />
        </View>
      </View>
    </Card>
  );
}
