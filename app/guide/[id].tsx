import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import type { Guide, PhaseWithSteps } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { UserPreferences } from '@/lib/userPreferences';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BirdsEyeHeader } from '@/components/guide/BirdsEyeHeader';
import { FreeformView } from '@/components/guide/FreeformView';
import { GuideCompletionModal } from '@/components/guide/GuideCompletionModal';
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
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const [guide, setGuide] = useState<Guide | null>(null);
  const [phases, setPhases] = useState<PhaseWithSteps[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePhaseIndex, setActivePhaseIndex] = useState(0);
  const [sequentialStepIndex, setSequentialStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const [showShareModal,     setShowShareModal]     = useState(false);
  const [showCompletion,     setShowCompletion]     = useState(false);
  const [userGuilds,         setUserGuilds]         = useState<UserGuild[]>([]);
  const [isCreator,          setIsCreator]          = useState(false);

  // Auto-advance state
  const [autoAdvance,        setAutoAdvance]        = useState(false);
  const [showAdvancePrompt,  setShowAdvancePrompt]  = useState(false);
  const [guideAdvanceDefault, setGuideAdvanceDefault] = useState(false);

  // Ref: prevents the completion modal from re-showing if user undoes the last step
  const completionShownRef = useRef(false);
  // Ref: prevents position save from firing before initial load completes
  const positionLoadedRef  = useRef(false);
  // Ref: prevents the advance prompt alert from firing multiple times
  const advancePromptShownRef = useRef(false);

  useEffect(() => {
    if (id) {
      loadGuideData();
      fetchUserGuilds();
    }
  }, [id]);

  // -------------------------------------------------------------------------
  // Auto-advance conflict prompt (shown once, via Alert to keep it modal)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!showAdvancePrompt || advancePromptShownRef.current) return;
    advancePromptShownRef.current = true;
    Alert.alert(
      'Step Advance Mode',
      `This guide is set to ${guideAdvanceDefault ? 'auto-advance' : 'manual advance'}, but your default preference is different. How would you like to proceed?`,
      [
        {
          text: `Use guide setting (${guideAdvanceDefault ? 'Auto' : 'Manual'})`,
          onPress: () => handleAdvancePromptChoice(true),
        },
        {
          text: `Use my setting (${guideAdvanceDefault ? 'Manual' : 'Auto'})`,
          onPress: () => handleAdvancePromptChoice(false),
        },
      ],
      { cancelable: false },
    );
  }, [showAdvancePrompt]);

  // -------------------------------------------------------------------------
  // Persist sequential position whenever phase or step index changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!positionLoadedRef.current || !id) return;
    UserPreferences.setGuidePosition(id, activePhaseIndex, sequentialStepIndex).catch(() => {});
  }, [activePhaseIndex, sequentialStepIndex]);

  // -------------------------------------------------------------------------
  // Completion detection — fires when completedSteps or phases change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!guide || phases.length === 0 || completedSteps.size === 0) return;
    if (completionShownRef.current) return;

    // Required steps: non-optional, non-embedded (linked guides can't be "completed" directly)
    const requiredSteps = phases
      .flatMap(p => p.step_cards)
      .filter(s => !s.is_optional && !s.linked_guide_id);

    if (requiredSteps.length === 0) return;

    if (requiredSteps.every(s => completedSteps.has(s.id))) {
      completionShownRef.current = true;
      setShowCompletion(true);
    }
  }, [completedSteps, phases, guide]);

  async function loadGuideData() {
    try {
      // Fetch guide metadata
      const { data: guideData } = await supabase
        .from('guides')
        .select('*')
        .eq('id', id)
        .single();

      if (guideData) {
        setGuide(guideData);
        const { data: { user } } = await supabase.auth.getUser();
        setIsCreator(user?.id === guideData.creator_id);

        // Resolve auto-advance preference
        await resolveAutoAdvance(guideData.auto_advance_default ?? false);
      }

      // Fetch phases with their step_cards, ordered by phase_index and step_index
      const { data: phasesData } = await supabase
        .from('phases')
        .select('*, step_cards(*)')
        .eq('guide_id', id)
        .order('phase_index', { ascending: true });

      if (phasesData) {
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

      // Restore saved position (must happen after phases are set)
      const savedPos = await UserPreferences.getGuidePosition(id!);
      if (savedPos) {
        setActivePhaseIndex(savedPos.phase);
        setSequentialStepIndex(savedPos.step);
      }

      // Mark load complete so position-save effect can fire
      positionLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Auto-advance resolution
  // -------------------------------------------------------------------------

  async function resolveAutoAdvance(guideDefault: boolean) {
    setGuideAdvanceDefault(guideDefault);

    // Check if the user has already made a per-guide choice
    const guideChoice = await UserPreferences.getGuideAdvanceChoice(id!);
    if (guideChoice !== null) {
      setAutoAdvance(guideChoice);
      return;
    }

    // Check global user preference
    const userPref = await UserPreferences.getAutoAdvance();
    if (userPref === null) {
      // No user preference set — use guide default silently
      setAutoAdvance(guideDefault);
      return;
    }

    if (userPref === guideDefault) {
      // They agree — no prompt needed
      setAutoAdvance(guideDefault);
      return;
    }

    // Conflict between user's global default and this guide's setting — prompt once
    setShowAdvancePrompt(true);
  }

  function handleAdvancePromptChoice(useGuideDefault: boolean) {
    const resolved = useGuideDefault ? guideAdvanceDefault : !guideAdvanceDefault;
    setAutoAdvance(resolved);
    UserPreferences.setGuideAdvanceChoice(id!, resolved).catch(() => {});
    setShowAdvancePrompt(false);
  }

  function handleAutoAdvanceToggle() {
    const next = !autoAdvance;
    setAutoAdvance(next);
    UserPreferences.setGuideAdvanceChoice(id!, next).catch(() => {});
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

  const handleLinkedGuidePress = (guideId: string) => {
    router.push({ pathname: '/guide/[id]', params: { id: guideId } });
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6 }}>
              {/* Edit Guide — only visible to the creator */}
              {isCreator && (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/create/guide-info',
                      params: { editGuideId: id },
                    })
                  }
                  style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                >
                  <Ionicons name="pencil-outline" size={22} color={theme.tint} />
                </TouchableOpacity>
              )}
              {/* Plan Event — jump directly to the Adapt screen for this Guide */}
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/plan/adapt',
                    params: { guideId: id, title: guide?.title ?? '' },
                  })
                }
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Ionicons name="map-outline" size={22} color={theme.tint} />
              </TouchableOpacity>
              {/* Share to Hearth */}
              <TouchableOpacity
                onPress={() => setShowShareModal(true)}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Ionicons name="bonfire-outline" size={22} color={theme.tint} />
              </TouchableOpacity>
            </View>
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
          onLinkedGuidePress={handleLinkedGuidePress}
          autoAdvance={autoAdvance}
          onAutoAdvanceToggle={handleAutoAdvanceToggle}
        />
      ) : (
        <FreeformView
          steps={activeSteps}
          completedSteps={completedSteps}
          onStepToggle={handleStepToggle}
          onLinkedGuidePress={handleLinkedGuidePress}
        />
      )}

      <ShareToHearthModal
        visible={showShareModal}
        guideId={id!}
        userGuilds={userGuilds}
        onClose={() => setShowShareModal(false)}
      />

      {/* Guide completion celebration */}
      <GuideCompletionModal
        visible={showCompletion}
        guideTitle={guide?.title ?? ''}
        totalSteps={phases.flatMap(p => p.step_cards).filter(s => !s.is_optional && !s.linked_guide_id).length}
        phaseCount={phases.length}
        onClose={() => setShowCompletion(false)}
        onShare={userGuilds.length > 0 ? () => { setShowCompletion(false); setShowShareModal(true); } : null}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
