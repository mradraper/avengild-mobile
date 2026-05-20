/**
 * lib/codexSignal.ts
 *
 * Module-level dirty flag for the Codex screen.
 *
 * Any screen that changes step completion state or codex entries can call
 * markCodexDirty() so the Codex re-fetches on its next focus, even though
 * the Codex component itself is not mounted at that point.
 *
 * The flag starts true so the first load always fetches.
 */

let _dirty = true;

/** Mark the Codex as needing a re-fetch on its next focus event. */
export function markCodexDirty(): void {
  _dirty = true;
}

/** True when the Codex should re-fetch on next focus. */
export function isCodexDirty(): boolean {
  return _dirty;
}

/** Clear the flag after a successful fetch. */
export function clearCodexDirty(): void {
  _dirty = false;
}
