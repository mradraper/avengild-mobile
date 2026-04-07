/**
 * codex.tsx
 *
 * The Codex tab — the user's personal adventure dashboard and discovery hub.
 *
 * Four segments:
 *
 *   Discover    — Global feed of Public Guides, sorted by popularity.
 *                 Two view modes, toggled by an icon button:
 *                   • Card view: swipe-deck (swipe right = Save to Intentions,
 *                     swipe left = Skip). Uses the SwipeCardStack component.
 *                   • List view: scrollable FlatList with inline search.
 *
 *   Intentions  — Guides the user wants to do (bucket list).
 *                 Visual language: large hero images, aspirational copy.
 *
 *   In Progress — Guides the user has begun or has scheduled as an Event.
 *                 Shows progress bar, next step text, and event date badge.
 *                 Scheduled items navigate to their Event Detail screen.
 *
 *   Completed   — Fully finished Guides (trophy case).
 *                 Shows a stats header (total guides + total steps) and
 *                 completion date per card.
 *
 * Hub actions (always visible):
 *   Create — /create/guide-info
 *   Plan   — /plan/search
 */

import { SwipeCardStack } from '@/components/plan/SwipeCardStack';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import { clearCodexDirty, isCodexDirty, markCodexDirty } from '@/lib/codexSignal';
import type { GuideSwipeCard } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

type StepIdRecord = { id: string; atomic_action_text: string | null };
type PhaseRecord  = { step_cards: StepIdRecord[] };
type GuideRecord  = {
  id: string;
  title: string;
  summary: string | null;
  hero_media_url: string | null;
  difficulty_level: string | null;
  primary_location_name: string | null;
  phases: PhaseRecord[];
  guide_tags?: Array<{ tag: { id: string; label: string } | null }>;
};

type CodexRow = {
  id: string;
  status: string;
  guide_id: string;
  is_pinned: boolean;
  last_completed_at?: string | null;
  guide: GuideRecord;
};

type EnrichedEntry = CodexRow & {
  totalSteps:     number;
  completedSteps: number;
  nextStepText:   string | null;
};

type Segment = 'discover' | 'intentions' | 'in_progress' | 'completed';
type DiscoverViewMode = 'cards' | 'list';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: string): string {
  switch (status) {
    case 'Intention':
    case 'active':    return 'Intention';
    case 'Scheduled': return 'Scheduled';
    case 'Completed': return 'Completed';
    default:          return status;
  }
}

function isCompleted(entry: EnrichedEntry): boolean {
  return (
    entry.status === 'Completed' ||
    (entry.totalSteps > 0 && entry.completedSteps === entry.totalSteps)
  );
}

