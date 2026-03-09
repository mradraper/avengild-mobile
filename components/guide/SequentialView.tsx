import React, { useRef } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { StepCard as StepCardType } from '@/lib/database.types';
import { StepCard } from './StepCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  steps: StepCardType[];
  completedSteps: Set<string>;
  onStepToggle: (stepId: string) => void;
  currentIndex: number;
  onIndexChange: (index: number) => void;
};

/**
 * Sequential execution mode: one step at a time, one-handed horizontal swipe.
 * Uses native ScrollView pagingEnabled for real swipe gestures — no new
 * dependencies required.
 */
export function SequentialView({ steps, completedSteps, onStepToggle, currentIndex, onIndexChange }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const scrollRef = useRef<ScrollView>(null);

  const scrollTo = (index: number) => {
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
    onIndexChange(newIndex);
  };

  if (steps.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.text }]}>No steps in this phase yet.</Text>
      </View>
    );
  }

  const currentStep = steps[currentIndex];
  const isCurrentCompleted = currentStep ? completedSteps.has(currentStep.id) : false;

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

        {/* Mark Done / Undo button */}
        <TouchableOpacity
          style={[
            styles.doneButton,
            { backgroundColor: isCurrentCompleted ? '#786C50' : theme.tint },
          ]}
          onPress={() => currentStep && onStepToggle(currentStep.id)}
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

        <TouchableOpacity
          onPress={handleNext}
          disabled={currentIndex === steps.length - 1}
          style={[styles.navButton, currentIndex === steps.length - 1 && styles.navButtonDisabled]}
        >
          <Ionicons name="chevron-forward" size={22} color={currentIndex === steps.length - 1 ? '#786C50' : theme.tint} />
        </TouchableOpacity>
      </View>

      {/* Step counter pill */}
      <View style={styles.counterContainer}>
        <Text style={[styles.counterText, { color: colorScheme === 'dark' ? '#ccc' : '#666' }]}>
          {currentIndex + 1} / {steps.length}
        </Text>
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
  counterContainer: { alignItems: 'center', paddingBottom: 8 },
  counterText: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, opacity: 0.5 },
});
