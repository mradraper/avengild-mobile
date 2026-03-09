import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  text: string;
};

/**
 * Amber warning strip displayed beneath curation_notes when a step has
 * beginner_mistakes content. Distinct from curation_notes to signal
 * actionable caution rather than general curator guidance.
 */
export function BeginnerMistakeBanner({ text }: Props) {
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle-outline" size={15} color="#BC8A2F" style={styles.icon} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(188,138,47,0.10)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  icon: {
    marginRight: 7,
    marginTop: 1,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#BC8A2F',
    fontStyle: 'italic',
  },
});
