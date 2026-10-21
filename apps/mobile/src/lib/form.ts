/**
 * The one rule every name and title field shares.
 *
 * Two characters, not one: a single character is far more often a slip of the
 * finger than a name, and a name is what the family reads on every event.
 *
 * The rule itself was always there. What was missing is saying it. Each screen
 * disabled its button until the rule was met and showed nothing else, so a
 * one-letter name looked like a Continue button that had stopped working.
 * Screens now leave the button pressable and put the sentence under the field.
 */
export const MIN_TEXT_LENGTH = 2;

export function isLongEnough(value: string): boolean {
  return value.trim().length >= MIN_TEXT_LENGTH;
}
