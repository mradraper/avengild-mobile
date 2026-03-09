import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import type { Enums } from '@/lib/database.types';

type IntentTag = Enums<'intent_tag'>;

/** Returns the left-border accent colour for a StepCard based on its intent_tag. */
export function getIntentTagBorderColour(tag: IntentTag | null): string {
  switch (tag) {
    case 'Safety':      return '#BC2F38'; // paintbrushRed
    case 'Gear_Check':  return '#BC8A2F'; // burnishedGold
    // Milestone border uses edmontonForest — high contrast on both light and dark cards.
    case 'Milestone':   return '#375E3F'; // edmontonForest
    case 'General':
    default:            return 'transparent';
  }
}

type TagConfig = { label: string; icon: keyof typeof Ionicons.glyphMap; darkColour: string; lightColour: string };

// Milestone uses tundraLichen (#A9E1A1) on dark cards and edmontonForest (#375E3F) on
// light cards — tundraLichen is nearly invisible against limestoneWhite in light mode.
const INTENT_TAG_CONFIG: Record<IntentTag, TagConfig> = {
  General:    { label: 'General',     icon: 'flag-outline',      darkColour: '#786C50', lightColour: '#786C50' },
  Safety:     { label: 'Safety',      icon: 'warning-outline',   darkColour: '#BC2F38', lightColour: '#BC2F38' },
  Gear_Check: { label: 'Gear Check',  icon: 'briefcase-outline', darkColour: '#BC8A2F', lightColour: '#BC8A2F' },
  Milestone:  { label: 'Milestone',   icon: 'trophy-outline',    darkColour: '#A9E1A1', lightColour: '#375E3F' },
};

type Props = {
  tag: IntentTag;
};

export function IntentTagBadge({ tag }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (tag === 'General') return null;

  const config = INTENT_TAG_CONFIG[tag];
  const colour = isDark ? config.darkColour : config.lightColour;

  return (
    <View style={[styles.badge, { borderColor: colour }]}>
      <Ionicons name={config.icon} size={11} color={colour} style={styles.icon} />
      <Text style={[styles.label, { color: colour }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  icon: {
    marginRight: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
