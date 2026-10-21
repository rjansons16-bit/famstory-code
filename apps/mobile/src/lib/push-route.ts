/**
 * Where a tapped push opens the app (lib/push.ts). The push carries only its
 * kind and an event's id (api modules/push/push-messages.ts); the event
 * screen then reads the event through the visibility check like any other
 * time - a push is never a way to see something.
 *
 * An id that is not one of ours opens the bell instead: a notification's
 * data is the one thing here that arrives from outside the app.
 */
export function routeForPush(data: unknown): string {
  const eventId = typeof data === 'object' && data !== null ? (data as { eventId?: unknown }).eventId : undefined;
  if (typeof eventId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(eventId)) return `/event/${eventId}`;
  return '/notifications';
}
