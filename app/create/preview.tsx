/**
 * create/preview.tsx
 *
 * Step 4 of the Guide Creation wizard — Preview & Publish.
 *
 * Renders a full read-only preview of the Guide draft using the same real
 * StepCard components that the consumer sees during execution — what the
 * creator sees in preview is exactly what users will experience.
 *
 * Publish flow:
 *   1. Calls GuideCreationContext.publishGuide() which writes to Supabase.
 *   2. On success, resets the draft and navigates to the new Guide's detail
 *      screen so the user can immediately see their published work.
 *   3. On error, shows an alert without navigating away (preserving draft).
 *
 * The user can also go back to any prior step using the "Edit" shortcut links
 * in the header row, rather than pressing the system back button repeatedly.
 */

import { StepCard } from '@/components/guide/StepCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { DraftStep } from '@/lib/GuideCreationContext';
import { useGuideCreation } from '@/lib/GuideCreationContext';
import type { StepCard as StepCardType } from '@/lib/database.types';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Converts a DraftStep into the StepCardType shape that StepCard expects.
// The preview is entirely read-only — onPress is a no-op — so DB-only fields
// are filled with safe empty values that never reach Supabase.
// ---------------------------------------------------------------------------
function draftStepToCard(step: DraftStep, index: number, phaseLocalId: string): StepCardType {
  return {
    id:                 step.localId,
    phase_id:           phaseLocalId,
    creator_id:         '',
    atomic_action_text: step.atomic_action_text || `Step ${index + 1}`,
    step_index:         index,
    media_payload:      null,
    curation_notes:     step.curation_notes    || null,
    beginner_mistakes:  step.beginner_mistakes  || null,
    intent_tag:         step.intent_tag,
    is_sensitive:       false,
    // Omit GPS anchor in preview — lat/lng strings may not yet be valid GeoJSON
    location_anchor:    null,
    location_name:      step.location_name      || null,
    linked_guide_id:    step.linked_guide_id,
    completion_weight:  1,
    step_type:          step.step_type,
    checklist_items:    step.checklist_items.length > 0 ? step.checklist_items : null,
    timer_seconds:      step.timer_seconds,
    is_optional:        step.is_optional,
    created_at:         '',
  };
}

