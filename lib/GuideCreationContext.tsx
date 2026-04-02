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
 *   1. Inserts the `guides` row (or updates it in edit mode).
 *   2. Inserts all `phases` rows.
 *   3. Inserts all `step_cards` rows for each phase.
 *   4. Returns the new (or existing) Guide's ID so the app can navigate to it.
 *
 * Edit mode:
 *   Call `loadExistingGuide(guideId)` to pre-populate the draft from the DB.
 *   `publishGuide()` will detect edit mode and UPDATE the guide row rather
 *   than inserting a new one. Existing phases/steps are deleted and re-inserted
 *   (step IDs change — acceptable for MVP).
 *
 * Usage:
 *   Wrap the create/ route group in <GuideCreationProvider> in its _layout.tsx.
 *   Then call `useGuideCreation()` in any wizard screen.
 */

import type { ChecklistItem, Enums } from '@/lib/database.types';
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
  /** Step interaction type. Added in migration 007. */
  step_type:          'action' | 'checklist' | 'timer';
  /** Checklist sub-items (step_type = 'checklist' only). */
  checklist_items:    ChecklistItem[];
  /** Countdown duration in seconds (step_type = 'timer' only). */
  timer_seconds:      number | null;
  /** When true, this step is a suggestion and not required for completion. */
  is_optional:        boolean;
  /** Latitude string for GPS coordinate input (converted to GeoJSON on save). */
  latitude:           string;
  /** Longitude string for GPS coordinate input (converted to GeoJSON on save). */
  longitude:          string;
  /** Local URI or uploaded public URL for the step photo. Stored as media_payload on publish. */
  photo_url:          string | null;
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
  /**
   * Creator's preferred Sequential mode behaviour.
   * When true, the app auto-advances to the next step after the current
   * step is marked done. Saved to guides.auto_advance_default on publish.
   */
  auto_advance_default: boolean;
};

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

type GuideCreationContextValue = {
  guide:    DraftGuide;
  phases:   DraftPhase[];

  /** When in edit mode, the ID of the guide being edited. */
  editingGuideId: string | null;
  /** True when editingGuideId is set. */
  isEditMode: boolean;

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

  // Edit mode
  loadExistingGuide: (guideId: string) => Promise<void>;

  // Publish (create or update)
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
  auto_advance_default:  false,
};

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

const GuideCreationContext = createContext<GuideCreationContextValue | null>(null);

