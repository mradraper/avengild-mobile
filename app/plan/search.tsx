/**
 * plan/search.tsx
 *
 * The Plan discovery screen — the first step in creating an Event from a Guide.
 *
 * Features:
 * - Search input (debounced, 300ms) filters public Guides by title/location.
 * - Intentions-first ordering: Guides already in the user's Codex are sorted
 *   to the top of every result set, and flagged with a badge.
 * - Two view modes, toggled by the icon buttons in the header:
 *     Swipe — dating-app card stack (SwipeCardStack component)
 *     List  — scrollable FlatList for quick browsing
 * - Right-swipe or "Plan it" → navigates to plan/adapt with the guide
 *   pre-loaded, allowing the user to customise steps before inviting friends.
 *
 * Data strategy:
 * - Initial load: user's codex_entries (Intentions) + top public Guides ordered
 *   by instantiation_count DESC.
 * - On search change: re-queries the guides table with an ILIKE filter.
 * - Active swipe card: fetches the full phases + step_cards for the top card
 *   lazily (and pre-fetches the next card) to keep initial load fast.
 */

import { useColorScheme } from '@/components/useColorScheme';
import { GuidePreviewCard } from '@/components/plan/GuidePreviewCard';
import { SwipeCardStack } from '@/components/plan/SwipeCardStack';
import Colors from '@/constants/Colors';
import type { GuideSwipeCard } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'swipe' | 'list';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce delay for search input (ms). */
const SEARCH_DEBOUNCE_MS = 300;

/** Number of guides to fetch per query. */
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

