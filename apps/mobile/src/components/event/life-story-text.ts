import type { ChapterId, LifeStoryKey } from '@/domain/lifestory';
import { t } from '@/i18n';

/**
 * The words of a life-story question and of its chapter, from their keys
 * (domain/lifestory.ts). Called from render, never at module level: see
 * i18n/index.ts.
 */
export function lifeQuestionText(key: LifeStoryKey): string {
  return t(`lifestory.q.${key.slice('ls-'.length)}` as Parameters<typeof t>[0]);
}

export function chapterTitle(id: ChapterId): string {
  return t(`lifestory.chapter.${id}` as Parameters<typeof t>[0]);
}
