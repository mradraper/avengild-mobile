import React, { useState } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { ChecklistItem, StepCard as StepCardType } from '@/lib/database.types';
import { BeginnerMistakeBanner } from './BeginnerMistakeBanner';
import { IntentTagBadge, getIntentTagBorderColour } from './IntentTagBadge';
import { StepTimer } from './StepTimer';

type Props = {
  step: StepCardType;
  stepNumber: number;
  isCompleted: boolean;
  onPress: (stepId: string) => void;
  /** When provided and the step has a linked_guide_id, tapping navigates to
   *  that guide rather than toggling completion. */
  onLinkedGuidePress?: (guideId: string) => void;
  /** Compact mode renders a condensed row for Freeform (checklist) layout. */
  compact?: boolean;
};

/**
 * Core step atom. Renders in two modes:
 * - Default: full card with media, curation notes, beginner mistake banner,
 *   optional checklist items, countdown timer, and location navigate button.
 * - Compact: single-row checklist item for FreeformView.
 *
 * Steps with a linked_guide_id receive an Embedded Guide portal indicator.
 * Steps with step_type='checklist' render interactive sub-item checkboxes.
 * Steps with step_type='timer' render a StepTimer countdown component.
 * Steps with is_optional=true show an "Optional" badge.
 * Steps with location_anchor render a "Navigate" button that opens Maps.
 */
