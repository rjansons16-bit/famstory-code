import type { Slide } from '@/domain/film';

/**
 * On a phone the year's film plays in the app (app/film.tsx), but is not yet
 * saved as a file: that needs a native video encoder, which the web version
 * gets for free from MediaRecorder. The screen says so instead of offering it.
 */

export interface FilmLabels {
  title: string;
  tagline: string;
}

export function canRecordFilm(): boolean {
  return false;
}

export async function recordFilm(
  _slides: Slide[],
  _labels: FilmLabels,
  _onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; extension: 'mp4' | 'webm'; mimeType: string }> {
  throw new Error('Saving the film as a video works in the browser for now.');
}
