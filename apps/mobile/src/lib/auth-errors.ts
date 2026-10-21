/**
 * What to tell somebody whose sign-in did not work.
 *
 * The server answers in codes. Shown as they are, those codes are either
 * nothing at all or a sentence written for a developer — and the first person
 * to try this app against a real server typed an address and a password, pressed
 * the button, and saw nothing happen. They had no account; nothing said so.
 *
 * So every code a sign-in can produce maps to a sentence that says what to DO,
 * and "wrong email or password" always mentions creating an account, because on
 * a brand-new server that is by far the likeliest reason.
 */

import type { TextKey } from '@/i18n';

const BY_CODE: Record<string, TextKey> = {
  // Deliberately one message for both cases: the server does not reveal whether
  // an address has an account, and the screen must not undo that.
  invalid_credentials: 'auth.errorInvalidCredentials',
  email_taken: 'auth.errorEmailTaken',
  invalid_email: 'auth.errorInvalidEmail',
  weak_password: 'auth.errorWeakPassword',
  missing_name: 'auth.errorGeneric',
  // The server stopped counting guesses (api common/rate-limit.guard.ts). It
  // reaches a real person too - four wrong passwords in a row - so it has to
  // say the one thing that helps: this passes on its own.
  too_many_attempts: 'auth.errorTooManyAttempts',
  network_unreachable: 'auth.errorUnreachable',
  api_unreachable: 'auth.errorUnreachable',
  // Same advice: the server is either off or unreachable from here.
  request_timed_out: 'auth.errorUnreachable',
};

export function authErrorMessage(code: string | undefined): TextKey {
  return (code && BY_CODE[code]) || 'auth.errorGeneric';
}

/** The same floor the server enforces on registration (`assertRegistrable`). */
export const MIN_PASSWORD_LENGTH = 8;

export type FormProblem = 'auth.errorIncomplete' | 'auth.errorInvalidEmail' | 'auth.errorWeakPassword';

/**
 * What is wrong with the form before anything is sent, or null.
 *
 * A disabled button with no reason next to it is how "nothing happens" happened,
 * so the button stays pressable and pressing it explains. Signing in only needs
 * both fields filled: the length rule belongs to creating an account, and an
 * older account may predate it.
 */
export function formProblem(
  mode: 'signIn' | 'register',
  email: string,
  password: string,
): FormProblem | null {
  const address = email.trim();
  if (!address || !password) return 'auth.errorIncomplete';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return 'auth.errorInvalidEmail';
  if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) return 'auth.errorWeakPassword';
  return null;
}
