import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * PLAYING ONE VOICE NOTE, in the browser: the page's own Audio element.
 * note-player.native.ts is the phone's, with the same answer, so the
 * VoiceNote component draws one player for both.
 */

export interface NotePlayer {
  canPlay: boolean;
  playing: boolean;
  /** Seconds in. */
  position: number;
  /** The length as the file reports it, once it does; null until then. */
  measured: number | null;
  failed: boolean;
  /** Play or pause. Returns true when it started playing, for the count. */
  toggle: () => boolean;
  clearFailure: () => void;
}

export function useNotePlayer(url: string): NotePlayer {
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  const [measured, setMeasured] = useState<number | null>(null);

  const canPlay = Platform.OS === 'web' && typeof Audio !== 'undefined';

  // A new link (after a refresh) is a new player; leaving stops the sound.
  useEffect(
    () => () => {
      player.current?.pause();
      player.current = null;
    },
    [url],
  );

  function playerFor(): HTMLAudioElement {
    if (player.current) return player.current;
    const audio = new Audio(url);
    audio.preload = 'metadata';
    audio.ontimeupdate = () => setPosition(audio.currentTime);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) setMeasured(audio.duration);
    };
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.onended = () => {
      setPlaying(false);
      setPosition(0);
    };
    audio.onerror = () => {
      setPlaying(false);
      setFailed(true);
      player.current = null;
    };
    player.current = audio;
    return audio;
  }

  function toggle(): boolean {
    if (!canPlay) return false;
    const audio = playerFor();
    if (!audio.paused) {
      audio.pause();
      return false;
    }
    setFailed(false);
    audio.play().catch(() => {
      setFailed(true);
      player.current = null;
    });
    return true;
  }

  return { canPlay, playing, position, measured, failed, toggle, clearFailure: () => setFailed(false) };
}
