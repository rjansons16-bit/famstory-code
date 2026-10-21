import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * DICTATION - speech into the words of a field (domain/voice.ts says why it
 * is asked about before the first time).
 *
 * The browser's SpeechRecognition, which is Google's service in Chrome and
 * Edge and Apple's in Safari. Nothing here records or keeps the sound: the
 * browser hands back finished phrases and they are added to the field as
 * text. Firefox has no such service, and a native build would need a package
 * of its own, so both answer "unsupported" and the button is not shown.
 */

export type DictationAvailability = 'ready' | 'insecure' | 'unsupported';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationAvailability(): DictationAvailability {
  if (!recognitionConstructor()) return 'unsupported';
  return window.isSecureContext ? 'ready' : 'insecure';
}

/** Has this browser been told where dictation's sound goes? Per device, like the theme. */
const NOTICE_KEY = 'famstory.dictation.noticeSeen';

export function dictationNoticeSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberDictationNotice(): void {
  try {
    globalThis.localStorage?.setItem(NOTICE_KEY, '1');
  } catch {
    // Storage refused - the notice is shown again next time, which is the safe way round.
  }
}

export type DictationEnd = 'stopped' | 'failed';

export function useDictation() {
  const [listening, setListening] = useState(false);
  const active = useRef<Recognition | null>(null);

  const stop = useCallback(() => {
    active.current?.stop();
  }, []);

  /**
   * Listen, handing each finished phrase to `onPhrase`, until stopped or the
   * browser stops by itself; `onEnd` says which.
   */
  const start = useCallback(
    (lang: string, onPhrase: (text: string) => void, onEnd?: (how: DictationEnd) => void) => {
      const Constructor = recognitionConstructor();
      if (!Constructor) return false;
      active.current?.abort();

      const recognition = new Constructor();
      recognition.lang = lang;
      recognition.continuous = true;
      // Finished phrases only: text that rewrites itself under the cursor
      // while somebody is still talking is harder to trust than a short wait.
      recognition.interimResults = false;

      let failed = false;
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) onPhrase(result[0]?.transcript ?? '');
        }
      };
      recognition.onerror = (event) => {
        // "no-speech" and "aborted" are silence and the stop button, not faults.
        if (event.error !== 'no-speech' && event.error !== 'aborted') failed = true;
      };
      recognition.onend = () => {
        // A session that was replaced ends after its successor began; it must
        // not switch the new one's state off on its way out.
        if (active.current === recognition) {
          active.current = null;
          setListening(false);
        }
        onEnd?.(failed ? 'failed' : 'stopped');
      };

      try {
        recognition.start();
      } catch {
        return false;
      }
      active.current = recognition;
      setListening(true);
      return true;
    },
    [],
  );

  // Never listening behind a screen that has gone.
  useEffect(() => () => active.current?.abort(), []);

  return { listening, start, stop };
}