export function GuideCreationProvider({ children }: { children: React.ReactNode }) {
  const [guide,          setGuideState]    = useState<DraftGuide>(DEFAULT_GUIDE);
  const [phases,         setPhasesState]   = useState<DraftPhase[]>([]);
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);

  const isEditMode = editingGuideId !== null;

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
  // Load existing guide (edit mode)
  // -------------------------------------------------------------------------

  const loadExistingGuide = useCallback(async (guideId: string): Promise<void> => {
    const { data: g } = await supabase.from('guides').select('*').eq('id', guideId).single();
    if (!g) throw new Error('Guide not found.');

    setGuideState({
      title:                 g.title ?? '',
      description:           g.description ?? '',
      summary:               g.summary ?? '',
      hero_media_url:        g.hero_media_url,
      primary_location_name: g.primary_location_name ?? '',
      stewardship_level:     g.stewardship_level,
      derivative_licence:    g.derivative_licence,
      difficulty_level:      g.difficulty_level ?? '',
      duration_estimate:     g.duration_estimate ?? '',
      auto_advance_default:  g.auto_advance_default ?? false,
    });

    // Fetch phases with steps, ordered by phase_index
    const { data: phasesData } = await supabase
      .from('phases')
      .select('*, step_cards(*)')
      .eq('guide_id', guideId)
      .order('phase_index', { ascending: true });

    // Collect all linked_guide_ids so we can resolve their titles in one query
    const allSteps = (phasesData ?? []).flatMap((p: any) => p.step_cards ?? []);
    const linkedIds = [...new Set(
      allSteps.map((s: any) => s.linked_guide_id).filter(Boolean) as string[]
    )];

    // Batch-fetch linked guide titles (empty if no embedded guides exist)
    const linkedTitleMap = new Map<string, string>();
    if (linkedIds.length > 0) {
      const { data: linkedGuides } = await supabase
        .from('guides')
        .select('id, title')
        .in('id', linkedIds);
      (linkedGuides ?? []).forEach((lg: any) => linkedTitleMap.set(lg.id, lg.title));
    }

    const draftPhases: DraftPhase[] = (phasesData ?? []).map((phase: any) => {
      const sortedSteps = (phase.step_cards ?? []).sort(
        (a: any, b: any) => a.step_index - b.step_index,
      );
      return {
        localId:        phase.id, // Use actual DB id as localId for edit mode
        title:          phase.title,
        description:    phase.description ?? '',
        execution_mode: phase.execution_mode,
        steps: sortedSteps.map((s: any) => ({
          localId:            s.id, // Use actual DB id as localId
          atomic_action_text: s.atomic_action_text,
          curation_notes:     s.curation_notes ?? '',
          beginner_mistakes:  s.beginner_mistakes ?? '',
          location_name:      s.location_name ?? '',
          intent_tag:         s.intent_tag,
          linked_guide_id:    s.linked_guide_id ?? null,
          linked_guide_title: s.linked_guide_id ? (linkedTitleMap.get(s.linked_guide_id) ?? null) : null,
          step_type:          s.step_type ?? 'action',
          checklist_items:    s.checklist_items ?? [],
          timer_seconds:      s.timer_seconds ?? null,
          is_optional:        s.is_optional ?? false,
          // Convert GeoJSON back to string inputs for the form
          latitude:  s.location_anchor ? String((s.location_anchor as any).coordinates?.[1] ?? '') : '',
          longitude: s.location_anchor ? String((s.location_anchor as any).coordinates?.[0] ?? '') : '',
          // Extract the first photo URL from media_payload (if any)
          photo_url: (s.media_payload as any)?.[0]?.url ?? null,
        })),
      };
    });

    setPhasesState(draftPhases);
    setEditingGuideId(guideId);
  }, []);

  // -------------------------------------------------------------------------
  // Publish (create or update)
  // -------------------------------------------------------------------------

  const publishGuide = useCallback(async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');

    if (!guide.title.trim()) throw new Error('A Guide must have a title.');

    // Helper: build the step rows array for a phase
    function buildStepRows(phaseId: string, draftSteps: DraftStep[]) {
      return draftSteps.map((s, sIdx) => {
        const lat = parseFloat(s.latitude ?? '');
        const lng = parseFloat(s.longitude ?? '');
        const location_anchor = (!isNaN(lat) && !isNaN(lng))
          ? { type: 'Point' as const, coordinates: [lng, lat] }
          : null;
        return {
          phase_id:           phaseId,
          creator_id:         user.id,
          atomic_action_text: s.atomic_action_text.trim(),
          curation_notes:     s.curation_notes.trim() || null,
          beginner_mistakes:  s.beginner_mistakes.trim() || null,
          location_name:      s.location_name.trim() || null,
          location_anchor,
          intent_tag:         s.intent_tag,
          linked_guide_id:    s.linked_guide_id,
          step_type:          s.step_type,
          checklist_items:    s.checklist_items.length > 0 ? s.checklist_items : null,
          timer_seconds:      s.timer_seconds,
          is_optional:        s.is_optional,
          step_index:         sIdx,
          // Convert photo_url to the media_payload JSONB format
          media_payload:      s.photo_url ? [{ type: 'photo', url: s.photo_url, caption: null }] : null,
        };
      });
    }

    // ── Edit mode: update guide row, delete old phases/steps, re-insert ──────
    if (editingGuideId) {
      const { error: updateErr } = await supabase
        .from('guides')
        .update({
          title:                 guide.title.trim(),
          description:           guide.description.trim() || null,
          summary:               guide.summary.trim() || null,
          hero_media_url:        guide.hero_media_url,
          primary_location_name: guide.primary_location_name.trim() || null,
          stewardship_level:     guide.stewardship_level,
          derivative_licence:    guide.derivative_licence,
          difficulty_level:      guide.difficulty_level.trim() || null,
          duration_estimate:     guide.duration_estimate.trim() || null,
          auto_advance_default:  guide.auto_advance_default,
        })
        .eq('id', editingGuideId);
      if (updateErr) throw updateErr;

      // Delete all existing phases (cascades to step_cards via FK)
      await supabase.from('phases').delete().eq('guide_id', editingGuideId);

      // Re-insert all phases and steps
      for (let pIdx = 0; pIdx < phases.length; pIdx++) {
        const draftPhase = phases[pIdx];

        const { data: insertedPhase, error: phaseError } = await supabase
          .from('phases')
          .insert({
            guide_id:       editingGuideId,
            title:          draftPhase.title.trim(),
            description:    draftPhase.description.trim() || null,
            phase_index:    pIdx,
            execution_mode: draftPhase.execution_mode,
          })
          .select()
          .single();
        if (phaseError) throw phaseError;

        if (draftPhase.steps.length > 0) {
          const stepRows = buildStepRows(insertedPhase.id, draftPhase.steps);
          const { error: stepsError } = await supabase.from('step_cards').insert(stepRows);
          if (stepsError) throw stepsError;
        }
      }

      return editingGuideId;
    }

    // ── Create mode: insert new guide row, phases, and steps ─────────────────
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
        auto_advance_default:  guide.auto_advance_default,
        original_architect_id: user.id, // Originator — preserved through all forks
      })
      .select()
      .single();

    if (guideError) throw guideError;
    const guideId = insertedGuide.id;

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

      if (draftPhase.steps.length > 0) {
        const stepRows = buildStepRows(insertedPhase.id, draftPhase.steps);
        const { error: stepsError } = await supabase.from('step_cards').insert(stepRows);
        if (stepsError) throw stepsError;
      }
    }

    return guideId;
  }, [guide, phases, editingGuideId]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const resetDraft = useCallback(() => {
    setGuideState(DEFAULT_GUIDE);
    setPhasesState([]);
    setEditingGuideId(null);
  }, []);

  return (
    <GuideCreationContext.Provider value={{
      guide, phases,
      editingGuideId,
      isEditMode,
      setGuide,
      addPhase, updatePhase, removePhase, reorderPhases,
      addStep, updateStep, removeStep, reorderSteps,
      loadExistingGuide,
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
