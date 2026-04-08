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
import { markCodexDirty } from '@/lib/codexSignal';
import { storePendingDeepLink } from '@/lib/pendingDeepLink';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  TextInput,
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
  end_time: string | null;
  guide_id: string | null;
  creator_id: string;
  removed_step_ids: string[];
  activity_context: Record<string, string> | null;
  guide: {
    id: string;
    title: string;
    hero_media_url: string | null;
    primary_location_name: string | null;
    summary: string | null;
    activity_type: string;
  } | null;
  organiser: { full_name: string | null; username: string | null } | null;
};

type TimePoll = {
  id: string;
  options: Array<{ label: string; iso: string }>;
  closes_at: string | null;
};

type PollTally = Record<string, number>; // option_index (string) → vote count

// ---------------------------------------------------------------------------
// ACTIVITY CONTEXT FIELD DEFINITIONS
// Maps guide.activity_type → ordered list of editable context fields shown
// in the Event Detail Overview tab.
// ---------------------------------------------------------------------------

type ContextField = { key: string; label: string; placeholder: string; multiline?: boolean };

const ACTIVITY_CONTEXT_FIELDS: Record<string, ContextField[]> = {
  trip: [
    { key: 'meeting_point',   label: 'MEETING POINT',   placeholder: 'e.g. YEG Airport Terminal 1, Departures' },
    { key: 'transport_notes', label: 'TRANSPORT NOTES',  placeholder: 'e.g. Car rental booked — see chat for details', multiline: true },
    { key: 'packing_list',    label: 'PACKING LIST',     placeholder: 'One item per line…', multiline: true },
  ],
  cooking: [
    { key: 'servings',      label: 'SERVINGS',       placeholder: 'e.g. 6 people' },
    { key: 'dietary_notes', label: 'DIETARY NOTES',  placeholder: 'e.g. Nut-free, one vegetarian' },
    { key: 'shopping_list', label: 'SHOPPING LIST',  placeholder: 'One item per line…', multiline: true },
  ],
  outdoor: [
    { key: 'gear_notes',        label: 'GEAR NOTES',        placeholder: 'e.g. Bring trekking poles and a camp stove', multiline: true },
    { key: 'emergency_contact', label: 'EMERGENCY CONTACT', placeholder: 'e.g. Park Rescue: 1-800-000-0000' },
    { key: 'conditions_notes',  label: 'CONDITIONS NOTES',  placeholder: 'e.g. Trail advisory: muddy above 1500m', multiline: true },
  ],
  climbing: [
    { key: 'gear_notes',        label: 'GEAR NOTES',        placeholder: 'e.g. 70m rope, 12 quickdraws, helmet required', multiline: true },
    { key: 'emergency_contact', label: 'EMERGENCY CONTACT', placeholder: 'e.g. Rescue: 1-800-000-0000' },
    { key: 'conditions_notes',  label: 'CONDITIONS NOTES',  placeholder: 'e.g. Wet rock forecast — check morning of', multiline: true },
  ],
  social: [
    { key: 'dress_code',   label: 'DRESS CODE',   placeholder: 'e.g. Smart casual' },
    { key: 'venue_notes',  label: 'VENUE NOTES',  placeholder: 'e.g. Private room booked under "Smith"', multiline: true },
  ],
  cultural: [
    { key: 'dress_code',   label: 'DRESS CODE',   placeholder: 'e.g. Smart casual' },
    { key: 'venue_notes',  label: 'VENUE NOTES',  placeholder: 'e.g. Meet at main entrance 15 min early', multiline: true },
  ],
  sport: [
    { key: 'gear_notes',  label: 'GEAR NOTES',  placeholder: 'e.g. Bring your own equipment', multiline: true },
    { key: 'venue_notes', label: 'VENUE NOTES', placeholder: 'e.g. Field 3, East entrance', multiline: true },
  ],
  fitness: [
    { key: 'gear_notes',  label: 'GEAR NOTES',  placeholder: 'e.g. Bring a mat and water bottle' },
    { key: 'venue_notes', label: 'VENUE NOTES', placeholder: 'e.g. Studio B, second floor' },
  ],
  dining: [
    { key: 'dress_code',  label: 'DRESS CODE',  placeholder: 'e.g. Smart casual' },
    { key: 'venue_notes', label: 'VENUE NOTES', placeholder: 'e.g. Reservation under "Johnson", 7:30 PM', multiline: true },
  ],
};

type PhaseDetail = {
  id: string;
  phase_id: string;
  scheduled_date: string | null;
  accommodation_name: string | null;
  accommodation_url: string | null;
  context: Record<string, unknown>;
};

