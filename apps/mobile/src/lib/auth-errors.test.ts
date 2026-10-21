import assert from 'node:assert/strict';

import { authErrorMessage, formProblem } from './auth-errors';

/**
 * Signing in has to explain itself.
 *
 * The first real attempt at this screen failed twice over and showed nothing
 * either time: a short password silently disabled the button, and a 401 from a
 * server that had no such account was swallowed. These pin both lessons.
 */

describe('Before anything is sent', () => {
  it('asks for both fields rather than doing nothing', () => {
    assert.equal(formProblem('signIn', '', ''), 'auth.errorIncomplete');
    assert.equal(formProblem('signIn', 'anna@example.com', ''), 'auth.errorIncomplete');
    assert.equal(formProblem('signIn', '   ', 'whatever'), 'auth.errorIncomplete');
  });

  it('says when the address is not an address', () => {
    assert.equal(formProblem('signIn', 'anna', 'secret'), 'auth.errorInvalidEmail');
    assert.equal(formProblem('register', 'anna@', 'long-enough'), 'auth.errorInvalidEmail');
  });

  it('does not hold an old short password against signing in', () => {
    // The length rule is for new accounts; an existing one may predate it.
    assert.equal(formProblem('signIn', 'anna@example.com', 'short'), null);
  });

  it('holds the same floor as the server when creating an account', () => {
    assert.equal(formProblem('register', 'anna@example.com', 'short77'), 'auth.errorWeakPassword');
    assert.equal(formProblem('register', 'anna@example.com', 'long-enough'), null);
  });
});

describe('After the server says no', () => {
  it('points a wrong password at creating an account too', () => {
    // On a new server, "no such account" is the likeliest reason — and the
    // server deliberately does not say which of the two it was.
    assert.equal(authErrorMessage('invalid_credentials'), 'auth.errorInvalidCredentials');
  });

  it('turns a taken address into an instruction to sign in', () => {
    assert.equal(authErrorMessage('email_taken'), 'auth.errorEmailTaken');
  });

  it('says the server is unreachable in words, whichever layer noticed', () => {
    assert.equal(authErrorMessage('network_unreachable'), 'auth.errorUnreachable');
    assert.equal(authErrorMessage('api_unreachable'), 'auth.errorUnreachable');
  });

  it('never leaves a code on screen', () => {
    assert.equal(authErrorMessage('something_new'), 'auth.errorGeneric');
    assert.equal(authErrorMessage(undefined), 'auth.errorGeneric');
  });
});
