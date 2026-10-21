import { Redirect } from 'expo-router';

/**
 * A placeholder route so the tab bar has a middle slot for the "+".
 *
 * The button never actually navigates here — `ComposeTabButton` pushes
 * `/event/new` as a modal instead. This exists only so the navigator has five
 * slots to lay out, and it redirects in the one case that could still reach it:
 * a deep link, or a hardware back that lands on the slot itself.
 */
export default function ComposeSlot() {
  return <Redirect href="/event/new" />;
}
