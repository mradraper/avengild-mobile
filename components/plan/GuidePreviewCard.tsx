/**
 * GuidePreviewCard.tsx
 *
 * The visual card shown in the Plan discovery flow — both in the swipe stack
 * and the list view.
 *
 * Layout:
 * ┌─────────────────────────┐
 * │  Hero image (180px)     │
 * │  Intention badge (if    │
 * │  already in Codex)      │
 * ├─────────────────────────┤
 * │  Title                  │
 * │  📍 Location  ★ Count   │
 * │  ─────────────────────  │
 * │  [Scrollable step list] │ ← vertical scroll within card
 * │  Phase 1: Prep          │
 * │  → Step 1               │
 * │  → Step 2               │
 * │  Phase 2: Execution     │
 * │  → Step 3               │
 * └─────────────────────────┘
 *
 * In non-interactive mode (background deck cards), the ScrollView is
 * replaced with a static View to prevent ghost gestures.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { GuideSwipeCard } from '@/lib/database.types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  guide: GuideSwipeCard;
  /** True only for the top card in the swipe stack. Enables scroll. */
  isInteractive: boolean;
  /** When true, renders a compact horizontal list row instead of full card. */
  listMode?: boolean;
  /** Set when this guide is already in the user's Codex as an Intention. */
  isIntention?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GuidePreviewCard({
  guide,
  isInteractive,
  listMode = false,
  isIntention = false,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';

  // -------------------------------------------------------------------------
  // List mode — compact horizontal row for the list view
  // -------------------------------------------------------------------------

  if (listMode) {
    return (
      <View style={[styles.listRow, { backgroundColor: theme.cardBackground }]}>
        {guide.hero_media_url ? (
          <Image source={{ uri: guide.hero_media_url }} style={styles.listThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.listThumb, styles.listThumbEmpty]} />
        )}
        <View style={styles.listBody}>
          <View style={styles.listTitleRow}>
            <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={1}>
              {guide.title}
            </Text>
            {isIntention && (
              <View style={styles.intentionBadge}>
                <Text style={styles.intentionBadgeText}>INTENTION</Text>
              </View>
            )}
          </View>
          {guide.primary_location_name ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={12} color={subText} />
              <Text style={[styles.metaText, { color: subText }]} numberOfLines={1}>
                {guide.primary_location_name}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={12} color={subText} />
            <Text style={[styles.metaText, { color: subText }]}>
              {guide.instantiation_count ?? 0} plans
            </Text>
            {guide.total_step_completions ? (
              <>
                <Text style={[styles.metaSep, { color: subText }]}>·</Text>
                <Ionicons name="checkmark-done-outline" size={12} color={subText} />
                <Text style={[styles.metaText, { color: subText }]}>
                  {guide.total_step_completions} completions
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={subText} />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Full card mode — used in the swipe stack
  // -------------------------------------------------------------------------

  // Total step count across all phases (for the "N steps" label)
  const totalSteps = (guide.phases ?? []).reduce(
    (sum, p) => sum + (p.step_cards?.length ?? 0),
    0,
  );

  const StepList = isInteractive ? ScrollView : View;

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
      {/* Hero image */}
      {guide.hero_media_url ? (
        <Image source={{ uri: guide.hero_media_url }} style={styles.hero} resizeMode="cover" />
      ) : (
        <View style={[styles.hero, styles.heroEmpty]} />
      )}

      {/* Intention badge — overlaid on hero */}
      {isIntention && (
        <View style={styles.intentionOverlay}>
          <Ionicons name="bookmark" size={12} color="#fff" />
          <Text style={styles.intentionOverlayText}>In Your Codex</Text>
        </View>
      )}

      {/* Card body */}
      <View style={styles.body}>
        {/* Title */}
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {guide.title}
        </Text>

        {/* Meta row: location + stats */}
        <View style={styles.metaRow}>
          {guide.primary_location_name ? (
            <>
              <Ionicons name="location-outline" size={13} color={subText} />
              <Text style={[styles.metaText, { color: subText }]} numberOfLines={1}>
                {guide.primary_location_name}
              </Text>
              <Text style={[styles.metaSep, { color: subText }]}>·</Text>
            </>
          ) : null}
          <Ionicons name="people-outline" size={13} color={subText} />
          <Text style={[styles.metaText, { color: subText }]}>
            {guide.instantiation_count ?? 0} plans
          </Text>
          {totalSteps > 0 && (
            <>
              <Text style={[styles.metaSep, { color: subText }]}>·</Text>
              <Text style={[styles.metaText, { color: subText }]}>
                {totalSteps} steps
              </Text>
            </>
          )}
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: isDark ? '#1e2330' : '#e0e0e0' }]} />

        {/* Phase + step preview — scrollable on the active card */}
        {/* @ts-ignore — ScrollView and View share the same children API here */}
        <StepList
          style={styles.stepScroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {(guide.phases ?? []).length === 0 ? (
            <Text style={[styles.noStepsText, { color: subText }]}>No steps added yet.</Text>
          ) : (
            (guide.phases ?? []).map((phase) => (
              <View key={phase.id} style={styles.phaseBlock}>
                {/* Phase label */}
                <Text style={[styles.phaseLabel, { color: '#BC8A2F' }]}>
                  {phase.title}
                </Text>

                {/* Steps */}
                {(phase.step_cards ?? []).map((step, idx) => (
                  <View key={step.id} style={styles.stepRow}>
                    <View style={[styles.stepDot, { backgroundColor: isDark ? '#1e2330' : '#ddd' }]}>
                      <Text style={[styles.stepDotText, { color: subText }]}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: theme.text }]} numberOfLines={2}>
                      {step.atomic_action_text}
                    </Text>
                    {step.location_name ? (
                      <Text style={[styles.stepLocation, { color: subText }]} numberOfLines={1}>
                        📍 {step.location_name}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))
          )}
          {/* Bottom padding inside scroll */}
          <View style={{ height: 16 }} />
        </StepList>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // --- Full card ---
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 540,
  },
  hero:       { width: '100%', height: 180 },
  heroEmpty:  { backgroundColor: '#1e2330' },

  // Intention badge overlaid on hero
  intentionOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(55,94,63,0.85)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  intentionOverlayText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },

  body:       { paddingHorizontal: 16, paddingTop: 14 },
  title:      { fontSize: 20, fontWeight: '800', lineHeight: 26, marginBottom: 8 },

  metaRow:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  metaText:   { fontSize: 13, marginLeft: 4 },
  metaSep:    { marginHorizontal: 6, fontSize: 13 },

  divider:    { height: 1, marginVertical: 12 },

  // Scrollable step list inside the card
  stepScroll: { maxHeight: 230 },
  noStepsText: { fontSize: 13, fontStyle: 'italic' },

  phaseBlock: { marginBottom: 12 },
  phaseLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
    marginTop: 1,
  },
  stepDotText:     { fontSize: 11, fontWeight: '700' },
  stepText:        { flex: 1, fontSize: 14, lineHeight: 20 },
  stepLocation:    { fontSize: 11, marginTop: 2, opacity: 0.7 },

  // --- List mode row ---
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    paddingRight: 14,
  },
  listThumb:      { width: 80, height: 80 },
  listThumbEmpty: { backgroundColor: '#1e2330' },
  listBody:       { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  listTitleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  listTitle:      { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 6 },

  intentionBadge: {
    backgroundColor: 'rgba(55,94,63,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  intentionBadgeText: {
    color: '#375E3F',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
