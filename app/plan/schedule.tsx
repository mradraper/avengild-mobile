/**
 * plan/schedule.tsx
 *
 * The Schedule screen — the final step in the Event creation flow.
 *
 * UI: a full calendar-first date/time picker:
 *   1. Month grid   — tap any day to select it; existing events show as dots
 *   2. Time picker  — hour grid (6 AM – 11 PM) appears once a day is chosen
 *   3. Multi-day toggle — "This is a multi-day trip" reveals an end-date
 *                     calendar so the organiser can set a date range.
 *   4. TBD option   — "Plan for later" skips the date and creates the event
 *                     without a start_time; the date can be set from inside
 *                     the Event Detail screen after the group decides.
 *
 * On confirmation, writes to the database:
 *   1. events row (with removed_step_ids, nullable start_time for TBD)
 *   2. event_participants rows
 *   3. event_step_additions rows
 *   4. increment_guide_stat RPC (instantiation_count +1)
 *   5. codex_entries upsert → 'Scheduled'
 *
 * Navigates to the Event Detail screen after saving so the user can
 * share the event link with invitees.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Hours shown in the time picker (6 AM – 11 PM)
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
function ymd(y: number, m: number, d: number) {
  return new Date(y, m, d, 0, 0, 0, 0);
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function fmtMonth(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}
function formatHour(h: number) {
  if (h === 0)  return '12 AM';
  if (h < 12)  return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}
function formatSelected(date: Date | null): string {
  if (!date) return 'Plan for later (TBD)';
  return date.toLocaleString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

export default function ScheduleScreen() {
  const params = useLocalSearchParams<{
    guideId: string;
    guideTitle: string;
    removedStepIds: string;
    additions: string;
    invitedUserIds: string;
  }>();

  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();
  const { width } = useWindowDimensions();

  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  // null = TBD; set when user taps a day
  const [selectedDay,  setSelectedDay]  = useState<Date | null>(null);
  // null until user picks a time
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [saving,       setSaving]       = useState(false);

  // Multi-day trip: end date (optional)
  const [isMultiDay,      setIsMultiDay]      = useState(false);
  const [endDay,          setEndDay]          = useState<Date | null>(null);
  // end-date calendar navigation — starts in the same month as selectedDay
  const [endViewYear,     setEndViewYear]     = useState(today.getFullYear());
  const [endViewMonth,    setEndViewMonth]    = useState(today.getMonth());

  // Existing event dates (for dots on the calendar grid)
  const [busyDays, setBusyDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBusyDays();
  }, []);

  async function loadBusyDays() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const threeMonthsOut = new Date();
    threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);
    const { data } = await supabase
      .from('events')
      .select('start_time')
      .eq('creator_id', user.id)
      .not('start_time', 'is', null)
      .gte('start_time', new Date().toISOString())
      .lte('start_time', threeMonthsOut.toISOString());
    if (data) {
      const keys = new Set(data.map((e: any) => {
        const d = new Date(e.start_time);
        return dateKey(d);
      }));
      setBusyDays(keys);
    }
  }

  // -------------------------------------------------------------------------
  // Calendar navigation
  // -------------------------------------------------------------------------

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(d: Date) {
    setSelectedDay(d);
    // Sync end-date calendar to the same month so it opens nearby
    setEndViewYear(d.getFullYear());
    setEndViewMonth(d.getMonth());
    // Preserve previously chosen hour, or default to noon
    if (selectedHour === null) setSelectedHour(12);
    // Clear end-day if it's now before the new start
    if (endDay && endDay < d) setEndDay(null);
  }

  function prevEndMonth() {
    if (endViewMonth === 0) { setEndViewYear(y => y - 1); setEndViewMonth(11); }
    else setEndViewMonth(m => m - 1);
  }
  function nextEndMonth() {
    if (endViewMonth === 11) { setEndViewYear(y => y + 1); setEndViewMonth(0); }
    else setEndViewMonth(m => m + 1);
  }

  // -------------------------------------------------------------------------
  // Build the selected Date from day + hour
  // -------------------------------------------------------------------------

  function buildDate(): Date | null {
    if (!selectedDay) return null;
    const d = new Date(selectedDay);
    d.setHours(selectedHour ?? 12, 0, 0, 0);
    return d;
  }

  // -------------------------------------------------------------------------
  // Confirm: write to the database
  // -------------------------------------------------------------------------

  async function handleConfirm(isTbd = false) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');

      const guideId    = params.guideId;
      const guideTitle = params.guideTitle;
      const additions  = JSON.parse(params.additions    ?? '[]');
      const invitedIds = JSON.parse(params.invitedUserIds ?? '[]') as string[];
      const removedIds = JSON.parse(params.removedStepIds  ?? '[]') as string[];

      const finalDate = isTbd ? null : buildDate();

      // Build end_time: end of the last day (23:59:59) if multi-day
      let endTime: string | null = null;
      if (isMultiDay && endDay) {
        const d = new Date(endDay);
        d.setHours(23, 59, 59, 0);
        endTime = d.toISOString();
      }

      // 1. Create the event row
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          guide_id:         guideId || null,
          creator_id:       user.id,
          title:            guideTitle,
          start_time:       finalDate?.toISOString() ?? null,
          end_time:         endTime,
          is_published:     false,
          removed_step_ids: removedIds,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // 2. Participants
      const participantRows = [
        { event_id: event.id, user_id: user.id, status: 'confirmed' },
        ...invitedIds.map((uid: string) => ({
          event_id:   event.id,
          user_id:    uid,
          invited_by: user.id,
          status:     'invited',
        })),
      ];
      await supabase.from('event_participants').insert(participantRows);

      // 3. Step additions
      if (additions.length > 0) {
        const additionRows = additions.map((a: any) => ({
          event_id:           event.id,
          atomic_action_text: a.atomic_action_text,
          location_name:      a.location_name || null,
          curation_notes:     a.curation_notes || null,
          step_index:         a.step_index,
        }));
        await supabase.from('event_step_additions').insert(additionRows);
      }

      // 4. Guide stat
      if (guideId) {
        await supabase.rpc('increment_guide_stat', {
          p_guide_id:  guideId,
          p_stat_name: 'instantiation_count',
          p_amount:    1,
        }).catch(() => {});
      }

      // 5. Codex entry
      if (guideId) {
        await supabase
          .from('codex_entries')
          .upsert(
            { user_id: user.id, guide_id: guideId, status: 'Scheduled' },
            { onConflict: 'user_id,guide_id' },
          );
      }

      // Navigate to the Event Detail screen so the user can share the link.
      // replace() clears this step from the back stack; the earlier plan steps
      // (search → adapt → invite) are gone once the user navigates away.
      router.replace({ pathname: '/event/[id]', params: { id: event.id } });
    } catch (err: any) {
      console.error('[Schedule] handleConfirm error:', err);
      Alert.alert('Could not save event', err.message ?? 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Calendar grid
  // -------------------------------------------------------------------------

  const cellW = Math.floor((width - 32) / 7);
  const numDays    = daysInMonth(viewYear, viewMonth);
  const startDay   = firstWeekday(viewYear, viewMonth);
  const todayKey   = dateKey(today);
  const selectedKey = selectedDay ? dateKey(selectedDay) : null;

  // Build cell array: nulls for blank leading cells, then day numbers
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  const finalDate = buildDate();
  const canConfirm = !!selectedDay && selectedHour !== null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Pick a Date',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ---- MONTH HEADER ---- */}
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthNav} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={theme.tint} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {fmtMonth(viewYear, viewMonth)}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthNav} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={theme.tint} />
          </TouchableOpacity>
        </View>

        {/* ---- DAY-OF-WEEK HEADER ---- */}
        <View style={styles.dayRow}>
          {DAY_NAMES.map(n => (
            <Text key={n} style={[styles.dayName, { width: cellW, color: subText }]}>{n}</Text>
          ))}
        </View>

        {/* ---- CALENDAR GRID ---- */}
        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <View key={`blank-${idx}`} style={{ width: cellW, height: cellW }} />;
            }
            const cellDate   = ymd(viewYear, viewMonth, day);
            const key        = dateKey(cellDate);
            const isPast     = cellDate < ymd(today.getFullYear(), today.getMonth(), today.getDate());
            const isToday    = key === todayKey;
            const isSelected = key === selectedKey;
            const hasBusy    = busyDays.has(key);

            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.cell,
                  { width: cellW, height: cellW },
                  isSelected && { backgroundColor: theme.tint, borderRadius: cellW / 2 },
                  isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.tint, borderRadius: cellW / 2 },
                ]}
                onPress={() => !isPast && selectDay(cellDate)}
                disabled={isPast}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.cellText,
                  { color: isPast ? '#ccc' : isSelected ? '#fff' : theme.text },
                ]}>
                  {day}
                </Text>
                {/* Event dot */}
                {hasBusy && !isSelected && (
                  <View style={[styles.dot, { backgroundColor: theme.tint }]} />
                )}
                {hasBusy && isSelected && (
                  <View style={[styles.dot, { backgroundColor: '#fff' }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ---- TIME PICKER (revealed after a day is tapped) ---- */}
        {selectedDay !== null && (
          <View style={styles.timeSection}>
            <Text style={[styles.sectionLabel, { color: subText }]}>WHAT TIME?</Text>
            <View style={styles.hourGrid}>
              {HOURS.map(h => {
                const active = selectedHour === h;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[
                      styles.hourCell,
                      {
                        backgroundColor: active
                          ? theme.tint
                          : isDark ? '#1a1f2e' : '#f2f2f2',
                        borderColor: active ? theme.tint : 'transparent',
                      },
                    ]}
                    onPress={() => setSelectedHour(h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.hourCellText,
                      { color: active ? '#fff' : theme.text },
                    ]}>
                      {formatHour(h)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ---- MULTI-DAY TOGGLE (shown once a start day+time is chosen) ---- */}
        {canConfirm && (
          <TouchableOpacity
            style={[styles.multiDayToggle, { backgroundColor: isDark ? '#1a1f2e' : '#f2f2f2' }]}
            onPress={() => { setIsMultiDay(v => !v); if (!isMultiDay) setEndDay(null); }}
            activeOpacity={0.8}
          >
            <View style={[styles.multiDayCheck, isMultiDay && { backgroundColor: theme.tint, borderColor: theme.tint }]}>
              {isMultiDay && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={[styles.multiDayLabel, { color: theme.text }]}>
              Multi-day trip (set an end date)
            </Text>
          </TouchableOpacity>
        )}

        {/* ---- END DATE CALENDAR (shown when multi-day is toggled on) ---- */}
        {isMultiDay && canConfirm && (() => {
          const endCellW      = Math.floor((width - 32) / 7);
          const endNumDays    = daysInMonth(endViewYear, endViewMonth);
          const endStartDay   = firstWeekday(endViewYear, endViewMonth);
          const endCells: (number | null)[] = [
            ...Array(endStartDay).fill(null),
            ...Array.from({ length: endNumDays }, (_, i) => i + 1),
          ];
          const startKey  = selectedDay ? dateKey(selectedDay) : null;
          const endSelKey = endDay ? dateKey(endDay) : null;

          return (
            <View style={styles.endDateSection}>
              <Text style={[styles.sectionLabel, { color: subText }]}>END DATE</Text>
              <View style={styles.monthHeader}>
                <TouchableOpacity onPress={prevEndMonth} style={styles.monthNav} hitSlop={8}>
                  <Ionicons name="chevron-back" size={22} color={theme.tint} />
                </TouchableOpacity>
                <Text style={[styles.monthTitle, { color: theme.text }]}>
                  {fmtMonth(endViewYear, endViewMonth)}
                </Text>
                <TouchableOpacity onPress={nextEndMonth} style={styles.monthNav} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={22} color={theme.tint} />
                </TouchableOpacity>
              </View>
              <View style={styles.dayRow}>
                {DAY_NAMES.map(n => (
                  <Text key={n} style={[styles.dayName, { width: endCellW, color: subText }]}>{n}</Text>
                ))}
              </View>
              <View style={styles.grid}>
                {endCells.map((day, idx) => {
                  if (day === null) return <View key={`e-blank-${idx}`} style={{ width: endCellW, height: endCellW }} />;
                  const cellDate   = ymd(endViewYear, endViewMonth, day);
                  const key        = dateKey(cellDate);
                  // End day must be after (or equal to) start day
                  const isBeforeStart = selectedDay ? cellDate < selectedDay : false;
                  const isSelStart = key === startKey;
                  const isSelEnd   = key === endSelKey;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.cell,
                        { width: endCellW, height: endCellW },
                        isSelEnd   && { backgroundColor: theme.tint, borderRadius: endCellW / 2 },
                        isSelStart && !isSelEnd && { borderWidth: 1.5, borderColor: theme.tint, borderRadius: endCellW / 2 },
                      ]}
                      onPress={() => !isBeforeStart && setEndDay(cellDate)}
                      disabled={isBeforeStart}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.cellText,
                        { color: isBeforeStart ? '#ccc' : isSelEnd ? '#fff' : theme.text },
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* ---- SELECTED SUMMARY ---- */}
        {canConfirm && (
          <View style={[styles.summaryRow, { backgroundColor: isDark ? '#1a1f2e' : '#f2f2f2' }]}>
            <Ionicons name="calendar-outline" size={18} color={theme.tint} />
            <Text style={[styles.summaryText, { color: theme.text }]}>
              {formatSelected(finalDate)}
              {isMultiDay && endDay ? (
                ` → ${endDay.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}`
              ) : ''}
            </Text>
          </View>
        )}

        {/* ---- TBD OPTION ---- */}
        <View style={styles.tbdSection}>
          <Text style={[styles.tbdHint, { color: subText }]}>
            Not sure yet? Create the event first — you can set a date inside
            the event once your group figures out what works.
          </Text>
          <TouchableOpacity
            style={[styles.tbdBtn, { borderColor: isDark ? '#2a2f3e' : '#ddd' }]}
            onPress={() => handleConfirm(true)}
            activeOpacity={0.7}
            disabled={saving}
          >
            <Text style={[styles.tbdBtnText, { color: subText }]}>
              Plan for later (TBD)
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ---- CONFIRM FOOTER ---- */}
      <View style={[styles.footer, { borderTopColor: isDark ? '#1e2330' : '#e8e8e8', backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            { backgroundColor: canConfirm ? theme.tint : (isDark ? '#1e2330' : '#ddd') },
          ]}
          onPress={() => handleConfirm(false)}
          activeOpacity={0.85}
          disabled={!canConfirm || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.confirmBtnText, { color: canConfirm ? '#fff' : subText }]}>
                Confirm Date & Time  ✓
              </Text>
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
  scroll:    { padding: 16, paddingBottom: 32 },

  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNav:   { padding: 6 },
  monthTitle: { fontSize: 17, fontFamily: 'Chivo_700Bold', fontWeight: 'normal' },

  dayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayName: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 4,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 14, fontWeight: '500' },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 3,
  },

  timeSection: { marginTop: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  hourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hourCell: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  hourCellText: { fontSize: 14, fontWeight: '600' },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
  },
  summaryText: { fontSize: 15, fontWeight: '600', flex: 1 },

  tbdSection: { marginTop: 24 },
  tbdHint: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  tbdBtn: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
  },
  tbdBtnText: { fontSize: 14 },

  // Multi-day toggle
  multiDayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  multiDayCheck: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#aaa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiDayLabel: { fontSize: 15, fontWeight: '600', flex: 1 },

  endDateSection: { marginTop: 24 },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  confirmBtn:     { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { fontSize: 17, fontWeight: '800' },
});
