/**
 * plan/adapt.tsx
 *
 * The Adapt screen — the heart of the "Mutation Pipeline."
 *
 * After the user selects a Guide (via swipe or list), they land here to
 * review the Guide's steps and adapt the Event to their specific plan.
 * This is where "Dinner and Dessert" is born from "Thai Garden YEG."
 *
 * Features:
 * - Displays all phases and steps from the source Guide blueprint (read-only).
 * - Allows the user to mark steps as "removed" from this specific event
 *   (the originals are never modified — this is an event-level override).
 * - Allows the user to add new steps at any position in the event, stored
 *   in event_step_additions with a decimal step_index.
 * - Another Guide can be linked as a step (Mastery Tree portal), supporting
 *   the "go for ice cream afterwards" composition use case.
 * - "Continue" navigates to /plan/invite to add friends, then /plan/schedule.
 *
 * State management:
 * - removedStepIds: Set<string> — original step IDs the user has excluded.
 * - additions: DraftAddition[] — user-authored steps not in the source Guide.
 *
 * Note: The event row in the database is created when the user taps "Continue"
 * (not on entry to this screen), keeping the DB clean of abandoned drafts.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { PhaseWithSteps } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DraftAddition = {
  /** Client-side temporary ID. Replaced with a real UUID on DB write. */
  localId:            string;
  atomic_action_text: string;
  location_name:      string;
  curation_notes:     string;
  /** Decimal index. Determines where this step slots relative to originals. */
  step_index:         number;
  /** Optional: links this step to a Guide as a Mastery Tree portal. */
  linked_guide_id:    string | null;
  linked_guide_title: string | null;
};

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

