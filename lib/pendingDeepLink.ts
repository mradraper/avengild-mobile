/**
 * pendingDeepLink.ts
 *
 * Module-level store for a deep-linked path that arrived while the user was
 * unauthenticated. After sign-in, guilds.tsx consumes it to redirect the user
 * to the screen they were originally trying to reach.
 *
 * A module-level variable persists across navigation without requiring a
 * React context provider or AsyncStorage (the value is only needed for the
 * lifetime of the current app session).
 */

let _pending: string | null = null;

/** Store a route path to redirect to after sign-in (e.g. "/event/abc123"). */
export function storePendingDeepLink(path: string): void {
  _pending = path;
}

/**
 * Retrieve and clear the pending path.
 * Returns null if none is stored.
 */
export function consumePendingDeepLink(): string | null {
  const path = _pending;
  _pending = null;
  return path;
}