export default function PlanSearchScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const [searchQuery,    setSearchQuery]    = useState('');
  const [viewMode,       setViewMode]       = useState<ViewMode>('swipe');
  const [guides,         setGuides]         = useState<GuideSwipeCard[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [intentionIds,   setIntentionIds]   = useState<Set<string>>(new Set());
  const [stackGuides,    setStackGuides]    = useState<GuideSwipeCard[]>([]);
  const [stackLoading,   setStackLoading]   = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Boot: load the user's Intention IDs for badge rendering
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function boot() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('codex_entries')
          .select('guide_id')
          .eq('user_id', user.id)
          .eq('status', 'Intention');
        if (data) {
          setIntentionIds(new Set(data.map((r: any) => r.guide_id)));
        }
      }
      // Initial guide load (no search query)
      await fetchGuides('');
      setLoading(false);
    }
    boot();
  }, []);

  // -------------------------------------------------------------------------
  // When the guide list changes, load full step data for the swipe stack
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (guides.length > 0) {
      loadStackData(guides.slice(0, 5)); // Pre-load the first 5 cards
    } else {
      setStackGuides([]);
    }
  }, [guides]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  async function fetchGuides(query: string) {
    let q = supabase
      .from('guides')
      .select(`
        id, title, summary, hero_media_url,
        primary_location_name, difficulty_level, stewardship_level,
        instantiation_count, total_step_completions, created_at
      `)
      .eq('stewardship_level', 'Public')
      .eq('is_archived', false);

    if (query.trim()) {
      // Search across title and location
      q = q.or(`title.ilike.%${query.trim()}%,primary_location_name.ilike.%${query.trim()}%`);
    }

    q = q.order('instantiation_count', { ascending: false }).limit(PAGE_SIZE);

    const { data, error } = await q;
    if (error) {
      console.error('[PlanSearch] fetchGuides error:', error);
      return;
    }

    const raw = (data ?? []) as GuideSwipeCard[];

    // Sort so that the user's Intentions always appear first, regardless of
    // their instantiation_count rank.
    const sorted = [
      ...raw.filter(g => intentionIds.has(g.id)),
      ...raw.filter(g => !intentionIds.has(g.id)),
    ].map(g => ({ ...g, phases: [] })); // phases hydrated separately

    setGuides(sorted);
  }

  /**
   * Loads the full phases + step_cards for a batch of guides.
   * This is kept separate from the guide list query to keep initial load fast.
   */
  async function loadStackData(batch: GuideSwipeCard[]) {
    setStackLoading(true);
    const ids = batch.map(g => g.id);

    const { data, error } = await supabase
      .from('phases')
      .select('*, step_cards(*)')
      .in('guide_id', ids)
      .order('phase_index', { ascending: true });

    if (error) {
      console.error('[PlanSearch] loadStackData error:', error);
      setStackGuides(batch);
      setStackLoading(false);
      return;
    }

    // Group phases by guide_id and attach to the correct guide
    const phasesByGuide: Record<string, any[]> = {};
    for (const phase of data ?? []) {
      if (!phasesByGuide[phase.guide_id]) phasesByGuide[phase.guide_id] = [];
      const sortedSteps = (phase.step_cards ?? []).sort(
        (a: any, b: any) => a.step_index - b.step_index,
      );
      phasesByGuide[phase.guide_id].push({ ...phase, step_cards: sortedSteps });
    }

    const enriched: GuideSwipeCard[] = batch.map(g => ({
      ...g,
      phases: phasesByGuide[g.id] ?? [],
    }));

    setStackGuides(enriched);
    setStackLoading(false);
  }

  // -------------------------------------------------------------------------
  // Search input handler (debounced)
  // -------------------------------------------------------------------------

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      setLoading(true);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        await fetchGuides(text);
        setLoading(false);
      }, SEARCH_DEBOUNCE_MS);
    },
    [intentionIds], // Re-bind when Intentions change so sorting stays correct
  );

  // -------------------------------------------------------------------------
  // Swipe handlers
  // -------------------------------------------------------------------------

  function handlePlan(guide: GuideSwipeCard) {
    // Remove the planned guide from the front of the stack
    setStackGuides(prev => prev.slice(1));

    // Navigate to the adapt screen with this guide's ID
    router.push({ pathname: '/plan/adapt', params: { guideId: guide.id, title: guide.title } });
  }

  function handleSkip() {
    // Remove the skipped guide from the front of the stack
    setStackGuides(prev => {
      const next = prev.slice(1);
      // If the stack is running low, try to pre-load the next batch from guides
      if (next.length <= 2 && guides.length > prev.length) {
        const nextBatch = guides.slice(prev.length, prev.length + 3);
        loadStackData(nextBatch).then(() => {
          setStackGuides(curr => [...curr, ...nextBatch]);
        });
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderHeader() {
    return (
      <View style={styles.header}>
        {/* Search input */}
        <View style={StyleSheet.flatten([styles.searchBar, { backgroundColor: isDark ? '#121620' : '#fff', borderColor: isDark ? '#1e2330' : '#ddd' }])}>
          <Ionicons name="search" size={18} color={subText} style={styles.searchIcon} />
          <TextInput
            style={StyleSheet.flatten([styles.searchInput, { color: theme.text }])}
            placeholder="Search Guides…"
            placeholderTextColor={subText}
            value={searchQuery}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* View mode toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={StyleSheet.flatten([styles.toggleBtn, viewMode === 'swipe' && { backgroundColor: theme.tint }])}
            onPress={() => setViewMode('swipe')}
            activeOpacity={0.8}
          >
            <Ionicons name="albums-outline" size={18} color={viewMode === 'swipe' ? '#fff' : subText} />
          </TouchableOpacity>
          <TouchableOpacity
            style={StyleSheet.flatten([styles.toggleBtn, viewMode === 'list' && { backgroundColor: theme.tint }])}
            onPress={() => setViewMode('list')}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={20} color={viewMode === 'list' ? '#fff' : subText} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderListItem({ item }: { item: GuideSwipeCard }) {
    const isIntention = intentionIds.has(item.id);
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/plan/adapt', params: { guideId: item.id, title: item.title } })}
      >
        <GuidePreviewCard
          guide={item}
          isInteractive={false}
          listMode
          isIntention={isIntention}
        />
      </Pressable>
    );
  }

  function renderListSectionHeader(label: string, count: number) {
    if (count === 0) return null;
    return (
      <Text style={[styles.sectionHeader, { color: subText }]}>
        {label.toUpperCase()}  ({count})
      </Text>
    );
  }

  function renderListView() {
    const intentionList = guides.filter(g => intentionIds.has(g.id));
    const discoverList  = guides.filter(g => !intentionIds.has(g.id));

    return (
      <FlatList
        data={discoverList}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderListItem}
        ListHeaderComponent={
          <>
            {intentionList.length > 0 && renderListSectionHeader('Your Intentions', intentionList.length)}
            {intentionList.map(g => (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: '/plan/adapt', params: { guideId: g.id, title: g.title } })}
              >
                <GuidePreviewCard
                  guide={g}
                  isInteractive={false}
                  listMode
                  isIntention
                />
              </Pressable>
            ))}
            {discoverList.length > 0 &&
              renderListSectionHeader('Discover', discoverList.length)}
          </>
        }
        ListEmptyComponent={
          intentionList.length === 0
            ? <Text style={[styles.emptyText, { color: subText }]}>No guides found.</Text>
            : null
        }
      />
    );
  }

  function renderSwipeView() {
    if (stackLoading && stackGuides.length === 0) {
      return (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      );
    }

    if (stackGuides.length === 0) {
      return (
        <View style={styles.centred}>
          <Ionicons name="compass-outline" size={52} color={subText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No more Guides to show.
          </Text>
          <Text style={[styles.emptyHint, { color: subText }]}>
            Try a different search, or switch to List view to browse all results.
          </Text>
        </View>
      );
    }

    return (
      <SwipeCardStack
        guides={stackGuides}
        onPlan={handlePlan}
        onSkip={handleSkip}
        onEmpty={() => {
          // Re-query with the current search to reset the deck
          fetchGuides(searchQuery);
        }}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Root render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Plan',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      {renderHeader()}

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : viewMode === 'swipe' ? (
        renderSwipeView()
      ) : (
        renderListView()
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },

  // Search bar
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 42,
  },
  searchIcon:  { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 15 },

  // View mode toggle
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e2330',
  },
  toggleBtn: {
    padding: 9,
  },

  // List view
  listContent: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 4 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 8,
  },

  // Empty / loading states
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptyHint:  { fontSize: 14, marginTop: 8,  textAlign: 'center', lineHeight: 20 },
  emptyText:  { textAlign: 'center', marginTop: 24, fontSize: 15 },
});
