import React, { useEffect, useRef } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { StepCard as StepCardType } from '@/lib/database.types';
import { StepCard } from './StepCard';

// Delay (ms) before auto-scrolling to the next step after marking done.
const AUTO_ADVANCE_DELAY_MS = 650;

type Props = {
  steps: StepCardType[];
  completedSteps: Set<string>;
  onStepToggle: (stepId: string) => void;
  onLinkedGuidePress?: (guideId: string) => void;
  /** Hero image shown at the top of the list, scrolls away with content. */
  heroImageUrl?: string | null;
  /**
   * When provided, the list scrolls to this index whenever it changes.
   * Used by BirdsEye (guide/[id].tsx) to jump to a tapped step.
   */
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  /** When true, the list auto-scrolls to the next step after marking done. */
  autoAdvance?: boolean;
  /** Called when the user taps the auto-advance toggle. */
  onAutoAdvanceToggle?: () => void;
};

// Internal helper — not part of the public Props type.
// Scrolls the list to the step with the given id (branch navigation).
function scrollToStepId(
  stepId: string | null,
  steps: StepCardType[],
  listRef: React.RefObject<FlatList>,
  onIndexChange?: (i: number) => void,
) {
  if (!stepId) return;
  const idx = steps.findIndex(s => s.id === stepId);
  if (idx < 0) return;
  try {
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
  } catch { /* no-op */ }
  onIndexChange?.(idx);
}

/**
 * Sequential execution mode: vertical scrollable list of full StepCards.
 * Steps are shown in order and can be completed in any sequence the user
 * chooses. Auto-advance scrolls to the next step when a step is marked done.
 *
 * `currentIndex` / `onIndexChange` keep the BirdsEye navigator in sync
 * (guide/[id].tsx).
 */
export function SequentialView({
  steps,
  completedSteps,
  onStepToggle,
  onLinkedGuidePress,
  heroImageUrl,
  currentIndex,
  onIndexChange,
  autoAdvance = false,
  onAutoAdvanceToggle,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const flatListRef = useRef<FlatList>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When currentIndex changes from outside (BirdsEye), scroll to that item.
  useEffect(() => {
    if (currentIndex === undefined || currentIndex < 0 || currentIndex >= steps.length) return;
    try {
      flatListRef.current?.scrollToIndex({ index: currentIndex, animated: true, viewPosition: 0.1 });
    } catch {
      // scrollToIndex can fail if the list isn't laid out yet — no-op
    }
  }, [currentIndex]);

  function handleStepToggle(stepId: string) {
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const wasCompleted = completedSteps.has(stepId);
    onStepToggle(stepId);

    if (stepIndex >= 0 && onIndexChange) onIndexChange(stepIndex);

    if (autoAdvance && !wasCompleted && stepIndex >= 0 && stepIndex < steps.length - 1) {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = setTimeout(() => {
        const nextIndex = stepIndex + 1;
        try {
          flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true, viewPosition: 0.1 });
        } catch { /* no-op */ }
        onIndexChange?.(nextIndex);
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }

  if (steps.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.text }]}>No steps in this phase yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={steps}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.listContent}
      onScrollToIndexFailed={({ index }) => {
        // Retry after a short delay once the list has finished layout
        setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.1 });
          } catch { /* no-op */ }
        }, 120);
      }}
      ListHeaderComponent={
        <View>
          {heroImageUrl ? (
            <Image source={{ uri: heroImageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : null}
          {onAutoAdvanceToggle ? (
            <TouchableOpacity
              onPress={onAutoAdvanceToggle}
              style={styles.advanceToggle}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={autoAdvance ? 'play-skip-forward' : 'play-skip-forward-outline'}
                size={14}
                color={autoAdvance ? theme.tint : (colorScheme === 'dark' ? '#555' : '#bbb')}
              />
              <Text style={[
                styles.advanceLabel,
                { color: autoAdvance ? theme.tint : (colorScheme === 'dark' ? '#555' : '#bbb') },
              ]}>
                {autoAdvance ? 'Auto-advance on' : 'Auto-advance off'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <StepCard
          step={item}
          stepNumber={index + 1}
          isCompleted={completedSteps.has(item.id)}
          onPress={handleStepToggle}
          onLinkedGuidePress={onLinkedGuidePress}
          onDecisionSelect={(linkedStepId) =>
            scrollToStepId(linkedStepId, steps, flatListRef, onIndexChange)
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  heroImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#080A12',
    marginBottom: 8,
  },
  advanceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  advanceLabel: { fontSize: 11, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, opacity: 0.5 },
});
