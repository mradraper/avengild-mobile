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

    // Check if entry exists first to avoid error spam
    const { data: existing } = await supabase
      .from('codex_entries')
      .select('id')
      .eq('user_id', user.id)
      .eq('guide_id', guideId)
      .single();

    if (existing) return existing;

    // If not, create it
    const { data, error } = await supabase
      .from('codex_entries')
      .insert({
        user_id: user.id,
        guide_id: guideId,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 2. COMPLETE A STEP
   * Marks a specific step as 'completed' in the step_progress table.
   */
  async completeStep(guideId: string, stepId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in');

    // 1. Ensure the Guide is "Started" (Just in case)
    await this.startGuide(guideId);

    // 2. Log the step completion
    const { error } = await supabase
      .from('step_progress')
      .upsert({
        user_id: user.id,
        guide_id: guideId,
        step_id: stepId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }, { onConflict: 'user_id, step_id' }); // If already done, just update timestamp

    if (error) throw error;
  },

  /**
   * 3. GET PROGRESS
   * Returns a list of all Step IDs the user has finished for this guide.
   * Useful for painting the UI green.
   */
  async getGuideProgress(guideId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return []; // Return empty if not logged in

    const { data, error } = await supabase
      .from('step_progress')
      .select('step_id')
      .eq('user_id', user.id)
      .eq('guide_id', guideId);

    if (error) {
      console.error('Error fetching progress:', error);
      return [];
    }

    // Return just an array of IDs: ['uuid-1', 'uuid-2']
    return data.map(row => row.step_id);
  }
};