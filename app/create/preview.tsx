/**
 * create/preview.tsx
 *
 * Step 4 of the Guide Creation wizard — Preview & Publish.
 *
 * Renders a full read-only preview of the Guide draft using the same visual
 * language as the Guide detail screen (phase headers, step cards, meta row).
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

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useGuideCreation } from '@/lib/GuideCreationContext';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function PreviewScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const { guide, phases, publishGuide, resetDraft } = useGuideCreation();
  const [publishing, setPublishing] = useState(false);

  const totalSteps = phases.reduce((s, p) => s + p.steps.length, 0);

  // -------------------------------------------------------------------------
  // Intent tag colour (mirrors StepCard component)
  // -------------------------------------------------------------------------

  function tagColour(tag: string): string {
    switch (tag) {
      case 'Safety':     return '#BC2F38';
      case 'Gear_Check': return '#BC8A2F';
      case 'Milestone':  return '#375E3F';
      default:           return 'transparent';
    }
  }

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  async function handlePublish() {
    Alert.alert(
      'Publish Guide?',
      `"${guide.title}" will be ${guide.stewardship_level === 'Public' ? 'visible to everyone on Discovery' : guide.stewardship_level === 'Guild_Only' ? 'visible to your guilds' : 'private (only you)'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishing(true);
            try {
              const guideId = await publishGuide();
              resetDraft();
              // Dismiss the create modal stack, then navigate to the new Guide
              router.dismissAll();
              router.push({ pathname: '/guide/[id]', params: { id: guideId } });
            } catch (err: any) {
              console.error('[Preview] publishGuide error:', err);
              Alert.alert('Publish failed', err.message ?? 'Please try again.');
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
          title: 'Preview',
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
          {/* Hero placeholder */}
          <View style={styles.heroPlaceholder}>
            <Ionicons name="image-outline" size={36} color={subText} />
            <Text style={[styles.heroPlaceholderText, { color: subText }]}>
              Hero image upload coming soon
            </Text>
          </View>

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

        {/* Phase + step preview */}
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

            {phase.steps.map((step, sIdx) => {
              const borderColour = tagColour(step.intent_tag);
              return (
                <View
                  key={step.localId}
                  style={StyleSheet.flatten([
                    styles.stepCard,
                    { backgroundColor: theme.cardBackground },
                    borderColour !== 'transparent' && { borderLeftColor: borderColour, borderLeftWidth: 3 },
                  ])}
                >
                  <View style={[styles.stepDot, { backgroundColor: theme.tint }]}>
                    <Text style={styles.stepDotText}>{sIdx + 1}</Text>
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={[styles.stepAction, { color: theme.text }]}>{step.atomic_action_text}</Text>
                    {step.location_name ? (
                      <Text style={[styles.stepMeta, { color: subText }]}>📍 {step.location_name}</Text>
                    ) : null}
                    {step.curation_notes ? (
                      <Text style={[styles.stepNote, { color: subText }]}>{step.curation_notes}</Text>
                    ) : null}
                    {step.linked_guide_id ? (
                      <Text style={[styles.stepMeta, { color: '#BC8A2F' }]}>⎇  Mastery Tree: {step.linked_guide_title}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
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
            : <Text style={styles.publishBtnText}>Publish Guide  ✓</Text>
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
  phaseBlock:  { marginBottom: 20 },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  phaseDot:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  phaseDotText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  phaseInfo:   { flex: 1 },
  phaseTitle:  { fontSize: 16, fontWeight: '700' },
  phaseMeta:   { fontSize: 12, marginTop: 2 },

  // Steps
  stepCard: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepDot:     { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  stepDotText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepBody:    { flex: 1 },
  stepAction:  { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  stepMeta:    { fontSize: 12, marginTop: 4 },
  stepNote:    { fontSize: 13, lineHeight: 19, marginTop: 6 },

  // Footer
  footer:          { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, gap: 8 },
  publishWarning:  { fontSize: 13, textAlign: 'center', fontWeight: '600' },
  publishBtn:      { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  publishBtnText:  { color: '#fff', fontSize: 17, fontWeight: '800' },
});