export default function AdaptScreen() {
  const { guideId, title: guideTitle } = useLocalSearchParams<{ guideId: string; title: string }>();
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const [phases,        setPhases]        = useState<PhaseWithSteps[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [removedIds,    setRemovedIds]    = useState<Set<string>>(new Set());
  const [additions,     setAdditions]     = useState<DraftAddition[]>([]);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [insertAfterIdx, setInsertAfterIdx] = useState<number>(9999);

  // New step form state
  const [newAction,    setNewAction]    = useState('');
  const [newLocation,  setNewLocation]  = useState('');
  const [newNotes,     setNewNotes]     = useState('');
  const actionInputRef = useRef<TextInput>(null);

  // Total steps: original (non-removed) + additions
  const originalStepCount = phases.reduce((s, p) => s + p.step_cards.length, 0);
  const activeStepCount   = originalStepCount - removedIds.size + additions.length;

  // -------------------------------------------------------------------------
  // Load the source Guide's phases and steps
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!guideId) return;
    loadPhases();
  }, [guideId]);

  async function loadPhases() {
    const { data, error } = await supabase
      .from('phases')
      .select('*, step_cards(*)')
      .eq('guide_id', guideId)
      .order('phase_index', { ascending: true });

    if (error) {
      console.error('[Adapt] loadPhases error:', error);
    } else {
      const sorted = (data ?? []).map((phase: any) => ({
        ...phase,
        step_cards: (phase.step_cards ?? []).sort(
          (a: any, b: any) => a.step_index - b.step_index,
        ),
      }));
      setPhases(sorted);
    }
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Toggle removal of an original step
  // -------------------------------------------------------------------------

  function toggleRemove(stepId: string) {
    setRemovedIds(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId); else next.add(stepId);
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Add a new step
  // -------------------------------------------------------------------------

  function openAddModal(insertAfter: number) {
    setInsertAfterIdx(insertAfter);
    setNewAction('');
    setNewLocation('');
    setNewNotes('');
    setShowAddModal(true);
    setTimeout(() => actionInputRef.current?.focus(), 100);
  }

  function confirmAddStep() {
    if (!newAction.trim()) return;

    const addition: DraftAddition = {
      localId:            `local-${Date.now()}`,
      atomic_action_text: newAction.trim(),
      location_name:      newLocation.trim(),
      curation_notes:     newNotes.trim(),
      // Insert between insertAfterIdx and insertAfterIdx + 1 using midpoint
      step_index:         insertAfterIdx + 0.5,
      linked_guide_id:    null,
      linked_guide_title: null,
    };

    setAdditions(prev => [...prev, addition].sort((a, b) => a.step_index - b.step_index));
    setShowAddModal(false);
  }

  function removeAddition(localId: string) {
    setAdditions(prev => prev.filter(a => a.localId !== localId));
  }

  // -------------------------------------------------------------------------
  // Continue → navigate to invite screen with the draft event data
  // -------------------------------------------------------------------------

  function handleContinue() {
    if (activeStepCount === 0) {
      Alert.alert(
        'No steps left',
        'Your event has no steps. Add at least one step or restore a removed step before continuing.',
      );
      return;
    }

    // Serialise the event draft into route params so invite + schedule screens
    // can access it without a premature DB write.
    router.push({
      pathname: '/plan/invite',
      params: {
        guideId,
        guideTitle:       guideTitle ?? '',
        removedStepIds:   JSON.stringify([...removedIds]),
        additions:        JSON.stringify(additions),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderStepRow(stepId: string, text: string, stepNum: number, location?: string | null) {
    const isRemoved = removedIds.has(stepId);
    return (
      <View
        key={stepId}
        style={StyleSheet.flatten([
          styles.stepRow,
          { backgroundColor: theme.cardBackground },
          isRemoved && styles.stepRowRemoved,
        ])}
      >
        <View style={[styles.stepDot, { backgroundColor: isRemoved ? '#333' : theme.tint }]}>
          {isRemoved
            ? <Ionicons name="close" size={13} color="#666" />
            : <Text style={styles.stepDotText}>{stepNum}</Text>
          }
        </View>
        <View style={styles.stepBody}>
          <Text
            style={StyleSheet.flatten([
              styles.stepAction,
              { color: isRemoved ? '#666' : theme.text },
              isRemoved && styles.strikethrough,
            ])}
          >
            {text}
          </Text>
          {location ? (
            <Text style={[styles.stepLocation, { color: subText }]}>📍 {location}</Text>
          ) : null}
        </View>
        {/* Remove / restore toggle */}
        <TouchableOpacity onPress={() => toggleRemove(stepId)} style={styles.removeBtn}>
          <Ionicons
            name={isRemoved ? 'add-circle-outline' : 'remove-circle-outline'}
            size={22}
            color={isRemoved ? '#375E3F' : '#BC2F38'}
          />
        </TouchableOpacity>
      </View>
    );
  }

  function renderAdditionRow(addition: DraftAddition, stepNum: number) {
    return (
      <View
        key={addition.localId}
        style={StyleSheet.flatten([styles.stepRow, styles.additionRow, { backgroundColor: theme.cardBackground }])}
      >
        <View style={[styles.stepDot, styles.additionDot]}>
          <Text style={styles.stepDotText}>{stepNum}</Text>
        </View>
        <View style={styles.stepBody}>
          <Text style={[styles.stepAction, { color: theme.text }]}>
            {addition.atomic_action_text}
          </Text>
          {addition.location_name ? (
            <Text style={[styles.stepLocation, { color: subText }]}>📍 {addition.location_name}</Text>
          ) : null}
          <Text style={[styles.addedLabel, { color: '#BC8A2F' }]}>ADDED BY YOU</Text>
        </View>
        <TouchableOpacity onPress={() => removeAddition(addition.localId)} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={20} color="#BC2F38" />
        </TouchableOpacity>
      </View>
    );
  }

  function renderAddButton(afterIndex: number) {
    return (
      <TouchableOpacity
        key={`add-after-${afterIndex}`}
        style={[styles.addStepBtn, { borderColor: isDark ? '#1e2330' : '#ddd' }]}
        onPress={() => openAddModal(afterIndex)}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle-outline" size={16} color="#BC8A2F" />
        <Text style={[styles.addStepBtnText, { color: '#BC8A2F' }]}>Add a step here</Text>
      </TouchableOpacity>
    );
  }

  // -------------------------------------------------------------------------
  // Build the merged, sorted step list for rendering
  // -------------------------------------------------------------------------

  type MergedItem =
    | { kind: 'original'; stepId: string; text: string; stepIndex: number; location: string | null }
    | { kind: 'addition'; addition: DraftAddition };

  function buildMergedSteps(): MergedItem[] {
    const originals: MergedItem[] = phases.flatMap(p =>
      p.step_cards.map(sc => ({
        kind: 'original' as const,
        stepId:    sc.id,
        text:      sc.atomic_action_text,
        stepIndex: sc.step_index,
        location:  sc.location_name,
      })),
    );

    const adds: MergedItem[] = additions.map(a => ({
      kind: 'addition' as const,
      addition: a,
    }));

    return [...originals, ...adds].sort((a, b) => {
      const ai = a.kind === 'original' ? a.stepIndex : a.addition.step_index;
      const bi = b.kind === 'original' ? b.stepIndex : b.addition.step_index;
      return ai - bi;
    });
  }

  // -------------------------------------------------------------------------
  // Root render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.centred, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Adapt' }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  const merged = buildMergedSteps();
  let visibleStepNum = 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Adapt Your Plan',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Source Guide label */}
        <View style={styles.sourceRow}>
          <Ionicons name="git-branch-outline" size={14} color={subText} />
          <Text style={[styles.sourceLabel, { color: subText }]}>
            Based on "{guideTitle}"
          </Text>
        </View>

        {/* Step count summary */}
        <Text style={[styles.stepCount, { color: theme.text }]}>
          {activeStepCount} {activeStepCount === 1 ? 'step' : 'steps'} in your event
          {removedIds.size > 0 && `  ·  ${removedIds.size} removed`}
          {additions.length > 0 && `  ·  ${additions.length} added`}
        </Text>

        {/* Phases + steps */}
        {phases.length === 0 ? (
          <View style={styles.emptyPhases}>
            <Text style={[styles.emptyText, { color: subText }]}>
              This guide has no steps yet. Add your own below.
            </Text>
          </View>
        ) : (
          phases.map((phase) => (
            <View key={phase.id} style={styles.phaseBlock}>
              <Text style={[styles.phaseLabel, { color: '#BC8A2F' }]}>{phase.title}</Text>
            </View>
          ))
        )}

        {/* Merged step list with inline "Add step" buttons */}
        <View style={styles.stepList}>
          {merged.map((item, idx) => {
            if (item.kind === 'original') {
              if (!removedIds.has(item.stepId)) visibleStepNum++;
              const row = renderStepRow(item.stepId, item.text, visibleStepNum, item.location);
              return (
                <View key={item.stepId}>
                  {row}
                  {renderAddButton(item.stepIndex)}
                </View>
              );
            } else {
              visibleStepNum++;
              return (
                <View key={item.addition.localId}>
                  {renderAdditionRow(item.addition, visibleStepNum)}
                  {renderAddButton(item.addition.step_index)}
                </View>
              );
            }
          })}

          {/* "Add step at the beginning" if list is empty */}
          {merged.length === 0 && renderAddButton(0)}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky Continue button */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: theme.tint }]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Continue  →</Text>
        </TouchableOpacity>
      </View>

      {/* Add Step modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable
            style={StyleSheet.flatten([styles.modalSheet, { backgroundColor: isDark ? '#121620' : '#fff' }])}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add a Step</Text>

            <Text style={[styles.fieldLabel, { color: subText }]}>What's the action?</Text>
            <TextInput
              ref={actionInputRef}
              style={StyleSheet.flatten([styles.textInput, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="e.g., Stop at Sweet Factory for ice cream"
              placeholderTextColor={subText}
              value={newAction}
              onChangeText={setNewAction}
              multiline
              maxLength={200}
            />

            <Text style={[styles.fieldLabel, { color: subText }]}>Location (optional)</Text>
            <TextInput
              style={StyleSheet.flatten([styles.textInput, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="e.g., Sweet Factory, Whyte Ave"
              placeholderTextColor={subText}
              value={newLocation}
              onChangeText={setNewLocation}
            />

            <Text style={[styles.fieldLabel, { color: subText }]}>Notes (optional)</Text>
            <TextInput
              style={StyleSheet.flatten([styles.textInput, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="Any tips or context for this stop"
              placeholderTextColor={subText}
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.addConfirmBtn, { backgroundColor: newAction.trim() ? theme.tint : '#333' }]}
              onPress={confirmAddStep}
              activeOpacity={0.85}
            >
              <Text style={styles.addConfirmBtnText}>Add Step</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centred:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:    { paddingHorizontal: 16, paddingTop: 16 },

  sourceRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sourceLabel: { fontSize: 13, marginLeft: 6 },
  stepCount:  { fontSize: 15, fontWeight: '700', marginBottom: 16 },

  phaseBlock: { marginBottom: 6 },
  phaseLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  stepList: { gap: 0 },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepRowRemoved: { opacity: 0.5 },
  additionRow:    { borderWidth: 1.5, borderColor: 'rgba(188,138,47,0.3)' },

  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  additionDot: { backgroundColor: 'rgba(188,138,47,0.2)' },
  stepDotText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  stepBody:    { flex: 1 },
  stepAction:  { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  strikethrough: { textDecorationLine: 'line-through' },
  stepLocation: { fontSize: 12, marginTop: 3, opacity: 0.75 },
  addedLabel:   { fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },

  removeBtn: { padding: 6 },

  addStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 6,
  },
  addStepBtnText: { fontSize: 13, fontWeight: '600' },

  emptyPhases: { alignItems: 'center', paddingVertical: 24 },
  emptyText:   { fontSize: 14, textAlign: 'center' },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  continueBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Add step modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 44,
  },
  addConfirmBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addConfirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
