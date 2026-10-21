import type { Locale } from '@/data/locale';

import type { LegalDoc } from './parse';
import generated from './texts.generated.json';

/**
 * The privacy policy and the terms, in the app's two languages.
 *
 * Generated from docs/legal/ (`npm run legal`, scripts/legal-texts.mjs). It is
 * never edited by hand: texts.test.ts fails while it is behind the documents.
 */
export type LegalDocId = 'privacy' | 'terms';

export const LEGAL_DOCS: readonly LegalDocId[] = ['privacy', 'terms'];

const TEXTS = generated as Record<LegalDocId, Record<Locale, LegalDoc>>;

/**
 * The version of the terms and the privacy policy this build publishes. The
 * server keeps which version each person accepted (POST /users/me/terms), and
 * the app asks again when it is not this one (app/terms.tsx).
 */
export const LEGAL_VERSION: string = TEXTS.terms.en.version ?? '';

export function isLegalDoc(value: unknown): value is LegalDocId {
  return value === 'privacy' || value === 'terms';
}

export function legalText(doc: LegalDocId, locale: Locale): LegalDoc {
  return TEXTS[doc][locale];
}

/** Whether any of them still has a blank in it - then it is a draft, and says so. */
export function legalTextsAreDrafts(): boolean {
  return LEGAL_DOCS.some((doc) => Object.values(TEXTS[doc]).some((text) => text.placeholders.length > 0));
}
