/**
 * app/event/[id].tsx — Event Detail Screen
 *
 * Four-tab layout:
 *   Overview  — Title, date, location, description, organiser
 *   Plan      — Adapted step list (source Guide steps minus removed, plus additions)
 *   Crew      — Participant list with RSVP status badges
 *   Chat      — Live event chat (ChatView, lazy thread creation)
 *
 * Navigation entry points:
 *   - Calendar screen (tapping an event row)
 *   - Codex "In Progress" cards with status === 'Scheduled'
 */

import ChatView from '@/components/chat/ChatView';
import { FreeformView } from '@/components/guide/FreeformView';
import { PhaseNavigator } from '@/components/guide/PhaseNavigator';
import { SequentialView } from '@/components/guide/SequentialView';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Enums, StepCard as StepCardType } from '@/lib/database.types';
import { storePendingDeepLink } from '@/lib/pendingDeepLink';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type EventData = {
  id: string;
  title: string;
  start_time: string | null;
  guide_id: string | null;
  creator_id: string;
  removed_step_ids: string[];
  guide: {
    id: string;
    title: string;
    hero_media_url: string | null;
    primary_location_name: string | null;
    summary: string | null;
  } | null;
  organiser: { full_name: string | null; username: string | null } | null;
};

type Participant = {
  id: string;
  user_id: string;
  status: Enums['participant_status'];
  profile: { full_name: string | null; username: string | null; avatar_url: string | null } | null;
};

/**
 * Event phase — mirrors PhaseWithSteps but is self-contained so we don't
 * need to import the full DB type. `is_custom` marks the synthetic
 * "Added Steps" phase that holds organiser additions.
 */