function isInProgress(entry: EnrichedEntry): boolean {
  if (isCompleted(entry)) return false;
  return entry.status === 'Scheduled' || entry.completedSteps > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CodexScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const [entries,       setEntries]       = useState<EnrichedEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [user,          setUser]          = useState<any>(null);
  const [segment,       setSegment]       = useState<Segment>('intentions');

  // Intentions tag filter — null means "All"
  const [selectedIntentionTag, setSelectedIntentionTag] = useState<string | null>(null);

  // Discover tag filter
  const [selectedDiscoverTag,  setSelectedDiscoverTag]  = useState<string | null>(null);
  const [discoverTagMap,       setDiscoverTagMap]        = useState<Map<string, string>>(new Map()); // tag_id → label
  const [discoverTagGuideIds,  setDiscoverTagGuideIds]   = useState<Set<string>>(new Set());

  // Scheduled events: guideId → { eventId, startTime }
  const [eventDates, setEventDates] = useState<Map<string, { eventId: string; startTime: string }>>(new Map());

  // Discover segment state
  const [discoverGuides,  setDiscoverGuides]  = useState<GuideSwipeCard[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverFetched, setDiscoverFetched] = useState(false);
  const [discoverQuery,   setDiscoverQuery]   = useState('');
  const [discoverMode,    setDiscoverMode]    = useState<DiscoverViewMode>('cards');
  const [savedGuideIds,   setSavedGuideIds]   = useState<Set<string>>(new Set());
  const [saveToast,       setSaveToast]       = useState(false);

  const discoverDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  async function fetchCodex(userId: string) {
    const [entriesResult, completedIds] = await Promise.all([
      supabase
        .from('codex_entries')
        .select(`
          *,
          guide:guides (
            id, title, summary, hero_media_url,
            difficulty_level, primary_location_name,
            phases ( step_cards ( id, atomic_action_text ) ),
            guide_tags ( tag:tags ( id, label ) )
          )
        `)
        .eq('user_id', userId),
      Codex.getCompletedStepIds(),
    ]);

    if (entriesResult.error) {
      console.error('[Codex] fetchCodex error:', entriesResult.error);
      setLoading(false);
      return;
    }

    const enriched: EnrichedEntry[] = (entriesResult.data ?? []).map((raw: any) => {
      const guide: GuideRecord = Array.isArray(raw.guide) ? raw.guide[0] : raw.guide;
      const phases: PhaseRecord[] = guide?.phases ?? [];
      const allSteps       = phases.flatMap(p => p.step_cards);
      const totalSteps     = allSteps.length;
      const completedSteps = allSteps.filter(s => completedIds.has(s.id)).length;
      // First incomplete step text for the In Progress "next step" display
      const nextStep = allSteps.find(s => !completedIds.has(s.id));
      return {
        ...raw,
        guide,
        totalSteps,
        completedSteps,
        nextStepText: nextStep?.atomic_action_text ?? null,
      };
    });

    setEntries(enriched);
    setLoading(false);
  }

  async function fetchEventDates(userId: string) {
    const { data } = await supabase
      .from('events')
      .select('id, guide_id, start_time')
      .eq('creator_id', userId)
      .not('start_time', 'is', null)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    const map = new Map<string, { eventId: string; startTime: string }>();
    for (const evt of data ?? []) {
      if (evt.guide_id && !map.has(evt.guide_id)) {
        map.set(evt.guide_id, { eventId: evt.id, startTime: evt.start_time });
      }
    }
    setEventDates(map);
  }

  async function fetchDiscover(query: string) {
    setDiscoverLoading(true);
    let q = supabase
      .from('guides')
      .select('id, title, summary, hero_media_url, primary_location_name, difficulty_level, stewardship_level, instantiation_count, total_step_completions, created_at')
      .eq('stewardship_level', 'Public')
      .eq('is_archived', false);

    if (query.trim()) {
      q = q.or(
        `title.ilike.%${query.trim()}%,primary_location_name.ilike.%${query.trim()}%`,
      );
    }

    q = q.order('instantiation_count', { ascending: false }).limit(40);

    const { data, error } = await q;
    if (error) {
      console.error('[Codex] fetchDiscover error:', error);
    } else {
      setDiscoverGuides((data ?? []).map(g => ({ ...g, phases: [] })) as GuideSwipeCard[]);
    }
    setDiscoverLoading(false);
    setDiscoverFetched(true);
  }

  async function fetchSavedGuideIds(userId: string) {
    const { data } = await supabase
      .from('codex_entries')
      .select('guide_id')
      .eq('user_id', userId);
    if (data) setSavedGuideIds(new Set(data.map((r: any) => r.guide_id)));
  }

  async function fetchDiscoverTags() {
    const { data } = await supabase
      .from('tags')
      .select('id, label')
      .eq('tag_type', 'activity')
      .order('label', { ascending: true });
    if (data) {
      setDiscoverTagMap(new Map(data.map((t: any) => [t.id, t.label])));
    }
  }

  async function applyDiscoverTagFilter(tagId: string | null) {
    setSelectedDiscoverTag(tagId);
    if (!tagId) {
      setDiscoverTagGuideIds(new Set());
      return;
    }
    const { data } = await supabase
      .from('guide_tags')
      .select('guide_id')
      .eq('tag_id', tagId);
    setDiscoverTagGuideIds(new Set((data ?? []).map((r: any) => r.guide_id as string)));
  }

  // -------------------------------------------------------------------------
  // Focus effect
  // -------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isActive) return;

        if (session?.user) {
          setUser(session.user);
          // Skip the round-trip when we know entries haven't changed since last load.
          // isCodexDirty() is set by any screen that changes step completions or entries.
          if (isCodexDirty()) {
            setLoading(true);
            await Promise.all([
              fetchCodex(session.user.id),
              fetchEventDates(session.user.id),
              fetchSavedGuideIds(session.user.id),
            ]);
            clearCodexDirty();
          }
        } else {
          setUser(null);
          setLoading(false);
        }
      }

      init();
      return () => { isActive = false; };
    }, []),
  );

  function handleSegmentChange(seg: Segment) {
    setSegment(seg);
    if (seg === 'discover' && !discoverFetched) {
      fetchDiscover('');
      if (discoverTagMap.size === 0) fetchDiscoverTags();
    }
  }

  // -------------------------------------------------------------------------
  // Save to Intentions (from Discover card deck)
  // -------------------------------------------------------------------------

  async function handleSaveToIntentions(guide: GuideSwipeCard) {
    if (!user) return;
    await Codex.saveToIntentions(guide.id);
    setSavedGuideIds(prev => new Set([...prev, guide.id]));
    markCodexDirty(); // new entry was added — re-fetch on next focus
    // Brief "Saved!" toast
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 1800);
  }

  async function handleToggleSave(guide: GuideSwipeCard) {
    if (!user) return;
    if (savedGuideIds.has(guide.id)) return; // Already saved — don't unsave from here
    await handleSaveToIntentions(guide);
  }

  async function handlePinToggle(entry: EnrichedEntry) {
    const newPinned = !entry.is_pinned;
    // Optimistic update so the card snaps to/from top immediately
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_pinned: newPinned } : e));
    try {
      await Codex.pinEntry(entry.id, newPinned);
    } catch {
      // Revert on failure
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_pinned: !newPinned } : e));
    }
  }

  function openPinMenu(entry: EnrichedEntry) {
    Alert.alert(
      entry.guide.title,
      undefined,
      [
        {
          text: entry.is_pinned ? 'Unpin' : 'Pin to Top',
          onPress: () => handlePinToggle(entry),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const intentionEntries = entries
    .filter(e => !isCompleted(e) && !isInProgress(e))
    .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  const inProgressEntries = entries
    .filter(e => isInProgress(e))
    .sort((a, b) => {
      // Pinned first
      if (a.is_pinned !== b.is_pinned) return b.is_pinned ? 1 : -1;
      // Scheduled events next, then by progress fraction descending
      const aScheduled = eventDates.has(a.guide.id) ? 1 : 0;
      const bScheduled = eventDates.has(b.guide.id) ? 1 : 0;
      if (aScheduled !== bScheduled) return bScheduled - aScheduled;
      const aFrac = a.totalSteps > 0 ? a.completedSteps / a.totalSteps : 0;
      const bFrac = b.totalSteps > 0 ? b.completedSteps / b.totalSteps : 0;
      return bFrac - aFrac;
    });

  const completedEntries = entries
    .filter(e => isCompleted(e))
    .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  // Guides already saved to Codex are filtered out of the card deck so the
  // swipe view only shows genuinely new discoveries. The list view keeps all
  // results so users can see and browse what they've already saved.
  const unsavedDiscoverGuides = discoverGuides.filter(g => !savedGuideIds.has(g.id));

  // When a discover tag is selected, filter guides to those matching that tag.
  const tagFilteredDiscoverGuides = selectedDiscoverTag
    ? discoverGuides.filter(g => discoverTagGuideIds.has(g.id))
    : discoverGuides;
  const tagFilteredUnsaved = tagFilteredDiscoverGuides.filter(g => !savedGuideIds.has(g.id));

  const segmentCounts: Record<Segment, number> = {
    // Discover badge shows unsaved guides only — already-saved guides are filtered
    // from the card deck, so showing the total count would be misleading.
    discover:    unsavedDiscoverGuides.length,
    intentions:  intentionEntries.length,
    in_progress: inProgressEntries.length,
    completed:   completedEntries.length,
  };

  // Completed tab stats
  const totalGuidesCompleted = completedEntries.length;
  const totalStepsCompleted  = completedEntries.reduce((sum, e) => sum + e.totalSteps, 0);

  // -------------------------------------------------------------------------
  // Sub-renders
  // -------------------------------------------------------------------------

  function renderHubHeader() {
    return (
      <View style={[styles.hubHeader, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>My Codex</Text>
        <View style={styles.hubActions}>
          <TouchableOpacity
            style={[styles.hubBtn, styles.hubBtnPrimary, { backgroundColor: theme.tint }]}
            onPress={() => router.push('/create/guide-info')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.hubBtnPrimaryText}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hubBtn, styles.hubBtnSecondary, { borderColor: theme.tint }]}
            onPress={() => router.push('/plan/search')}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={16} color={theme.tint} style={{ marginRight: 5 }} />
            <Text style={[styles.hubBtnSecondaryText, { color: theme.tint }]}>Plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSegmentControl() {
    const SEGMENTS: { key: Segment; label: string }[] = [
      { key: 'discover',    label: 'Discover' },
      { key: 'intentions',  label: 'Intentions' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'completed',   label: 'Completed' },
    ];

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.segmentScroll, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}
        contentContainerStyle={styles.segmentContent}
      >
        {SEGMENTS.map(({ key, label }) => {
          const isActive = segment === key;
          const count    = segmentCounts[key];
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.segmentTab,
                isActive && { borderBottomColor: '#BC8A2F', borderBottomWidth: 2 },
              ]}
              onPress={() => handleSegmentChange(key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.segmentLabel, { color: isActive ? '#BC8A2F' : subText }]}>
                {label}
              </Text>
              {/* No badge for Discover — the pool is unbounded and a count adds
                  no actionable signal. Show counts only for personal segments. */}
              {count > 0 && key !== 'discover' && (
                <View style={[
                  styles.countBadge,
                  { backgroundColor: isActive ? '#BC8A2F' : isDark ? '#1e2330' : '#e8e8e8' },
                ]}>
                  <Text style={[styles.countText, { color: isActive ? '#fff' : subText }]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  // ── Discover segment ──────────────────────────────────────────────────────

  function renderDiscoverView() {
    if (discoverLoading && discoverGuides.length === 0) {
      return <View style={styles.centred}><ActivityIndicator size="large" color={theme.tint} /></View>;
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Tag filter pills — shown in list mode when tags are available */}
        {discoverMode === 'list' && discoverTagMap.size > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tagFilterScroll, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}
            contentContainerStyle={styles.tagFilterContent}
          >
            <Pressable
              style={[styles.tagPill, !selectedDiscoverTag && { backgroundColor: theme.tint }, selectedDiscoverTag && { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}
              onPress={() => applyDiscoverTagFilter(null)}
            >
              <Text style={[styles.tagPillText, { color: selectedDiscoverTag ? subText : '#fff' }]}>All</Text>
            </Pressable>
            {[...discoverTagMap.entries()].map(([id, label]) => (
              <Pressable
                key={id}
                style={[styles.tagPill, selectedDiscoverTag === id ? { backgroundColor: theme.tint } : { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}
                onPress={() => applyDiscoverTagFilter(selectedDiscoverTag === id ? null : id)}
              >
                <Text style={[styles.tagPillText, { color: selectedDiscoverTag === id ? '#fff' : subText }]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* View mode toggle + search (list mode only) */}
        <View style={[styles.discoverToolbar, { backgroundColor: theme.background }]}>
          {discoverMode === 'list' && (
            <View style={[styles.discoverSearch, { backgroundColor: isDark ? '#121620' : '#f2f2f2', flex: 1 }]}>
              <Ionicons name="search" size={16} color={subText} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.discoverSearchInput, { color: theme.text }]}
                placeholder="Search Guides…"
                placeholderTextColor={subText}
                value={discoverQuery}
                onChangeText={text => {
                  setDiscoverQuery(text);
                  if (discoverDebounce.current) clearTimeout(discoverDebounce.current);
                  discoverDebounce.current = setTimeout(() => fetchDiscover(text), 300);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
            </View>
          )}
          {discoverMode === 'cards' && (
            <Text style={[styles.discoverCardHint, { color: subText, flex: 1 }]}>
              Swipe right to save · Left to skip
            </Text>
          )}
          <TouchableOpacity
            style={[styles.viewModeToggle, { backgroundColor: isDark ? '#1e2330' : '#f0f0f0' }]}
            onPress={() => setDiscoverMode(m => m === 'cards' ? 'list' : 'cards')}
            activeOpacity={0.8}
            hitSlop={8}
          >
            <Ionicons
              name={discoverMode === 'cards' ? 'list-outline' : 'layers-outline'}
              size={20}
              color={theme.tint}
            />
          </TouchableOpacity>
        </View>

        {/* Saved toast */}
        {saveToast && (
          <View style={styles.saveToast}>
            <Ionicons name="bookmark" size={14} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.saveToastText}>Saved to Intentions!</Text>
          </View>
        )}

        {/* Card view */}
        {discoverMode === 'cards' && tagFilteredUnsaved.length > 0 && (
          <SwipeCardStack
            guides={tagFilteredUnsaved}
            onPlan={handleSaveToIntentions}
            onSkip={() => {}}
            rightStampLabel="SAVE"
            rightBtnLabel="Save  ✦"
          />
        )}

        {/* Card view: all saved or no results */}
        {discoverMode === 'cards' && tagFilteredUnsaved.length === 0 && discoverFetched && (
          <View style={styles.emptyState}>
            {discoverGuides.length > 0 ? (
              <>
                <Ionicons name="checkmark-circle-outline" size={52} color={theme.tint} style={{ opacity: 0.6 }} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  You've explored everything here.
                </Text>
                <Text style={[styles.emptyHint, { color: subText }]}>
                  Your saved Guides are in Intentions. Check back as new Guides are published.
                </Text>
                <TouchableOpacity
                  style={[styles.findButton, { backgroundColor: theme.cardBackground }]}
                  onPress={() => setDiscoverMode('list')}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Browse List View</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="compass-outline" size={52} color={subText} style={{ opacity: 0.5 }} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Guides found.</Text>
              </>
            )}
          </View>
        )}

        {/* List view */}
        {discoverMode === 'list' && (
          <FlatList
            data={tagFilteredDiscoverGuides}
            keyExtractor={item => item.id}
            renderItem={({ item }) => renderDiscoverListItem(item)}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centred}>
                <Text style={[styles.emptyHint, { color: subText }]}>No Guides found.</Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  function renderDiscoverListItem(item: GuideSwipeCard) {
    const isSaved = savedGuideIds.has(item.id);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.cardBackground, opacity: pressed ? 0.9 : 1 },
        ]}
        onPress={() => router.push({ pathname: '/guide/[id]', params: { id: item.id } })}
      >
        {item.hero_media_url ? (
          <Image source={{ uri: item.hero_media_url }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImageEmpty, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]} />
        )}
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
            {/* Bookmark button */}
            <TouchableOpacity
              onPress={() => handleToggleSave(item)}
              hitSlop={8}
              style={styles.bookmarkBtn}
            >
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={isSaved ? theme.tint : subText}
              />
            </TouchableOpacity>
          </View>
          {item.summary ? (
            <Text style={[styles.summary, { color: subText }]} numberOfLines={2}>{item.summary}</Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.difficulty_level ? (
              <View style={[styles.difficultyBadge, { backgroundColor: isDark ? '#1e2330' : '#f0ece3' }]}>
                <Text style={[styles.difficultyText, { color: theme.tint }]}>{item.difficulty_level}</Text>
              </View>
            ) : null}
            {item.primary_location_name ? (
              <Text style={[styles.metaChip, { color: subText }]}>
                <Ionicons name="location-outline" size={11} />{'  '}{item.primary_location_name}
              </Text>
            ) : null}
            {item.instantiation_count > 0 ? (
              <Text style={[styles.metaChip, { color: subText }]}>
                {item.instantiation_count.toLocaleString()} planned
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  // ── Intentions segment ────────────────────────────────────────────────────

  function renderIntentionItem({ item }: { item: EnrichedEntry }) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          item.is_pinned && styles.pinnedCard,
          { backgroundColor: theme.cardBackground, opacity: pressed ? 0.9 : 1 },
        ]}
        onPress={() => router.push({ pathname: '/guide/[id]', params: { id: item.guide.id } })}
        onLongPress={() => openPinMenu(item)}
        delayLongPress={400}
      >
        {item.guide.hero_media_url ? (
          <Image source={{ uri: item.guide.hero_media_url }} style={styles.intentionImage} resizeMode="cover" />
        ) : (
          <View style={[styles.intentionImage, styles.cardImageEmpty, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]} />
        )}
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            {item.is_pinned && (
              <Ionicons name="pin" size={13} color={theme.tint} style={{ marginRight: 4, marginTop: 2, flexShrink: 0 }} />
            )}
            <Text style={[styles.title, { color: theme.text, flex: 1 }]} numberOfLines={2}>{item.guide.title}</Text>
          </View>
          {item.guide.summary ? (
            <Text style={[styles.summary, { color: subText }]} numberOfLines={3}>{item.guide.summary}</Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.guide.difficulty_level ? (
              <View style={[styles.difficultyBadge, { backgroundColor: isDark ? '#1e2330' : '#f0ece3' }]}>
                <Text style={[styles.difficultyText, { color: theme.tint }]}>{item.guide.difficulty_level}</Text>
              </View>
            ) : null}
            {item.totalSteps > 0 ? (
              <Text style={[styles.metaChip, { color: subText }]}>
                <Ionicons name="footsteps-outline" size={11} />{'  '}{item.totalSteps} steps
              </Text>
            ) : null}
            {item.guide.primary_location_name ? (
              <Text style={[styles.metaChip, { color: subText }]}>
                <Ionicons name="location-outline" size={11} />{'  '}{item.guide.primary_location_name}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  function renderIntentionsView() {
    if (intentionEntries.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="compass-outline" size={52} color={theme.tint} style={{ opacity: 0.5 }} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Every great adventure{'\n'}begins with a single intention.
          </Text>
          <Text style={[styles.emptyHint, { color: subText }]}>
            Browse Discover to start building your bucket list.
          </Text>
          <TouchableOpacity
            style={[styles.findButton, { backgroundColor: theme.tint }]}
            onPress={() => handleSegmentChange('discover')}
            activeOpacity={0.8}
          >
            <Text style={styles.findButtonText}>Explore Guides</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Collect unique tags from all intention entries
    const tagSet = new Map<string, string>(); // id → label
    for (const entry of intentionEntries) {
      for (const gt of entry.guide.guide_tags ?? []) {
        if (gt.tag) tagSet.set(gt.tag.id, gt.tag.label);
      }
    }
    const allTags = [...tagSet.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    const filtered = selectedIntentionTag
      ? intentionEntries.filter(e =>
          (e.guide.guide_tags ?? []).some(gt => gt.tag?.id === selectedIntentionTag),
        )
      : intentionEntries;

    return (
      <View style={{ flex: 1 }}>
        {/* Tag filter pills — only rendered when tags exist */}
        {allTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tagFilterScroll, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}
            contentContainerStyle={styles.tagFilterContent}
          >
            <Pressable
              style={[
                styles.tagPill,
                !selectedIntentionTag && { backgroundColor: theme.tint },
                selectedIntentionTag && { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' },
              ]}
              onPress={() => setSelectedIntentionTag(null)}
            >
              <Text style={[styles.tagPillText, { color: selectedIntentionTag ? subText : '#fff' }]}>
                All
              </Text>
            </Pressable>
            {allTags.map(([id, label]) => (
              <Pressable
                key={id}
                style={[
                  styles.tagPill,
                  selectedIntentionTag === id
                    ? { backgroundColor: theme.tint }
                    : { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' },
                ]}
                onPress={() => setSelectedIntentionTag(prev => prev === id ? null : id)}
              >
                <Text style={[
                  styles.tagPillText,
                  { color: selectedIntentionTag === id ? '#fff' : subText },
                ]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderIntentionItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyHint, { color: subText }]}>
                No intentions match this tag.
              </Text>
            </View>
          }
        />
      </View>
    );
  }

  // ── In Progress segment ───────────────────────────────────────────────────

  function renderInProgressItem({ item }: { item: EnrichedEntry }) {
    const progressFrac  = item.totalSteps > 0 ? item.completedSteps / item.totalSteps : 0;
    const progressPct   = `${Math.round(progressFrac * 100)}%`;
    const progressColor = progressFrac === 1 ? '#375E3F' : '#BC8A2F';
    const stepsLeft     = item.totalSteps - item.completedSteps;

    const eventEntry  = eventDates.get(item.guide.id);
    const hasSchedule = !!eventEntry;
    const scheduleBadge = hasSchedule
      ? new Date(eventEntry!.startTime).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      : null;

    const destination = hasSchedule && eventEntry
      ? { pathname: '/event/[id]' as const, params: { id: eventEntry.eventId } }
      : { pathname: '/guide/[id]' as const, params: { id: item.guide.id } };

    return (
      <Link href={destination} asChild>
        <Pressable
          style={[styles.card, item.is_pinned && styles.pinnedCard, { backgroundColor: theme.cardBackground }]}
          onLongPress={() => openPinMenu(item)}
          delayLongPress={400}
        >
          {item.guide.hero_media_url ? (
            <Image source={{ uri: item.guide.hero_media_url }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cardImage, styles.cardImageEmpty, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]} />
          )}
          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              {item.is_pinned && (
                <Ionicons name="pin" size={13} color={theme.tint} style={{ marginRight: 4, marginTop: 2, flexShrink: 0 }} />
              )}
              <Text style={[styles.title, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                {item.guide.title}
              </Text>
              {hasSchedule && (
                <View style={[styles.eventDateBadge, { backgroundColor: 'rgba(55,94,63,0.15)' }]}>
                  <Ionicons name="calendar-outline" size={11} color="#375E3F" style={{ marginRight: 3 }} />
                  <Text style={[styles.eventDateText, { color: '#375E3F' }]}>{scheduleBadge}</Text>
                </View>
              )}
            </View>

            {/* Progress bar */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={[styles.progressPct, { color: progressColor }]}>{progressPct}</Text>
                <Text style={[styles.progressLabel, { color: subText }]}>
                  {stepsLeft > 0 ? `${stepsLeft} step${stepsLeft !== 1 ? 's' : ''} to go` : 'Almost done!'}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
                <View style={[styles.progressFill, { width: progressPct as any, backgroundColor: progressColor }]} />
              </View>
            </View>

            {/* Next step hint */}
            {item.nextStepText && stepsLeft > 0 ? (
              <View style={[styles.nextStepRow, { backgroundColor: isDark ? '#121620' : '#f5f2ec' }]}>
                <Ionicons name="arrow-forward-circle-outline" size={14} color={theme.tint} style={{ marginRight: 6, flexShrink: 0 }} />
                <Text style={[styles.nextStepText, { color: theme.text }]} numberOfLines={2}>
                  {item.nextStepText}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Link>
    );
  }

  function renderInProgressView() {
    if (inProgressEntries.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="walk-outline" size={52} color={subText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing in progress.</Text>
          <Text style={[styles.emptyHint, { color: subText }]}>
            Start completing steps on a Guide, or schedule an event.
          </Text>
          <TouchableOpacity
            style={[styles.findButton, { backgroundColor: theme.tint }]}
            onPress={() => router.push('/plan/search')}
            activeOpacity={0.8}
          >
            <Text style={styles.findButtonText}>Plan an Adventure</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <FlatList
        data={inProgressEntries}
        keyExtractor={item => item.id}
        renderItem={renderInProgressItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  // ── Completed segment ─────────────────────────────────────────────────────

  function renderCompletedStats() {
    if (completedEntries.length === 0) return null;
    return (
      <View style={[styles.completedStats, { backgroundColor: isDark ? '#1a1f2e' : '#f9f5ee' }]}>
        <View style={styles.completedStatItem}>
          <Text style={[styles.completedStatValue, { color: theme.tint }]}>
            {totalGuidesCompleted}
          </Text>
          <Text style={[styles.completedStatLabel, { color: subText }]}>
            {totalGuidesCompleted === 1 ? 'Guide' : 'Guides'} Completed
          </Text>
        </View>
        <View style={[styles.completedStatDivider, { backgroundColor: isDark ? '#2a2f40' : '#e0d9cc' }]} />
        <View style={styles.completedStatItem}>
          <Text style={[styles.completedStatValue, { color: theme.tint }]}>
            {totalStepsCompleted.toLocaleString()}
          </Text>
          <Text style={[styles.completedStatLabel, { color: subText }]}>Steps Taken</Text>
        </View>
      </View>
    );
  }

  function renderCompletedItem({ item }: { item: EnrichedEntry }) {
    return (
      <Link href={{ pathname: '/guide/[id]', params: { id: item.guide.id } }} asChild>
        <Pressable
          style={[styles.card, styles.completedCard, item.is_pinned && styles.pinnedCard, { backgroundColor: theme.cardBackground }]}
          onLongPress={() => openPinMenu(item)}
          delayLongPress={400}
        >
          {item.guide.hero_media_url ? (
            <Image source={{ uri: item.guide.hero_media_url }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cardImage, styles.cardImageEmpty, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]} />
          )}
          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              {item.is_pinned
                ? <Ionicons name="pin" size={13} color={theme.tint} style={{ marginRight: 4, marginTop: 2, flexShrink: 0 }} />
                : <Ionicons name="star" size={14} color={theme.tint} style={{ marginRight: 6, marginTop: 2, flexShrink: 0 }} />
              }
              <Text style={[styles.title, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                {item.guide.title}
              </Text>
            </View>
            {item.guide.summary ? (
              <Text style={[styles.summary, { color: subText }]} numberOfLines={2}>{item.guide.summary}</Text>
            ) : null}
            <View style={styles.completedMeta}>
              <Text style={[styles.completedStepsText, { color: theme.tint }]}>
                {item.totalSteps} steps completed
              </Text>
              {item.last_completed_at ? (
                <Text style={[styles.dateText, { color: subText }]}>
                  {new Date(item.last_completed_at).toLocaleDateString('en-CA', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Link>
    );
  }

  function renderCompletedView() {
    if (completedEntries.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={52} color={subText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Your trophy case awaits its first prize.</Text>
          <Text style={[styles.emptyHint, { color: subText }]}>
            Finish a Guide to see it commemorated here.
          </Text>
        </View>
      );
    }
    return (
      <FlatList
        data={completedEntries}
        keyExtractor={item => item.id}
        renderItem={renderCompletedItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderCompletedStats()}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Root render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderHubHeader()}

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>

      ) : !user ? (
        <View style={styles.centred}>
          <Ionicons name="lock-closed-outline" size={48} color={subText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Sign in to view your Codex.</Text>
          <Link href="/(tabs)/guilds" asChild>
            <Pressable style={[styles.findButton, { backgroundColor: theme.cardBackground, marginTop: 16 }]}>
              <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Go to Guilds / Sign In</Text>
            </Pressable>
          </Link>
        </View>

      ) : (
        <>
          {renderSegmentControl()}
          {segment === 'discover'    && renderDiscoverView()}
          {segment === 'intentions'  && renderIntentionsView()}
          {segment === 'in_progress' && renderInProgressView()}
          {segment === 'completed'   && renderCompletedView()}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },

  // Hub header
  hubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  screenTitle:      { fontSize: 28, fontWeight: 'bold' },
  hubActions:       { flexDirection: 'row', gap: 8 },
  hubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
  },
  hubBtnPrimary:       {},
  hubBtnPrimaryText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  hubBtnSecondary:     { borderWidth: 1.5 },
  hubBtnSecondaryText: { fontWeight: '700', fontSize: 14 },

  // Segment control
  segmentScroll:  { borderBottomWidth: 1, flexShrink: 0, flexGrow: 0, height: 44 },
  segmentContent: { paddingHorizontal: 20, paddingBottom: 2 },
  segmentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segmentLabel: { fontSize: 14, fontWeight: '600' },
  countBadge: {
    marginLeft: 6, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1,
  },
  countText: { fontSize: 11, fontWeight: '700' },

  // Intentions tag filter
  tagFilterScroll:  { borderBottomWidth: 1, flexShrink: 0, flexGrow: 0, height: 48 },
  tagFilterContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  tagPillText: { fontSize: 13, fontWeight: '600' },

  // Discover toolbar
  discoverToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  discoverSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
  },
  discoverSearchInput: { flex: 1, fontSize: 15 },
  discoverCardHint: { fontSize: 13, fontStyle: 'italic' },
  viewModeToggle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Save toast
  saveToast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#BC8A2F',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  saveToastText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // List
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },

  // Card (shared base)
  card: {
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  pinnedCard: {
    borderTopWidth: 2,
    borderTopColor: '#BC8A2F',
  },
  completedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#BC8A2F',
  },
  cardImage:       { width: '100%', height: 140 },
  intentionImage:  { width: '100%', height: 200 },
  cardImageEmpty:  {},
  cardBody:        { padding: 14 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 4,
  },
  title:   { fontSize: 17, fontWeight: '700', flex: 1 },
  summary: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  metaChip: { fontSize: 12 },
  difficultyBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  difficultyText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Bookmark button (list view)
  bookmarkBtn: { padding: 4, flexShrink: 0 },

  // Event date badge (in progress)
  eventDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  eventDateText: { fontSize: 11, fontWeight: '700' },

  // Progress (in progress)
  progressSection: { marginTop: 4, marginBottom: 8 },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  progressPct:   { fontSize: 15, fontWeight: '800' },
  progressLabel: { fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3 },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
    padding: 10,
    marginTop: 2,
  },
  nextStepText: { fontSize: 13, lineHeight: 18, flex: 1 },

  // Completed stats header
  completedStats: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    alignItems: 'center',
  },
  completedStatItem: { flex: 1, alignItems: 'center' },
  completedStatValue: {
    fontSize: 30,
    fontFamily: 'Chivo_900Black',
    fontWeight: 'normal',
  },
  completedStatLabel: { fontSize: 12, marginTop: 3, textAlign: 'center' },
  completedStatDivider: { width: 1, height: 40 },

  // Completed card
  completedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(188,138,47,0.15)',
  },
  completedStepsText: { fontSize: 12, fontWeight: '700' },
  dateText:           { fontSize: 12, opacity: 0.7 },

  // Empty states
  centred:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 14, textAlign: 'center', lineHeight: 26 },
  emptyHint:  { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  findButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  findButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
