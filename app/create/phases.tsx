/**
 * create/phases.tsx
 *
 * Step 2 of the Guide Creation wizard.
 *
 * The user builds out the phase structure of their Guide. Phases are named
 * containers that group step cards — e.g., "Getting There", "The Meal",
 * "Dessert Run." Each phase also has an execution_mode:
 *   Sequential — steps are followed one at a time (swipe flow)
 *   Freeform   — steps are a flexible checklist (any order)
 *
 * Features:
 * - Inline "Add Phase" form (no separate screen needed)
 * - Edit phase title / description / execution_mode in-place
 * - Delete phase (with confirmation if it has steps)
 * - Simple up/down reorder buttons
 *
 * Navigation:
 * - Tap a phase's "Add Steps" button → /create/steps?phaseLocalId=...
 * - "Preview Guide" button → /create/preview (when at least one phase exists)
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useGuideCreation } from '@/lib/GuideCreationContext';
import type { Enums } from '@/lib/database.types';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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

type FormState = {
  title: string;
  description: string;
  execution_mode: Enums['execution_mode'];
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  execution_mode: 'Sequential',
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PhasesScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const { guide, phases, addPhase, updatePhase, removePhase, reorderPhases } = useGuideCreation();

  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM);
  const [editingId,   setEditingId]   = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Add or save a phase
  // -------------------------------------------------------------------------

  function handleSavePhase() {
    if (!form.title.trim()) return;

    if (editingId) {
      updatePhase(editingId, {
        title:          form.title.trim(),
        description:    form.description.trim(),
        execution_mode: form.execution_mode,
      });
      setEditingId(null);
    } else {
      addPhase({
        title:          form.title.trim(),
        description:    form.description.trim(),
        execution_mode: form.execution_mode,
      });
    }

    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function startEdit(localId: string) {
    const phase = phases.find(p => p.localId === localId);
    if (!phase) return;
    setForm({
      title:          phase.title,
      description:    phase.description,
      execution_mode: phase.execution_mode,
    });
    setEditingId(localId);
    setShowForm(true);
  }

  function handleDelete(localId: string) {
    const phase = phases.find(p => p.localId === localId);
    if (!phase) return;

    if (phase.steps.length > 0) {
      Alert.alert(
        `Delete "${phase.title}"?`,
        `This phase has ${phase.steps.length} step${phase.steps.length > 1 ? 's' : ''}. Deleting it will remove all its steps.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => removePhase(localId) },
        ],
      );
    } else {
      removePhase(localId);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: 'Phases',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Progress */}
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map(step => (
            <View
              key={step}
              style={StyleSheet.flatten([
                styles.progressDot,
                step <= 2 && { backgroundColor: theme.tint },
                step > 2  && { backgroundColor: isDark ? '#1e2330' : '#ddd' },
              ])}
            />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: subText }]}>STEP 2 OF 4  ·  Phases for "{guide.title}"</Text>

        {/* Guide title reminder */}
        <Text style={[styles.hint, { color: subText }]}>
          Phases group your steps. A simple Guide can have one phase.
          Multi-phase Guides (e.g., "Prep → Execution → Recovery") give
          users a clear sense of the adventure arc.
        </Text>

        {/* Phase list */}
        {phases.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="albums-outline" size={44} color={subText} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No phases yet.</Text>
            <Text style={[styles.emptyHint, { color: subText }]}>Add at least one phase to hold your steps.</Text>
          </View>
        ) : (
          phases.map((phase, idx) => (
            <View key={phase.localId} style={[styles.phaseCard, { backgroundColor: theme.cardBackground }]}>
              {/* Header row */}
              <View style={styles.phaseHeader}>
                <View style={styles.phaseIndex}>
                  <Text style={styles.phaseIndexText}>{idx + 1}</Text>
                </View>
                <View style={styles.phaseInfo}>
                  <Text style={[styles.phaseTitle, { color: theme.text }]}>{phase.title}</Text>
                  <Text style={[styles.phaseMeta, { color: subText }]}>
                    {phase.execution_mode}  ·  {phase.steps.length} step{phase.steps.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {/* Action buttons */}
                <View style={styles.phaseActions}>
                  {idx > 0 && (
                    <TouchableOpacity onPress={() => reorderPhases(idx, idx - 1)} style={styles.iconBtn}>
                      <Ionicons name="chevron-up" size={18} color={subText} />
                    </TouchableOpacity>
                  )}
                  {idx < phases.length - 1 && (
                    <TouchableOpacity onPress={() => reorderPhases(idx, idx + 1)} style={styles.iconBtn}>
                      <Ionicons name="chevron-down" size={18} color={subText} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => startEdit(phase.localId)} style={styles.iconBtn}>
                    <Ionicons name="pencil-outline" size={18} color={subText} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(phase.localId)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color="#BC2F38" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Steps preview */}
              {phase.steps.length > 0 && (
                <View style={styles.stepsPreview}>
                  {phase.steps.slice(0, 3).map((s, si) => (
                    <Text key={s.localId} style={[styles.stepPreviewText, { color: subText }]} numberOfLines={1}>
                      {si + 1}. {s.atomic_action_text}
                    </Text>
                  ))}
                  {phase.steps.length > 3 && (
                    <Text style={[styles.stepPreviewText, { color: subText }]}>
                      +{phase.steps.length - 3} more…
                    </Text>
                  )}
                </View>
              )}

              {/* Add Steps button */}
              <TouchableOpacity
                style={[styles.addStepsBtn, { borderColor: theme.tint }]}
                onPress={() => router.push({ pathname: '/create/steps', params: { phaseLocalId: phase.localId } })}
                activeOpacity={0.75}
              >
                <Ionicons name={phase.steps.length > 0 ? 'list-outline' : 'add-circle-outline'} size={15} color={theme.tint} />
                <Text style={[styles.addStepsBtnText, { color: theme.tint }]}>
                  {phase.steps.length > 0 ? 'Manage Steps' : 'Add Steps'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Inline add/edit form */}
        {showForm ? (
          <View style={[styles.form, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>
              {editingId ? 'Edit Phase' : 'New Phase'}
            </Text>

            <Text style={[styles.fieldLabel, { color: subText }]}>Name</Text>
            <TextInput
              style={StyleSheet.flatten([styles.input, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="e.g., Getting There, The Meal, Dessert Run"
              placeholderTextColor={subText}
              value={form.title}
              onChangeText={t => setForm(prev => ({ ...prev, title: t }))}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: subText }]}>Description (optional)</Text>
            <TextInput
              style={StyleSheet.flatten([styles.input, styles.inputTall, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="Context for this phase"
              placeholderTextColor={subText}
              value={form.description}
              onChangeText={t => setForm(prev => ({ ...prev, description: t }))}
              multiline
            />

            <Text style={[styles.fieldLabel, { color: subText }]}>Execution Mode</Text>
            <View style={styles.modeRow}>
              {(['Sequential', 'Freeform'] as Enums['execution_mode'][]).map(mode => {
                const isSelected = form.execution_mode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setForm(prev => ({ ...prev, execution_mode: mode }))}
                    style={StyleSheet.flatten([
                      styles.modePill,
                      { borderColor: isSelected ? theme.tint : (isDark ? '#1e2330' : '#ddd') },
                      isSelected && { backgroundColor: isDark ? 'rgba(188,138,47,0.1)' : 'rgba(55,94,63,0.07)' },
                    ])}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.modePillLabel, { color: isSelected ? theme.tint : subText }]}>{mode}</Text>
                    <Text style={[styles.modePillHint, { color: isDark ? '#666' : '#aaa' }]}>
                      {mode === 'Sequential' ? 'One at a time' : 'Any order'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.formBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: isDark ? '#1e2330' : '#ddd' }]}
                onPress={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
              >
                <Text style={[styles.cancelBtnText, { color: subText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: form.title.trim() ? theme.tint : '#333' }]}
                onPress={handleSavePhase}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Add Phase'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addPhaseBtn, { borderColor: theme.tint }]}
            onPress={() => setShowForm(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.tint} />
            <Text style={[styles.addPhaseBtnText, { color: theme.tint }]}>Add a Phase</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <TouchableOpacity
          style={[styles.previewBtn, { backgroundColor: phases.length > 0 ? theme.tint : '#333' }]}
          onPress={() => phases.length > 0 && router.push('/create/preview')}
          activeOpacity={0.85}
        >
          <Text style={styles.previewBtnText}>Preview Guide  →</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressDot: { height: 4, borderRadius: 2, flex: 1 },
  stepLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },
  hint:        { fontSize: 13, lineHeight: 20, marginBottom: 20 },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyHint:  { fontSize: 14, marginTop: 6, textAlign: 'center' },

  phaseCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  phaseHeader:  { flexDirection: 'row', alignItems: 'flex-start' },
  phaseIndex:   { width: 28, height: 28, borderRadius: 14, backgroundColor: '#BC8A2F', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  phaseIndexText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  phaseInfo:    { flex: 1 },
  phaseTitle:   { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  phaseMeta:    { fontSize: 12, marginTop: 2 },
  phaseActions: { flexDirection: 'row', gap: 2 },
  iconBtn:      { padding: 5 },

  stepsPreview: { marginTop: 10, marginLeft: 40 },
  stepPreviewText: { fontSize: 13, lineHeight: 19, marginBottom: 2 },

  addStepsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    gap: 6,
  },
  addStepsBtnText: { fontSize: 13, fontWeight: '700' },

  // Add/edit form
  form: { borderRadius: 12, padding: 16, marginBottom: 12 },
  formTitle: { fontSize: 17, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputTall: { minHeight: 70, textAlignVertical: 'top' },
  modeRow:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  modePill:  { flex: 1, borderWidth: 1.5, borderRadius: 8, padding: 10 },
  modePillLabel: { fontSize: 14, fontWeight: '700' },
  modePillHint:  { fontSize: 11, marginTop: 3 },
  formBtns:  { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn:   { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  addPhaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 4,
  },
  addPhaseBtnText: { fontSize: 15, fontWeight: '700' },

  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  previewBtn:     { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  previewBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
