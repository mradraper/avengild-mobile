import React, { useRef } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { StepCard as StepCardType } from '@/lib/database.types';
import { StepCard } from './StepCard';

// Delay (ms) before auto-advancing after a step is marked done.
// Long enough for the user to see the completion state, short enough
// to feel snappy.
const AUTO_ADVANCE_DELAY_MS = 650;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  steps: StepCardType[];
  completedSteps: Set<string>;
  onStepToggle: (stepId: string) => void;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onLinkedGuidePress?: (guideId: string) => void;
  /** When true, automatically advances to the next step after a step is marked done. */
  autoAdvance?: boolean;
  /** Called when the user taps the auto-advance toggle icon in the nav bar. */
  onAutoAdvanceToggle?: () => void;
};

/**
 * Sequential execution mode: one step at a time, one-handed horizontal swipe.
 * Uses native ScrollView pagingEnabled for real swipe gestures — no new
 * dependencies required.
 */
export function SequentialView({
  steps,
  completedSteps,
  onStepToggle,
  currentIndex,
  onIndexChange,
  onLinkedGuidePress,
  autoAdvance = false,
  onAutoAdvanceToggle,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const scrollRef = useRef<ScrollView>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks the index the ScrollView is physically showing.
  // Initialised to -1 so the first effect run (on mount) always triggers a scroll,
  // even when currentIndex is 0 — handles restored positions.
  const physicalIndexRef = useRef(-1);

  // Sync the ScrollView to currentIndex whenever it changes from outside
  // (BirdsEye step tap, phase change, or position restore on guide open).
  // When the user swipes, handleMomentumScrollEnd updates physicalIndexRef first,
  // so the effect sees no difference and skips the redundant scroll.
  useEffect(() => {
    if (physicalIndexRef.current === currentIndex) return;

    const isFirstMount = physicalIndexRef.current === -1;
    physicalIndexRef.current = currentIndex;

    // Delay the initial scroll slightly so the ScrollView has finished layout.
    // Subsequent external jumps (BirdsEye) animate immediately.
    const delay = isFirstMount ? 80 : 0;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: currentIndex * SCREEN_WIDTH, animated: !isFirstMount });
    }, delay);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  const scrollTo = (index: number) => {
    physicalIndexRef.current = index;
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    onIndexChange(index);
  };

  const handlePrev = () => {
    if (currentIndex > 0) scrollTo(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < steps.length - 1) scrollTo(currentIndex + 1);
  };

  const handleMomentumScrollEnd = (e: any) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    // Update the physical ref BEFORE calling onIndexChange so the useEffect
    // above sees no change and doesn't issue a redundant scrollTo.
    physicalIndexRef.current = newIndex;
    onIndexChange(newIndex);
  };

  // Wraps onStepToggle so that when auto-advance is on and a step is newly
  // completed (not uncompleted), we schedule a scroll to the next step.
  function handleStepToggleWithAutoAdvance(stepId: string) {
    const wasCompleted = completedSteps.has(stepId);
    onStepToggle(stepId);

    if (autoAdvance && !wasCompleted && currentIndex < steps.length - 1) {
      // Clear any pending timer from a rapid double-tap
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = setTimeout(() => {
        scrollTo(currentIndex + 1);
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

  const currentStep = steps[currentIndex];
  const isCurrentCompleted = currentStep ? completedSteps.has(currentStep.id) : false;
  const isCurrentEmbedded = !!(currentStep?.linked_guide_id);

  return (
    <View style={styles.container}>
      {/* Paged step cards */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        style={styles.scroller}
      >
        {steps.map((step, index) => (
          <View key={step.id} style={styles.page}>
            <StepCard
              step={step}
              stepNumber={index + 1}
              isCompleted={completedSteps.has(step.id)}
              onPress={onStepToggle}
              onLinkedGuidePress={onLinkedGuidePress}
            />
          </View>
        ))}
      </ScrollView>

      {/* Navigation bar */}
      <View style={[styles.navBar, { borderTopColor: colorScheme === 'dark' ? '#1e2330' : '#e8e8e8' }]}>
        <TouchableOpacity
          onPress={handlePrev}
          disabled={currentIndex === 0}
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
        >
          <Ionicons name="chevron-back" size={22} color={currentIndex === 0 ? '#786C50' : theme.tint} />
        </TouchableOpacity>

        {/* Mark Done / Undo / Open Guide button */}
        {isCurrentEmbedded ? (
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: '#BC8A2F' }]}
            onPress={() => currentStep?.linked_guide_id && onLinkedGuidePress?.(currentStep.linked_guide_id)}
          >
            <Ionicons name="book-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.doneButtonText}>Open Guide</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.doneButton,
              { backgroundColor: isCurrentCompleted ? '#786C50' : theme.tint },
            ]}
            onPress={() => currentStep && handleStepToggleWithAutoAdvance(currentStep.id)}
          >
            <Ionicons
              name={isCurrentCompleted ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
              size={18}
              color="#fff"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.doneButtonText}>
              {isCurrentCompleted ? 'Undo' : 'Mark Done'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleNext}
          disabled={currentIndex === steps.length - 1}
          style={[styles.navButton, currentIndex === steps.length - 1 && styles.navButtonDisabled]}
        >
          <Ionicons name="chevron-forward" size={22} color={currentIndex === steps.length - 1 ? '#786C50' : theme.tint} />
        </TouchableOpacity>
      </View>

      {/* Step counter + auto-advance indicator */}
      <View style={styles.counterContainer}>
        <Text style={[styles.counterText, { color: colorScheme === 'dark' ? '#ccc' : '#666' }]}>
          {currentIndex + 1} / {steps.length}
        </Text>
        {onAutoAdvanceToggle && (
          <TouchableOpacity onPress={onAutoAdvanceToggle} style={styles.advanceToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={autoAdvance ? 'play-skip-forward' : 'play-skip-forward-outline'}
              size={14}
              color={autoAdvance ? theme.tint : (colorScheme === 'dark' ? '#555' : '#bbb')}
            />
            <Text style={[styles.advanceLabel, { color: autoAdvance ? theme.tint : (colorScheme === 'dark' ? '#555' : '#bbb') }]}>
              {autoAdvance ? 'Auto' : 'Manual'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroller: { flex: 1 },
  page: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  navButton: { padding: 8 },
  navButtonDisabled: { opacity: 0.3 },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  counterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 8, gap: 12 },
  counterText: { fontSize: 12 },
  advanceToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  advanceLabel: { fontSize: 11, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, opacity: 0.5 },
});
