import { View } from 'react-native';

import { IconButton } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import type { Attachment } from '@/domain/types';
import { formatDuration } from '@/domain/voice';
import { t, tf } from '@/i18n';
import { useNotePlayer } from '@/lib/note-player';
import { useTheme } from '@/theme';

/**
 * ONE VOICE NOTE: play, pause, how far, how long.
 *
 * The player underneath is the browser's or the phone's (lib/note-player.ts
 * and .native.ts); this draws the same row over either.
 *
 * The length shown is the one the recorder measured (Attachment.durationSec):
 * a browser's own recording often does not know its length until it has been
 * played to the end, and "0:00 / Infinity" is not a thing to show a family.
 *
 * The link is signed for half an hour, like a photograph's. A note played on a
 * screen left open longer finds it expired; the answer is a refresh, which
 * brings fresh links, and then the same button plays it.
 */
export function VoiceNote({
  note,
  onRemove,
  onPlay,
}: {
  note: Attachment;
  onRemove?: () => void;
  /** Told when it starts to play. */
  onPlay?: () => void;
}) {
  const theme = useTheme();
  const syncNow = useApp((s) => s.syncNow);
  const player = useNotePlayer(note.url);

  const length = note.durationSec ?? player.measured ?? 0;
  const progress = length > 0 ? Math.min(1, player.position / length) : 0;

  function toggle() {
    if (player.toggle()) {
      track({ name: 'voice_note_played' });
      onPlay?.();
    }
  }

  return (
    <View
      accessibilityLabel={tf('voice.label', formatDuration(length))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        paddingLeft: theme.spacing.xs,
        paddingRight: onRemove ? 0 : theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.surfaceMuted,
      }}
    >
      <IconButton
        name={player.playing ? 'pause' : 'play'}
        tone="primary"
        disabled={!player.canPlay}
        accessibilityLabel={player.playing ? t('voice.pause') : t('voice.play')}
        onPress={toggle}
      />

      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <View
          style={{
            height: 4,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.border,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              backgroundColor: theme.color.primary,
            }}
          />
        </View>

        {player.failed ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Text variant="caption" tone="danger">
              {t('voice.couldNotPlay')}
            </Text>
            <Touchable
              accessibilityRole="button"
              hitSlop={8}
              give="row"
              onPress={() => {
                // Most likely an expired link: fetch fresh ones.
                void syncNow().then(player.clearFailure);
              }}
            >
              <Text variant="caption" tone="primary">
                {t('error.retry')}
              </Text>
            </Touchable>
          </View>
        ) : (
          <Text variant="caption" tone="muted">
            {`${formatDuration(player.position)} / ${formatDuration(length)}`}
          </Text>
        )}
      </View>

      {onRemove ? (
        <IconButton name="close" accessibilityLabel={t('voice.remove')} onPress={onRemove} />
      ) : null}
    </View>
  );
}
