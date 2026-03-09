import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { StepCard as StepCardType } from '@/lib/database.types';
import { BeginnerMistakeBanner } from './BeginnerMistakeBanner';
import { IntentTagBadge, getIntentTagBorderColour } from './IntentTagBadge';

type Props = {
  step: StepCardType;
  stepNumber: number;
  isCompleted: boolean;
  onPress: (stepId: string) => void;
  /** Compact mode renders a condensed row for Freeform (checklist) layout. */
  compact?: boolean;
};

/**
 * Core step atom. Renders in two modes:
 * - Default: full card with media, curation notes, and beginner mistake banner.
 * - Compact: single-row checklist item for FreeformView.
 *
 * Steps with a linked_guide_id receive a Mastery Tree portal indicator
 * (visual-only; full portal logic deferred to the Events Engine).
 */
export function StepCard({ step, stepNumber, isCompleted, onPress, compact = false }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const borderColour = getIntentTagBorderColour(step.intent_tag);
  const hasBorder = borderColour !== 'transparent';
  const firstMedia = Array.isArray(step.media_payload) && step.media_payload.length > 0
    ? step.media_payload[0]
    : null;
  const isMasteryTree = !!step.linked_guide_id;

  if (compact) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPress(step.id)}
        style={[
          styles.compactCard,
          { backgroundColor: theme.cardBackground },
          hasBorder && { borderLeftColor: borderColour, borderLeftWidth: 3 },
        ]}
      >
        <View style={[styles.checkCircle, { borderColor: theme.tint }, isCompleted && { backgroundColor: theme.tint }]}>
          {isCompleted && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text
          style={[
            styles.compactAction,
            { color: theme.text },
            isCompleted && styles.strikethrough,
          ]}
          numberOfLines={2}
        >
          {step.atomic_action_text}
        </Text>
        {isMasteryTree && (
          <Ionicons name="git-branch-outline" size={16} color="#BC8A2F" style={{ marginLeft: 8 }} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(step.id)}
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground },
        hasBorder && { borderLeftColor: borderColour, borderLeftWidth: 4 },
        isCompleted && styles.completedOpacity,
      ]}
    >
      {/* Step index bubble */}
      <View style={[styles.indexBubble, { backgroundColor: isCompleted ? '#786C50' : theme.tint }]}>
        {isCompleted
          ? <Ionicons name="checkmark" size={18} color="#fff" />
          : <Text style={styles.indexText}>{stepNumber}</Text>
        }
      </View>

      <View style={styles.body}>
        {step.intent_tag && step.intent_tag !== 'General' && (
          <IntentTagBadge tag={step.intent_tag} />
        )}

        <Text style={[styles.action, { color: theme.text }, isCompleted && styles.strikethrough]}>
          {step.atomic_action_text}
        </Text>

        {/* Mastery Tree portal indicator */}
        {isMasteryTree && (
          <View style={styles.masteryRow}>
            <Ionicons name="git-branch-outline" size={14} color="#BC8A2F" />
            <Text style={styles.masteryLabel}>Mastery Tree</Text>
          </View>
        )}

        {/* Media thumbnail */}
        {firstMedia && firstMedia.type === 'photo' && (
          <Image
            source={{ uri: firstMedia.url }}
            style={styles.mediaThumbnail}
            resizeMode="cover"
          />
        )}

        {/* Curation notes */}
        {step.curation_notes ? (
          <Text style={[styles.note, { color: colorScheme === 'dark' ? '#ccc' : '#666' }]}>
            {step.curation_notes}
          </Text>
        ) : null}

        {/* Beginner mistake banner */}
        {step.beginner_mistakes ? (
          <BeginnerMistakeBanner text={step.beginner_mistakes} />
        ) : null}

        {/* Location anchor */}
        {step.location_name ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={colorScheme === 'dark' ? '#ccc' : '#666'} />
            <Text style={[styles.locationText, { color: colorScheme === 'dark' ? '#ccc' : '#666' }]}>
              {step.location_name}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  completedOpacity: { opacity: 0.65 },
  indexBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
    marginTop: 2,
  },
  indexText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  body: { flex: 1 },
  action: { fontSize: 16, fontWeight: '700', lineHeight: 22, marginBottom: 4 },
  strikethrough: { textDecorationLine: 'line-through' },
  masteryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  masteryLabel: { fontSize: 11, color: '#BC8A2F', fontWeight: '600', marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  mediaThumbnail: { width: '100%', height: 160, borderRadius: 8, marginVertical: 8 },
  note: { fontSize: 14, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, opacity: 0.8 },
  locationText: { fontSize: 12, marginLeft: 4, fontWeight: '500' },

  // Compact mode
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  compactAction: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 20 },
});
