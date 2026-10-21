import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useApp } from '@/data/store';
import { VISIT_GAP_MS } from '@/domain/whats-new';

/**
 * BRINGING A SCREEN UP TO DATE.
 *
 * Everything this device does is applied locally as it happens, so the person
 * holding the phone always sees their own work immediately. What they did not
 * see, before this file existed, was anybody else's: the snapshot was read
 * once at launch and never again, so a photograph a grandmother added at noon
 * appeared only after the app was closed and opened. On a shared family
 * timeline that is the difference between a product and a demo.
 *
 * Two triggers, because they are two different questions:
 *
 *   - pulling down is "is there anything new?", asked deliberately;
 *   - coming back to the app is the same question asked by having put the
 *     phone down. Anything fresher than STALE_AFTER_MS is left alone, so
 *     switching to the camera to take a picture and coming straight back does
 *     not cost a request.
 */

/** Long enough that a trip to the camera is free, short enough to feel live. */
const STALE_AFTER_MS = 60_000;

export interface PullToRefresh {
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * The two props a `RefreshControl` needs.
 *
 * On the mock backend `syncNow` resolves immediately and the spinner blinks
 * rather than spins. That is honest — there is nothing to fetch — and worth
 * more than a fake delay that would also be in the real build.
 */
export function usePullToRefresh(): PullToRefresh {
  const syncNow = useApp((s) => s.syncNow);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void syncNow().finally(() => {
      // The user can pull and immediately navigate away; the answer arrives
      // after this component is gone.
      if (mounted.current) setRefreshing(false);
    });
  }, [syncNow]);

  return { refreshing, onRefresh };
}

/**
 * Refetch when the app comes back to the foreground. Mounted once, at the root.
 *
 * Reading the store through `getState()` instead of subscribing is deliberate:
 * this effect must not be torn down and rebuilt every time the session or the
 * timestamp changes, or a re-render during a listener's lifetime could drop the
 * listener that was about to fire.
 */
export function useForegroundSync(): void {
  const syncNow = useApp((s) => s.syncNow);

  useEffect(() => {
    // When the app last went out of sight. Coming back after VISIT_GAP_MS is a
    // new visit, and "new since you last looked" starts counting from the one
    // before it; coming back from the camera is the same visit.
    let leftAt: number | null = null;

    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') {
        leftAt ??= Date.now();
        return;
      }

      const awayFor = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;

      const { session, lastSyncedAt, startVisit } = useApp.getState();
      // Nobody to refresh for: the welcome screen has no family behind it.
      if (!session) return;
      if (lastSyncedAt !== null && Date.now() - lastSyncedAt < STALE_AFTER_MS) return;

      void syncNow().then(() => {
        if (awayFor >= VISIT_GAP_MS) void startVisit();
      });
    });

    return () => subscription.remove();
  }, [syncNow]);
}