type EventPhaseData = {
  id:             string;
  title:          string;
  execution_mode: Enums['execution_mode'];
  step_cards:     StepCardType[];
  is_custom:      boolean;
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [event, setEvent] = useState<EventData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [eventPhases, setEventPhases] = useState<EventPhaseData[]>([]);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [chatThreadId, setChatThreadId] = useState<string | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'crew' | 'chat'>('overview');

  // Phase-based sequential navigation for the Plan tab
  const [activePhaseIndex,    setActivePhaseIndex]    = useState(0);
  const [sequentialStepIndex, setSequentialStepIndex] = useState(0);

  // Gate: prevents position-save effect from firing before the initial load restores position
  const positionLoadedRef = useRef(false);

  // Reschedule modal state
  const [showDateModal,   setShowDateModal]   = useState(false);
  const [modalDay,        setModalDay]        = useState<Date | null>(null);
  const [modalHour,       setModalHour]       = useState<number>(12);
  const [modalViewYear,   setModalViewYear]   = useState(new Date().getFullYear());
  const [modalViewMonth,  setModalViewMonth]  = useState(new Date().getMonth());
  const [savingDate,      setSavingDate]      = useState(false);

  const { width } = useWindowDimensions();

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setCurrentUserId(uid);
      setAuthChecked(true);

      if (uid && id && typeof id === 'string') {
        loadAll(id);
      } else if (!uid && id && typeof id === 'string') {
        // User arrived via deep link without a session — store the path so
        // guilds.tsx can redirect here after sign-in.
        storePendingDeepLink(`/event/${id}`);
        setLoading(false);
      }
    }
    init();
  }, [id]);

  // -------------------------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------------------------

  async function loadAll(eventId: string) {
    setLoading(true);
    await Promise.all([
      fetchEvent(eventId),
      fetchParticipants(eventId),
      fetchEventPhases(eventId),
      fetchChatThread(eventId),
    ]);
    setLoading(false);
  }

  async function fetchEvent(eventId: string) {
    const { data } = await supabase
      .from('events')
      .select(`
        id, title, start_time, guide_id, creator_id, removed_step_ids,
        guide:guides!events_guide_id_fkey(id, title, hero_media_url, primary_location_name, summary),
        organiser:profiles!events_creator_id_fkey(full_name, username)
      `)
      .eq('id', eventId)
      .single();

    if (data) setEvent(data as EventData);
  }

  async function fetchParticipants(eventId: string) {
    const { data } = await supabase
      .from('event_participants')
      .select(`
        id, user_id, status,
        profile:profiles!event_participants_user_id_fkey(full_name, username, avatar_url)
      `)
      .eq('event_id', eventId);

    if (data) setParticipants(data as Participant[]);
  }

  async function fetchEventPhases(eventId: string) {
    // Fetch the event to get guide_id and removed_step_ids
    const { data: ev } = await supabase
      .from('events')
      .select('guide_id, removed_step_ids')
      .eq('id', eventId)
      .single();

    if (!ev) return;

    const removedIds = new Set<string>(ev.removed_step_ids ?? []);
    const phases: EventPhaseData[] = [];

    // A. Source Guide phases with full step_cards data
    if (ev.guide_id) {
      const { data: guidePhases } = await supabase
        .from('phases')
        .select(`
          id, title, phase_index, execution_mode,
          step_cards(*)
        `)
        .eq('guide_id', ev.guide_id)
        .order('phase_index', { ascending: true });

      if (guidePhases) {
        for (const phase of guidePhases as any[]) {
          const sorted = ((phase.step_cards ?? []) as any[])
            .sort((a: any, b: any) => a.step_index - b.step_index)
            .filter((s: any) => !removedIds.has(s.id)) as StepCardType[];

          phases.push({
            id:             phase.id,
            title:          phase.title,
            execution_mode: phase.execution_mode,
            step_cards:     sorted,
            is_custom:      false,
          });
        }
      }
    }

    // B. Event-specific additions → synthetic "Added Steps" phase (Freeform, read-only)
    const { data: additions } = await supabase
      .from('event_step_additions')
      .select('id, atomic_action_text, step_index, curation_notes, intent_tag')
      .eq('event_id', eventId)
      .order('step_index', { ascending: true });

    if (additions && additions.length > 0) {
      const additionCards: StepCardType[] = (additions as any[]).map((a: any, idx: number) => ({
        id:                 a.id,
        phase_id:           'custom',
        creator_id:         '',
        atomic_action_text: a.atomic_action_text,
        step_index:         idx,
        media_payload:      null,
        curation_notes:     a.curation_notes ?? null,
        beginner_mistakes:  null,
        intent_tag:         a.intent_tag,
        is_sensitive:       false,
        location_anchor:    null,
        location_name:      null,
        linked_guide_id:    null,
        completion_weight:  1,
        step_type:          'action' as const,
        checklist_items:    null,
        timer_seconds:      null,
        // Mark as optional so they don't count toward required completion
        is_optional:        true,
        created_at:         '',
      }));

      phases.push({
        id:             'custom',
        title:          'Added Steps',
        execution_mode: 'Freeform',
        step_cards:     additionCards,
        is_custom:      true,
      });
    }

    setEventPhases(phases);

    // C. My completion states
    const { data: states } = await supabase
      .from('event_step_states')
      .select('step_card_id')
      .eq('event_id', eventId);

    if (states) {
      setCompletedStepIds(new Set(states.map((s: any) => s.step_card_id)));
    }

    // D. Restore saved position from event_participants.last_position
    try {
      const { data: participant } = await supabase
        .from('event_participants')
        .select('last_position')
        .eq('event_id', eventId)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle();

      if (participant?.last_position) {
        const pos = participant.last_position as { phase: number; step: number };
        setActivePhaseIndex(pos.phase ?? 0);
        setSequentialStepIndex(pos.step ?? 0);
      }
    } catch {
      // Participant row may not exist yet (e.g., invited but not joined) — silently ignore
    }

    // Allow position-save effect to fire from this point on
    positionLoadedRef.current = true;
  }

  async function fetchChatThread(eventId: string) {
    const { data } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (data) setChatThreadId(data.id);
  }

  // -------------------------------------------------------------------------
  // SHARE EVENT (deep link)
  // -------------------------------------------------------------------------

  async function shareEvent() {
    if (!event || !id) return;
    const eventId  = typeof id === 'string' ? id : id[0];
    const deepLink = `avengildmobile://event/${eventId}`;
    const title    = event.title;

    const message = [
      `I'm planning "${title}" on Avengild and I'd love you to join the crew!`,
      '',
      `Open in Avengild: ${deepLink}`,
      '',
      `Not on Avengild yet? Download it:`,
      `iOS: https://apps.apple.com/app/avengild/id000000000`,
      `Android: https://play.google.com/store/apps/details?id=com.avengild`,
    ].join('\n');

    try {
      await Share.share({ message, title: `Join me for: ${title}` });
    } catch {
      // User cancelled — do nothing
    }
  }

  // -------------------------------------------------------------------------
  // SET DATE (reschedule TBD events)
  // -------------------------------------------------------------------------

  // Calendar helpers (mirrors schedule.tsx, self-contained here)
  function modalDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
  function modalFirstWeekday(y: number, m: number) { return new Date(y, m, 1).getDay(); }
  function modalDateKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
  function modalFmtMonth(y: number, m: number) {
    return new Date(y, m, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  }
  function fmtHour(h: number) {
    if (h === 0)  return '12 AM';
    if (h < 12)  return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  async function confirmSetDate() {
    if (!modalDay || !id) return;
    const eventId = typeof id === 'string' ? id : id[0];
    const d = new Date(modalDay);
    d.setHours(modalHour, 0, 0, 0);

    setSavingDate(true);
    const { error } = await supabase
      .from('events')
      .update({ start_time: d.toISOString() })
      .eq('id', eventId);
    setSavingDate(false);

    if (error) {
      console.error('[EventDetail] set date error:', error.message);
      return;
    }
    // Refresh event data and close modal
    setShowDateModal(false);
    setModalDay(null);
    await fetchEvent(eventId);
  }

  // -------------------------------------------------------------------------
  // PERSIST PLAN POSITION to event_participants.last_position
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!positionLoadedRef.current || !id || typeof id !== 'string' || !currentUserId) return;
    supabase
      .from('event_participants')
      .update({ last_position: { phase: activePhaseIndex, step: sequentialStepIndex } })
      .eq('event_id', id)
      .eq('user_id', currentUserId)
      .then();
  }, [activePhaseIndex, sequentialStepIndex]);

  // -------------------------------------------------------------------------
  // STEP COMPLETION TOGGLE
  // -------------------------------------------------------------------------
  function handleEventStepToggle(stepId: string) {
    if (!currentUserId || !id || typeof id !== 'string') return;
    // Additions are in the 'custom' phase and are informational only —
    // their IDs don't exist in step_cards so they can't be written to event_step_states.
    const isAddition = eventPhases.find(p => p.is_custom)?.step_cards.some(s => s.id === stepId);
    if (isAddition) return;

    const wasCompleted = completedStepIds.has(stepId);

    setCompletedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

    if (wasCompleted) {
      supabase
        .from('event_step_states')
        .delete()
        .eq('event_id', id)
        .eq('step_card_id', stepId)
        .eq('user_id', currentUserId)
        .then();
    } else {
      supabase.from('event_step_states').insert({
        event_id: id,
        step_card_id: stepId,
        user_id: currentUserId,
      }).then();
    }
  }

  // -------------------------------------------------------------------------
  // TAB BAR
  // -------------------------------------------------------------------------
  const renderTab = (key: typeof activeTab, label: string, icon: any) => (
    <Pressable
      style={[
        styles.tab,
        activeTab === key && { borderBottomColor: theme.tint, borderBottomWidth: 3 },
      ]}
      onPress={() => setActiveTab(key)}
    >
      <Ionicons name={icon} size={18} color={activeTab === key ? theme.tint : '#999'} />
      <Text style={[styles.tabText, { color: activeTab === key ? theme.tint : '#999' }]}>
        {label}
      </Text>
    </Pressable>
  );

  // -------------------------------------------------------------------------
  // UNAUTHENTICATED GATE
  // -------------------------------------------------------------------------
  if (authChecked && !currentUserId) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Stack.Screen options={{ title: 'Event Invitation', headerTintColor: theme.tint }} />
        <Ionicons name="people-outline" size={64} color={theme.tint} style={{ marginBottom: 20 }} />
        <Text style={{ fontFamily: 'Chivo_900Black', fontSize: 22, color: theme.text, textAlign: 'center', marginBottom: 10 }}>
          You've been invited
        </Text>
        <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          Sign in to Avengild to view the event details and join the crew.
        </Text>
        <Pressable
          style={{
            backgroundColor: theme.tint,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 10,
            width: '100%',
            alignItems: 'center',
          }}
          onPress={() => router.replace('/(tabs)/guilds')}
        >
          <Text style={{ color: '#fff', fontFamily: 'Chivo_700Bold', fontSize: 16 }}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // LOADING STATE
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Event', headerTintColor: theme.tint }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Event', headerTintColor: theme.tint }} />
        <Text style={{ color: '#999', textAlign: 'center' }}>Event not found.</Text>
      </View>
    );
  }

  const formattedDate = event.start_time
    ? new Date(event.start_time).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'Date TBD';

  const formattedTime = event.start_time
    ? new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const confirmedCount = participants.filter((p) => p.status === 'confirmed').length;
  // Only count required (non-optional) source steps (exclude custom additions phase)
  const allSourceSteps = eventPhases.filter(p => !p.is_custom).flatMap(p => p.step_cards).filter(s => !s.is_optional);
  const completedCount = allSourceSteps.filter(s => completedStepIds.has(s.id)).length;
  const totalCount     = allSourceSteps.length;

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: '',
          headerTintColor: theme.tint,
          headerBackTitle: '',
          headerStyle: { backgroundColor: theme.cardBackground },
        }}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.headerContent}>
          <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
          <Text style={{ color: '#999', marginTop: 2 }}>
            {formattedDate}{formattedTime ? `  •  ${formattedTime}` : ''}
          </Text>
          {event.guide?.primary_location_name && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color="#999" />
              <Text style={{ color: '#999', fontSize: 13, marginLeft: 4 }}>
                {event.guide.primary_location_name}
              </Text>
            </View>
          )}
          {/* Quick stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Ionicons name="people-outline" size={13} color={theme.tint} />
              <Text style={[styles.statText, { color: theme.tint }]}>
                {confirmedCount} confirmed
              </Text>
            </View>
            {totalCount > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="checkmark-circle-outline" size={13} color={theme.tint} />
                <Text style={[styles.statText, { color: theme.tint }]}>
                  {completedCount}/{totalCount} steps
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {renderTab('overview', 'Overview', 'information-circle-outline')}
          {renderTab('plan',     'Plan',     'list-outline')}
          {renderTab('crew',     'Crew',     'people-outline')}
          {renderTab('chat',     'Chat',     'chatbubbles-outline')}
        </View>
      </View>

      {/* Tab content */}
      <View style={styles.content}>

        {/* ---- OVERVIEW ---- */}
        {activeTab === 'overview' && (
          <ScrollView contentContainerStyle={{ padding: 20 }}>

            {/* TBD date prompt */}
            {!event.start_time && (
              <Pressable
                style={[styles.setDateCard, { backgroundColor: 'rgba(188,138,47,0.1)', borderColor: theme.tint }]}
                onPress={() => setShowDateModal(true)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.setDateTitle, { color: theme.tint }]}>Date not set</Text>
                  <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
                    Tap to set a date — or decide together in the Chat.
                  </Text>
                </View>
                <Ionicons name="calendar-outline" size={22} color={theme.tint} />
              </Pressable>
            )}

            {event.guide?.summary && (
              <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>About</Text>
                <Text style={{ color: '#666', lineHeight: 22 }}>{event.guide.summary}</Text>
              </View>
            )}

            <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Organised by</Text>
              <Text style={{ color: '#666' }}>
                {event.organiser?.full_name ?? event.organiser?.username ?? 'Unknown'}
              </Text>
            </View>

            {event.guide && (
              <Pressable
                style={[styles.guideLinkCard, { backgroundColor: theme.cardBackground, borderColor: theme.tint }]}
                onPress={() => router.push({ pathname: '/guide/[id]', params: { id: event.guide!.id } })}
              >
                <View>
                  <Text style={{ color: '#999', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Based on Guide
                  </Text>
                  <Text style={[styles.guideLinkTitle, { color: theme.text }]}>
                    {event.guide.title}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.tint} />
              </Pressable>
            )}

            {/* Share event link */}
            <Pressable
              style={[styles.shareCard, { backgroundColor: theme.cardBackground }]}
              onPress={shareEvent}
            >
              <Ionicons name="share-outline" size={20} color={theme.tint} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.shareCardTitle, { color: theme.text }]}>Share Event</Text>
                <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                  Send an invitation via Messages, WhatsApp, email, and more.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>

          </ScrollView>
        )}

        {/* ---- PLAN ---- */}
        {activeTab === 'plan' && (
          eventPhases.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="list-outline" size={48} color="#ccc" />
              <Text style={{ color: '#999', marginTop: 12 }}>No steps for this event.</Text>
            </View>
          ) : (
            <>
              {/* Phase tab bar — shown only when there are multiple phases */}
              {eventPhases.length > 1 && (
                <PhaseNavigator
                  phases={eventPhases}
                  activePhaseIndex={activePhaseIndex}
                  completedSteps={completedStepIds}
                  onPhaseSelect={(idx) => { setActivePhaseIndex(idx); setSequentialStepIndex(0); }}
                />
              )}

              {/* Step execution — per-phase SequentialView or FreeformView */}
              {(() => {
                const activePhase = eventPhases[activePhaseIndex];
                if (!activePhase) return null;
                const isSequential = activePhase.execution_mode === 'Sequential';
                const isCustom     = activePhase.is_custom;

                if (isSequential) {
                  return (
                    <SequentialView
                      steps={activePhase.step_cards}
                      completedSteps={completedStepIds}
                      onStepToggle={handleEventStepToggle}
                      currentIndex={sequentialStepIndex}
                      onIndexChange={setSequentialStepIndex}
                      // No auto-advance in event execution — crew advances at their own pace
                    />
                  );
                }
                return (
                  <FreeformView
                    steps={activePhase.step_cards}
                    completedSteps={completedStepIds}
                    // Additions phase is read-only — no-op prevents FK constraint violations
                    onStepToggle={isCustom ? () => {} : handleEventStepToggle}
                  />
                );
              })()}
            </>
          )
        )}

        {/* ---- CREW ---- */}
        {activeTab === 'crew' && (
          <FlatList
            data={participants}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 12 }}>No crew yet.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const name = item.profile?.full_name ?? item.profile?.username ?? 'Member';
              const initial = name.charAt(0).toUpperCase();
              const statusColour =
                item.status === 'confirmed' ? '#375E3F'
                : item.status === 'declined'  ? '#E53E3E'
                : '#BC8A2F';
              const statusLabel =
                item.status === 'confirmed' ? 'Going'
                : item.status === 'declined'  ? 'Can\'t make it'
                : 'Invited';

              return (
                <Pressable
                  style={[styles.memberRow, { backgroundColor: theme.cardBackground }]}
                  onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.user_id } })}
                >
                  <View style={[styles.crewAvatar, { backgroundColor: theme.tint }]}>
                    <Text style={styles.crewInitial}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: theme.text }]}>{name}</Text>
                    {item.profile?.username && (
                      <Text style={{ color: '#999', fontSize: 12 }}>@{item.profile.username}</Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { borderColor: statusColour }]}>
                    <Text style={[styles.statusText, { color: statusColour }]}>{statusLabel}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {/* ---- CHAT ---- */}
        {activeTab === 'chat' && typeof id === 'string' && (
          <ChatView
            threadId={chatThreadId}
            eventId={id}
            onThreadCreated={(tid) => setChatThreadId(tid)}
          />
        )}

      </View>

      {/* ---- SET DATE MODAL ---- */}
      <Modal
        visible={showDateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDateModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: '#eee' }]}>
            <TouchableOpacity onPress={() => setShowDateModal(false)} hitSlop={8}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Set a Date</Text>
            <TouchableOpacity
              onPress={confirmSetDate}
              disabled={!modalDay || savingDate}
              hitSlop={8}
            >
              {savingDate
                ? <ActivityIndicator size="small" color={theme.tint} />
                : <Text style={[
                    styles.modalConfirm,
                    { color: modalDay ? theme.tint : '#ccc' },
                  ]}>Confirm</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Month navigation */}
            <View style={styles.monthHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (modalViewMonth === 0) { setModalViewYear(y => y - 1); setModalViewMonth(11); }
                  else setModalViewMonth(m => m - 1);
                }}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color={theme.tint} />
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: theme.text }]}>
                {modalFmtMonth(modalViewYear, modalViewMonth)}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (modalViewMonth === 11) { setModalViewYear(y => y + 1); setModalViewMonth(0); }
                  else setModalViewMonth(m => m + 1);
                }}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={22} color={theme.tint} />
              </TouchableOpacity>
            </View>

            {/* Day-of-week labels */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(n => {
                const cw = Math.floor((width - 32) / 7);
                return (
                  <Text key={n} style={{ width: cw, textAlign: 'center', fontSize: 11, color: '#999', fontWeight: '600' }}>
                    {n}
                  </Text>
                );
              })}
            </View>

            {/* Calendar grid */}
            {(() => {
              const today = new Date();
              const numDays  = modalDaysInMonth(modalViewYear, modalViewMonth);
              const startDay = modalFirstWeekday(modalViewYear, modalViewMonth);
              const cellW    = Math.floor((width - 32) / 7);
              const cells: (number | null)[] = [
                ...Array(startDay).fill(null),
                ...Array.from({ length: numDays }, (_, i) => i + 1),
              ];
              const todayKey = modalDateKey(today);

              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {cells.map((day, idx) => {
                    if (day === null) return <View key={`b-${idx}`} style={{ width: cellW, height: cellW }} />;
                    const cellDate   = new Date(modalViewYear, modalViewMonth, day, 0, 0, 0, 0);
                    const key        = modalDateKey(cellDate);
                    const isPast     = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const isToday    = key === todayKey;
                    const isSelected = modalDay ? key === modalDateKey(modalDay) : false;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.cell,
                          { width: cellW, height: cellW },
                          isSelected && { backgroundColor: theme.tint, borderRadius: cellW / 2 },
                          isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.tint, borderRadius: cellW / 2 },
                        ]}
                        onPress={() => !isPast && setModalDay(cellDate)}
                        disabled={isPast}
                      >
                        <Text style={{
                          fontSize: 14, fontWeight: '500',
                          color: isPast ? '#ccc' : isSelected ? '#fff' : theme.text,
                        }}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })()}

            {/* Hour picker */}
            {modalDay && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#999', marginBottom: 12 }}>
                  WHAT TIME?
                </Text>
                <View style={styles.hourGrid}>
                  {Array.from({ length: 18 }, (_, i) => i + 6).map(h => {
                    const active = modalHour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[
                          styles.hourCell,
                          { backgroundColor: active ? theme.tint : '#f2f2f2', borderColor: 'transparent' },
                        ]}
                        onPress={() => setModalHour(h)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#333' }}>
                          {fmtHour(h)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerContent: {
    padding: 16,
    paddingBottom: 12,
  },
  eventTitle: {
    fontSize: 22,
    fontFamily: 'Chivo_700Bold',
    fontWeight: 'normal',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(188,138,47,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },

  tabBar: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    gap: 3,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },

  content: { flex: 1 },

  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    opacity: 0.7,
  },

  guideLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  guideLinkTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  crewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },

  // Set-date prompt card (shown in Overview when start_time is null)
  setDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  setDateTitle: { fontSize: 15, fontWeight: '700' },

  // Share event card
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  shareCardTitle: { fontSize: 15, fontWeight: '600' },

  // Reschedule modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: 'Chivo_700Bold', fontWeight: 'normal' },
  modalConfirm: { fontSize: 16, fontWeight: '700' },

  // Calendar grid (shared with modal)
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitle: { fontSize: 16, fontFamily: 'Chivo_700Bold', fontWeight: 'normal' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourCell: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
});
