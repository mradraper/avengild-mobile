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
   * 2. COMPLETE A STEP
   * Marks a specific step as 'completed' in the step_progress table.
   * Calls startGuide first to ensure the Codex entry exists.
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
   * 3. UNCOMPLETE A STEP
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
   * 4. GET PROGRESS (single guide)
   * Returns a list of all Step IDs the user has finished for this guide.
   * Used by the Guide detail screen to restore UI state on load.
   */
  async getGuideProgress(guideId: string): Promise<string[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('step_progress')
      .select('step_id')
      .eq('user_id', user.id)
      .eq('guide_id', guideId);

    if (error) {
      console.error('[Codex] getGuideProgress error:', error);
      return [];
    }

    return data.map(row => row.step_id);
  },

  /**
   * 5. GET ALL COMPLETED STEP IDs
   * Returns a Set of every step_id the user has completed across all guides.
   * Used by the Codex screen to compute real progress percentages without
   * issuing a separate query per guide.
   */
  async getCompletedStepIds(): Promise<Set<string>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();

    const { data, error } = await supabase
      .from('step_progress')
      .select('step_id')
      .eq('user_id', user.id);

    if (error) {
      console.error('[Codex] getCompletedStepIds error:', error);
      return new Set();
    }

    return new Set(data.map(row => row.step_id));
  },
};
