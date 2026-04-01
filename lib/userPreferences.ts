/**
 * lib/userPreferences.ts
 *
 * Thin AsyncStorage wrapper for user-scoped preferences that need to
 * persist across sessions but do not require server-side storage.
 *
 * Current preferences:
 *   - auto_advance       Global default for Sequential mode auto-advance.
 *   - guide_advance_[id] Per-guide override. Set when the user resolves a
 *                        conflict between their global default and a guide's
 *                        creator-set default, or when they toggle auto-advance
 *                        directly from the guide execution screen.
 *
 * All values are stored as plain strings ('true' / 'false') to keep
 * AsyncStorage reads simple and avoid JSON parse errors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  autoAdvance:       'pref_auto_advance',
  guideAdvance: (id: string) => `pref_guide_advance_${id}`,
};

export const UserPreferences = {

  // ---------------------------------------------------------------------------
  // Global auto-advance preference
  // ---------------------------------------------------------------------------

  /**
   * Returns the user's global auto-advance default.
   * Returns null if the user has never set a preference (use guide default).
   */
  async getAutoAdvance(): Promise<boolean | null> {
    const val = await AsyncStorage.getItem(KEYS.autoAdvance);
    if (val === null) return null;
    return val === 'true';
  },

  /** Saves the user's global auto-advance default. */
  async setAutoAdvance(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.autoAdvance, String(value));
  },

  // ---------------------------------------------------------------------------
  // Per-guide auto-advance override
  // ---------------------------------------------------------------------------

  /**
   * Returns the user's saved choice for a specific guide.
   * Returns null if the user has never made a per-guide choice
   * (i.e., the conflict prompt has not been shown yet for this guide).
   */
  async getGuideAdvanceChoice(guideId: string): Promise<boolean | null> {
    const val = await AsyncStorage.getItem(KEYS.guideAdvance(guideId));
    if (val === null) return null;
    return val === 'true';
  },

  /** Saves the user's choice for a specific guide. */
  async setGuideAdvanceChoice(guideId: string, value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.guideAdvance(guideId), String(value));
  },

  // ---------------------------------------------------------------------------
  // Position (Sequential mode resume)
  // ---------------------------------------------------------------------------

  /** Returns the last saved phase/step position for a standalone guide. */
  async getGuidePosition(guideId: string): Promise<{ phase: number; step: number } | null> {
    const val = await AsyncStorage.getItem(`guide_pos_${guideId}`);
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed.phase === 'number' && typeof parsed.step === 'number') {
        return parsed;
      }
    } catch {}
    return null;
  },

  /** Saves the current phase/step position for a standalone guide. */
  async setGuidePosition(guideId: string, phase: number, step: number): Promise<void> {
    await AsyncStorage.setItem(`guide_pos_${guideId}`, JSON.stringify({ phase, step }));
  },

  // ---------------------------------------------------------------------------
  // Checklist item states (per-step sub-item check persistence)
  // ---------------------------------------------------------------------------

  /**
   * Returns the set of checked item IDs for a checklist step.
   * Used for standalone guide execution (not event-bound).
   */
  async getChecklistState(stepId: string): Promise<Set<string>> {
    const val = await AsyncStorage.getItem(`checklist_${stepId}`);
    if (!val) return new Set();
    try {
      return new Set(JSON.parse(val) as string[]);
    } catch {
      return new Set();
    }
  },

  /** Persists the set of checked item IDs for a checklist step. */
  async setChecklistState(stepId: string, checkedIds: Set<string>): Promise<void> {
    await AsyncStorage.setItem(`checklist_${stepId}`, JSON.stringify([...checkedIds]));
  },
};
