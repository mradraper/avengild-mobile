import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import type { Guide, PhaseWithSteps } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BirdsEyeHeader } from '@/components/guide/BirdsEyeHeader';
import { FreeformView } from '@/components/guide/FreeformView';
import { MediaHeader } from '@/components/guide/MediaHeader';
import { PhaseNavigator } from '@/components/guide/PhaseNavigator';
import { SequentialView } from '@/components/guide/SequentialView';
import { ShareToHearthModal } from '@/components/guide/ShareToHearthModal';

type UserGuild = {
  guild_id: string;
  guild: { name: string };
};

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const [guide, setGuide] = useState<Guide | null>(null);
  const [phases, setPhases] = useState<PhaseWithSteps[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePhaseIndex, setActivePhaseIndex] = useState(0);
  const [sequentialStepIndex, setSequentialStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const [showShareModal, setShowShareModal] = useState(false);
  const [userGuilds, setUserGuilds] = useState<UserGuild[]>([]);

  useEffect(() => {
    if (id) {
      loadGuideData();
      fetchUserGuilds();
    }
  }, [id]);

  async function loadGuideData() {
    try {
      // Fetch guide metadata
      const { data: guideData } = await supabase
        .from('guides')
        .select('*')
        .eq('id', id)
        .single();

      if (guideData) setGuide(guideData);

      // Fetch phases with their step_cards, ordered by phase_index and step_index
      const { data: phasesData } = await supabase
        .from('phases')
        .select('*, step_cards(*)')
        .eq('guide_id', id)
        .order('phase_index', { ascending: true });

      if (phasesData) {
        // Sort step_cards within each phase by step_index
        const sorted = phasesData.map((phase) => ({
          ...phase,
          step_cards: (phase.step_cards ?? []).sort(
            (a: any, b: any) => a.step_index - b.step_index,
          ),
        }));
        setPhases(sorted);
      }

      // Load Codex progress (bridge: step_progress table)
      try {
        const progress = await Codex.getGuideProgress(id!);
        if (progress.length > 0) setCompletedSteps(new Set(progress));
      } catch {
        // Anonymous or offline user — silently ignore
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserGuilds() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('guild_members')
      .select('guild_id, guild:guilds(name)')
      .eq('user_id', user?.id);

    if (data) setUserGuilds(data as UserGuild[]);
  }

  const handleStepToggle = (stepId: string) => {
    // Capture the current state before the toggle to determine the correct
    // Codex action: completing a new step, or reverting a previously done one.
    const wasCompleted = completedSteps.has(stepId);

    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

    if (wasCompleted) {
      Codex.uncompleteStep(id!, stepId).catch((err) => {
        console.log('Codex uncomplete failed (anonymous user):', err.message);
      });
    } else {
      Codex.completeStep(id!, stepId).catch((err) => {
        console.log('Codex save failed (anonymous user):', err.message);
      });
    }
  };

  const handlePhaseSelect = (index: number) => {
    setActivePhaseIndex(index);
    setSequentialStepIndex(0);
  };

  const handleBirdsEyeStepSelect = (phaseIndex: number, stepIndex: number) => {
    setActivePhaseIndex(phaseIndex);
    setSequentialStepIndex(stepIndex);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Guide', headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.tint, headerShadowVisible: false }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  const activePhase = phases[activePhaseIndex] ?? null;
  const activeSteps = activePhase?.step_cards ?? [];
  const isSequential = activePhase?.execution_mode === 'Sequential';

  // In Sequential mode, expose the active step's first photo as the media URL.
  // In Freeform mode, no single step is "active", so the hero image always shows.
  const activeStep = isSequential ? (activeSteps[sequentialStepIndex] ?? null) : null;
  const activeStepMediaUrl = activeStep?.media_payload?.[0]?.url ?? null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: guide?.title ?? 'Guide',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowShareModal(true)} style={{ marginRight: 10 }}>
              <Ionicons name="bonfire-outline" size={24} color={theme.tint} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Media header — shows hero image by default, crossfades to active step media */}
      <MediaHeader
        heroUrl={guide?.hero_media_url ?? null}
        activeMediaUrl={activeStepMediaUrl}
      />

      {/* Bird's Eye collapsible header */}
      {guide && (
        <BirdsEyeHeader
          guide={guide}
          phases={phases}
          completedSteps={completedSteps}
          defaultExpanded={phases.length > 1}
          onStepSelect={handleBirdsEyeStepSelect}
        />
      )}

      {/* Phase tab bar */}
      {phases.length > 1 && (
        <PhaseNavigator
          phases={phases}
          activePhaseIndex={activePhaseIndex}
          completedSteps={completedSteps}
          onPhaseSelect={handlePhaseSelect}
        />
      )}

      {/* Step execution area */}
      {isSequential ? (
        <SequentialView
          steps={activeSteps}
          completedSteps={completedSteps}
          onStepToggle={handleStepToggle}
          currentIndex={sequentialStepIndex}
          onIndexChange={setSequentialStepIndex}
        />
      ) : (
        <FreeformView
          steps={activeSteps}
          completedSteps={completedSteps}
          onStepToggle={handleStepToggle}
        />
      )}

      <ShareToHearthModal
        visible={showShareModal}
        guideId={id!}
        userGuilds={userGuilds}
        onClose={() => setShowShareModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
