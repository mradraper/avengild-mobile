/**
 * create/steps.tsx
 *
 * Step 3 of the Guide Creation wizard (per phase).
 *
 * The user adds and manages the step cards for a single phase.
 * This screen is launched from phases.tsx with a `phaseLocalId` param.
 *
 * Each step has:
 * - atomic_action_text (required) — the imperative action
 * - location_name (optional) — venue / place
 * - curation_notes (optional) — the "why" behind the action
 * - beginner_mistakes (optional) — common pitfalls
 * - intent_tag — General / Safety / Gear_Check / Milestone
 * - linked_guide_id (optional) — Mastery Tree portal to another Guide
 *
 * Features:
 * - Inline add/edit form (no modal needed)
 * - Up/down reorder buttons
 * - Delete step with confirmation
 * - "Advanced" toggle reveals curation notes, beginner mistakes, and
 *   the Mastery Tree portal field
 *
 * Navigation: Back → /create/phases
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { DraftStep } from '@/lib/GuideCreationContext';
import { useGuideCreation } from '@/lib/GuideCreationContext';
import type { Enums } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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

type StepForm = Omit<DraftStep, 'localId'>;

const EMPTY_FORM: StepForm = {
  atomic_action_text: '',
  curation_notes:     '',
  beginner_mistakes:  '',
  location_name:      '',
  intent_tag:         'General',
  linked_guide_id:    null,
  linked_guide_title: null,
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function StepsScreen() {
  const { phaseLocalId } = useLocalSearchParams<{ phaseLocalId: string }>();
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const { phases, addStep, updateStep, removeStep, reorderSteps } = useGuideCreation();
  const phase = phases.find(p => p.localId === phaseLocalId);

  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState<StepForm>(EMPTY_FORM);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [guideSearch, setGuideSearch] = useState('');
  const [guideResults, setGuideResults] = useState<{ id: string; title: string }[]>([]);

  if (!phase) {
    return (
      <View style={[styles.centred, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Phase not found.</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Save step
  // -------------------------------------------------------------------------

  function handleSaveStep() {
    if (!form.atomic_action_text.trim()) return;

    if (editingId) {
      updateStep(phaseLocalId, editingId, { ...form, atomic_action_text: form.atomic_action_text.trim() });
      setEditingId(null);
    } else {
      addStep(phaseLocalId, { ...form, atomic_action_text: form.atomic_action_text.trim() });
    }

    setForm(EMPTY_FORM);
    setShowForm(false);
    setShowAdvanced(false);
  }

  function startEdit(stepLocalId: string) {
    const step = phase.steps.find(s => s.localId === stepLocalId);
    if (!step) return;
    setForm({
      atomic_action_text: step.atomic_action_text,
      curation_notes:     step.curation_notes,
      beginner_mistakes:  step.beginner_mistakes,
      location_name:      step.location_name,
      intent_tag:         step.intent_tag,
      linked_guide_id:    step.linked_guide_id,
      linked_guide_title: step.linked_guide_title,
    });
    setEditingId(stepLocalId);
    setShowForm(true);
  }

  function handleDelete(stepLocalId: string) {
    Alert.alert('Delete step?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeStep(phaseLocalId, stepLocalId) },
    ]);
  }

  // -------------------------------------------------------------------------
  // Guide search for Mastery Tree portal
  // -------------------------------------------------------------------------

  async function searchGuides(text: string) {
    setGuideSearch(text);
    if (text.trim().length < 2) { setGuideResults([]); return; }
    const { data } = await supabase
      .from('guides')
      .select('id, title')
      .ilike('title', `%${text.trim()}%`)
      .limit(5);
    setGuideResults(data ?? []);
  }

  // -------------------------------------------------------------------------
  // Intent tag pill colour
  // -------------------------------------------------------------------------

  function tagColour(tag: Enums['intent_tag']): string {
    switch (tag) {
      case 'Safety':     return '#BC2F38';
      case 'Gear_Check': return '#BC8A2F';
      case 'Milestone':  return '#375E3F';
      default:           return '#786C50';
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
          title: phase.title,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={[styles.hint, { color: subText }]}>
          Mode: <Text style={{ color: theme.tint, fontWeight: '700' }}>{phase.execution_mode}</Text>
          {phase.execution_mode === 'Sequential'
            ? ' — Steps are followed one at a time in order.'
            : ' — Steps are a checklist; any order.'}
        </Text>

        {/* Step list */}
        {phase.steps.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={40} color={subText} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No steps yet.</Text>
          </View>
        ) : (
          phase.steps.map((step, idx) => (
            <View key={step.localId} style={[styles.stepCard, { backgroundColor: theme.cardBackground }]}>
              {/* Header */}
              <View style={styles.stepHeader}>
                <View style={[styles.stepNum, { backgroundColor: theme.tint }]}>
                  <Text style={styles.stepNumText}>{idx + 1}</Text>
                </View>
                <Text style={[styles.stepAction, { color: theme.text }]} numberOfLines={2}>
                  {step.atomic_action_text}
                </Text>
                {/* Reorder */}
                <View style={styles.reorderBtns}>
                  {idx > 0 && (
                    <TouchableOpacity onPress={() => reorderSteps(phaseLocalId, idx, idx - 1)}>
                      <Ionicons name="chevron-up" size={18} color={subText} />
                    </TouchableOpacity>
                  )}
                  {idx < phase.steps.length - 1 && (
                    <TouchableOpacity onPress={() => reorderSteps(phaseLocalId, idx, idx + 1)}>
                      <Ionicons name="chevron-down" size={18} color={subText} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Meta chips */}
              <View style={styles.metaRow}>
                {step.intent_tag !== 'General' && (
                  <View style={[styles.tagChip, { borderColor: tagColour(step.intent_tag) }]}>
                    <Text style={[styles.tagChipText, { color: tagColour(step.intent_tag) }]}>
                      {step.intent_tag.replace('_', ' ')}
                    </Text>
                  </View>
                )}
                {step.location_name ? (
                  <Text style={[styles.metaText, { color: subText }]} numberOfLines={1}>
                    📍 {step.location_name}
                  </Text>
                ) : null}
                {step.linked_guide_id ? (
                  <Text style={[styles.metaText, { color: '#BC8A2F' }]} numberOfLines={1}>
                    ⎇  Mastery Tree
                  </Text>
                ) : null}
              </View>

              {/* Actions */}
              <View style={styles.stepActions}>
                <TouchableOpacity onPress={() => startEdit(step.localId)} style={styles.editBtn}>
                  <Ionicons name="pencil-outline" size={15} color={subText} />
                  <Text style={[styles.editBtnText, { color: subText }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(step.localId)} style={styles.editBtn}>
                  <Ionicons name="trash-outline" size={15} color="#BC2F38" />
                  <Text style={[styles.editBtnText, { color: '#BC2F38' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Add/edit form */}
        {showForm ? (
          <View style={[styles.form, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.formTitle, { color: theme.text }]}>
              {editingId ? 'Edit Step' : 'New Step'}
            </Text>

            {/* Action */}
            <Text style={[styles.fieldLabel, { color: subText }]}>Action <Text style={{ color: '#BC2F38' }}>*</Text></Text>
            <TextInput
              style={StyleSheet.flatten([styles.input, styles.inputTall, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="e.g., Turn left at the cairn"
              placeholderTextColor={subText}
              value={form.atomic_action_text}
              onChangeText={t => setForm(prev => ({ ...prev, atomic_action_text: t }))}
              multiline
              autoFocus
              maxLength={200}
            />

            {/* Location */}
            <Text style={[styles.fieldLabel, { color: subText }]}>Location (optional)</Text>
            <TextInput
              style={StyleSheet.flatten([styles.input, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
              placeholder="e.g., Thai Garden, 10505 Jasper Ave"
              placeholderTextColor={subText}
              value={form.location_name}
              onChangeText={t => setForm(prev => ({ ...prev, location_name: t }))}
            />

            {/* Intent tag */}
            <Text style={[styles.fieldLabel, { color: subText }]}>Tag</Text>
            <View style={styles.tagRow}>
              {(['General', 'Safety', 'Gear_Check', 'Milestone'] as Enums['intent_tag'][]).map(tag => {
                const isSelected = form.intent_tag === tag;
                const colour = tagColour(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => setForm(prev => ({ ...prev, intent_tag: tag }))}
                    style={StyleSheet.flatten([
                      styles.tagPill,
                      { borderColor: isSelected ? colour : (isDark ? '#1e2330' : '#ddd') },
                      isSelected && { backgroundColor: `${colour}18` },
                    ])}
                  >
                    <Text style={[styles.tagPillText, { color: isSelected ? colour : subText }]}>
                      {tag.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Advanced toggle */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(prev => !prev)}
            >
              <Text style={[styles.advancedToggleText, { color: theme.tint }]}>
                {showAdvanced ? 'Hide advanced  ▲' : 'Advanced options  ▼'}
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <>
                {/* Curation notes */}
                <Text style={[styles.fieldLabel, { color: subText }]}>Curation Notes</Text>
                <Text style={[styles.fieldHint, { color: subText }]}>The "why" behind this action.</Text>
                <TextInput
                  style={StyleSheet.flatten([styles.input, styles.inputTall, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
                  placeholder="e.g., The spicy basil here is exceptional — order it medium."
                  placeholderTextColor={subText}
                  value={form.curation_notes}
                  onChangeText={t => setForm(prev => ({ ...prev, curation_notes: t }))}
                  multiline
                />

                {/* Beginner mistakes */}
                <Text style={[styles.fieldLabel, { color: subText }]}>Common Mistakes</Text>
                <TextInput
                  style={StyleSheet.flatten([styles.input, styles.inputTall, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
                  placeholder="e.g., Do not skip the reservations — it fills up fast."
                  placeholderTextColor={subText}
                  value={form.beginner_mistakes}
                  onChangeText={t => setForm(prev => ({ ...prev, beginner_mistakes: t }))}
                  multiline
                />

                {/* Mastery Tree portal */}
                <Text style={[styles.fieldLabel, { color: subText }]}>Link a Guide (Mastery Tree)</Text>
                <Text style={[styles.fieldHint, { color: subText }]}>
                  Completing this linked Guide will automatically complete this step.
                </Text>
                {form.linked_guide_id ? (
                  <View style={[styles.linkedGuide, { borderColor: '#BC8A2F' }]}>
                    <Ionicons name="git-branch-outline" size={14} color="#BC8A2F" />
                    <Text style={[styles.linkedGuideTitle, { color: '#BC8A2F' }]} numberOfLines={1}>
                      {form.linked_guide_title ?? 'Linked Guide'}
                    </Text>
                    <TouchableOpacity onPress={() => setForm(prev => ({ ...prev, linked_guide_id: null, linked_guide_title: null }))}>
                      <Ionicons name="close-circle" size={16} color="#BC2F38" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={StyleSheet.flatten([styles.input, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#080A12' : '#f9f9f9' }])}
                      placeholder="Search for a Guide to link…"
                      placeholderTextColor={subText}
                      value={guideSearch}
                      onChangeText={searchGuides}
                    />
                    {guideResults.map(g => (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.guideResult, { borderBottomColor: isDark ? '#1e2330' : '#eee' }]}
                        onPress={() => {
                          setForm(prev => ({ ...prev, linked_guide_id: g.id, linked_guide_title: g.title }));
                          setGuideSearch('');
                          setGuideResults([]);
                        }}
                      >
                        <Text style={[styles.guideResultText, { color: theme.text }]}>{g.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}

            {/* Form buttons */}
            <View style={styles.formBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: isDark ? '#1e2330' : '#ddd' }]}
                onPress={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setShowAdvanced(false); }}
              >
                <Text style={[styles.cancelBtnText, { color: subText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: form.atomic_action_text.trim() ? theme.tint : '#333' }]}
                onPress={handleSaveStep}
              >
                <Text style={styles.saveBtnText}>{editingId ? 'Save Step' : 'Add Step'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: theme.tint }]}
            onPress={() => setShowForm(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.tint} />
            <Text style={[styles.addBtnText, { color: theme.tint }]}>Add a Step</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Done button */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: theme.tint }]}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Text style={styles.doneBtnText}>Done  ✓</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:  { paddingHorizontal: 20, paddingTop: 16 },
  hint:    { fontSize: 13, lineHeight: 20, marginBottom: 16 },

  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 },

  stepCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepHeader:   { flexDirection: 'row', alignItems: 'flex-start' },
  stepNum:      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  stepNumText:  { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepAction:   { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  reorderBtns:  { gap: 2 },

  metaRow:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8, gap: 8 },
  metaText:   { fontSize: 12 },
  tagChip:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  tagChipText: { fontSize: 11, fontWeight: '700' },

  stepActions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  editBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 13, fontWeight: '600' },

  // Form
  form:       { borderRadius: 12, padding: 16, marginBottom: 12 },
  formTitle:  { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  fieldHint:  { fontSize: 12, marginBottom: 6, marginTop: -2 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputTall: { minHeight: 70, textAlignVertical: 'top' },

  tagRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagPill:      { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  tagPillText:  { fontSize: 12, fontWeight: '700' },

  advancedToggle: { marginTop: 16, alignSelf: 'flex-start' },
  advancedToggleText: { fontSize: 13, fontWeight: '700' },

  linkedGuide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  linkedGuideTitle: { flex: 1, fontSize: 14, fontWeight: '600' },

  guideResult: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  guideResultText: { fontSize: 14 },

  formBtns:     { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:    { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn:      { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveBtnText:  { color: '#fff', fontSize: 15, fontWeight: '800' },

  addBtn: {
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
  addBtnText: { fontSize: 15, fontWeight: '700' },

  footer:   { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1 },
  doneBtn:  { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
