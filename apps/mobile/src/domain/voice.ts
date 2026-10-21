/**
 * VOICE - a note told instead of typed, and text spoken instead of typed.
 *
 * Two different things that share a microphone:
 *
 *   A VOICE NOTE is a recording kept with the event, played back by the
 *   family. It goes to our server like a photograph and nowhere else, and is
 *   seen by exactly the people the event is for. It never reaches a guest link.
 *
 *   DICTATION turns speech into the words of the title or the description.
 *   The browser does it - which means the browser's maker does it: Chrome and
 *   Edge send the sound to Google, Safari to Apple. FamStory only ever sees the
 *   text. That is why the app says so before the first time, and why dictation
 *   is a button somebody presses, never something that listens by itself.
 *
 * Both need the page to be a secure one (https, or the computer's own
 * localhost): a browser gives no microphone to a plain http address - which
 * the LAN address is. The screens explain that rather than showing a button
 * that cannot work.
 *
 * What is here is the part with no browser in it, so it can be tested.
 */

/** Long enough for a story, short enough to be listened to. */
export const VOICE_NOTE_MAX_SECONDS = 5 * 60;

/**
 * The format to record in, the first this browser can make: Opus in WebM
 * (Chrome, Edge), AAC in MP4 (Safari), Opus in Ogg (older Firefox). All three
 * are what the server accepts (apps/api/src/common/storage/storage.service.ts).
 */
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export function pickRecordingType(isSupported: (type: string) => boolean): string | null {
  return RECORDING_TYPES.find((type) => {
    try {
      return isSupported(type);
    } catch {
      return false;
    }
  }) ?? null;
}

/** "audio/webm;codecs=opus" -> "audio/webm": the parameters are the browser's business. */
export function baseType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** 7 -> "0:07", 84 -> "1:24", 723 -> "12:03". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * What was spoken, added to what was already written.
 *
 * Speech comes back without the capital a sentence starts with and without
 * the space that separates it from the words before, so both are supplied:
 * a capital at the start of the field or after a full stop, a space unless
 * there already is one. Nothing else is changed - the words are the person's.
 */
export function appendDictation(current: string, spoken: string): string {
  const words = spoken.trim().replace(/\s+/g, ' ');
  if (!words) return current;

  const before = current.replace(/\s+$/, '');
  const startsSentence = before === '' || /[.!?…]$/.test(before);
  const phrase = startsSentence ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : words;

  if (before === '') return phrase;
  return `${current}${/\s$/.test(current) ? '' : ' '}${phrase}`;
}

/** The language to listen for: the one the app is in. */
export function speechLanguage(locale: 'lv' | 'en'): string {
  return locale === 'lv' ? 'lv-LV' : 'en-GB';
}
