/**
 * GuideCreationContext.tsx
 *
 * Stores and manages the in-progress Guide draft for the creation wizard.
 *
 * All four wizard screens (guide-info, phases, steps, preview) read from and
 * write to this context, so the user can navigate between steps freely without
 * losing their work.
 *
 * The draft is purely in-memory — nothing is written to the database until
 * the user taps "Publish" in the preview screen. This prevents the Guides
 * table from accumulating abandoned drafts.
 *
 * On publish, the context's `publishGuide()` function:
 *   1. Inserts the `guides` row.
 *   2. Inserts all `phases` rows.
 *   3. Inserts all `step_cards` rows for each phase.
 *   4. Returns the new Guide's ID so the app can navigate to it.
 *
 * Usage:
 *   Wrap the create/ route group in <GuideCreationProvider> in its _layout.tsx.
 *   Then call `useGuideCreation()` in any wizard screen.
 */

import type { Enums } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import React, { createContext, useCallback, useContext, useState } from 'react';

// ---------------------------------------------------------------------------
// Draft types (client-side only — not persisted until publish)
// ---------------------------------------------------------------------------

export type DraftStep = {
  /** Temporary client-side ID. Never sent to the database. */
  localId:            string;
  atomic_action_text: string;
  curation_notes:     string;
  beginner_mistakes:  string;
  location_name:      string;
  intent_tag:         Enums['intent_tag'];
  /** When set, this step is a Mastery Tree portal to another Guide. */
  linked_guide_id:    string | null;
  linked_guide_title: string | null;
};

export type DraftPhase = {
  /** Temporary client-side ID. Never sent to the database. */
  localId:        string;
  title:          string;
  description:    string;
  execution_mode: Enums['execution_mode'];
  steps:          DraftStep[];
};

export type DraftGuide = {
  title:               string;
  description:         string;
  summary:             string;
  hero_media_url:      string | null;
  primary_location_name: string;
  stewardship_level:   Enums['stewardship_level'];
  derivative_licence:  Enums['derivative_licence'];
  difficulty_level:    string;
  duration_estimate:   string;
};

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

type GuideCreationContextValue = {
  guide:    DraftGuide;
  phases:   DraftPhase[];

  // Guide info
  setGuide: (updates: Partial<DraftGuide>) => void;

  // Phase management
  addPhase:        (phase: Omit<DraftPhase, 'localId' | 'steps'>) => string;
  updatePhase:     (localId: string, updates: Partial<Omit<DraftPhase, 'localId' | 'steps'>>) => void;
  removePhase:     (localId: string) => void;
  reorderPhases:   (fromIndex: number, toIndex: number) => void;

  // Step management
  addStep:         (phaseLocalId: string, step: Omit<DraftStep, 'localId'>) => void;
  updateStep:      (phaseLocalId: string, stepLocalId: string, updates: Partial<Omit<DraftStep, 'localId'>>) => void;
  removeStep:      (phaseLocalId: string, stepLocalId: string) => void;
  reorderSteps:    (phaseLocalId: string, fromIndex: number, toIndex: number) => void;

  // Publish
  publishGuide:    () => Promise<string>;

  // Reset (called after publish or if the user abandons the flow)
  resetDraft:      () => void;
};

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_GUIDE: DraftGuide = {
  title:                 '',
  description:           '',
  summary:               '',
  hero_media_url:        null,
  primary_location_name: '',
  stewardship_level:     'Private',
  derivative_licence:    'allow_forking',
  difficulty_level:      '',
  duration_estimate:     '',
};

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

const GuideCreationContext = createContext<GuideCreationContextValue | null>(null);

