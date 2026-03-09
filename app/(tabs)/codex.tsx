import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
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
  // Timestamp fields are declared optional because the live codex_entries
  // table schema differs from our type definition. Using select('*') returns
  // whatever columns actually exist; we never assume their presence.
  last_completed_at?: string | null;
  guide: GuideRecord;
};

type EnrichedEntry = CodexRow & {
  totalSteps: number;
  completedSteps: number;
};

type Segment = 'intentions' | 'logs';

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

/**
 * Returns true when an entry belongs in the Logs segment.
 * An entry is a Log if the DB status is 'Completed', OR if the user has
 * ticked every step — whichever happens first. This is a bridge-period
 * heuristic; the Events Engine (migration 002) will make status the
 * authoritative signal and retire this computed check.
 */
function isLog(entry: EnrichedEntry): boolean {
  return (
    entry.status === 'Completed' ||
    (entry.totalSteps > 0 && entry.completedSteps === entry.totalSteps)
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CodexScreen() {
  const [entries, setEntries] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser]       = useState<any>(null);
  const [segment, setSegment] = useState<Segment>('intentions');

  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#ccc' : '#666';

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  async function fetchCodex(userId: string) {
    // Single query: codex entries + guide metadata + all phase/step IDs.
    // Nested step_cards(id) provides total step counts without a second query.
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

      // Flatten all step IDs across every phase for this guide.
      const allStepIds     = phases.flatMap(p => p.step_cards.map(s => s.id));
      const totalSteps     = allStepIds.length;
      const completedSteps = allStepIds.filter(sid => completedIds.has(sid)).length;

      return { ...raw, guide, totalSteps, completedSteps };
    });

    setEntries(enriched);
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Focus effect — re-fetches every time the tab is opened
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
          fetchCodex(session.user.id);
        } else {
          setUser(null);
          setLoading(false);
        }
      }

      init();
      return () => { isActive = false; };
    }, []),
  );

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const logEntries       = entries.filter(e => isLog(e));
  const intentionEntries = entries.filter(e => !isLog(e));
  const activeEntries    = segment === 'intentions' ? intentionEntries : logEntries;

  // -------------------------------------------------------------------------
  // Sub-renders
  // -------------------------------------------------------------------------

  function renderSegmentControl() {
    return (
      // StyleSheet.flatten used on all arrays to produce a single plain object,
      // preventing react-native-web's CSSStyleDeclaration indexed setter error.
      <View style={StyleSheet.flatten([styles.segmentRow, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }])}>
        {(['intentions', 'logs'] as Segment[]).map((seg) => {
          const isActive = segment === seg;
          const label    = seg === 'intentions' ? 'Intentions' : 'Logs';
          const count    = seg === 'intentions' ? intentionEntries.length : logEntries.length;

          // Active tab adds a gold bottom border. Flattened to a single object
          // so react-native-web never receives a nested or mixed-type style array.
          const tabStyle = StyleSheet.flatten([
            styles.segmentTab,
            isActive ? { borderBottomColor: '#BC8A2F', borderBottomWidth: 2 } : null,
          ]);

          return (
            <TouchableOpacity
              key={seg}
              style={tabStyle}
              onPress={() => setSegment(seg)}
              activeOpacity={0.75}
            >
              <Text style={StyleSheet.flatten([styles.segmentLabel, { color: isActive ? '#BC8A2F' : subText }])}>
                {label}
              </Text>
              {count > 0 && (
                <View style={StyleSheet.flatten([styles.countBadge, { backgroundColor: isActive ? '#BC8A2F' : (isDark ? '#1e2330' : '#e8e8e8') }])}>
                  <Text style={StyleSheet.flatten([styles.countText, { color: isActive ? '#fff' : subText }])}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderEntry({ item }: { item: EnrichedEntry }) {
    const isComplete   = isLog(item);
    const progressFrac = item.totalSteps > 0 ? item.completedSteps / item.totalSteps : 0;
    const progressPct  = `${Math.round(progressFrac * 100)}%`;
    const label        = statusLabel(item.status);

    // Precompute all merged styles for this card. Avoids passing arrays to
    // Pressable (which sits inside Link asChild), where expo-router's prop
    // merging can produce nested arrays that react-native-web cannot flatten.
    const cardStyle = StyleSheet.flatten([styles.card, { backgroundColor: theme.cardBackground }]);
    const badgeStyle = StyleSheet.flatten([
      styles.badge,
      { backgroundColor: isComplete ? 'rgba(169,225,161,0.15)' : 'rgba(188,138,47,0.12)' },
    ]);
    const progressTrackStyle = StyleSheet.flatten([
      styles.progressTrack,
      { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' },
    ]);
    const progressFillStyle = StyleSheet.flatten([
      styles.progressFill,
      { width: progressPct, backgroundColor: progressFrac === 1 ? '#375E3F' : '#BC8A2F' },
    ]);

    return (
      <Link href={{ pathname: '/guide/[id]', params: { id: item.guide.id } }} asChild>
        <Pressable style={cardStyle}>
          {/* Hero image — uses a dedicated combined style to avoid a two-ID array. */}
          {item.guide.hero_media_url ? (
            <Image source={{ uri: item.guide.hero_media_url }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.cardImageEmpty} />
          )}

          <View style={styles.cardBody}>
            {/* Title row + status badge */}
            <View style={styles.titleRow}>
              <Text style={StyleSheet.flatten([styles.title, { color: theme.text }])} numberOfLines={2}>
                {item.guide.title}
              </Text>
              <View style={badgeStyle}>
                {isComplete && <Ionicons name="checkmark-circle" size={11} color="#375E3F" style={{ marginRight: 3 }} />}
                <Text style={StyleSheet.flatten([styles.badgeText, { color: isComplete ? '#375E3F' : '#BC8A2F' }])}>
                  {label.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Summary */}
            {item.guide.summary ? (
              <Text style={StyleSheet.flatten([styles.summary, { color: subText }])} numberOfLines={2}>
                {item.guide.summary}
              </Text>
            ) : null}

            {/* Progress section */}
            {item.totalSteps > 0 ? (
              <View style={styles.progressSection}>
                <View style={progressTrackStyle}>
                  <View style={progressFillStyle} />
                </View>
                <Text style={StyleSheet.flatten([styles.progressLabel, { color: subText }])}>
                  {item.completedSteps} / {item.totalSteps} steps
                </Text>
              </View>
            ) : (
              <Text style={StyleSheet.flatten([styles.progressLabel, { color: subText }])}>No steps yet</Text>
            )}

            {/* Completed date for Logs segment */}
            {isComplete && item.last_completed_at ? (
              <Text style={StyleSheet.flatten([styles.dateText, { color: subText }])}>
                Completed {new Date(item.last_completed_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Link>
    );
  }

  function renderEmpty(seg: Segment) {
    const isIntentions = seg === 'intentions';
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={isIntentions ? 'compass-outline' : 'trophy-outline'}
          size={44}
          color={subText}
        />
        <Text style={StyleSheet.flatten([styles.emptyTitle, { color: theme.text }])}>
          {isIntentions ? 'No intentions yet.' : 'No logs yet.'}
        </Text>
        <Text style={StyleSheet.flatten([styles.emptyHint, { color: subText }])}>
          {isIntentions
            ? 'Start a Guide to add it to your Codex.'
            : 'Complete a Guide to see it here.'}
        </Text>
        {isIntentions && (
          <Link href="/" asChild>
            <Pressable style={StyleSheet.flatten([styles.findButton, { backgroundColor: theme.tint }])}>
              <Text style={styles.findButtonText}>Find a Guide</Text>
            </Pressable>
          </Link>
        )}
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Root render
  // -------------------------------------------------------------------------

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: theme.background }])}>
      {/* Screen header */}
      <View style={styles.screenHeader}>
        <Text style={StyleSheet.flatten([styles.screenTitle, { color: theme.text }])}>My Codex</Text>
      </View>

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : !user ? (
        // Not signed in
        <View style={styles.centred}>
          <Ionicons name="lock-closed-outline" size={48} color={subText} />
          <Text style={StyleSheet.flatten([styles.emptyTitle, { color: theme.text }])}>Sign in to view your Codex.</Text>
          <Link href="/(tabs)/profile" asChild>
            <Pressable style={StyleSheet.flatten([styles.findButton, { backgroundColor: theme.cardBackground, marginTop: 16 }])}>
              <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Go to Profile</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          {renderSegmentControl()}
          {activeEntries.length === 0 ? (
            renderEmpty(segment)
          ) : (
            <FlatList
              data={activeEntries}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={renderEntry}
            />
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
  container:    { flex: 1, paddingTop: 60 },
  screenHeader: { paddingHorizontal: 20, marginBottom: 16 },
  screenTitle:  { fontSize: 32, fontWeight: 'bold' },

  // Segment control
  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  segmentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginRight: 24,
    paddingTop: 4,
  },
  segmentLabel: { fontSize: 15, fontWeight: '600' },
  countBadge: {
    marginLeft: 6,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: { fontSize: 11, fontWeight: '700' },

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
  // Separated into two distinct entries to avoid passing a two-ID style array.
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

  // Progress
  progressSection: { marginTop: 2 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 5,
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