type StepAssignment = {
  step_card_id: string;
  user_id: string;
  profile: { full_name: string | null; username: string | null } | null;
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

  // Trip Events (Migration 014)
  const [phaseDetails,     setPhaseDetails]     = useState<PhaseDetail[]>([]);
  const [stepAssignments,  setStepAssignments]  = useState<StepAssignment[]>([]);
  // Phase detail edit modal state
  const [editingPhaseId,   setEditingPhaseId]   = useState<string | null>(null);
  const [editAccomName,    setEditAccomName]     = useState('');
  const [editAccomUrl,     setEditAccomUrl]      = useState('');
  const [editPhaseDate,    setEditPhaseDate]     = useState('');
  const [savingPhaseDetail, setSavingPhaseDetail] = useState(false);
  // Step assignment: which step is being assigned
  const [assigningStepId,  setAssigningStepId]  = useState<string | null>(null);

  // Phase-based navigation for the Plan tab
  const [activePhaseIndex, setActivePhaseIndex] = useState(0);

  // Gate: prevents position-save effect from firing before the initial load restores position
  const positionLoadedRef = useRef(false);

  // Reschedule modal state
  const [showDateModal,      setShowDateModal]      = useState(false);
  const [modalDay,           setModalDay]           = useState<Date | null>(null);
  const [modalHour,          setModalHour]          = useState<number>(12);
  const [modalViewYear,      setModalViewYear]      = useState(new Date().getFullYear());
  const [modalViewMonth,     setModalViewMonth]     = useState(new Date().getMonth());
  const [savingDate,         setSavingDate]         = useState(false);
  // Multi-day / end-date extension
  const [modalIsMultiDay,    setModalIsMultiDay]    = useState(false);
  const [modalEndDay,        setModalEndDay]        = useState<Date | null>(null);
  const [modalEndViewYear,   setModalEndViewYear]   = useState(new Date().getFullYear());
  const [modalEndViewMonth,  setModalEndViewMonth]  = useState(new Date().getMonth());

  // Activity context editing
  const [showContextModal, setShowContextModal] = useState(false);
  const [contextDraft,     setContextDraft]     = useState<Record<string, string>>({});
  const [savingContext,    setSavingContext]     = useState(false);

  // Time poll
  const [timePoll,        setTimePoll]        = useState<TimePoll | null>(null);
  const [pollTally,       setPollTally]       = useState<PollTally>({});
  const [myVoteIndex,     setMyVoteIndex]     = useState<number | null>(null);
  const [showPollModal,   setShowPollModal]   = useState(false);
  const [pollDraft,       setPollDraft]       = useState<string[]>(['', '']);
  const [savingPoll,      setSavingPoll]      = useState(false);
  const [castingVote,     setCastingVote]     = useState(false);

  // Publish Adaptation as Forked Guide
  const [publishingFork, setPublishingFork] = useState(false);

  // Collapsible header — collapses when Plan tab is active to give steps more room
  const headerInfoAnim = useRef(new Animated.Value(1)).current;
  const headerInfoHeightRef = useRef(0);

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
      fetchPhaseDetails(eventId),
      fetchStepAssignments(eventId),
      fetchPoll(eventId),
    ]);
    setLoading(false);
  }

  async function fetchPoll(eventId: string) {
    const { data: poll } = await supabase
      .from('event_time_polls')
      .select('id, options, closes_at')
      .eq('event_id', eventId)
      .maybeSingle();

    if (!poll) return;
    setTimePoll(poll as TimePoll);

    // Fetch tally (all votes for this poll)
    const { data: votes } = await supabase
      .from('event_time_votes')
      .select('user_id, option_index')
      .eq('poll_id', poll.id);

    if (votes) {
      const tally: PollTally = {};
      const uid = (await supabase.auth.getUser()).data.user?.id;
      for (const v of votes as any[]) {
        const key = String(v.option_index);
        tally[key] = (tally[key] ?? 0) + 1;
        if (v.user_id === uid) setMyVoteIndex(v.option_index);
      }
      setPollTally(tally);
    }
  }

  async function fetchEvent(eventId: string) {
    const { data, error } = await supabase
      .from('events')
      .select(`
        id, title, start_time, end_time, guide_id, creator_id, removed_step_ids, activity_context,
        guide:guides!events_guide_id_fkey(id, title, hero_media_url, primary_location_name, summary, activity_type)
      `)
      .eq('id', eventId)
      .single();

    if (error) {
      console.error('[EventDetail] fetchEvent error:', error.code, error.message);
      return;
    }
    if (!data) return;

    // events.creator_id → auth.users (not profiles directly) — two-step resolve
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', data.creator_id)
      .maybeSingle();

    setEvent({ ...data, organiser: profile ?? null } as EventData);
  }

  async function fetchPhaseDetails(eventId: string) {
    const { data } = await supabase
      .from('event_phase_details')
      .select('id, phase_id, scheduled_date, accommodation_name, accommodation_url, context')
      .eq('event_id', eventId);
    if (data) setPhaseDetails(data as PhaseDetail[]);
  }

  async function fetchStepAssignments(eventId: string) {
    // Two-step query: the FK points to auth.users, not profiles directly.
    const { data: rows } = await supabase
      .from('event_step_assignments')
      .select('step_card_id, user_id')
      .eq('event_id', eventId);

    if (!rows || rows.length === 0) {
      setStepAssignments([]);
      return;
    }

    const userIds = [...new Set(rows.map((r: any) => r.user_id as string))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', userIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    setStepAssignments(
      rows.map((r: any) => ({
        step_card_id: r.step_card_id,
        user_id:      r.user_id,
        profile:      profileMap.get(r.user_id) ?? null,
      })),
    );
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
    const startDate = new Date(modalDay);
    startDate.setHours(modalHour, 0, 0, 0);

    // Build end_time: end of the selected end day (23:59:59), or null for single-day.
    let endTime: string | null = null;
    if (modalIsMultiDay && modalEndDay) {
      const endDate = new Date(modalEndDay);
      endDate.setHours(23, 59, 59, 0);
      endTime = endDate.toISOString();
    }

    setSavingDate(true);
    const { error } = await supabase
      .from('events')
      .update({ start_time: startDate.toISOString(), end_time: endTime })
      .eq('id', eventId);
    setSavingDate(false);

    if (error) {
      console.error('[EventDetail] set date error:', error.message);
      return;
    }
    // Refresh event data and close modal
    setShowDateModal(false);
    setModalDay(null);
    setModalEndDay(null);
    setModalIsMultiDay(false);
    await fetchEvent(eventId);
  }

  // -------------------------------------------------------------------------
  // PERSIST PLAN POSITION to event_participants.last_position
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!positionLoadedRef.current || !id || typeof id !== 'string' || !currentUserId) return;
    supabase
      .from('event_participants')
      .update({ last_position: { phase: activePhaseIndex, step: 0 } })
      .eq('event_id', id)
      .eq('user_id', currentUserId)
      .then();
  }, [activePhaseIndex]);

  // Collapse header info when user switches to the Plan tab
  useEffect(() => {
    Animated.timing(headerInfoAnim, {
      toValue: activeTab === 'plan' ? 0 : 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [activeTab]);

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

    markCodexDirty(); // Step completion changed — Codex In Progress view must re-fetch.

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
  // INVITATION ACCEPTANCE (fixes critical bug: no Accept UI for invited users,
  // and no Join path for external share-link recipients who are not participants)
  // -------------------------------------------------------------------------

  async function handleJoinEvent() {
    if (!currentUserId || !id || typeof id !== 'string') return;
    const { error } = await supabase
      .from('event_participants')
      .insert({ event_id: id, user_id: currentUserId, status: 'confirmed' });
    if (!error) await fetchParticipants(id);
  }

  async function handleRespondInvitation(accept: boolean) {
    if (!currentUserId || !id || typeof id !== 'string') return;
    const newStatus = accept ? 'confirmed' : 'declined';
    const { error } = await supabase
      .from('event_participants')
      .update({ status: newStatus })
      .eq('event_id', id)
      .eq('user_id', currentUserId);
    if (!error) await fetchParticipants(id);
  }

  // -------------------------------------------------------------------------
  // ACTIVITY CONTEXT EDITING (organiser only)
  // -------------------------------------------------------------------------

  async function saveActivityContext() {
    if (!id || typeof id !== 'string') return;
    setSavingContext(true);
    // Strip empty strings so the JSONB stays clean
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(contextDraft)) {
      if (v.trim()) cleaned[k] = v.trim();
    }
    await supabase
      .from('events')
      .update({ activity_context: cleaned })
      .eq('id', id);
    setSavingContext(false);
    setShowContextModal(false);
    await fetchEvent(id);
  }

  // -------------------------------------------------------------------------
  // PHASE DETAIL EDITING (organiser only)
  // -------------------------------------------------------------------------

  function openPhaseDetailEdit(phaseId: string) {
    const existing = phaseDetails.find(d => d.phase_id === phaseId);
    setEditAccomName(existing?.accommodation_name ?? '');
    setEditAccomUrl(existing?.accommodation_url ?? '');
    setEditPhaseDate(existing?.scheduled_date ?? '');
    setEditingPhaseId(phaseId);
  }

  async function savePhaseDetail() {
    if (!editingPhaseId || !id || typeof id !== 'string') return;
    setSavingPhaseDetail(true);

    const payload = {
      event_id:           id,
      phase_id:           editingPhaseId,
      scheduled_date:     editPhaseDate.trim() || null,
      accommodation_name: editAccomName.trim() || null,
      accommodation_url:  editAccomUrl.trim() || null,
    };

    await supabase
      .from('event_phase_details')
      .upsert(payload, { onConflict: 'event_id,phase_id' });

    await fetchPhaseDetails(id);
    setSavingPhaseDetail(false);
    setEditingPhaseId(null);
  }

  // -------------------------------------------------------------------------
  // STEP ASSIGNMENTS (organiser only)
  // -------------------------------------------------------------------------

  async function handleAssignStep(stepId: string, userId: string) {
    if (!id || typeof id !== 'string' || !currentUserId) return;
    const already = stepAssignments.some(a => a.step_card_id === stepId && a.user_id === userId);
    if (already) {
      // Toggle off
      await supabase
        .from('event_step_assignments')
        .delete()
        .eq('event_id', id)
        .eq('step_card_id', stepId)
        .eq('user_id', userId);
    } else {
      await supabase
        .from('event_step_assignments')
        .insert({ event_id: id, step_card_id: stepId, user_id: userId, assigned_by: currentUserId });
    }
    await fetchStepAssignments(id);
    setAssigningStepId(null);
  }

  // -------------------------------------------------------------------------
  // TIME POLL ACTIONS
  // -------------------------------------------------------------------------

  async function createPoll() {
    if (!id || typeof id !== 'string' || !currentUserId) return;
    const opts = pollDraft
      .map(s => s.trim())
      .filter(Boolean)
      .map(label => ({ label, iso: '' }));
    if (opts.length < 2) return;

    setSavingPoll(true);
    const { data, error } = await supabase
      .from('event_time_polls')
      .insert({ event_id: id, proposed_by: currentUserId, options: opts })
      .select('id, options, closes_at')
      .single();

    setSavingPoll(false);
    if (!error && data) {
      setTimePoll(data as TimePoll);
      setPollDraft(['', '']);
      setShowPollModal(false);
    }
  }

  async function castVote(optionIndex: number) {
    if (!timePoll || !currentUserId) return;
    setCastingVote(true);
    const { data } = await supabase.rpc('cast_poll_vote', {
      p_poll_id:      timePoll.id,
      p_option_index: optionIndex,
    });
    setCastingVote(false);
    if (data) {
      setPollTally(data as PollTally);
      setMyVoteIndex(optionIndex);
    }
  }

  async function lockPollOption(optionIndex: number) {
    if (!timePoll || !id || typeof id !== 'string') return;
    const option = timePoll.options[optionIndex];
    if (!option?.iso) {
      // Option has no ISO date — open the Set Date modal pre-filled
      setShowDateModal(true);
      return;
    }
    await supabase
      .from('events')
      .update({ start_time: option.iso })
      .eq('id', id);
    await fetchEvent(id);
  }

  // -------------------------------------------------------------------------
  // PUBLISH ADAPTATION AS FORKED GUIDE (organiser only)
  // -------------------------------------------------------------------------

  async function publishAdaptation() {
    if (!event || !currentUserId) return;
    if (!event.guide_id) {
      Alert.alert('No Guide', 'This event is not based on a guide and cannot be published as a fork.');
      return;
    }

    Alert.alert(
      'Publish as Forked Guide',
      'This will create a new guide based on your adapted step list, crediting the original guide. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishingFork(true);

            // 1. Fetch the source guide for attribution metadata
            const { data: sourceGuide } = await supabase
              .from('guides')
              .select('id, title, original_architect_id, creator_id, derivative_licence')
              .eq('id', event.guide_id!)
              .single();

            if (!sourceGuide) {
              setPublishingFork(false);
              Alert.alert('Error', 'Could not load source guide.');
              return;
            }

            // 2. Create the new forked guide
            const { data: newGuide, error: guideError } = await supabase
              .from('guides')
              .insert({
                title: event.title,
                summary: `Adapted from "${sourceGuide.title}"`,
                creator_id: currentUserId,
                original_architect_id: sourceGuide.original_architect_id ?? sourceGuide.creator_id,
                immediate_parent_id: sourceGuide.id,
                stewardship_level: 'private',
                derivative_licence: 'locked_execution',
                activity_type: event.guide?.activity_type ?? 'general',
              })
              .select('id')
              .single();

            if (guideError || !newGuide) {
              setPublishingFork(false);
              Alert.alert('Error', guideError?.message ?? 'Could not create forked guide.');
              return;
            }

            // 3. Copy effective phases + steps from the event
            //    Effective = all phases from eventPhases (already accounts for removed_step_ids)
            for (let pi = 0; pi < eventPhases.length; pi++) {
              const phase = eventPhases[pi];
              const { data: newPhase } = await supabase
                .from('phases')
                .insert({
                  guide_id:       newGuide.id,
                  title:          phase.title,
                  description:    phase.description ?? null,
                  phase_index:    pi,
                  execution_mode: phase.execution_mode,
                })
                .select('id')
                .single();

              if (!newPhase) continue;

              for (let si = 0; si < phase.step_cards.length; si++) {
                const step = phase.step_cards[si];
                await supabase.from('step_cards').insert({
                  phase_id:          newPhase.id,
                  atomic_action_text: step.atomic_action_text,
                  step_index:        si,
                  step_type:         step.step_type,
                  checklist_items:   step.checklist_items ?? null,
                  timer_seconds:     step.timer_seconds ?? null,
                  is_optional:       step.is_optional ?? false,
                  photo_url:         step.photo_url ?? null,
                  location_anchor:   step.location_anchor ?? null,
                  linked_guide_id:   step.linked_guide_id ?? null,
                });
              }
            }

            // 4. Increment fork_count on source guide
            await supabase.rpc('increment_guide_stat', {
              p_guide_id: sourceGuide.id,
              p_column:   'fork_count',
            });

            setPublishingFork(false);
            Alert.alert(
              'Guide Published',
              'Your adapted guide has been saved. You can find and edit it in the Codex under My Guides.',
              [
                {
                  text: 'View Guide',
                  onPress: () => router.push({ pathname: '/guide/[id]', params: { id: newGuide.id } }),
                },
                { text: 'OK' },
              ],
            );
          },
        },
      ],
    );
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

  const isMultiDay = !!event.start_time && !!event.end_time;

  const formattedDate = event.start_time
    ? isMultiDay
      ? (() => {
          const start = new Date(event.start_time!);
          const end   = new Date(event.end_time!);
          const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
          if (sameMonth) {
            return `${start.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`;
          }
          return `${start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        })()
      : new Date(event.start_time).toLocaleDateString('en-CA', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        })
    : 'Date TBD';

  const formattedTime = event.start_time && !isMultiDay
    ? new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const myParticipant  = participants.find(p => p.user_id === currentUserId) ?? null;
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
        <Animated.View
          style={[
            styles.headerContent,
            {
              overflow: 'hidden',
              opacity: headerInfoAnim,
              height: headerInfoAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, headerInfoHeightRef.current || 120],
              }),
            },
          ]}
          onLayout={e => {
            // Capture natural height on first render (when not yet collapsed)
            if (headerInfoHeightRef.current === 0 && activeTab !== 'plan') {
              headerInfoHeightRef.current = e.nativeEvent.layout.height;
            }
          }}
        >
          <Text style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
          <Pressable
            onPress={() => {
              if (event?.creator_id !== currentUserId) return;
              setModalDay(null); setModalEndDay(null); setModalIsMultiDay(false);
              setModalViewYear(new Date().getFullYear()); setModalViewMonth(new Date().getMonth());
              setShowDateModal(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ color: '#999', marginTop: 2 }}>
              {formattedDate}{formattedTime ? `  •  ${formattedTime}` : ''}
            </Text>
            {event?.creator_id === currentUserId && (
              <Ionicons name="pencil-outline" size={12} color="#999" style={{ marginTop: 2 }} />
            )}
          </Pressable>
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
        </Animated.View>

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

            {/* Invitation / Join banner — shown to non-participants and invited users */}
            {!myParticipant && (
              <View style={[styles.inviteBanner, { backgroundColor: 'rgba(188,138,47,0.12)', borderColor: theme.tint }]}>
                <Ionicons name="people-outline" size={22} color={theme.tint} style={{ marginBottom: 6 }} />
                <Text style={[styles.inviteBannerTitle, { color: theme.text }]}>
                  You're not on the crew yet
                </Text>
                <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                  Join this event to track your progress and participate in the crew chat.
                </Text>
                <Pressable
                  style={[styles.inviteBtn, { backgroundColor: theme.tint }]}
                  onPress={handleJoinEvent}
                >
                  <Text style={styles.inviteBtnText}>Join Event</Text>
                </Pressable>
              </View>
            )}

            {myParticipant?.status === 'invited' && (
              <View style={[styles.inviteBanner, { backgroundColor: 'rgba(188,138,47,0.12)', borderColor: theme.tint }]}>
                <Ionicons name="mail-outline" size={22} color={theme.tint} style={{ marginBottom: 6 }} />
                <Text style={[styles.inviteBannerTitle, { color: theme.text }]}>
                  You've been invited
                </Text>
                <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                  Would you like to join this event?
                </Text>
                <View style={styles.inviteBannerActions}>
                  <Pressable
                    style={[styles.inviteBtn, { backgroundColor: theme.tint, flex: 1 }]}
                    onPress={() => handleRespondInvitation(true)}
                  >
                    <Text style={styles.inviteBtnText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.inviteBtn, { backgroundColor: '#555', flex: 1 }]}
                    onPress={() => handleRespondInvitation(false)}
                  >
                    <Text style={styles.inviteBtnText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* TBD date prompt */}
            {!event.start_time && (
              <Pressable
                style={[styles.setDateCard, { backgroundColor: 'rgba(188,138,47,0.1)', borderColor: theme.tint }]}
                onPress={() => {
                  setModalDay(null); setModalEndDay(null); setModalIsMultiDay(false);
                  setModalViewYear(new Date().getFullYear()); setModalViewMonth(new Date().getMonth());
                  setShowDateModal(true);
                }}
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

            {/* Time poll — shown when event has no start_time yet */}
            {!event.start_time && (() => {
              const isOrganiser = event.creator_id === currentUserId;
              const totalVotes  = Object.values(pollTally).reduce((s, n) => s + n, 0);

              if (!timePoll && !isOrganiser) return null;

              return (
                <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                      When Should We Go?
                    </Text>
                    {isOrganiser && !timePoll && (
                      <Pressable hitSlop={8} onPress={() => setShowPollModal(true)}>
                        <Ionicons name="add-circle-outline" size={20} color={theme.tint} />
                      </Pressable>
                    )}
                  </View>

                  {!timePoll ? (
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      onPress={() => setShowPollModal(true)}
                    >
                      <Ionicons name="calendar-outline" size={15} color={theme.tint} />
                      <Text style={{ color: theme.tint, fontWeight: '600', fontSize: 14 }}>
                        Propose date options for the crew to vote on
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      {totalVotes > 0 && (
                        <Text style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                          {totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast
                        </Text>
                      )}
                      {timePoll.options.map((opt, idx) => {
                        const votes   = pollTally[String(idx)] ?? 0;
                        const maxVotes = Math.max(1, ...Object.values(pollTally));
                        const pct     = Math.round((votes / maxVotes) * 100);
                        const isMyVote = myVoteIndex === idx;
                        return (
                          <Pressable
                            key={idx}
                            style={[
                              styles.pollOption,
                              { borderColor: isMyVote ? theme.tint : (colorScheme === 'dark' ? '#1e2330' : '#e8e8e8') },
                            ]}
                            onPress={() => !castingVote && castVote(idx)}
                          >
                            <View style={[
                              styles.pollBar,
                              { width: `${pct}%` as any, backgroundColor: isMyVote ? 'rgba(188,138,47,0.2)' : (colorScheme === 'dark' ? '#1a1f2e' : '#f2f2f2') },
                            ]} />
                            <View style={styles.pollOptionRow}>
                              <Text style={[styles.pollOptionLabel, { color: theme.text }]} numberOfLines={1}>
                                {opt.label}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {isMyVote && (
                                  <Ionicons name="checkmark-circle" size={14} color={theme.tint} />
                                )}
                                <Text style={{ fontSize: 12, color: '#999', fontWeight: '700' }}>
                                  {votes}
                                </Text>
                                {isOrganiser && (
                                  <Pressable hitSlop={6} onPress={() => lockPollOption(idx)}>
                                    <Ionicons name="lock-closed-outline" size={13} color={theme.tint} />
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                      {isOrganiser && (
                        <Text style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
                          Tap the lock icon to confirm a date for the crew.
                        </Text>
                      )}
                    </>
                  )}
                </View>
              );
            })()}

            {event.guide?.summary && (
              <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>About</Text>
                <Text style={{ color: '#666', lineHeight: 22 }}>{event.guide.summary}</Text>
              </View>
            )}

            {/* Activity context card — shown for typed activities (trip, cooking, outdoor, etc.) */}
            {(() => {
              const activityType = event.guide?.activity_type ?? 'general';
              const fields = ACTIVITY_CONTEXT_FIELDS[activityType];
              if (!fields) return null;

              const ctx = (event.activity_context ?? {}) as Record<string, string>;
              const isOrganiser = event.creator_id === currentUserId;
              const hasAnyValue = fields.some(f => !!ctx[f.key]);

              if (!hasAnyValue && !isOrganiser) return null;

              const sectionLabel =
                activityType.charAt(0).toUpperCase() + activityType.slice(1) + ' Details';

              return (
                <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                      {sectionLabel}
                    </Text>
                    {isOrganiser && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          const draft: Record<string, string> = {};
                          fields.forEach(f => { draft[f.key] = ctx[f.key] ?? ''; });
                          setContextDraft(draft);
                          setShowContextModal(true);
                        }}
                      >
                        <Ionicons name="create-outline" size={16} color={theme.tint} />
                      </Pressable>
                    )}
                  </View>

                  {hasAnyValue
                    ? fields.map(f => {
                        const val = ctx[f.key];
                        if (!val) return null;
                        return (
                          <View key={f.key} style={{ marginBottom: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#999', marginBottom: 3 }}>
                              {f.label}
                            </Text>
                            <Text style={{ color: '#666', lineHeight: 20 }}>{val}</Text>
                          </View>
                        );
                      })
                    : (
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        onPress={() => {
                          const draft: Record<string, string> = {};
                          fields.forEach(f => { draft[f.key] = ''; });
                          setContextDraft(draft);
                          setShowContextModal(true);
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={theme.tint} />
                        <Text style={{ color: theme.tint, fontSize: 14, fontWeight: '600' }}>Add details</Text>
                      </Pressable>
                    )
                  }
                </View>
              );
            })()}

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

              {/* Phase details bar — date, accommodation (trip events) */}
              {(() => {
                const activePhase = eventPhases[activePhaseIndex];
                if (!activePhase || activePhase.is_custom) return null;
                const detail = phaseDetails.find(d => d.phase_id === activePhase.id);
                const isOrganiser = event?.creator_id === currentUserId;
                const hasDetail = detail?.scheduled_date || detail?.accommodation_name;

                if (!hasDetail && !isOrganiser) return null;

                return (
                  <Pressable
                    style={[styles.phaseDetailBar, { backgroundColor: 'rgba(188,138,47,0.08)', borderColor: 'rgba(188,138,47,0.3)' }]}
                    onPress={() => isOrganiser && openPhaseDetailEdit(activePhase.id)}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      {detail?.scheduled_date ? (
                        <View style={styles.phaseDetailRow}>
                          <Ionicons name="calendar-outline" size={13} color={theme.tint} />
                          <Text style={[styles.phaseDetailText, { color: theme.tint }]}>
                            {new Date(detail.scheduled_date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </Text>
                        </View>
                      ) : null}
                      {detail?.accommodation_name ? (
                        <View style={styles.phaseDetailRow}>
                          <Ionicons name="bed-outline" size={13} color="#999" />
                          <Text style={[styles.phaseDetailText, { color: '#999' }]} numberOfLines={1}>
                            {detail.accommodation_name}
                          </Text>
                          {detail.accommodation_url ? (
                            <Pressable onPress={() => Linking.openURL(detail!.accommodation_url!)} hitSlop={6}>
                              <Ionicons name="open-outline" size={12} color={theme.tint} style={{ marginLeft: 4 }} />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                      {!hasDetail && isOrganiser && (
                        <Text style={{ fontSize: 12, color: '#999' }}>Tap to set date & accommodation</Text>
                      )}
                    </View>
                    {isOrganiser && (
                      <Ionicons name="create-outline" size={15} color={theme.tint} />
                    )}
                  </Pressable>
                );
              })()}

              {/* Step execution — per-phase SequentialView or FreeformView */}
              {(() => {
                const activePhase = eventPhases[activePhaseIndex];
                if (!activePhase) return null;
                const isSequential = activePhase.execution_mode === 'Sequential';
                const isCustom     = activePhase.is_custom;
                const isOrganiser  = event?.creator_id === currentUserId;

                // Build a map: stepId → assignee names for display chips
                const assigneeMap = new Map<string, string[]>();
                for (const a of stepAssignments) {
                  const name = a.profile?.full_name ?? a.profile?.username ?? 'Crew';
                  if (!assigneeMap.has(a.step_card_id)) assigneeMap.set(a.step_card_id, []);
                  assigneeMap.get(a.step_card_id)!.push(name);
                }

                if (isSequential) {
                  return (
                    <SequentialView
                      steps={activePhase.step_cards}
                      completedSteps={completedStepIds}
                      onStepToggle={handleEventStepToggle}
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

              {/* Publish Adaptation — organiser only; shown at the bottom of the Plan tab */}
              {event?.creator_id === currentUserId && event.guide_id && (
                <Pressable
                  style={[styles.publishForkBtn, { borderColor: theme.tint + '55' }]}
                  onPress={publishAdaptation}
                  disabled={publishingFork}
                >
                  {publishingFork ? (
                    <ActivityIndicator size="small" color={theme.tint} />
                  ) : (
                    <>
                      <Ionicons name="git-branch-outline" size={16} color={theme.tint} style={{ marginRight: 8 }} />
                      <Text style={[styles.publishForkText, { color: theme.tint }]}>
                        Publish Adaptation as Forked Guide
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
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
              disabled={!modalDay || (modalIsMultiDay && !modalEndDay) || savingDate}
              hitSlop={8}
            >
              {savingDate
                ? <ActivityIndicator size="small" color={theme.tint} />
                : <Text style={[
                    styles.modalConfirm,
                    { color: (modalDay && (!modalIsMultiDay || modalEndDay)) ? theme.tint : '#ccc' },
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

                {/* Multi-day toggle */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' }}
                  onPress={() => { setModalIsMultiDay(m => !m); setModalEndDay(null); }}
                  activeOpacity={0.75}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: modalIsMultiDay ? theme.tint : '#ccc',
                    backgroundColor: modalIsMultiDay ? theme.tint : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {modalIsMultiDay && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>Multi-day trip</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* End-date calendar (shown when multi-day is enabled) */}
            {modalIsMultiDay && modalDay && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#999', marginBottom: 12 }}>
                  END DATE
                </Text>
                {/* End-date month navigation */}
                <View style={styles.monthHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      if (modalEndViewMonth === 0) { setModalEndViewYear(y => y - 1); setModalEndViewMonth(11); }
                      else setModalEndViewMonth(m => m - 1);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-back" size={22} color={theme.tint} />
                  </TouchableOpacity>
                  <Text style={[styles.monthTitle, { color: theme.text }]}>
                    {modalFmtMonth(modalEndViewYear, modalEndViewMonth)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (modalEndViewMonth === 11) { setModalEndViewYear(y => y + 1); setModalEndViewMonth(0); }
                      else setModalEndViewMonth(m => m + 1);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-forward" size={22} color={theme.tint} />
                  </TouchableOpacity>
                </View>

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

                {(() => {
                  const numDays  = modalDaysInMonth(modalEndViewYear, modalEndViewMonth);
                  const startDay = modalFirstWeekday(modalEndViewYear, modalEndViewMonth);
                  const cellW    = Math.floor((width - 32) / 7);
                  const cells: (number | null)[] = [
                    ...Array(startDay).fill(null),
                    ...Array.from({ length: numDays }, (_, i) => i + 1),
                  ];
                  return (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {cells.map((day, idx) => {
                        if (day === null) return <View key={`eb-${idx}`} style={{ width: cellW, height: cellW }} />;
                        const cellDate = new Date(modalEndViewYear, modalEndViewMonth, day, 0, 0, 0, 0);
                        const isBeforeStart = cellDate < modalDay;
                        const isSelected    = modalEndDay ? modalDateKey(cellDate) === modalDateKey(modalEndDay) : false;
                        return (
                          <TouchableOpacity
                            key={modalDateKey(cellDate)}
                            style={[
                              styles.cell,
                              { width: cellW, height: cellW },
                              isSelected && { backgroundColor: theme.tint, borderRadius: cellW / 2 },
                            ]}
                            onPress={() => !isBeforeStart && setModalEndDay(cellDate)}
                            disabled={isBeforeStart}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '500', color: isBeforeStart ? '#ccc' : isSelected ? '#fff' : theme.text }}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ---- PHASE DETAIL EDIT MODAL (organiser only) ---- */}
      <Modal
        visible={editingPhaseId !== null}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setEditingPhaseId(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: '#eee' }]}>
            <TouchableOpacity onPress={() => setEditingPhaseId(null)} hitSlop={8}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Phase Details</Text>
            <TouchableOpacity onPress={savePhaseDetail} hitSlop={8} disabled={savingPhaseDetail}>
              {savingPhaseDetail
                ? <ActivityIndicator size="small" color={theme.tint} />
                : <Text style={[styles.modalConfirm, { color: theme.tint }]}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View>
              <Text style={[styles.phaseDetailLabel, { color: '#999' }]}>DATE FOR THIS PHASE</Text>
              <TextInput
                style={[styles.phaseDetailInput, { backgroundColor: theme.cardBackground, color: theme.text }]}
                placeholder="YYYY-MM-DD  (e.g. 2026-07-14)"
                placeholderTextColor="#999"
                value={editPhaseDate}
                onChangeText={setEditPhaseDate}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View>
              <Text style={[styles.phaseDetailLabel, { color: '#999' }]}>ACCOMMODATION NAME</Text>
              <TextInput
                style={[styles.phaseDetailInput, { backgroundColor: theme.cardBackground, color: theme.text }]}
                placeholder="e.g. Tunnel Mountain Campground"
                placeholderTextColor="#999"
                value={editAccomName}
                onChangeText={setEditAccomName}
              />
            </View>

            <View>
              <Text style={[styles.phaseDetailLabel, { color: '#999' }]}>BOOKING / MAP LINK</Text>
              <TextInput
                style={[styles.phaseDetailInput, { backgroundColor: theme.cardBackground, color: theme.text }]}
                placeholder="https://…"
                placeholderTextColor="#999"
                value={editAccomUrl}
                onChangeText={setEditAccomUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ---- STEP ASSIGNMENT PICKER MODAL ---- */}
      <Modal
        visible={assigningStepId !== null}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setAssigningStepId(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: '#eee' }]}>
            <TouchableOpacity onPress={() => setAssigningStepId(null)} hitSlop={8}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Assign to Crew</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {participants
              .filter(p => p.status === 'confirmed' || p.status === 'invited')
              .map(p => {
                const name = p.profile?.full_name ?? p.profile?.username ?? 'Member';
                const isAssigned = assigningStepId
                  ? stepAssignments.some(a => a.step_card_id === assigningStepId && a.user_id === p.user_id)
                  : false;
                return (
                  <Pressable
                    key={p.user_id}
                    style={[
                      styles.assigneeRow,
                      { backgroundColor: isAssigned ? 'rgba(188,138,47,0.12)' : theme.cardBackground },
                    ]}
                    onPress={() => assigningStepId && handleAssignStep(assigningStepId, p.user_id)}
                  >
                    <View style={[styles.assigneeAvatar, { backgroundColor: theme.tint }]}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.assigneeName, { color: theme.text }]}>{name}</Text>
                    {isAssigned && <Ionicons name="checkmark-circle" size={20} color={theme.tint} />}
                  </Pressable>
                );
              })
            }
          </ScrollView>
        </View>
      </Modal>

      {/* ---- TIME POLL CREATE MODAL (organiser only) ---- */}
      <Modal
        visible={showPollModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowPollModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: '#eee' }]}>
            <TouchableOpacity onPress={() => setShowPollModal(false)} hitSlop={8}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Propose Times</Text>
            <TouchableOpacity
              onPress={createPoll}
              hitSlop={8}
              disabled={savingPoll || pollDraft.filter(s => s.trim()).length < 2}
            >
              {savingPoll
                ? <ActivityIndicator size="small" color={theme.tint} />
                : <Text style={[styles.modalConfirm, {
                    color: pollDraft.filter(s => s.trim()).length >= 2 ? theme.tint : '#ccc',
                  }]}>Create</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            <Text style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>
              Add 2–4 date options. Your crew will vote on their preference.
            </Text>
            {pollDraft.map((val, idx) => (
              <View key={idx}>
                <Text style={[styles.phaseDetailLabel, { color: '#999' }]}>
                  OPTION {idx + 1}
                </Text>
                <TextInput
                  style={[styles.phaseDetailInput, { backgroundColor: theme.cardBackground, color: theme.text }]}
                  placeholder={idx === 0 ? 'e.g. Sat Jun 7, afternoon' : idx === 1 ? 'e.g. Sun Jun 8, morning' : 'e.g. Following weekend'}
                  placeholderTextColor="#999"
                  value={val}
                  onChangeText={text => setPollDraft(d => d.map((v, i) => i === idx ? text : v))}
                />
              </View>
            ))}
            {pollDraft.length < 4 && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                onPress={() => setPollDraft(d => [...d, ''])}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.tint} />
                <Text style={{ color: theme.tint, fontWeight: '600' }}>Add another option</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ---- ACTIVITY CONTEXT EDIT MODAL (organiser only) ---- */}
      <Modal
        visible={showContextModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowContextModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: '#eee' }]}>
            <TouchableOpacity onPress={() => setShowContextModal(false)} hitSlop={8}>
              <Text style={{ color: theme.tint, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {event.guide?.activity_type
                ? event.guide.activity_type.charAt(0).toUpperCase() + event.guide.activity_type.slice(1) + ' Details'
                : 'Event Details'}
            </Text>
            <TouchableOpacity onPress={saveActivityContext} hitSlop={8} disabled={savingContext}>
              {savingContext
                ? <ActivityIndicator size="small" color={theme.tint} />
                : <Text style={[styles.modalConfirm, { color: theme.tint }]}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {(ACTIVITY_CONTEXT_FIELDS[event.guide?.activity_type ?? ''] ?? []).map(f => (
              <View key={f.key}>
                <Text style={[styles.phaseDetailLabel, { color: '#999' }]}>{f.label}</Text>
                <TextInput
                  style={[
                    styles.phaseDetailInput,
                    { backgroundColor: theme.cardBackground, color: theme.text },
                    f.multiline ? { height: 80, textAlignVertical: 'top', paddingTop: 10 } : undefined,
                  ]}
                  placeholder={f.placeholder}
                  placeholderTextColor="#999"
                  value={contextDraft[f.key] ?? ''}
                  onChangeText={text => setContextDraft(d => ({ ...d, [f.key]: text }))}
                  multiline={f.multiline}
                  autoCorrect
                />
              </View>
            ))}
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

  // Invitation / Join banner
  inviteBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  inviteBannerTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  inviteBannerActions: { flexDirection: 'row', gap: 10, width: '100%' },
  inviteBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Phase detail bar (Plan tab)
  phaseDetailBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  phaseDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  phaseDetailText: { fontSize: 13, fontWeight: '600' },

  // Phase detail edit modal
  phaseDetailLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  phaseDetailInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },

  // Step assignment chips
  assignmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  assigneePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  assigneeAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeName: { flex: 1, fontSize: 16, fontWeight: '600' },

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

  // Time poll
  pollOption: {
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 44,
    justifyContent: 'center',
  },
  pollBar: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    borderRadius: 8,
  },
  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pollOptionLabel: { flex: 1, fontSize: 14, fontWeight: '600', marginRight: 8 },
  publishForkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  publishForkText: { fontSize: 14, fontWeight: '700' },
});
