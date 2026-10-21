import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { chapterTitle, lifeQuestionText } from '@/components/event/life-story-text';
import { VoiceNote } from '@/components/event/voice-note';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, Header, SectionHeader, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp, useCurrentMember, useVisibleEvents } from '@/data/store';
import { LIFE_STORY_KEYS, lifeStory, nextQuestion, type LifeStoryKey } from '@/domain/lifestory';
import { can } from '@/domain/visibility';
import { t, tf } from '@/i18n';
import { useTheme } from '@/theme';
import { goBack } from '@/lib/navigation';

/**
 * ONE PERSON'S LIFE STORY (domain/lifestory.ts).
 *
 * Five chapters of questions a grandchild will one day wish somebody had
 * asked, answered one at a time - by the person, or by whoever sits beside
 * them with the phone. An answer is an entry about them, usually a voice, and
 * it plays right here, in the chapter it belongs to.
 */
export default function LifeStory() {
  const theme = useTheme();
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const person = useApp((s) => s.members.find((m) => m.id === memberId));
  const loadArchive = useApp((s) => s.loadArchive);
  const me = useCurrentMember();
  const visible = useVisibleEvents();

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  const chapters = useMemo(() => (person ? lifeStory(visible, person.id) : []), [visible, person]);
  const next = useMemo(() => (person ? nextQuestion(visible, person.id) : null), [visible, person]);
  const answered = chapters.reduce((sum, c) => sum + c.answered, 0);
  const mayAnswer = !!me && can(me, 'event.create');

  if (!person) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="—" onBack={() => goBack(router)} />
      </Screen>
    );
  }

  const answer = (key: LifeStoryKey) => router.push(`/event/new?lifestory=${key}&about=${person.id}`);

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('lifestory.title')} subtitle={person.displayName} onBack={() => goBack(router)} />
      <Text variant="body" tone="muted">
        {t('lifestory.hint')}
      </Text>
      <Text variant="label" tone="primary">
        {tf('lifestory.progress', answered, LIFE_STORY_KEYS.length)}
      </Text>

      {next && mayAnswer ? (
        <Button label={t('lifestory.next')} icon="mic" onPress={() => answer(next)} />
      ) : null}
      {!next ? (
        <Card elevation="flat">
          <Text variant="body">{t('lifestory.done')}</Text>
        </Card>
      ) : null}

      {chapters.map((chapter) => (
        <View key={chapter.id} style={{ gap: theme.spacing.sm }}>
          <SectionHeader title={`${chapterTitle(chapter.id)} · ${chapter.answered}/${chapter.questions.length}`} />
          {chapter.questions.map(({ key, answer: entry }) => (
            <Card key={key} elevation={entry ? 'raised' : 'flat'}>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                  <Icon
                    name={entry ? 'check' : 'question'}
                    size={18}
                    color={entry ? theme.color.accentText : theme.color.textMuted}
                  />
                  <Text variant={entry ? 'heading' : 'body'} tone={entry ? 'default' : 'muted'} style={{ flex: 1 }}>
                    {lifeQuestionText(key)}
                  </Text>
                </View>

                {entry ? (
                  <>
                    {(entry.voiceNotes ?? []).map((note) => (
                      <VoiceNote key={note.id} note={note} />
                    ))}
                    {entry.description ? (
                      <Touchable accessibilityRole="button" onPress={() => router.push(`/event/${entry.id}`)}>
                        <Text variant="read" tone="muted" numberOfLines={3}>
                          {entry.description}
                        </Text>
                      </Touchable>
                    ) : null}
                  </>
                ) : mayAnswer ? (
                  <Touchable
                    accessibilityRole="button"
                    onPress={() => answer(key)}
                    hitSlop={8}
                    give="row"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <Text variant="label" tone="primary">
                      {t('lifestory.answer')}
                    </Text>
                  </Touchable>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
