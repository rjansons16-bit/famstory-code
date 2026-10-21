import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import type { NotePlayer } from './note-player';

/**
 * PLAYING ONE VOICE NOTE, on a phone: expo-audio, answering exactly what the
 * browser's player does (note-player.ts).
 *
 * A signed link lives half an hour. A note that will not load after a press -
 * most likely a link that has expired on a screen left open - is reported as
 * failed, and the VoiceNote's "Try again" fetches fresh links.
 */

export type { NotePlayer } from './note-player';

/** How long a press may wait for the file before it counts as not coming. */
const LOAD_PATIENCE_MS = 8000;

export function useNotePlayer(url: string): NotePlayer {
  const player = useAudioPlayer(url, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loaded after all: whatever the press was waiting for has arrived.
  useEffect(() => {
    if (status.isLoaded && waiting.current) {
      clearTimeout(waiting.current);
      waiting.current = null;
    }
  }, [status.isLoaded]);

  // At the end, back to the start - so the next press plays it again.
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0).catch(() => undefined);
  }, [status.didJustFinish, player]);

  useEffect(
    () => () => {
      if (waiting.current) clearTimeout(waiting.current);
    },
    [],
  );

  function toggle(): boolean {
    if (status.playing) {
      player.pause();
      return false;
    }
    setFailed(false);
    try {
      player.play();
    } catch {
      setFailed(true);
      return false;
    }
    if (!status.isLoaded) {
      if (waiting.current) clearTimeout(waiting.current);
      waiting.current = setTimeout(() => {
        waiting.current = null;
        setFailed(true);
      }, LOAD_PATIENCE_MS);
    }
    return true;
  }

  const duration = status.isLoaded && Number.isFinite(status.duration) && status.duration > 0 ? status.duration : null;

  return {
    canPlay: true,
    playing: status.playing,
    position: status.currentTime,
    measured: duration,
    failed,
    toggle,
    clearFailure: () => setFailed(false),
  };
}
