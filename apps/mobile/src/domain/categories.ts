/**
 * Life-cycle categories.
 *
 * The feasibility study lists these as one of the differentiators: no
 * competitor (Cozi, FamilyWall, Tinybeans, Life360, Todoist) offers a
 * structured life-cycle model.
 *
 * So a category is NOT just a coloured tag. It is:
 *   - the basis for the archive and yearly summaries,
 *   - the basis for AI classification in V2,
 *   - the basis for timeline filters.
 */

import type { Category, CategoryId } from './types';

export const CATEGORIES: Category[] = [
  { id: 'development', labelKey: 'category.development', tone: 'growth' },
  { id: 'education', labelKey: 'category.education', tone: 'learn' },
  { id: 'milestone', labelKey: 'category.milestone', tone: 'landmark' },
  { id: 'health', labelKey: 'category.health', tone: 'care' },
  { id: 'celebration', labelKey: 'category.celebration', tone: 'joy' },
  { id: 'travel', labelKey: 'category.travel', tone: 'journey' },
  { id: 'activity', labelKey: 'category.activity', tone: 'routine' },
  { id: 'chore', labelKey: 'category.chore', tone: 'task' },
  { id: 'finance', labelKey: 'category.finance', tone: 'money' },
  { id: 'other', labelKey: 'category.other', tone: 'neutral' },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, Category>;

/**
 * The MVP "AI" category suggestion: keyword matching, not a model.
 *
 * Keywords are STEMS, not whole words, so plurals and possessives all match a
 * single entry ("school", "schools", "school's" all hit "school").
 *
 * A deliberate choice: the study's risk "complexity of AI integration"
 * recommends only simple functions at MVP level. This gives 80% of the value at
 * 0% of the cost, and its output has the same shape as a later LLM version
 * (a Suggestion object), so the UI does not change when the backend does.
 *
 * Keep this list in sync with apps/api/src/modules/ai/ai.service.ts.
 */
const KEYWORDS: Partial<Record<CategoryId, string[]>> = {
  // No bare ordinals like "first": they are modifiers, not category signals.
  // "First day of school" is education, not development.
  development: ['step', 'tooth', 'teeth', 'crawl', 'walked', 'grew', 'weigh'],
  education: ['school', 'lesson', 'exam', 'homework', 'teacher', 'nursery', 'graduation'],
  milestone: ['wedding', 'anniversar', 'moving', 'christening', 'engage'],
  health: ['doctor', 'dentist', 'appointment', 'vaccin', 'hospital', 'clinic', 'checkup', 'fever'],
  celebration: ['birthday', 'party', 'christmas', 'easter', 'new year', 'celebrat'],
  travel: ['trip', 'travel', 'holiday', 'vacation', 'flight', 'hotel', 'seaside', 'camping'],
  activity: ['practice', 'training', 'rehearsal', 'concert', 'match', 'club', 'swim'],
  chore: ['chore', 'task', 'groceries', 'shopping', 'laundry', 'repair', 'inspection'],
  finance: ['payment', 'loan', 'insurance', 'tax', 'invoice', 'mortgage', 'bill'],
};

export function suggestCategory(title: string, description = ''): CategoryId | null {
  const haystack = `${title} ${description}`.toLowerCase();
  if (haystack.trim().length < 3) return null;

  let best: { id: CategoryId; hits: number; specificity: number } | null = null;

  for (const [id, words] of Object.entries(KEYWORDS) as [CategoryId, string[]][]) {
    const matched = words.filter((w) => haystack.includes(w));
    if (matched.length === 0) continue;

    // Specificity = the length of the longest matched stem. This breaks ties:
    // a longer stem is a more specific signal than a short generic word.
    // Without it the winner would depend on object key order, which is
    // arbitrary from the user's point of view.
    const specificity = Math.max(...matched.map((w) => w.length));

    const better =
      !best ||
      matched.length > best.hits ||
      (matched.length === best.hits && specificity > best.specificity);

    if (better) best = { id, hits: matched.length, specificity };
  }

  return best?.id ?? null;
}
