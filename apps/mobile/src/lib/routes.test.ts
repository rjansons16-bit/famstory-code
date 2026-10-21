import { opensWithoutAccount } from './routes';

describe('Which pages open without an account', () => {
  it('lets the entry point decide for itself', () => {
    expect(opensWithoutAccount([])).toBe(true);
  });

  it('opens the front door, an invitation, a guest link and a password link', () => {
    expect(opensWithoutAccount(['(auth)', 'welcome'])).toBe(true);
    expect(opensWithoutAccount(['(auth)', 'sign-in'])).toBe(true);
    expect(opensWithoutAccount(['join', '[code]'])).toBe(true);
    expect(opensWithoutAccount(['guest', '[token]'])).toBe(true);
    expect(opensWithoutAccount(['reset', '[token]'])).toBe(true);
  });

  it('opens the privacy policy and the terms to anybody, before there is an account to sign', () => {
    expect(opensWithoutAccount(['legal', '[doc]'])).toBe(true);
  });

  it('opens support to somebody who no longer has the app, to delete their account', () => {
    expect(opensWithoutAccount(['support'])).toBe(true);
  });

  it('keeps everything with a family in it behind an account', () => {
    expect(opensWithoutAccount(['event', 'new'])).toBe(false);
    expect(opensWithoutAccount(['event', '[id]'])).toBe(false);
    expect(opensWithoutAccount(['(tabs)', 'calendar'])).toBe(false);
    expect(opensWithoutAccount(['(onboarding)', 'about-you'])).toBe(false);
    expect(opensWithoutAccount(['shelf'])).toBe(false);
    expect(opensWithoutAccount(['sticker', '[eventId]'])).toBe(false);
  });

  it('fails closed on a page it has never heard of', () => {
    expect(opensWithoutAccount(['+not-found'])).toBe(false);
    expect(opensWithoutAccount(['something-new'])).toBe(false);
  });
});
