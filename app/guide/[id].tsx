import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import { guideCache } from '@/lib/guideCache';
import type { Guide, PhaseWithSteps } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { UserPreferences } from '@/lib/userPreferences';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BirdsEyeHeader } from '@/components/guide/BirdsEyeHeader';
import { FreeformView } from '@/components/guide/FreeformView';
import { GuideCompletionModal } from '@/components/guide/GuideCompletionModal';
import { GuideMapView, type GeoStep } from '@/components/guide/GuideMapView';
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

  // Fork lineage breadcrumb — title + id of the immediate parent guide
  const [parentGuide, setParentGuide] = useState<{ id: string; title: string } | null>(null);

  // View toggle: 'steps' or 'map' (map tab only shown when ≥2 geo-tagged steps exist)
  const [viewTab, setViewTab] = useState<'steps' | 'map'>('steps');

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
  // Ref: always holds the latest completedSteps so useFocusEffect avoids a
  // stale closure without adding completedSteps to its dependency array.
  const completedStepsRef = useRef(completedSteps);
  useEffect(() => { completedStepsRef.current = completedSteps; }, [completedSteps]);

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
  // Sub-guide completion propagation
  // Fires when this screen regains focus (i.e., after the user returns from
  // a linked sub-guide). For each step with a linked_guide_id that is not
  // yet marked complete, checks if all required steps in the sub-guide have
  // been finished. If so, auto-marks the parent step complete.
  // -------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      if (!id || !positionLoadedRef.current) return;
      propagateSubGuideCompletions();
    }, [id, phases]),
  );

  async function propagateSubGuideCompletions() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const current = completedStepsRef.current;

    // Embedded guide steps that the user has not yet checked off
    const uncompletedLinked = phases
      .flatMap(p => p.step_cards)
      .filter(s => s.linked_guide_id && !current.has(s.id));

    if (uncompletedLinked.length === 0) return;

    const newlyCompleted: string[] = [];

    for (const step of uncompletedLinked) {
      const { data: linkedPhases } = await supabase
        .from('phases')
        .select('step_cards(*)')
        .eq('guide_id', step.linked_guide_id);

      if (!linkedPhases) continue;

      const requiredIds = (linkedPhases as any[])
        .flatMap((p: any) => p.step_cards ?? [])
        .filter((s: any) => !s.is_optional && !s.linked_guide_id)
        .map((s: any) => s.id as string);

      if (requiredIds.length === 0) continue;

      if (requiredIds.every(sid => current.has(sid))) {
        await Codex.completeStep(id!, step.id);
        newlyCompleted.push(step.id);
      }
    }

    if (newlyCompleted.length > 0) {
      setCompletedSteps(prev => {
        const next = new Set(prev);
        for (const sid of newlyCompleted) next.add(sid);
        return next;
      });
    }
  }

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
      // Show cached data immediately (stale-while-revalidate)
      const cached = await guideCache.get(id!);
      if (cached) {
        setGuide(cached.guide);
        setPhases(cached.phases);
        const { data: { user } } = await supabase.auth.getUser();
        setIsCreator(user?.id === cached.guide.creator_id);
        // If cache is fresh, skip the network fetch
        if (!guideCache.isStale(cached)) {
          setLoading(false);
          positionLoadedRef.current = true;
          return;
        }
        // Cache is stale — continue to refetch in background (loading stays false)
        setLoading(false);
      }

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

        // Fetch parent guide title for fork lineage breadcrumb (up to 1 level)
        if (guideData.immediate_parent_id) {
          const { data: parent } = await supabase
            .from('guides')
            .select('id, title')
            .eq('id', guideData.immediate_parent_id)
            .maybeSingle();
          if (parent) setParentGuide({ id: parent.id, title: parent.title });
        }
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
        // Persist to offline cache for stale-while-revalidate
        if (guideData) {
          guideCache.set(id!, { guide: guideData, phases: sorted }).catch(() => {});
        }
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

  // Collect all geo-tagged steps across all phases for the map tab
  const geoSteps: GeoStep[] = [];
  let globalStepIndex = 0;
  for (const phase of phases) {
    for (const step of phase.step_cards) {
      const anchor = step.location_anchor as any;
      if (anchor?.coordinates) {
        // PostgREST Geography(Point) → { type: 'Point', coordinates: [lng, lat] }
        const [lng, lat] = anchor.coordinates;
        geoSteps.push({
          id:        step.id,
          title:     step.atomic_action_text ?? '',
          lat,
          lng,
          stepIndex: globalStepIndex,
        });
      }
      globalStepIndex++;
    }
  }
  const showMapTab = geoSteps.length >= 2;


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

      {/* Fork lineage breadcrumb — shown when this guide was forked from another */}
      {parentGuide && (
        <Pressable
          style={[styles.forkBreadcrumb, { backgroundColor: theme.tint + '18', borderColor: theme.tint + '44' }]}
          onPress={() => router.push({ pathname: '/guide/[id]', params: { id: parentGuide.id } })}
        >
          <Ionicons name="git-branch-outline" size={14} color={theme.tint} style={{ marginRight: 6 }} />
          <Text style={[styles.forkBreadcrumbText, { color: theme.tint }]} numberOfLines={1}>
            Forked from <Text style={{ fontFamily: 'Chivo_700Bold' }}>{parentGuide.title}</Text>
          </Text>
          <Ionicons name="chevron-forward" size={13} color={theme.tint} style={{ marginLeft: 'auto' }} />
        </Pressable>
      )}

      {/* Steps / Map toggle — only shown when ≥2 geo-tagged steps exist */}
      {showMapTab && (
        <View style={[styles.viewToggleBar, { backgroundColor: theme.cardBackground, borderBottomColor: '#eee' }]}>
          <Pressable
            style={[styles.viewToggleBtn, viewTab === 'steps' && { borderBottomColor: theme.tint, borderBottomWidth: 2 }]}
            onPress={() => setViewTab('steps')}
          >
            <Ionicons name="list-outline" size={16} color={viewTab === 'steps' ? theme.tint : '#999'} />
            <Text style={[styles.viewToggleText, { color: viewTab === 'steps' ? theme.tint : '#999' }]}>Steps</Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewTab === 'map' && { borderBottomColor: theme.tint, borderBottomWidth: 2 }]}
            onPress={() => setViewTab('map')}
          >
            <Ionicons name="map-outline" size={16} color={viewTab === 'map' ? theme.tint : '#999'} />
            <Text style={[styles.viewToggleText, { color: viewTab === 'map' ? theme.tint : '#999' }]}>Map</Text>
          </Pressable>
        </View>
      )}

      {/* Map view */}
      {viewTab === 'map' && showMapTab && (
        <GuideMapView
          steps={geoSteps}
          onStepPress={(stepIndex) => {
            // Resolve which phase and within-phase index this global step index maps to
            let idx = 0;
            for (let pi = 0; pi < phases.length; pi++) {
              const phase = phases[pi];
              for (let si = 0; si < phase.step_cards.length; si++) {
                if (idx === stepIndex) {
                  setActivePhaseIndex(pi);
                  setSequentialStepIndex(si);
                  setViewTab('steps');
                  return;
                }
                idx++;
              }
            }
          }}
        />
      )}

      {/* Phase tab bar — hidden while map is shown */}
      {viewTab === 'steps' && phases.length > 1 && (
        <PhaseNavigator
          phases={phases}
          activePhaseIndex={activePhaseIndex}
          completedSteps={completedSteps}
          onPhaseSelect={handlePhaseSelect}
        />
      )}

      {/* Step execution area */}
      {viewTab === 'steps' && (isSequential ? (
        <SequentialView
          steps={activeSteps}
          completedSteps={completedSteps}
          onStepToggle={handleStepToggle}
          heroImageUrl={guide?.hero_media_url ?? null}
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
          heroImageUrl={guide?.hero_media_url ?? null}
          onLinkedGuidePress={handleLinkedGuidePress}
        />
      ))}

      <ShareToHearthModal
        visible={showShareModal}
        guideId={id!}
        guideTitle={guide?.title}
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
  forkBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  forkBreadcrumbText: { fontSize: 13, flex: 1 },

  viewToggleBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewToggleText: { fontSize: 13, fontWeight: '600' },
});
