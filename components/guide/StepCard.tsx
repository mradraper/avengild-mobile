import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { ChecklistItem, StepCard as StepCardType } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { UserPreferences } from '@/lib/userPreferences';
import { BeginnerMistakeBanner } from './BeginnerMistakeBanner';
import { IntentTagBadge, getIntentTagBorderColour } from './IntentTagBadge';
import { StepTimer } from './StepTimer';

type DecisionOption = {
  label: string;
  linked_step_id: string | null;
};

type Props = {
  step: StepCardType;
  stepNumber: number;
  isCompleted: boolean;
  onPress: (stepId: string) => void;
  /** When provided and the step has a linked_guide_id, tapping navigates to
   *  that guide rather than toggling completion. */
  onLinkedGuidePress?: (guideId: string) => void;
  /** Called when the user taps a decision branch option. Provides the chosen
   *  linked_step_id (or null = end of branch). */
  onDecisionSelect?: (linkedStepId: string | null) => void;
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
export function StepCard({ step, stepNumber, isCompleted, onPress, onLinkedGuidePress, onDecisionSelect, compact = false }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  const borderColour = getIntentTagBorderColour(step.intent_tag);
  const hasBorder = borderColour !== 'transparent';
  const firstMedia = Array.isArray(step.media_payload) && step.media_payload.length > 0
    ? step.media_payload[0]
    : null;
  const isEmbeddedGuide = !!step.linked_guide_id;

  // Checklist item state — persisted to AsyncStorage, keyed by step ID
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Step media gallery — rows from step_media table
  type StepMediaRow = { id: string; url: string; caption: string | null; display_order: number };
  const [stepMedia,        setStepMedia]        = useState<StepMediaRow[]>([]);
  const [galleryVisible,   setGalleryVisible]   = useState(false);
  const [galleryIndex,     setGalleryIndex]     = useState(0);

  // Personal note state — loaded from user_step_notes table on mount
  const [noteUserId, setNoteUserId]   = useState<string | null>(null);
  const [noteText,   setNoteText]     = useState('');
  const [noteDraft,  setNoteDraft]    = useState('');
  const [noteExpanded, setNoteExpanded] = useState(false);
  // Track the last-saved value so we skip redundant DB writes on blur
  const savedNoteRef = useRef('');

  useEffect(() => {
    if (step.step_type !== 'checklist') return;
    UserPreferences.getChecklistState(step.id).then(saved => {
      if (saved.size > 0) setCheckedItems(saved);
    });
  }, [step.id, step.step_type]);

  // Fetch step_media rows for the gallery (full card only)
  useEffect(() => {
    if (compact) return;
    supabase
      .from('step_media')
      .select('id, url, caption, display_order')
      .eq('step_id', step.id)
      .order('display_order', { ascending: true })
      .then(({ data }) => { if (data && data.length > 0) setStepMedia(data as any); });
  }, [step.id, compact]);

  // Load personal note for authenticated users. Skipped in compact mode since
  // notes are only shown in the full card layout.
  useEffect(() => {
    if (compact) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setNoteUserId(user.id);
      supabase
        .from('user_step_notes')
        .select('note_text')
        .eq('user_id', user.id)
        .eq('step_id', step.id)
        .maybeSingle()
        .then(({ data }) => {
          const text = data?.note_text ?? '';
          setNoteText(text);
          savedNoteRef.current = text;
        });
    });
  }, [step.id, compact]);

  function handleNoteExpand() {
    setNoteDraft(noteText);
    setNoteExpanded(true);
  }

  async function handleNoteBlur() {
    if (!noteUserId) return;
    const text = noteDraft.trim();

    // Skip write if nothing changed
    if (text === savedNoteRef.current) {
      setNoteExpanded(false);
      return;
    }

    if (text === '') {
      // Clear note — delete the row
      await supabase
        .from('user_step_notes')
        .delete()
        .eq('user_id', noteUserId)
        .eq('step_id', step.id);
      setNoteText('');
      savedNoteRef.current = '';
    } else {
      await supabase
        .from('user_step_notes')
        .upsert(
          { user_id: noteUserId, step_id: step.id, note_text: text, updated_at: new Date().toISOString() },
          { onConflict: 'user_id, step_id' },
        );
      setNoteText(text);
      savedNoteRef.current = text;
    }

    setNoteExpanded(false);
  }

  function toggleChecklistItem(itemId: string) {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      UserPreferences.setChecklistState(step.id, next).catch(() => {});
      return next;
    });
  }

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
        {step.is_optional && (
          <View style={styles.optionalBadge}>
            <Text style={styles.optionalText}>Optional</Text>
          </View>
        )}

        {/* Checklist items — rendered for checklist-type steps */}
        {step.step_type === 'checklist' &&
          step.checklist_items &&
          step.checklist_items.length > 0 && (
          <View style={styles.checklistContainer}>
            {step.checklist_items.map((item: ChecklistItem) => {
              const isChecked = checkedItems.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checklistItem}
                  onPress={() => toggleChecklistItem(item.id)}
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
        {step.step_type === 'timer' && step.timer_seconds && (
          <StepTimer
            totalSeconds={step.timer_seconds}
            onComplete={() => onPress(step.id)}
          />
        )}

        {/* Decision choices — rendered for decision-type steps */}
        {step.step_type === 'decision' &&
          Array.isArray((step as any).decision_options) &&
          ((step as any).decision_options as DecisionOption[]).length > 0 && (
          <View style={styles.decisionContainer}>
            <Text style={[styles.decisionPrompt, { color: theme.tint }]}>Choose a path:</Text>
            {((step as any).decision_options as DecisionOption[]).map((opt, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.decisionOption, { borderColor: theme.tint + '66', backgroundColor: theme.tint + '12' }]}
                onPress={() => onDecisionSelect?.(opt.linked_step_id)}
                activeOpacity={0.75}
              >
                <Ionicons name="git-branch-outline" size={14} color={theme.tint} style={{ marginRight: 8 }} />
                <Text style={[styles.decisionOptionLabel, { color: theme.tint }]}>{opt.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.tint} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Media thumbnail (legacy media_payload scalar — kept for backwards compat) */}
        {firstMedia && firstMedia.type === 'photo' && stepMedia.length === 0 && (
          <Image
            source={{ uri: firstMedia.url }}
            style={styles.mediaThumbnail}
            resizeMode="cover"
          />
        )}

        {/* Step media gallery — horizontal strip from step_media table */}
        {stepMedia.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mediaStrip}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          >
            {stepMedia.map((m, idx) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => { setGalleryIndex(idx); setGalleryVisible(true); }}
                activeOpacity={0.85}
              >
                <Image source={{ uri: m.url }} style={styles.mediaTile} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Full-screen gallery modal */}
        {galleryVisible && (
          <Modal visible animationType="fade" onRequestClose={() => setGalleryVisible(false)}>
            <View style={styles.galleryModal}>
              <Pressable style={styles.galleryClose} onPress={() => setGalleryVisible(false)} hitSlop={16}>
                <View style={styles.galleryCloseBtn}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
                </View>
              </Pressable>
              <FlatList
                data={stepMedia}
                keyExtractor={m => m.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={galleryIndex}
                getItemLayout={(_, index) => ({ length: 400, offset: 400 * index, index })}
                renderItem={({ item }) => (
                  <View style={styles.galleryPage}>
                    <Image source={{ uri: item.url }} style={styles.galleryImage} resizeMode="contain" />
                    {item.caption ? (
                      <Text style={styles.galleryCaption}>{item.caption}</Text>
                    ) : null}
                  </View>
                )}
              />
              <Text style={styles.galleryCounter}>
                {galleryIndex + 1} / {stepMedia.length}
              </Text>
            </View>
          </Modal>
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

        {/* Personal note — only shown to authenticated users; not on embedded guide steps */}
        {noteUserId && !isEmbeddedGuide && (
          <View style={styles.noteSection}>
            {noteExpanded ? (
              <TextInput
                style={[styles.noteInput, { color: theme.text }]}
                multiline
                value={noteDraft}
                onChangeText={setNoteDraft}
                onBlur={handleNoteBlur}
                placeholder="Add a personal note…"
                placeholderTextColor="#786C50"
                autoFocus
              />
            ) : (
              <TouchableOpacity
                style={styles.noteTapTarget}
                onPress={handleNoteExpand}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil-outline" size={12} color="#786C50" />
                <Text style={[styles.noteTapText, noteText ? { color: isDark ? '#ccc' : '#555' } : {}]} numberOfLines={2}>
                  {noteText || 'Add a personal note…'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
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

  // Multi-image media strip
  mediaStrip: { marginVertical: 8 },
  mediaTile: { width: 120, height: 90, borderRadius: 8 },

  // Full-screen gallery
  galleryModal: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  galleryPage: { width: 400, alignItems: 'center', justifyContent: 'center', padding: 16 },
  galleryImage: { width: 368, height: 368 },
  galleryCaption: { color: '#ccc', fontSize: 13, marginTop: 12, textAlign: 'center', lineHeight: 18 },
  galleryClose: { position: 'absolute', top: 48, right: 20, zIndex: 10 },
  galleryCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryCounter: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    color: '#999',
    fontSize: 13,
  },
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

  // Decision step
  decisionContainer: { marginTop: 12, gap: 8 },
  decisionPrompt: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  decisionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  decisionOptionLabel: { fontSize: 14, fontWeight: '600', flex: 1 },

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

  // Personal note
  noteSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(188,138,47,0.15)',
    paddingTop: 8,
  },
  noteTapTarget: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noteTapText: {
    flex: 1,
    fontSize: 13,
    color: '#786C50',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  noteInput: {
    fontSize: 13,
    lineHeight: 19,
    borderWidth: 1,
    borderColor: 'rgba(188,138,47,0.3)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 64,
    textAlignVertical: 'top',
  },

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