export function GuideCreationProvider({ children }: { children: React.ReactNode }) {
  const [guide,  setGuideState]  = useState<DraftGuide>(DEFAULT_GUIDE);
  const [phases, setPhasesState] = useState<DraftPhase[]>([]);

  // -------------------------------------------------------------------------
  // Guide
  // -------------------------------------------------------------------------

  const setGuide = useCallback((updates: Partial<DraftGuide>) => {
    setGuideState(prev => ({ ...prev, ...updates }));
  }, []);

  // -------------------------------------------------------------------------
  // Phases
  // -------------------------------------------------------------------------

  const addPhase = useCallback((phase: Omit<DraftPhase, 'localId' | 'steps'>): string => {
    const localId = `phase-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPhasesState(prev => [...prev, { ...phase, localId, steps: [] }]);
    return localId;
  }, []);

  const updatePhase = useCallback(
    (localId: string, updates: Partial<Omit<DraftPhase, 'localId' | 'steps'>>) => {
      setPhasesState(prev =>
        prev.map(p => (p.localId === localId ? { ...p, ...updates } : p)),
      );
    },
    [],
  );

  const removePhase = useCallback((localId: string) => {
    setPhasesState(prev => prev.filter(p => p.localId !== localId));
  }, []);

  const reorderPhases = useCallback((fromIndex: number, toIndex: number) => {
    setPhasesState(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------

  const addStep = useCallback(
    (phaseLocalId: string, step: Omit<DraftStep, 'localId'>) => {
      const localId = `step-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setPhasesState(prev =>
        prev.map(p =>
          p.localId === phaseLocalId
            ? { ...p, steps: [...p.steps, { ...step, localId }] }
            : p,
        ),
      );
    },
    [],
  );

  const updateStep = useCallback(
    (phaseLocalId: string, stepLocalId: string, updates: Partial<Omit<DraftStep, 'localId'>>) => {
      setPhasesState(prev =>
        prev.map(p =>
          p.localId === phaseLocalId
            ? {
                ...p,
                steps: p.steps.map(s =>
                  s.localId === stepLocalId ? { ...s, ...updates } : s,
                ),
              }
            : p,
        ),
      );
    },
    [],
  );

  const removeStep = useCallback((phaseLocalId: string, stepLocalId: string) => {
    setPhasesState(prev =>
      prev.map(p =>
        p.localId === phaseLocalId
          ? { ...p, steps: p.steps.filter(s => s.localId !== stepLocalId) }
          : p,
      ),
    );
  }, []);

  const reorderSteps = useCallback(
    (phaseLocalId: string, fromIndex: number, toIndex: number) => {
      setPhasesState(prev =>
        prev.map(p => {
          if (p.localId !== phaseLocalId) return p;
          const next = [...p.steps];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { ...p, steps: next };
        }),
      );
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  const publishGuide = useCallback(async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');

    if (!guide.title.trim()) throw new Error('A Guide must have a title.');

    // 1. Insert the Guide row
    const { data: insertedGuide, error: guideError } = await supabase
      .from('guides')
      .insert({
        creator_id:            user.id,
        title:                 guide.title.trim(),
        description:           guide.description.trim() || null,
        summary:               guide.summary.trim() || null,
        hero_media_url:        guide.hero_media_url,
        primary_location_name: guide.primary_location_name.trim() || null,
        stewardship_level:     guide.stewardship_level,
        derivative_licence:    guide.derivative_licence,
        difficulty_level:      guide.difficulty_level.trim() || null,
        duration_estimate:     guide.duration_estimate.trim() || null,
        original_architect_id: user.id, // Originator — preserved through all forks
      })
      .select()
      .single();

    if (guideError) throw guideError;
    const guideId = insertedGuide.id;

    // 2. Insert phases (one at a time to capture returned IDs for steps)
    for (let pIdx = 0; pIdx < phases.length; pIdx++) {
      const draftPhase = phases[pIdx];

      const { data: insertedPhase, error: phaseError } = await supabase
        .from('phases')
        .insert({
          guide_id:       guideId,
          title:          draftPhase.title.trim(),
          description:    draftPhase.description.trim() || null,
          phase_index:    pIdx,
          execution_mode: draftPhase.execution_mode,
        })
        .select()
        .single();

      if (phaseError) throw phaseError;
      const phaseId = insertedPhase.id;

      // 3. Insert steps for this phase
      if (draftPhase.steps.length > 0) {
        const stepRows = draftPhase.steps.map((s, sIdx) => ({
          phase_id:           phaseId,
          creator_id:         user.id,
          atomic_action_text: s.atomic_action_text.trim(),
          curation_notes:     s.curation_notes.trim() || null,
          beginner_mistakes:  s.beginner_mistakes.trim() || null,
          location_name:      s.location_name.trim() || null,
          intent_tag:         s.intent_tag,
          linked_guide_id:    s.linked_guide_id,
          step_index:         sIdx,
        }));

        const { error: stepsError } = await supabase
          .from('step_cards')
          .insert(stepRows);

        if (stepsError) throw stepsError;
      }
    }

    return guideId;
  }, [guide, phases]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const resetDraft = useCallback(() => {
    setGuideState(DEFAULT_GUIDE);
    setPhasesState([]);
  }, []);

  return (
    <GuideCreationContext.Provider value={{
      guide, phases,
      setGuide,
      addPhase, updatePhase, removePhase, reorderPhases,
      addStep, updateStep, removeStep, reorderSteps,
      publishGuide,
      resetDraft,
    }}>
      {children}
    </GuideCreationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGuideCreation(): GuideCreationContextValue {
  const ctx = useContext(GuideCreationContext);
  if (!ctx) {
    throw new Error('useGuideCreation must be called inside a GuideCreationProvider.');
  }
  return ctx;
}
