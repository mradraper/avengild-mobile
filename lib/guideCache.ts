/**
 * lib/guideCache.ts
 *
 * Stale-while-revalidate offline cache for guide data.
 *
 * Persists a full guide payload (guide metadata + phases + steps) to
 * AsyncStorage so the app can render the guide immediately on the next open —
 * even with no network — while silently refetching in the background.
 *
 * Also implements a local completion-event queue: step toggles written while
 * offline are stored here and flushed automatically when connectivity
 * returns (via a NetInfo listener).
 *
 * Usage in guide/[id].tsx:
 *
 *   import { guideCache } from '@/lib/guideCache';
 *
 *   // Show cached data immediately, then refetch
 *   const cached = await guideCache.get(id);
 *   if (cached) { setGuide(cached.guide); setPhases(cached.phases); }
 *   const fresh = await fetchFromSupabase(id);
 *   guideCache.set(id, fresh);
 *
 *   // Queue a completion while offline
 *   guideCache.queueCompletion(guideId, stepId, completed);
 *
 * Requires: @react-native-async-storage/async-storage (already in expo deps)
 *           @react-native-community/netinfo — install if not present:
 *           npx expo install @react-native-community/netinfo
 *
 * Until NetInfo is installed the sync listener is a no-op (same lazy-require
 * guard used in lib/notifications.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Guide, PhaseWithSteps } from './database.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX    = 'guide_cache_v1_';
const QUEUE_KEY       = 'guide_completion_queue_v1';
/** Cache entries older than this are still shown but trigger a background
 *  revalidation even when the device is online. */
const STALE_AFTER_MS  = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CachedGuide = {
  guide:     Guide;
  phases:    PhaseWithSteps[];
  cachedAt:  number; // Unix ms
};

type QueuedCompletion = {
  guideId:   string;
  stepId:    string;
  completed: boolean; // true = mark done, false = unmark
  queuedAt:  number;
};

// ---------------------------------------------------------------------------
// Lazy NetInfo import
// ---------------------------------------------------------------------------

let NetInfo: typeof import('@react-native-community/netinfo').default | null = null;
let _unsubscribeNetInfo: (() => void) | null = null;

try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  // @react-native-community/netinfo not installed — sync listener disabled.
}

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

async function get(guideId: string): Promise<CachedGuide | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + guideId);
    if (!raw) return null;
    return JSON.parse(raw) as CachedGuide;
  } catch {
    return null;
  }
}

async function set(guideId: string, data: Omit<CachedGuide, 'cachedAt'>): Promise<void> {
  try {
    const entry: CachedGuide = { ...data, cachedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + guideId, JSON.stringify(entry));
  } catch {
    // Storage quota or serialisation error — silently ignore
  }
}

async function invalidate(guideId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + guideId);
  } catch { /* no-op */ }
}

function isStale(entry: CachedGuide): boolean {
  return Date.now() - entry.cachedAt > STALE_AFTER_MS;
}

// ---------------------------------------------------------------------------
// Offline completion queue
// ---------------------------------------------------------------------------

async function getQueue(): Promise<QueuedCompletion[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedCompletion[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* no-op */ }
}

async function queueCompletion(guideId: string, stepId: string, completed: boolean): Promise<void> {
  const queue = await getQueue();
  // Replace any earlier entry for the same step (last write wins)
  const filtered = queue.filter(q => !(q.guideId === guideId && q.stepId === stepId));
  filtered.push({ guideId, stepId, completed, queuedAt: Date.now() });
  await saveQueue(filtered);
}

/**
 * Flush queued completions to Supabase. Called when connectivity is restored.
 * Requires the supabase client — imported lazily to avoid circular deps.
 */
async function flushQueue(): Promise<void> {
  const queue = await getQueue();
  if (queue.length === 0) return;

  let supabase: any;
  try {
    supabase = require('./supabase').supabase;
  } catch {
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const failed: QueuedCompletion[] = [];

  for (const item of queue) {
    if (item.completed) {
      const { error } = await supabase
        .from('step_progress')
        .upsert({ user_id: user.id, guide_id: item.guideId, step_id: item.stepId });
      if (error) failed.push(item);
    } else {
      const { error } = await supabase
        .from('step_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('guide_id', item.guideId)
        .eq('step_id', item.stepId);
      if (error) failed.push(item);
    }
  }

  // Only keep entries that failed to sync
  await saveQueue(failed);
}

// ---------------------------------------------------------------------------
// NetInfo connectivity listener — flushes queue when online
// ---------------------------------------------------------------------------

function startSyncListener(): () => void {
  if (!NetInfo) return () => {};

  if (_unsubscribeNetInfo) {
    _unsubscribeNetInfo();
    _unsubscribeNetInfo = null;
  }

  const unsub = NetInfo.addEventListener((state: any) => {
    if (state.isConnected) {
      flushQueue().catch(() => {});
    }
  });

  _unsubscribeNetInfo = unsub;
  return unsub;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const guideCache = {
  get,
  set,
  invalidate,
  isStale,
  queueCompletion,
  flushQueue,
  startSyncListener,
};
