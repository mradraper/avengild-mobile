import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { StepCard as StepCardType } from '@/lib/database.types';
import { StepCard } from './StepCard';

type Props = {
  steps: StepCardType[];
  completedSteps: Set<string>;
  onStepToggle: (stepId: string) => void;
};

/**
 * Freeform execution mode: vertical checklist of compact StepCard rows.
 * No ordering enforcement — users complete steps in any order they choose.
 */
export function FreeformView({ steps, completedSteps, onStepToggle }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const completedCount = steps.filter(s => completedSteps.has(s.id)).length;

  if (steps.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.text }]}>No steps in this phase yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={steps}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <Text style={[styles.progress, { color: colorScheme === 'dark' ? '#ccc' : '#666' }]}>
          {completedCount} of {steps.length} completed
        </Text>
      }
      renderItem={({ item, index }) => (
        <StepCard
          step={item}
          stepNumber={index + 1}
          isCompleted={completedSteps.has(item.id)}
          onPress={onStepToggle}
          compact
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  progress: { fontSize: 12, marginBottom: 10, opacity: 0.7 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, opacity: 0.5 },
});
