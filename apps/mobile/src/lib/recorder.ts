import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { VOICE_NOTE_MAX_SECONDS, pickRecordingType } from '@/domain/voice';

/**
 * RECORDING A VOICE NOTE, in the browser (domain/voice.ts says what it is for).
 *
 * The browser's own MediaRecorder: no package, nothing sent anywhere while
 * recording - the sound stays in this page until the event is saved and it
 * goes up to our server with the photographs.
 *
 * The phone's is recorder.native.ts, with expo-audio and the same answers.
 */

export type RecorderAvailability = 'ready' | 'insecure' | 'unsupported';

/**
 * Whether this page can record at all. `insecure` is its own answer because
 * it is the common one here: the LAN address is plain http, and a browser
 * gives no microphone to that - only to https or the computer's own localhost.
 */
export function recorderAvailability(): RecorderAvailability {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  return pickRecordingType((type) => MediaRecorder.isTypeSupported(type)) ? 'ready' : 'unsupported';
}

export interface Recording {
  /** A blob: URL for this page - played from here until it is uploaded. */
  uri: string;
  mimeType: string;
  durationSec: number;
  /** Known in the browser; a phone learns it only when the upload reads the file. */
  sizeBytes?: number;
}

export type StartOutcome = 'started' | 'denied' | 'failed';

interface Live {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  startedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  cancelled: boolean;
}

export function useVoiceRecorder(onRecorded: (recording: Recording) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const live = useRef<Live>({
    recorder: null,
    stream: null,
    chunks: [],
    startedAt: 0,
    timer: null,
    cancelled: false,
  });
  // The latest callback, without restarting a recording when it changes.
  const done = useRef(onRecorded);
  useEffect(() => {
    done.current = onRecorded;
  }, [onRecorded]);

  const release = useCallback(() => {
    const l = live.current;
    if (l.timer) clearInterval(l.timer);
    l.timer = null;
    // The microphone light goes off the moment recording stops, not when the
    // page is left.
    l.stream?.getTracks().forEach((track) => track.stop());
    l.stream = null;
  }, []);

  const start = useCallback(async (): Promise<StartOutcome> => {
    const l = live.current;
    if (l.recorder?.state === 'recording') return 'started';

    const type = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return 'failed';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: type });

      l.stream = stream;
      l.recorder = recorder;
      l.chunks = [];
      l.cancelled = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) l.chunks.push(event.data);
      };
      recorder.onstop = () => {
        const seconds = (Date.now() - l.startedAt) / 1000;
        release();
        setRecording(false);
        setElapsed(0);
        if (l.cancelled || l.chunks.length === 0) return;

        const blob = new Blob(l.chunks, { type: recorder.mimeType || type });
        done.current({
          uri: URL.createObjectURL(blob),
          mimeType: blob.type,
          durationSec: Math.max(1, Math.round(seconds)),
          sizeBytes: blob.size,
        });
      };

      // A chunk a second: a tab that crashes loses a second, not the story.
      recorder.start(1000);
      l.startedAt = Date.now();
      l.timer = setInterval(() => {
        const seconds = (Date.now() - l.startedAt) / 1000;
        setElapsed(seconds);
        if (seconds >= VOICE_NOTE_MAX_SECONDS && recorder.state === 'recording') recorder.stop();
      }, 250);

      setRecording(true);
      return 'started';
    } catch (error) {
      release();
      setRecording(false);
      const name = (error as { name?: string } | null)?.name;
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed';
    }
  }, [release]);

  const stop = useCallback(() => {
    const recorder = live.current.recorder;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    live.current.cancelled = true;
    const recorder = live.current.recorder;
    if (recorder?.state === 'recording') recorder.stop();
    else release();
  }, [release]);

  // Leaving the screen mid-recording throws the recording away and frees the
  // microphone, rather than leaving it listening behind a closed composer.
  useEffect(
    () => () => {
      live.current.cancelled = true;
      if (live.current.recorder?.state === 'recording') live.current.recorder.stop();
      release();
    },
    [release],
  );

  return { recording, elapsed, start, stop, cancel };
}
