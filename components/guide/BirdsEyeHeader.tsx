import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { Guide, PhaseWithSteps } from '@/lib/database.types';

const PANEL_HEIGHT = 320;
const ANIMATION_DURATION = 280;

type Props = {
  guide: Guide;
  phases: PhaseWithSteps[];
  completedSteps: Set<string>;
  /** Whether the panel starts expanded. Defaults to true. Pass false for single-phase guides. */
  defaultExpanded?: boolean;
  /** Called when the user taps a step in the list. Panel collapses automatically before the callback fires. */
  onStepSelect?: (phaseIndex: number, stepIndex: number) => void;
};

/**
 * Collapsible Bird's Eye overview panel. Shows overall progress, a summary,
 * and a scrollable step list grouped by phase. Tapping a step navigates to it
 * and collapses the panel. Collapses from PANEL_HEIGHT → 0 in 280 ms using a
 * cubic ease-out curve via React Native Reanimated 4.
 */
export function BirdsEyeHeader({
  guide,
  phases,
  completedSteps,
  defaultExpanded = true,
  onStepSelect,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  // JS state mirrors the shared value so the chevron direction re-renders correctly.
  const [panelOpen, setPanelOpen] = useState(defaultExpanded);
  const isExpanded  = useSharedValue(defaultExpanded);
  const heightValue = useSharedValue(defaultExpanded ? PANEL_HEIGHT : 0);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightValue.value,
    overflow: 'hidden',
  }));

  const togglePanel = () => {
    const expanding = !isExpanded.value;
    isExpanded.value = expanding;
    setPanelOpen(expanding);
    heightValue.value = withTiming(expanding ? PANEL_HEIGHT : 0, {
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handleStepSelect = (phaseIndex: number, stepIndex: number) => {
    isExpanded.value = false;
    setPanelOpen(false);
    heightValue.value = withTiming(0, {
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    onStepSelect?.(phaseIndex, stepIndex);
  };

  const totalSteps = phases.reduce((sum, p) => sum + (p.step_cards?.length ?? 0), 0);
  const totalCompleted = phases.reduce(
    (sum, p) => sum + (p.step_cards?.filter(s => completedSteps.has(s.id)).length ?? 0),
    0,
  );
  const overallFraction = totalSteps > 0 ? totalCompleted / totalSteps : 0;

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.cardBackground }]}>
      {/* Header bar — always visible */}
      <TouchableOpacity
        onPress={togglePanel}
        activeOpacity={0.8}
        style={styles.headerBar}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.guideTitle, { color: theme.text }]} numberOfLines={1}>
            {guide.title}
          </Text>
          <Text style={[styles.progressSummary, { color: isDark ? '#ccc' : '#666' }]}>
            {totalCompleted} / {totalSteps} steps completed
          </Text>
        </View>
        <Ionicons
          name={panelOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={20}
          color={isDark ? '#786C50' : '#999'}
        />
      </TouchableOpacity>

      {/* Overall progress bar */}
      <View style={[styles.overallBarTrack, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <View style={[styles.overallBarFill, { width: `${overallFraction * 100}%` }]} />
      </View>

      {/* Collapsible body */}
      <Animated.View style={animatedStyle}>
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelBody}
          showsVerticalScrollIndicator={false}
        >
          {guide.summary ? (
            <Text style={[styles.summary, { color: isDark ? '#ccc' : '#555' }]} numberOfLines={3}>
              {guide.summary}
            </Text>
          ) : null}

          <Text style={[styles.sectionLabel, { color: isDark ? '#ccc' : '#777' }]}>Steps</Text>

          {phases.map((phase, phaseIndex) => {
            const stepCount = phase.step_cards?.length ?? 0;
            const doneCount = phase.step_cards?.filter(s => completedSteps.has(s.id)).length ?? 0;

            return (
              <View key={phase.id} style={styles.phaseGroup}>
                {/* Phase title + done/total */}
                <View style={styles.phaseGroupHeader}>
                  <Text style={[styles.phaseTitle, { color: theme.text }]} numberOfLines={1}>
                    {phase.title}
                  </Text>
                  <Text style={[styles.phaseFraction, { color: isDark ? '#786C50' : '#999' }]}>
                    {doneCount}/{stepCount}
                  </Text>
                </View>

                {/* Step rows */}
                {(phase.step_cards ?? []).map((step, stepIndex) => {
                  const done = completedSteps.has(step.id);
                  return (
                    <TouchableOpacity
                      key={step.id}
                      style={styles.stepRow}
                      onPress={() => handleStepSelect(phaseIndex, stepIndex)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={done ? '#A9E1A1' : (isDark ? '#786C50' : '#bbb')}
                        style={styles.stepIcon}
                      />
                      <Text
                        style={[
                          styles.stepTitle,
                          { color: done ? (isDark ? '#A9E1A1' : '#375E3F') : theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {step.atomic_action_text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  guideTitle: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  progressSummary: { fontSize: 12 },
  overallBarTrack: {
    height: 3,
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 2,
  },
  overallBarFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#BC8A2F',
  },
  panelScroll: { flex: 1 },
  panelBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  summary: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  phaseGroup: { marginBottom: 14 },
  phaseGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  phaseTitle: { fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  phaseFraction: { fontSize: 11, minWidth: 32, textAlign: 'right' },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  stepIcon: { marginRight: 8 },
  stepTitle: { fontSize: 13, flex: 1 },
});
