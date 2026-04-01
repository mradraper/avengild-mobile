/**
 * codex.tsx
 *
 * The Codex tab — the user's personal adventure dashboard and discovery hub.
 *
 * Four segments, toggled by a horizontal tab strip:
 *
 *   Discover   — Global feed of Public Guides, sorted by popularity.
 *                Lazy-loaded the first time the segment is opened.
 *                Includes an inline search input.
 *
 *   Intentions — Guides the user wants to do but hasn't started yet
 *                (codex_entry status='Intention'/'active', 0 completed steps).
 *
 *   In Progress — Guides the user has begun (≥1 completed step) OR has
 *                 scheduled as an Event. Scheduled items show a small
 *                 calendar badge with the upcoming event date.
 *
 *   Completed  — Guides the user has fully finished
 *                (status='Completed' or all steps ticked).
 *
 * Hub actions (always visible in header):
 *   Create — launches the Guide Creation wizard (/create/guide-info)
 *   Plan   — launches the swipe-based event planning flow (/plan/search)
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import type { GuideSwipeCard } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

type StepIdRecord = { id: string };
type PhaseRecord  = { step_cards: StepIdRecord[] };
type GuideRecord  = {
  id: string;
  title: string;
  summary: string | null;
  hero_media_url: string | null;
  phases: PhaseRecord[];
};

type CodexRow = {
  id: string;
  status: string;
  guide_id: string;
  last_completed_at?: string | null;
  guide: GuideRecord;
};

type EnrichedEntry = CodexRow & {
  totalSteps:     number;
  completedSteps: number;
};

type Segment = 'discover' | 'intentions' | 'in_progress' | 'completed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw DB status string to a display label.
 * Handles the legacy 'active' value as a synonym for 'Intention'.
 */
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

  const [entries,          setEntries]          = useState<EnrichedEntry[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [user,             setUser]             = useState<any>(null);
  const [segment,          setSegment]          = useState<Segment>('intentions');

  // Scheduled events for calendar badges: guideId → { eventId, startTime }
  const [eventDates, setEventDates] = useState<Map<string, { eventId: string; startTime: string }>>(new Map());

  // Discovery segment state
  const [discoverGuides,   setDiscoverGuides]   = useState<GuideSwipeCard[]>([]);
  const [discoverLoading,  setDiscoverLoading]  = useState(false);
  const [discoverFetched,  setDiscoverFetched]  = useState(false);
  const [discoverQuery,    setDiscoverQuery]    = useState('');
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
            phases ( step_cards ( id ) )
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
      const allStepIds     = phases.flatMap(p => p.step_cards.map(s => s.id));
      const totalSteps     = allStepIds.length;
      const completedSteps = allStepIds.filter(sid => completedIds.has(sid)).length;
      return { ...raw, guide, totalSteps, completedSteps };
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

  // -------------------------------------------------------------------------
  // Focus effect
  // -------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function init() {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!isActive) return;

        if (session?.user) {
          setUser(session.user);
          await Promise.all([
            fetchCodex(session.user.id),
            fetchEventDates(session.user.id),
          ]);
        } else {
          setUser(null);
          setLoading(false);
        }
      }

      init();
      return () => { isActive = false; };
    }, []),
  );

  // When the user switches to Discover, lazy-load guides once
  function handleSegmentChange(seg: Segment) {
    setSegment(seg);
    if (seg === 'discover' && !discoverFetched) {
      fetchDiscover('');
    }
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const intentionEntries  = entries.filter(e => !isCompleted(e) && !isInProgress(e));
  const inProgressEntries = entries.filter(e => isInProgress(e));
  const completedEntries  = entries.filter(e => isCompleted(e));

  const segmentCounts: Record<Segment, number> = {
    discover:    discoverGuides.length,
    intentions:  intentionEntries.length,
    in_progress: inProgressEntries.length,
    completed:   completedEntries.length,
  };

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
              {count > 0 && (
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor: isActive
                        ? '#BC8A2F'
                        : isDark ? '#1e2330' : '#e8e8e8',
                    },
                  ]}
                >
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

  function renderDiscoverSearch() {
    return (
      <View style={[styles.discoverSearch, { backgroundColor: isDark ? '#121620' : '#f2f2f2' }]}>
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
    );
  }

  function renderDiscoverItem({ item }: { item: GuideSwipeCard }) {
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
          <View style={styles.cardImageEmpty} />
        )}
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
          </View>
          {item.summary ? (
            <Text style={[styles.summary, { color: subText }]} numberOfLines={2}>{item.summary}</Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.primary_location_name ? (
              <Text style={[styles.metaChip, { color: subText }]}>
                <Ionicons name="location-outline" size={11} />{'  '}{item.primary_location_name}
              </Text>
            ) : null}
            {item.instantiation_count > 0 ? (
              <Text style={[styles.metaChip, { color: subText }]}>
                {item.instantiation_count} planned
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  function renderDiscoverView() {
    if (discoverLoading && discoverGuides.length === 0) {
      return (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      );
    }

    return (
      <FlatList
        data={discoverGuides}
        keyExtractor={item => item.id}
        renderItem={renderDiscoverItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderDiscoverSearch()}
        ListEmptyComponent={
          <View style={styles.centred}>
            <Text style={[styles.emptyHint, { color: subText }]}>No Guides found.</Text>
          </View>
        }
      />
    );
  }

  // ── Codex entry card (Intentions / In Progress / Completed) ──────────────

  function renderEntry({ item }: { item: EnrichedEntry }) {
    const complete     = isCompleted(item);
    const progressFrac = item.totalSteps > 0 ? item.completedSteps / item.totalSteps : 0;
    const progressPct  = `${Math.round(progressFrac * 100)}%`;
    const label        = statusLabel(item.status);

    // Calendar badge for scheduled items
    const eventEntry = eventDates.get(item.guide.id);
    const hasSchedule = !!eventEntry;
    const scheduleBadge = hasSchedule
      ? new Date(eventEntry!.startTime).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      : null;

    const cardStyle = [styles.card, { backgroundColor: theme.cardBackground }];
    const badgeBg   = complete
      ? 'rgba(169,225,161,0.15)'
      : hasSchedule
      ? 'rgba(55,94,63,0.15)'
      : 'rgba(188,138,47,0.12)';
    const badgeTextColor = complete ? '#375E3F' : hasSchedule ? '#375E3F' : '#BC8A2F';
    const progressColor  = progressFrac === 1 ? '#375E3F' : '#BC8A2F';

    // Scheduled entries navigate to their Event Detail; all others go to the Guide.
    const destination = hasSchedule && eventEntry
      ? { pathname: '/event/[id]' as const, params: { id: eventEntry.eventId } }
      : { pathname: '/guide/[id]' as const, params: { id: item.guide.id } };

    return (
      <Link href={destination} asChild>
        <Pressable style={cardStyle}>
          {item.guide.hero_media_url ? (
            <Image source={{ uri: item.guide.hero_media_url }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.cardImageEmpty} />
          )}

          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                {item.guide.title}
              </Text>
              <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                {complete && (
                  <Ionicons name="checkmark-circle" size={11} color="#375E3F" style={{ marginRight: 3 }} />
                )}
                {hasSchedule && !complete && (
                  <Ionicons name="calendar-outline" size={11} color="#375E3F" style={{ marginRight: 3 }} />
                )}
                <Text style={[styles.badgeText, { color: badgeTextColor }]}>
                  {scheduleBadge ?? label.toUpperCase()}
                </Text>
              </View>
            </View>

            {item.guide.summary ? (
              <Text style={[styles.summary, { color: subText }]} numberOfLines={2}>
                {item.guide.summary}
              </Text>
            ) : null}

            {item.totalSteps > 0 ? (
              <View style={styles.progressSection}>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
                  <View
                    style={[styles.progressFill, { width: progressPct as any, backgroundColor: progressColor }]}
                  />
                </View>
                <Text style={[styles.progressLabel, { color: subText }]}>
                  {item.completedSteps} / {item.totalSteps} steps
                </Text>
              </View>
            ) : (
              <Text style={[styles.progressLabel, { color: subText }]}>No steps yet</Text>
            )}

            {complete && item.last_completed_at ? (
              <Text style={[styles.dateText, { color: subText }]}>
                Completed {new Date(item.last_completed_at).toLocaleDateString('en-CA', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Link>
    );
  }

  function renderEntryList(data: EnrichedEntry[], emptyIcon: string, emptyTitle: string, emptyHint: string, showPlanCta?: boolean) {
    if (data.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name={emptyIcon as any} size={44} color={subText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{emptyTitle}</Text>
          <Text style={[styles.emptyHint, { color: subText }]}>{emptyHint}</Text>
          {showPlanCta && (
            <TouchableOpacity
              style={[styles.findButton, { backgroundColor: theme.tint }]}
              onPress={() => router.push('/plan/search')}
              activeOpacity={0.8}
            >
              <Text style={styles.findButtonText}>Browse Guides</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <FlatList
        data={data}
        keyExtractor={item => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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

          {segment === 'discover' && renderDiscoverView()}

          {segment === 'intentions' && renderEntryList(
            intentionEntries,
            'compass-outline',
            'No intentions yet.',
            'Browse Guides and save ones you want to do.',
            true,
          )}

          {segment === 'in_progress' && renderEntryList(
            inProgressEntries,
            'walk-outline',
            'Nothing in progress.',
            'Start completing steps on a Guide, or schedule an event.',
            true,
          )}

          {segment === 'completed' && renderEntryList(
            completedEntries,
            'trophy-outline',
            'No completed Guides yet.',
            'Finish a Guide to see it logged here.',
            false,
          )}
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
    marginBottom: 0,
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

  // Segment control (horizontal scroll)
  // paddingBottom: 2 gives the active-tab underline (2px) room to render
  // without being clipped by the ScrollView's bottom edge.
  segmentScroll:  { borderBottomWidth: 1, flexShrink: 0 },
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
    marginLeft: 6,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: { fontSize: 11, fontWeight: '700' },

  // Discover search bar
  discoverSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  discoverSearchInput: { flex: 1, fontSize: 15 },

  // List
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

  // Card
  card: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardImage:      { width: '100%', height: 140 },
  cardImageEmpty: { width: '100%', height: 140, backgroundColor: '#1e2330' },
  cardBody:       { padding: 14 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontSize: 17, fontWeight: '700', flex: 1, marginRight: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  summary:   { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  metaRow:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaChip:  { fontSize: 12 },

  // Progress
  progressSection: { marginTop: 2 },
  progressTrack: {
    height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 5,
  },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 12 },
  dateText:      { fontSize: 12, marginTop: 6, opacity: 0.8 },

  // Empty states
  centred:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 14, textAlign: 'center' },
  emptyHint:  { fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  findButton:     { marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  findButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
