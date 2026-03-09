import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { PhaseWithSteps } from '@/lib/database.types';

type Props = {
  phases: PhaseWithSteps[];
  activePhaseIndex: number;
  completedSteps: Set<string>;
  onPhaseSelect: (index: number) => void;
};

/**
 * Horizontal scrollable pill tabs, one per phase.
 * Each tab displays the phase title and a done/total fraction.
 * The active phase tab is highlighted in burnishedGold.
 */
export function PhaseNavigator({ phases, activePhaseIndex, completedSteps, onPhaseSelect }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={[styles.container, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}
    >
      {phases.map((phase, index) => {
        const isActive = index === activePhaseIndex;
        const stepCount = phase.step_cards?.length ?? 0;
        const doneCount = phase.step_cards?.filter(s => completedSteps.has(s.id)).length ?? 0;
        const fraction = stepCount > 0 ? `${doneCount}/${stepCount}` : null;

        return (
          <TouchableOpacity
            key={phase.id}
            onPress={() => onPhaseSelect(index)}
            style={[
              styles.pill,
              isActive
                ? { backgroundColor: '#BC8A2F', borderColor: '#BC8A2F' }
                : { backgroundColor: 'transparent', borderColor: isDark ? '#786C50' : '#ccc' },
            ]}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.pillTitle,
                { color: isActive ? '#fff' : (isDark ? '#ccc' : '#555') },
              ]}
              numberOfLines={1}
            >
              {phase.title}
            </Text>
            {fraction !== null && (
              <Text
                style={[
                  styles.pillFraction,
                  { color: isActive ? 'rgba(255,255,255,0.75)' : '#786C50' },
                ]}
              >
                {fraction}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
    borderBottomWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  pillTitle: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 140,
  },
  pillFraction: {
    fontSize: 11,
    fontWeight: '500',
  },
});