export default function PreviewScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const { guide, phases, publishGuide, resetDraft, isEditMode, editingGuideId } = useGuideCreation();
  const [publishing, setPublishing] = useState(false);

  const totalSteps = phases.reduce((s, p) => s + p.steps.length, 0);

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  async function handlePublish() {
    const visibility = guide.stewardship_level === 'Public'
      ? 'visible to everyone on Discovery'
      : guide.stewardship_level === 'Guild_Only'
        ? 'visible to your guilds'
        : 'private (only you)';

    Alert.alert(
      isEditMode ? 'Save Changes?' : 'Publish Guide?',
      isEditMode
        ? `Save your changes to "${guide.title}"? Users mid-way through the guide will see the updated version.`
        : `"${guide.title}" will be ${visibility}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isEditMode ? 'Save' : 'Publish',
          onPress: async () => {
            setPublishing(true);
            try {
              const guideId = await publishGuide();
              resetDraft();
              // Dismiss the create modal stack, then navigate to the Guide
              router.dismissAll();
              router.push({ pathname: '/guide/[id]', params: { id: guideId } });
            } catch (err: any) {
              console.error('[Preview] publishGuide error:', err);
              Alert.alert(
                isEditMode ? 'Save failed' : 'Publish failed',
                err.message ?? 'Please try again.',
              );
            } finally {
              setPublishing(false);
            }
          },
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: isEditMode ? 'Review & Save' : 'Preview',
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
                { backgroundColor: theme.tint },
              ])}
            />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: subText }]}>STEP 4 OF 4  ·  Preview & Publish</Text>

        {/* Edit shortcuts */}
        <View style={styles.editRow}>
          <TouchableOpacity onPress={() => router.push('/create/guide-info')} style={styles.editLink}>
            <Ionicons name="pencil-outline" size={12} color={theme.tint} />
            <Text style={[styles.editLinkText, { color: theme.tint }]}>Edit Info</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/create/phases')} style={styles.editLink}>
            <Ionicons name="pencil-outline" size={12} color={theme.tint} />
            <Text style={[styles.editLinkText, { color: theme.tint }]}>Edit Phases</Text>
          </TouchableOpacity>
        </View>

        {/* Guide identity block */}
        <View style={[styles.guideCard, { backgroundColor: theme.cardBackground }]}>
          {/* Hero image — shows uploaded image or a placeholder */}
          {guide.hero_media_url ? (
            <Image
              source={{ uri: guide.hero_media_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="image-outline" size={36} color={subText} />
              <Text style={[styles.heroPlaceholderText, { color: subText }]}>
                No hero image — add one in Guide Info
              </Text>
            </View>
          )}

          <View style={styles.guideMeta}>
            <Text style={[styles.guideTitle, { color: theme.text }]}>{guide.title}</Text>
            {guide.summary ? (
              <Text style={[styles.guideSummary, { color: subText }]}>{guide.summary}</Text>
            ) : null}

            <View style={styles.chips}>
              {guide.primary_location_name ? (
                <View style={[styles.chip, { backgroundColor: isDark ? '#1e2330' : '#eee' }]}>
                  <Ionicons name="location-outline" size={12} color={subText} />
                  <Text style={[styles.chipText, { color: subText }]}>{guide.primary_location_name}</Text>
                </View>
              ) : null}
              {guide.difficulty_level ? (
                <View style={[styles.chip, { backgroundColor: isDark ? '#1e2330' : '#eee' }]}>
                  <Text style={[styles.chipText, { color: subText }]}>{guide.difficulty_level}</Text>
                </View>
              ) : null}
              {guide.duration_estimate ? (
                <View style={[styles.chip, { backgroundColor: isDark ? '#1e2330' : '#eee' }]}>
                  <Ionicons name="time-outline" size={12} color={subText} />
                  <Text style={[styles.chipText, { color: subText }]}>{guide.duration_estimate}</Text>
                </View>
              ) : null}
              <View style={[styles.chip, { backgroundColor: isDark ? 'rgba(188,138,47,0.12)' : 'rgba(55,94,63,0.08)' }]}>
                <Text style={[styles.chipText, { color: theme.tint }]}>{guide.stewardship_level.replace('_', ' ')}</Text>
              </View>
            </View>

            {guide.description ? (
              <Text style={[styles.guideDescription, { color: subText }]}>{guide.description}</Text>
            ) : null}
          </View>
        </View>

        {/* Stats summary */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.text }]}>{phases.length}</Text>
            <Text style={[styles.statLabel, { color: subText }]}>{phases.length === 1 ? 'phase' : 'phases'}</Text>
          </View>
          <View style={[styles.statDiv, { backgroundColor: isDark ? '#1e2330' : '#ddd' }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.text }]}>{totalSteps}</Text>
            <Text style={[styles.statLabel, { color: subText }]}>{totalSteps === 1 ? 'step' : 'steps'}</Text>
          </View>
          <View style={[styles.statDiv, { backgroundColor: isDark ? '#1e2330' : '#ddd' }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.text }]}>
              {guide.derivative_licence === 'allow_forking' ? '✓' : '✗'}
            </Text>
            <Text style={[styles.statLabel, { color: subText }]}>forking</Text>
          </View>
        </View>

        {/* Phase + step preview — uses real StepCard for accurate fidelity */}
        {phases.map((phase, pIdx) => (
          <View key={phase.localId} style={styles.phaseBlock}>
            <View style={styles.phaseHeader}>
              <View style={[styles.phaseDot, { backgroundColor: '#BC8A2F' }]}>
                <Text style={styles.phaseDotText}>{pIdx + 1}</Text>
              </View>
              <View style={styles.phaseInfo}>
                <Text style={[styles.phaseTitle, { color: theme.text }]}>{phase.title}</Text>
                <Text style={[styles.phaseMeta, { color: subText }]}>
                  {phase.execution_mode}  ·  {phase.steps.length} {phase.steps.length === 1 ? 'step' : 'steps'}
                </Text>
              </View>
            </View>

            {/* Real StepCard components — read-only (onPress is a no-op) */}
            {phase.steps.map((step, sIdx) => (
              <StepCard
                key={step.localId}
                step={draftStepToCard(step, sIdx, phase.localId)}
                stepNumber={sIdx + 1}
                isCompleted={false}
                onPress={() => {}}
              />
            ))}
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Publish footer */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        {phases.length === 0 || totalSteps === 0 ? (
          <Text style={[styles.publishWarning, { color: '#BC2F38' }]}>
            Add at least one phase with one step before publishing.
          </Text>
        ) : null}
        <TouchableOpacity
          style={StyleSheet.flatten([
            styles.publishBtn,
            { backgroundColor: phases.length > 0 && totalSteps > 0 ? theme.tint : '#333' },
          ])}
          onPress={handlePublish}
          activeOpacity={0.85}
          disabled={publishing || phases.length === 0 || totalSteps === 0}
        >
          {publishing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.publishBtnText}>{isEditMode ? 'Save Changes  ✓' : 'Publish Guide  ✓'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20, paddingTop: 16 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressDot: { height: 4, borderRadius: 2, flex: 1 },
  stepLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },

  editRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLinkText: { fontSize: 13, fontWeight: '700' },

  // Guide identity card
  guideCard:  { borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  heroImage: { height: 160, width: '100%' },
  heroPlaceholder: {
    height: 120,
    backgroundColor: '#1e2330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: { fontSize: 12, marginTop: 8 },

  guideMeta:        { padding: 16 },
  guideTitle:       { fontSize: 22, fontWeight: '900', marginBottom: 6 },
  guideSummary:     { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  guideDescription: { fontSize: 14, lineHeight: 20, marginTop: 10 },

  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 24 },
  stat:     { alignItems: 'center' },
  statNum:  { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDiv:  { width: 1, height: 36 },

  // Phases
  phaseBlock:  { marginBottom: 8 },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  phaseDot:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  phaseDotText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  phaseInfo:   { flex: 1 },
  phaseTitle:  { fontSize: 16, fontWeight: '700' },
  phaseMeta:   { fontSize: 12, marginTop: 2 },
  // Steps rendered by real StepCard components — no custom step styles needed here

  // Footer
  footer:          { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, gap: 8 },
  publishWarning:  { fontSize: 13, textAlign: 'center', fontWeight: '600' },
  publishBtn:      { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  publishBtnText:  { color: '#fff', fontSize: 17, fontWeight: '800' },
});
