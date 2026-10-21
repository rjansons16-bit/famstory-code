import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/ui/button';
import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp, useVisibleEvents } from '@/data/store';
import { track } from '@/domain/analytics';
import { SLIDE_SECONDS, filmYear, yearFilm } from '@/domain/film';
import { t, tf } from '@/i18n';
import { friendlyDay } from '@/lib/date';
import { saveFile } from '@/lib/download';
import { notify } from '@/lib/dialog';
import { canRecordFilm, recordFilm } from '@/lib/film-recorder';
import { goBack } from '@/lib/navigation';
import { useNotePlayer } from '@/lib/note-player';
import { useTheme } from '@/theme';

/**
 * THE YEAR IN A MINUTE (domain/film.ts).
 *
 * The year's photographs one after another, three seconds each, with a voice
 * underneath where the entry has one: a tap on either side goes back or on,
 * like the stories people already know how to watch. In the browser it can
 * be saved as a video (lib/film-recorder.ts), made on this machine.
 */
export default function YearFilm() {
  const theme = useTheme();
  const router = useRouter();
  const { year: asked } = useLocalSearchParams<{ year?: string }>();
  const loadArchive = useApp((s) => s.loadArchive);
  const visible = useVisibleEvents();

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  const year = useMemo(() => {
    const n = Number(asked);
    return Number.isInteger(n) && n > 1900 ? n : filmYear(visible);
  }, [asked, visible]);
  const slides = useMemo(() => yearFilm(visible, year), [visible, year]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  const slide = slides[Math.min(index, Math.max(0, slides.length - 1))];

  // On to the next slide every few seconds while playing; the end stops it.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (index >= slides.length - 1) setPlaying(false);
      else setIndex(index + 1);
    }, SLIDE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [playing, index, slides.length]);

  function play() {
    if (index >= slides.length - 1) setIndex(0);
    if (!playing) track({ name: 'year_film_played', photos: slides.length });
    setPlaying(!playing);
  }

  async function save() {
    if (!canRecordFilm()) {
      notify(tf('film.title', year), t('film.savedWebOnly'));
      return;
    }
    setPlaying(false);
    setSaving(0);
    try {
      const film = await recordFilm(
        slides,
        { title: tf('film.title', year), tagline: t('auth.heroTitle') },
        (fraction) => setSaving(fraction),
      );
      saveFile(`famstory-${year}.${film.extension}`, film.blob, film.mimeType);
      track({ name: 'year_film_saved' });
    } catch (error) {
      notify(tf('film.title', year), error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={tf('film.title', year)} onBack={() => goBack(router)} />
      <Text variant="body" tone="muted">
        {t('film.hint')}
      </Text>

      {slides.length === 0 || !slide ? (
        <Card elevation="flat">
          <Text variant="body" tone="muted">
            {t('film.empty')}
          </Text>
        </Card>
      ) : (
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <View
            style={{
              width: '100%',
              maxWidth: theme.size.filmMaxWidth,
              aspectRatio: 9 / 16,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              backgroundColor: theme.color.text,
            }}
          >
            <Image
              source={{ uri: slide.photoUrl }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              contentFit="cover"
              transition={400}
            />

            {/* How far along: one segment per slide, the way stories show it. */}
            <View
              style={{
                position: 'absolute',
                top: theme.spacing.sm,
                left: theme.spacing.sm,
                right: theme.spacing.sm,
                flexDirection: 'row',
                gap: 2,
              }}
            >
              {slides.map((s, i) => (
                <View
                  key={s.eventId}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: theme.radius.pill,
                    backgroundColor: i <= index ? theme.onMedia.text : theme.onMedia.scrim,
                  }}
                />
              ))}
            </View>

            {/* Back and on, as the two halves of the picture. */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
              <Touchable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                onPress={() => setIndex(Math.max(0, index - 1))}
                style={{ flex: 1 }}
              />
              <Touchable
                accessibilityRole="button"
                accessibilityLabel={t('common.next')}
                onPress={() => setIndex(Math.min(slides.length - 1, index + 1))}
                style={{ flex: 1 }}
              />
            </View>

            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: theme.spacing.lg,
                gap: theme.spacing.xs,
                backgroundColor: theme.onMedia.scrim,
              }}
            >
              <Text variant="title" style={{ color: theme.onMedia.text }} numberOfLines={2}>
                {slide.title}
              </Text>
              <Text variant="caption" style={{ color: theme.onMedia.text }}>
                {friendlyDay(slide.startsAt)} · {tf('film.slideOf', index + 1, slides.length)}
              </Text>
            </View>

            {slide.voiceUrl ? <SlideVoice key={slide.eventId} url={slide.voiceUrl} playing={playing} /> : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <IconButton
              name={playing ? 'pause' : 'play'}
              tone="primary"
              accessibilityLabel={playing ? t('voice.pause') : t('voice.play')}
              onPress={play}
            />
            {/* Only where it can be done: on a phone the button only ever said
                "in the browser", and a button that does nothing is one App
                Review stops at (lib/film-recorder.native.ts). */}
            {canRecordFilm() ? (
              <Button
                label={saving !== null ? `${t('film.saving')} ${Math.round(saving * 100)}%` : t('film.save')}
                icon="download"
                variant="secondary"
                loading={saving !== null}
                onPress={() => void save()}
              />
            ) : null}
          </View>
        </View>
      )}
    </Screen>
  );
}

/**
 * The voice under one slide: starts with the slide when the film is playing,
 * stops with it - the player is let go when the slide changes.
 */
function SlideVoice({ url, playing }: { url: string; playing: boolean }) {
  const player = useNotePlayer(url);
  useEffect(() => {
    if (playing !== player.playing) player.toggle();
    // Only a change in `playing` should start or stop the sound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  return null;
}
