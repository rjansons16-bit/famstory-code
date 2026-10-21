/**
 * Minimal i18n.
 *
 * Two languages: English (./strings.ts) and Latvian (./lv.ts). The Latvian
 * dictionary is typed as `typeof strings`, so a key added to one and forgotten
 * in the other is a compile error rather than a blank label on a screen.
 *
 * ┌─ WHY `t` IS STILL A PLAIN FUNCTION AND NOT A HOOK ───────────────────────┐
 * │ A language switch MUST be reactive. One shipped once as a module-level   │
 * │ `let current` plus `setLocale()`, and it did nothing at all: React never │
 * │ learned the value had changed, and with React Compiler enabled           │
 * │ (app.json → experiments.reactCompiler) `t('some.key')` is memoised as a  │
 * │ pure call and is not re-evaluated on a re-render either.                 │
 * │                                                                          │
 * │ The note that used to sit here prescribed a `useT()` hook. That cannot   │
 * │ be the whole answer, because `t()` is also called from places that are   │
 * │ not components and cannot hold a hook — `reminderLabel` in lib/date.ts,  │
 * │ the error mapping in lib/auth-errors.ts, the category names in           │
 * │ domain/categories.ts. Half the app's text would have had to move.        │
 * │                                                                          │
 * │ So the locale lives in a store (data/locale.ts), exactly as the rule     │
 * │ asks, and `t()` reads it synchronously — which works from anywhere. What │
 * │ makes it reactive is the root: app/_layout.tsx keys the whole tree on    │
 * │ the locale, so changing the language mounts a fresh tree whose memoised  │
 * │ calls are computed again. One switch, every screen, including the text   │
 * │ a date helper produced.                                                  │
 * │                                                                          │
 * │ What this design cannot survive is `t()` at MODULE level — a constant    │
 * │ built once at import time keeps the language it was imported in. There   │
 * │ is none today, and i18n.test.ts fails if one appears.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { currentLocale, type Locale } from '@/data/locale';
import { lv } from './lv';
import { strings, type StringKey } from './strings';

type Dict = typeof strings;

const DICTIONARIES: Record<Locale, Dict> = { en: strings, lv };

/** The dictionary to answer from, right now. */
function dict(): Dict {
  return DICTIONARIES[currentLocale()] ?? strings;
}

type StringKeys = {
  [K in StringKey]: Dict[K] extends string ? K : never;
}[StringKey];

type FnKeys = Exclude<StringKey, StringKeys>;

/** Plain key with no arguments. */
export function t(key: StringKeys): string {
  return dict()[key] as string;
}

/** Key that takes an argument, e.g. `tf('timeline.comments', 3)`. */
export function tf<K extends FnKeys>(
  key: K,
  ...args: Dict[K] extends (...a: infer A) => string ? A : never
): string {
  const fn = dict()[key] as unknown as (...a: unknown[]) => string;
  return fn(...(args as unknown[]));
}

export { strings, lv };
/** A key `t()` accepts: a plain string, not one of the parameterised ones. */
export type { StringKey, StringKeys as TextKey };