export function StepCard({ step, stepNumber, isCompleted, onPress, onLinkedGuidePress, compact = false }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  const borderColour = getIntentTagBorderColour(step.intent_tag);
  const hasBorder = borderColour !== 'transparent';
  const firstMedia = Array.isArray(step.media_payload) && step.media_payload.length > 0
    ? step.media_payload[0]
    : null;
  const isEmbeddedGuide = !!step.linked_guide_id;

  // Checklist item state — local UI only (persisted via event_step_states if needed)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Embedded guide steps navigate to the sub-guide instead of toggling completion.
  const handlePress = () => {
    if (isEmbeddedGuide && onLinkedGuidePress) {
      onLinkedGuidePress(step.linked_guide_id!);
    } else {
      onPress(step.id);
    }
  };

  // Open the step's location_anchor in the device's native Maps app.
  function openInMaps() {
    if (!step.location_anchor) return;
    const { coordinates } = step.location_anchor as any;
    if (!coordinates) return;
    const lng = coordinates[0];
    const lat = coordinates[1];
    const label = encodeURIComponent(step.location_name ?? 'Location');
    const url = Platform.OS === 'ios'
      ? `maps:?q=${label}&ll=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    });
  }

  if (compact) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        style={[
          styles.compactCard,
          { backgroundColor: theme.cardBackground },
          isEmbeddedGuide
            ? { borderLeftColor: '#BC8A2F', borderLeftWidth: 3 }
            : hasBorder && { borderLeftColor: borderColour, borderLeftWidth: 3 },
        ]}
      >
        {isEmbeddedGuide ? (
          <Ionicons name="book-outline" size={20} color="#BC8A2F" style={{ marginRight: 12 }} />
        ) : (
          <View style={[styles.checkCircle, { borderColor: theme.tint }, isCompleted && { backgroundColor: theme.tint }]}>
            {isCompleted && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
        <Text
          style={[
            styles.compactAction,
            { color: isEmbeddedGuide ? '#BC8A2F' : theme.text },
            isCompleted && !isEmbeddedGuide && styles.strikethrough,
          ]}
          numberOfLines={2}
        >
          {step.atomic_action_text}
        </Text>
        {isEmbeddedGuide && (
          <Ionicons name="chevron-forward" size={16} color="#BC8A2F" style={{ marginLeft: 4 }} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground },
        isEmbeddedGuide
          ? { borderLeftColor: '#BC8A2F', borderLeftWidth: 4 }
          : hasBorder && { borderLeftColor: borderColour, borderLeftWidth: 4 },
        isCompleted && !isEmbeddedGuide && styles.completedOpacity,
      ]}
    >
      {/* Step index bubble / guide icon */}
      {isEmbeddedGuide ? (
        <View style={[styles.indexBubble, { backgroundColor: 'rgba(188,138,47,0.15)' }]}>
          <Ionicons name="book-outline" size={18} color="#BC8A2F" />
        </View>
      ) : (
        <View style={[styles.indexBubble, { backgroundColor: isCompleted ? '#786C50' : theme.tint }]}>
          {isCompleted
            ? <Ionicons name="checkmark" size={18} color="#fff" />
            : <Text style={styles.indexText}>{stepNumber}</Text>
          }
        </View>
      )}

      <View style={styles.body}>
        {!isEmbeddedGuide && step.intent_tag && step.intent_tag !== 'General' && (
          <IntentTagBadge tag={step.intent_tag} />
        )}

        <Text style={[
          styles.action,
          { color: isEmbeddedGuide ? '#BC8A2F' : theme.text },
          isCompleted && !isEmbeddedGuide && styles.strikethrough,
        ]}>
          {step.atomic_action_text}
        </Text>

        {/* Embedded guide call-to-action */}
        {isEmbeddedGuide && (
          <View style={styles.embeddedGuideRow}>
            <Ionicons name="git-branch-outline" size={13} color="#BC8A2F" />
            <Text style={styles.embeddedGuideLabel}>Embedded Guide  →</Text>
          </View>
        )}

        {/* Optional badge */}
        {(step as any).is_optional && (
          <View style={styles.optionalBadge}>
            <Text style={styles.optionalText}>Optional</Text>
          </View>
        )}

        {/* Checklist items — rendered for checklist-type steps */}
        {(step as any).step_type === 'checklist' &&
          (step as any).checklist_items &&
          ((step as any).checklist_items as ChecklistItem[]).length > 0 && (
          <View style={styles.checklistContainer}>
            {((step as any).checklist_items as ChecklistItem[]).map(item => {
              const isChecked = checkedItems.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checklistItem}
                  onPress={() => setCheckedItems(prev => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.itemCheck,
                    { borderColor: theme.tint },
                    isChecked && { backgroundColor: theme.tint },
                  ]}>
                    {isChecked && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={[
                    styles.itemLabel,
                    { color: isChecked ? '#888' : theme.text },
                    isChecked && { textDecorationLine: 'line-through' },
                  ]}>
                    {item.label}
                  </Text>
                  {!item.required && (
                    <Text style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>opt</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Timer — rendered for timer-type steps */}
        {(step as any).step_type === 'timer' && (step as any).timer_seconds && (
          <StepTimer
            totalSeconds={(step as any).timer_seconds}
            onComplete={() => onPress(step.id)}
          />
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
          <Text style={[styles.note, { color: isDark ? '#ccc' : '#666' }]}>
            {step.curation_notes}
          </Text>
        ) : null}

        {/* Beginner mistake banner */}
        {step.beginner_mistakes ? (
          <BeginnerMistakeBanner text={step.beginner_mistakes} />
        ) : null}

        {/* Location name row */}
        {step.location_name ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={isDark ? '#ccc' : '#666'} />
            <Text style={[styles.locationText, { color: isDark ? '#ccc' : '#666' }]}>
              {step.location_name}
            </Text>
          </View>
        ) : null}

        {/* Navigate button — shown when GPS coordinates are available */}
        {step.location_anchor && (
          <TouchableOpacity style={styles.navigateBtn} onPress={openInMaps}>
            <Ionicons name="navigate-outline" size={14} color={theme.tint} />
            <Text style={[styles.navigateBtnText, { color: theme.tint }]}>
              {step.location_name ? `Navigate to ${step.location_name}` : 'Navigate'}
            </Text>
          </TouchableOpacity>
        )}
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
  embeddedGuideRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 },
  embeddedGuideLabel: { fontSize: 12, color: '#BC8A2F', fontWeight: '700', marginLeft: 4, letterSpacing: 0.3 },
  mediaThumbnail: { width: '100%', height: 160, borderRadius: 8, marginVertical: 8 },
  note: { fontSize: 14, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, opacity: 0.8 },
  locationText: { fontSize: 12, marginLeft: 4, fontWeight: '500' },

  // Optional badge
  optionalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(120,108,80,0.15)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  optionalText: { fontSize: 11, color: '#786C50', fontWeight: '600' },

  // Checklist
  checklistContainer: { marginTop: 10, gap: 6 },
  checklistItem:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { flex: 1, fontSize: 14 },

  // Navigate button
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(188,138,47,0.1)',
    alignSelf: 'flex-start',
  },
  navigateBtnText: { fontSize: 13, fontWeight: '700' },

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
