/**
 * FROM THE DEMO TO THE REAL APP, on the web.
 *
 * The demo is the same app on sample data with no server, served beside the
 * real copy (tools/lan-host/README.md, "The demo"). It cannot know where that
 * copy is, and an address written into it would be the wrong one from every
 * other way in - the laptop itself, the local network, Tailscale. So it asks
 * the place it came from: /real is where its host sends somebody on to the
 * real copy (tools/lan-host/static-server.mjs; on a domain, a redirect).
 *
 * Inside the phone view on a computer (tools/lan-host/phone.html) the page
 * around the phone goes over instead, and opens the real app on its phone:
 * it is the phone that goes to the real app, not the window that leaves the
 * phone behind. That page names its frames, which is how the app knows.
 */

import { track } from '@/domain/analytics';
import type { DemoExitFrom } from './demo-exit';

export type { DemoExitFrom };

/** The name tools/lan-host/phone.html gives the frames it draws the app in. */
const PHONE_VIEW_FRAME = 'famstory-phone';

export function canLeaveDemo(): boolean {
  return true;
}

export function leaveDemo(from: DemoExitFrom): void {
  track({ name: 'demo_left', from });
  if (window.parent !== window && window.name === PHONE_VIEW_FRAME) {
    window.parent.postMessage({ type: 'famstory:real' }, window.location.origin);
    return;
  }
  window.location.assign('/real');
}
