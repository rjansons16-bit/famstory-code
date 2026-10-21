import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { VOICE_NOTE_MAX_SECONDS } from '@/domain/voice';

import type { Recording, RecorderAvailability, StartOutcome } from './recorder';

/**
 * RECORDING A VOICE NOTE, on a phone - the same promise as recorder.ts (the
 * browser's), kept by expo-audio instead of MediaRecorder, so the composer is
 * one screen for both.
 *
 * A phone asks for the microphone itself, the first time, with the words in
 * app.json; there is no secure-address question here - that one belongs to
 * pages, not to apps.
 */

export type { Recording, RecorderAvailability, StartOutcome } from './recorder';

/**
 * A voice, not music: one channel of AAC at a speech rate. Five minutes is
 * about 2.4 MB, well inside what the server takes (MAX_AUDIO_BYTES), where the
 * music preset would be twice that for nothing a story needs.
 */
const VOICE: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
};

/** On a phone the answer comes from the permission prompt, when it is asked. */
export function recorderAvailability(): RecorderAvailability {
  return 'ready';
}

export function useVoiceRecorder(onRecorded: (recording: Recording) => void) {
  const recorder = useAudioRecorder(VOICE);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const finishing = useRef(false);

  // The latest callback, without restarting a recording when it changes.
  const done = useRef(onRecorded);
  useEffect(() => {
    done.current = onRecorded;
  }, [onRecorded]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;

    const seconds = (Date.now() - startedAt.current) / 1000;
    try {
      await recorder.stop();
    } catch {
      // Already stopped - by the limit, or by leaving the screen.
    }
    // Back to playing through the speaker. On an iPhone a session left open for
    // recording sends every sound after it to the earpiece, where a voice note
    // is a whisper.
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);

    setRecording(false);
    setElapsed(0);
    finishing.current = false;

    const uri = recorder.uri;
    if (cancelled.current || !uri) return;
    done.current({
      uri,
      // What the preset records into; the file itself says .m4a.
      mimeType: 'audio/mp4',
      durationSec: Math.max(1, Math.round(seconds)),
    });
  }, [recorder]);

  const start = useCallback(async (): Promise<StartOutcome> => {
    if (recording) return 'started';

    const permission = await requestRecordingPermissionsAsync().catch(() => null);
    if (!permission?.granted) return 'denied';

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      return 'failed';
    }

    cancelled.current = false;
    startedAt.current = Date.now();
    setRecording(true);
    timer.current = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      setElapsed(seconds);
      if (seconds >= VOICE_NOTE_MAX_SECONDS) void finish();
    }, 250);
    return 'started';
  }, [finish, recorder, recording]);

  const stop = useCallback(() => {
    void finish();
  }, [finish]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    void finish();
  }, [finish]);

  // Leaving the screen mid-recording throws the recording away and frees the
  // microphone, rather than leaving it listening behind a closed composer.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (timer.current) clearInterval(timer.current);
      if (recorder.isRecording) void recorder.stop().catch(() => undefined);
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    },
    [recorder],
  );

  return { recording, elapsed, start, stop, cancel };
}
