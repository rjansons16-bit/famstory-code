/**
 * FROM THE DEMO TO THE REAL APP - somebody who has looked round the sample
 * family and wants one of their own.
 *
 * Only the web build has a real copy to go to (./demo-exit.web.ts): the demo
 * is a web build on sample data, served beside the real one. A phone build on
 * the sample family is design review, and has nowhere to send anybody.
 */

/** Where the button was: said to analytics, and nothing else. */
export type DemoExitFrom = 'welcome' | 'signIn' | 'profile';

/** Whether this build can send somebody from the demo to the real app. */
export function canLeaveDemo(): boolean {
  return false;
}

/** Sends them there. */
export function leaveDemo(_from: DemoExitFrom): void {}
