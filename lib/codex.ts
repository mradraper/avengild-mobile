import { supabase } from './supabase';

export const Codex = {

  /**
   * 1. START A GUIDE
   * Ensures the user has a "Save File" (codex_entry) for this specific guide.
   * If it already exists, it does nothing (safe to call multiple times).
   */
  async startGuide(guideId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in');

    // Check if entry exists first to avoid error spam.
    const { data: existing } = await supabase
      .from('codex_entries')
      .select('id')
      .eq('user_id', user.id)
      .eq('guide_id', guideId)
      .single();

    if (existing) return existing;

    const { data, error } = await supabase
      .from('codex_entries')
      .insert({
        user_id: user.id,
        guide_id: guideId,
        status: 'Intention', // Canonical starting state; supersedes legacy 'active'.
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 2. SAVE TO INTENTIONS
   * Upserts a codex_entry with status 'Intention'. Safe to call even if the
   * entry already exists at a higher-priority status (Scheduled, Completed) —
   * the onConflict: 'do nothing' path prevents regression.
   */
  async saveToIntentions(guideId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if an entry already exists — don't overwrite a Scheduled or Completed status.
    const { data: existing } = await supabase
      .from('codex_entries')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('guide_id', guideId)
      .maybeSingle();

    if (existing) return; // Already in Codex at any status — leave it as-is.

    await supabase
      .from('codex_entries')
      .insert({ user_id: user.id, guide_id: guideId, status: 'Intention' });
  },

  /**
   * 3. COMPLETE A STEP (solo guide execution)
   * Marks a specific step as 'completed' in the step_progress table.
   * Calls startGuide first to ensure the Codex entry exists.
   *
   * Note: Event-based step tracking writes to event_step_states instead
   * (handled directly in app/event/[id].tsx). getCompletedStepIds() queries
   * both tables so the Codex progress display is always accurate.
   */
  async completeStep(guideId: string, stepId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in');

    await this.startGuide(guideId);

    const { error } = await supabase
      .from('step_progress')
      .upsert({
        user_id: user.id,
        guide_id: guideId,
        step_id: stepId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }, { onConflict: 'user_id, step_id' });

    if (error) throw error;
  },

  /**
   * 4. UNCOMPLETE A STEP
   * Removes the step_progress row for a given step, reverting it to incomplete.
   * Called when the user unticks a step they previously marked as done.
   *
   * IMPORTANT — RLS prerequisite: this operation requires a DELETE policy on
   * the step_progress table. Without it, Supabase silently returns 0 rows
   * deleted without throwing an error. Run the following in Supabase SQL Editor
   * if uncompleting appears to have no effect:
   *
   *   CREATE POLICY "Users can delete their own step progress."
   *     ON public.step_progress
   *     FOR DELETE
   *     USING (auth.uid() = user_id);
   */
  async uncompleteStep(guideId: string, stepId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in');

    // { count: 'exact' } forces Supabase to return the number of rows affected.
    // A count of 0 almost always means a missing RLS DELETE policy — see above.
    const { error, count } = await supabase
      .from('step_progress')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('guide_id', guideId)
      .eq('step_id', stepId);

    console.log(`[Codex] uncompleteStep: ${count ?? 0} row(s) deleted for stepId=${stepId}`);

    if (error) {
      console.error('[Codex] uncompleteStep DB error:', error);
      throw error;
    }

    if ((count ?? 0) === 0) {
      console.warn(
        '[Codex] uncompleteStep: 0 rows deleted. ' +
        'If this step was previously marked complete, check that the ' +
        'step_progress table has a FOR DELETE RLS policy (see comment above).',
      );
    }
  },

  /**
   * 5. GET PROGRESS (single guide)
   * Returns a list of all Step IDs the user has finished for this guide.
   * Queries both solo (step_progress) and event (event_step_states) sources
   * so the Guide detail screen restores full state regardless of execution mode.
   */
  async getGuideProgress(guideId: string): Promise<string[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const [soloResult, eventResult] = await Promise.all([
      supabase
        .from('step_progress')
        .select('step_id')
        .eq('user_id', user.id)
        .eq('guide_id', guideId),
      supabase
        .from('event_step_states')
        .select('step_card_id')
        .eq('user_id', user.id),
    ]);

    const ids = new Set<string>();

    for (const row of soloResult.data ?? []) ids.add(row.step_id);
    for (const row of eventResult.data ?? []) ids.add(row.step_card_id);

    return Array.from(ids);
  },

  /**
   * 6. PIN / UNPIN A CODEX ENTRY
   * Toggles the is_pinned flag on a codex_entry. Pinned entries float to the
   * top of their Codex segment. The RLS policy for codex_entries already
   * allows the owner to UPDATE their own rows, so no additional policy is needed.
   */
  async pinEntry(entryId: string, isPinned: boolean) {
    const { error } = await supabase
      .from('codex_entries')
      .update({ is_pinned: isPinned })
      .eq('id', entryId);
    if (error) throw error;
  },

  /**
   * 7. GET ALL COMPLETED STEP IDs
   * Returns a Set of every step_id the user has completed across all guides
   * and all execution modes (solo + event).
   *
   * This unified query is what powers the Codex segment progress bars. By
   * merging both tables, the Codex correctly reflects steps completed whether
   * the user executed the Guide solo or as part of an Event.
   */
  async getCompletedStepIds(): Promise<Set<string>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();

    const [soloResult, eventResult] = await Promise.all([
      supabase
        .from('step_progress')
        .select('step_id')
        .eq('user_id', user.id),
      supabase
        .from('event_step_states')
        .select('step_card_id')
        .eq('user_id', user.id),
    ]);

    if (soloResult.error) {
      console.error('[Codex] getCompletedStepIds (step_progress) error:', soloResult.error);
    }
    if (eventResult.error) {
      console.error('[Codex] getCompletedStepIds (event_step_states) error:', eventResult.error);
    }

    const ids = new Set<string>();
    for (const row of soloResult.data ?? []) ids.add(row.step_id);
    for (const row of eventResult.data ?? []) ids.add(row.step_card_id);
    return ids;
  },
};
