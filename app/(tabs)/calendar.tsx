/**
 * calendar.tsx
 *
 * Outlook-style Calendar tab.
 *
 * Three views:
 *   Month — 7-column month grid with event dots.
 *            Tapping a day expands that day's event list below the grid.
 *   Week  — 7-day header strip + full week schedule list (grouped by day).
 *   Day   — Hourly timeline (6 AM – 11 PM) with event blocks.
 *
 * PostgREST FK disambiguation:
 *   The `events` table has two foreign keys to `guides`
 *   (guide_id → guides, published_guide_id → guides). Without an explicit
 *   hint, PostgREST throws PGRST201 "ambiguous embedding".
 *   Fix: use `guide:guides!events_guide_id_fkey(...)` in the select string
 *   to pin the join to the correct relationship.
 *
 * Plan entry:
 *   "Plan Event" always navigates to /plan/search. The selected date is
 *   passed as a param so the schedule screen can pre-fill it.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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

const HOUR_HEIGHT   = 60;   // px per hour in Day view
const DAY_START     = 6;    // 6 AM
const DAY_END       = 22;   // 10 PM
const HOURS         = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START);
const TIME_LABEL_W  = 48;
const DAY_NAMES     = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_INITIALS  = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  title: string;
  start_time: string | null;
  guide_id: string | null;
  guide: {
    id: string;
    title: string;
    primary_location_name: string | null;
  } | null;
};

type CalendarView = 'month' | 'week' | 'day';

// ---------------------------------------------------------------------------
// Pure date helpers (no external library)
// ---------------------------------------------------------------------------

/** Zero-time Date for a year/month/day triple. */
function ymd(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
}

/** 'YYYY-MM-DD' key from a local Date. */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' key from an ISO timestamp string. */
function keyFromISO(iso: string): string {
  return dateKey(new Date(iso));
}

/** True if two Dates refer to the same calendar day. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Number of days in a given month (0-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Day of week (0=Sun) of the 1st of the given month. */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Array of 7 Dates starting from the Sunday of the week containing `d`. */
function weekDates(d: Date): Date[] {
  const copy = new Date(d);
  copy.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  copy.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(copy);
    day.setDate(copy.getDate() + i);
    return day;
  });
}

/** '6 AM', '12 PM', '11 PM' etc. */
function formatHour(h: number): string {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** '7:30 PM' from an ISO string. */
function formatTime(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** 'March 2026', 'Mar 24' etc. */
function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}
function fmtWeekRange(dates: Date[]): string {
  const first = dates[0];
  const last  = dates[6];
  const same  = first.getMonth() === last.getMonth();
  if (same) {
    return `${first.toLocaleDateString('en-CA', { month: 'long' })} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
  }
  return `${first.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
function fmtDayFull(d: Date): string {
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
  const { width }   = useWindowDimensions();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'dark'];
  const isDark      = colorScheme === 'dark';
  const subText     = isDark ? '#aaa' : '#666';
  const router      = useRouter();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view,         setView]         = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewDate,     setViewDate]     = useState<Date>(today); // anchor for month/week nav
  const [events,       setEvents]       = useState<EventRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [userId,       setUserId]       = useState<string | null>(null);

  const dayScrollRef = useRef<ScrollView>(null);

  // -------------------------------------------------------------------------
  // Derived: events indexed by 'YYYY-MM-DD'
  // -------------------------------------------------------------------------

  const eventsByDate = new Map<string, EventRow[]>();
  const tbdEvents: EventRow[] = [];

  for (const evt of events) {
    if (!evt.start_time) {
      tbdEvents.push(evt);
    } else {
      const k = keyFromISO(evt.start_time);
      if (!eventsByDate.has(k)) eventsByDate.set(k, []);
      eventsByDate.get(k)!.push(evt);
    }
  }

  // Sort events within each day by start_time
  for (const [, list] of eventsByDate) {
    list.sort((a, b) =>
      (a.start_time ?? '').localeCompare(b.start_time ?? ''),
    );
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;

        if (!user) {
          setUserId(null);
          setLoading(false);
          return;
        }
        setUserId(user.id);

        // Explicitly hint the guide_id FK to avoid PGRST201 ambiguous join.
        // `events` has two FKs to `guides`: guide_id and published_guide_id.
        // The `!events_guide_id_fkey` suffix pins the join to the correct one.
        const { data, error } = await supabase
          .from('events')
          .select(`
            id, title, start_time, guide_id,
            guide:guides!events_guide_id_fkey(id, title, primary_location_name)
          `)
          .eq('creator_id', user.id)
          .order('start_time', { ascending: true, nullsFirst: false });

        if (error) {
          console.error('[Calendar] load error:', error);
          setLoading(false);
          return;
        }

        if (active) {
          setEvents((data ?? []) as EventRow[]);
          setLoading(false);
        }
      }

      load();
      return () => { active = false; };
    }, []),
  );

  // -------------------------------------------------------------------------
  // Navigation helpers
  // -------------------------------------------------------------------------

  function prevMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function prevWeek() {
    setViewDate(d => {
      const n = new Date(d);
      n.setDate(d.getDate() - 7);
      return n;
    });
    setSelectedDate(d => {
      const n = new Date(d);
      n.setDate(d.getDate() - 7);
      return n;
    });
  }
  function nextWeek() {
    setViewDate(d => {
      const n = new Date(d);
      n.setDate(d.getDate() + 7);
      return n;
    });
    setSelectedDate(d => {
      const n = new Date(d);
      n.setDate(d.getDate() + 7);
      return n;
    });
  }
  function prevDay() {
    setSelectedDate(d => {
      const n = new Date(d);
      n.setDate(d.getDate() - 1);
      return n;
    });
  }
  function nextDay() {
    setSelectedDate(d => {
      const n = new Date(d);
      n.setDate(d.getDate() + 1);
      return n;
    });
  }

  // -------------------------------------------------------------------------
  // Render: top header
  // -------------------------------------------------------------------------

  function renderHeader() {
    let title: string;
    if (view === 'month') title = fmtMonth(viewDate);
    else if (view === 'week') title = fmtWeekRange(weekDates(viewDate));
    else title = fmtDayFull(selectedDate);

    const onPrev = view === 'month' ? prevMonth : view === 'week' ? prevWeek : prevDay;
    const onNext = view === 'month' ? nextMonth : view === 'week' ? nextWeek : nextDay;

    return (
      <View style={[styles.header, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        {/* Nav arrow + title */}
        <View style={styles.headerNav}>
          <TouchableOpacity onPress={onPrev} hitSlop={10} style={styles.navArrow}>
            <Ionicons name="chevron-back" size={22} color={theme.tint} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity onPress={onNext} hitSlop={10} style={styles.navArrow}>
            <Ionicons name="chevron-forward" size={22} color={theme.tint} />
          </TouchableOpacity>
        </View>

        {/* View switcher + Plan button */}
        <View style={styles.headerActions}>
          <View style={[styles.viewSwitcher, { borderColor: isDark ? '#1e2330' : '#ddd' }]}>
            {(['month', 'week', 'day'] as CalendarView[]).map(v => (
              <TouchableOpacity
                key={v}
                style={[
                  styles.viewSwitcherBtn,
                  view === v && { backgroundColor: theme.tint },
                ]}
                onPress={() => setView(v)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.viewSwitcherText,
                  { color: view === v ? '#fff' : subText },
                ]}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.planBtn, { backgroundColor: theme.tint }]}
            onPress={() => router.push({
              pathname: '/plan/search',
              params: { defaultDate: selectedDate.toISOString() },
            })}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Month view
  // -------------------------------------------------------------------------

  function renderMonth() {
    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days  = daysInMonth(year, month);
    const offset = firstWeekday(year, month);

    // Build cell array: null = padding, number = day of month
    const cells: (number | null)[] = [
      ...Array(offset).fill(null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const selKey   = dateKey(selectedDate);
    const todayKey = dateKey(today);

    const cellW = width / 7;

    return (
      <View style={{ flex: 1 }}>
        {/* Day-of-week header */}
        <View style={[styles.weekdayHeader, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
          {DAY_INITIALS.map((d, i) => (
            <View key={i} style={{ width: cellW, alignItems: 'center' }}>
              <Text style={[styles.weekdayInitial, { color: subText }]}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Month grid */}
        <View style={styles.monthGrid}>
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <View key={`pad-${idx}`} style={{ width: cellW, height: 52 }} />
              );
            }

            const d   = ymd(year, month, day);
            const key = dateKey(d);
            const isTod = key === todayKey;
            const isSel = key === selKey;
            const dayEvts = eventsByDate.get(key) ?? [];

            return (
              <TouchableOpacity
                key={key}
                style={{ width: cellW, height: 52, alignItems: 'center', paddingTop: 4 }}
                onPress={() => {
                  setSelectedDate(d);
                  setViewDate(d);
                }}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.dayCircle,
                  isTod && { backgroundColor: theme.tint },
                  isSel && !isTod && { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' },
                ]}>
                  <Text style={[
                    styles.dayNumber,
                    { color: isTod ? '#fff' : theme.text },
                    isSel && !isTod && { color: theme.tint, fontWeight: '700' },
                  ]}>
                    {day}
                  </Text>
                </View>
                {/* Event dots */}
                {dayEvts.length > 0 && (
                  <View style={styles.dotRow}>
                    {dayEvts.slice(0, 3).map((_, di) => (
                      <View
                        key={di}
                        style={[styles.dot, { backgroundColor: isTod ? '#fff' : theme.tint }]}
                      />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected day events panel */}
        <View style={[styles.dayPanel, { borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
          <Text style={[styles.dayPanelTitle, { color: theme.text }]}>
            {fmtDayFull(selectedDate)}
          </Text>
          {renderDayEventList(selectedDate)}
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Week view
  // -------------------------------------------------------------------------

  function renderWeek() {
    const dates = weekDates(viewDate);
    const cellW = width / 7;

    return (
      <View style={{ flex: 1 }}>
        {/* 7-day strip */}
        <View style={[styles.weekStrip, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
          {dates.map((d, i) => {
            const key    = dateKey(d);
            const isTod  = sameDay(d, today);
            const isSel  = sameDay(d, selectedDate);
            const hasEvt = (eventsByDate.get(key)?.length ?? 0) > 0;

            return (
              <TouchableOpacity
                key={key}
                style={{ width: cellW, alignItems: 'center', paddingVertical: 8 }}
                onPress={() => setSelectedDate(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.weekStripDay, { color: isSel ? theme.tint : subText }]}>
                  {DAY_NAMES[i]}
                </Text>
                <View style={[
                  styles.dayCircle,
                  isTod && { backgroundColor: theme.tint },
                  isSel && !isTod && { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' },
                ]}>
                  <Text style={[
                    styles.dayNumber,
                    { color: isTod ? '#fff' : theme.text },
                    isSel && !isTod && { color: theme.tint, fontWeight: '700' },
                  ]}>
                    {d.getDate()}
                  </Text>
                </View>
                {hasEvt && (
                  <View style={[styles.dot, { backgroundColor: isTod ? theme.tint : theme.tint, marginTop: 2 }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Events list for the full week */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {tbdEvents.length > 0 && renderTbdBanner()}
          {dates.map(d => {
            const key = dateKey(d);
            const dayEvts = eventsByDate.get(key) ?? [];
            if (dayEvts.length === 0) return null;

            const isTod = sameDay(d, today);
            const isSel = sameDay(d, selectedDate);

            return (
              <View key={key}>
                <View style={[styles.weekDayHeader, { backgroundColor: theme.background }]}>
                  <Text style={[
                    styles.weekDayLabel,
                    { color: isTod || isSel ? theme.tint : subText },
                  ]}>
                    {d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
                  </Text>
                </View>
                {dayEvts.map(evt => renderEventRow(evt))}
              </View>
            );
          })}

          {/* Empty week */}
          {dates.every(d => (eventsByDate.get(dateKey(d))?.length ?? 0) === 0) && (
            <View style={styles.emptyWeek}>
              <Ionicons name="calendar-outline" size={40} color={subText} />
              <Text style={[styles.emptyWeekText, { color: subText }]}>No events this week.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Day view (hourly timeline)
  // -------------------------------------------------------------------------

  function renderDay() {
    const key       = dateKey(selectedDate);
    const dayEvts   = eventsByDate.get(key) ?? [];
    const timedEvts = dayEvts.filter(e => e.start_time);
    const eventAreaW = width - TIME_LABEL_W - 8; // right padding

    return (
      <View style={{ flex: 1 }}>
        {/* Selected day label */}
        <View style={[styles.dayViewLabel, { borderBottomColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
          <Text style={[styles.dayPanelTitle, { color: sameDay(selectedDate, today) ? theme.tint : theme.text }]}>
            {fmtDayFull(selectedDate)}
          </Text>
          {tbdEvents.length > 0 && renderTbdBanner()}
        </View>

        <ScrollView
          ref={dayScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          onLayout={() => {
            // Scroll to current hour if viewing today
            if (sameDay(selectedDate, today)) {
              const currentHour = new Date().getHours();
              const offset = Math.max(0, (currentHour - DAY_START - 1)) * HOUR_HEIGHT;
              dayScrollRef.current?.scrollTo({ y: offset, animated: false });
            }
          }}
        >
          <View style={{ flexDirection: 'row' }}>
            {/* Time labels */}
            <View style={{ width: TIME_LABEL_W }}>
              {HOURS.map(h => (
                <View key={h} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start', paddingTop: 4 }}>
                  <Text style={[styles.hourLabel, { color: subText }]}>{formatHour(h)}</Text>
                </View>
              ))}
            </View>

            {/* Grid + event blocks */}
            <View style={{ flex: 1, position: 'relative' }}>
              {/* Hour grid lines */}
              {HOURS.map(h => {
                const isCurrentHour =
                  sameDay(selectedDate, today) && new Date().getHours() === h;
                return (
                  <View
                    key={h}
                    style={[
                      styles.hourRow,
                      { borderTopColor: isDark ? '#1e2330' : '#e8e8e8' },
                      isCurrentHour && { borderTopColor: theme.tint },
                    ]}
                  />
                );
              })}

              {/* Current time indicator */}
              {sameDay(selectedDate, today) && (() => {
                const now  = new Date();
                const h    = now.getHours();
                const m    = now.getMinutes();
                if (h < DAY_START || h > DAY_END) return null;
                const top  = (h - DAY_START) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
                return (
                  <View style={[styles.nowLine, { top, width: eventAreaW }]}>
                    <View style={[styles.nowDot, { backgroundColor: theme.tint }]} />
                    <View style={[styles.nowBar, { backgroundColor: theme.tint }]} />
                  </View>
                );
              })()}

              {/* Event blocks */}
              {timedEvts.map(evt => {
                const start = new Date(evt.start_time!);
                const h = start.getHours();
                const m = start.getMinutes();

                // Events before/after visible range: skip
                if (h < DAY_START || h > DAY_END) return null;

                const top    = (h - DAY_START) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
                const height = Math.max(HOUR_HEIGHT * 0.75, HOUR_HEIGHT - 4); // default 1 h

                return (
                  <Pressable
                    key={evt.id}
                    style={[styles.eventBlock, { top, height, width: eventAreaW - 8, backgroundColor: theme.tint }]}
                    onPress={() =>
                      router.push({ pathname: '/event/[id]', params: { id: evt.id } })
                    }
                  >
                    <Text style={styles.eventBlockTime}>{formatTime(evt.start_time)}</Text>
                    <Text style={styles.eventBlockTitle} numberOfLines={2}>{evt.title}</Text>
                    {evt.guide && evt.guide.primary_location_name ? (
                      <Text style={styles.eventBlockLocation} numberOfLines={1}>
                        {evt.guide.primary_location_name}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Shared render helpers
  // -------------------------------------------------------------------------

  /** Compact event row used in Month panel + Week view list. */
  function renderEventRow(evt: EventRow) {
    return (
      <Pressable
        key={evt.id}
        style={({ pressed }) => [
          styles.eventRow,
          { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() =>
          router.push({ pathname: '/event/[id]', params: { id: evt.id } })
        }
      >
        <View style={[styles.eventRowAccent, { backgroundColor: theme.tint }]} />
        <View style={styles.eventRowBody}>
          <Text style={[styles.eventRowTitle, { color: theme.text }]} numberOfLines={1}>
            {evt.title}
          </Text>
          {evt.guide?.primary_location_name ? (
            <Text style={[styles.eventRowMeta, { color: subText }]} numberOfLines={1}>
              {evt.guide.primary_location_name}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.eventRowTime, { color: theme.tint }]}>
          {formatTime(evt.start_time)}
        </Text>
      </Pressable>
    );
  }

  /** Day events list shown in Month panel. */
  function renderDayEventList(d: Date) {
    const key     = dateKey(d);
    const dayEvts = eventsByDate.get(key) ?? [];

    if (dayEvts.length === 0) {
      return (
        <View style={styles.dayPanelEmpty}>
          <Text style={[styles.dayPanelEmptyText, { color: subText }]}>
            No events.{' '}
            <Text
              style={{ color: theme.tint, fontWeight: '700' }}
              onPress={() => router.push('/plan/search')}
            >
              Plan one →
            </Text>
          </Text>
        </View>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {dayEvts.map(evt => renderEventRow(evt))}
      </ScrollView>
    );
  }

  /** Unscheduled (TBD) events banner. */
  function renderTbdBanner() {
    if (tbdEvents.length === 0) return null;
    return (
      <View style={[styles.tbdBanner, { backgroundColor: isDark ? '#1e2330' : '#f4f4f4' }]}>
        <Ionicons name="time-outline" size={14} color={subText} />
        <Text style={[styles.tbdText, { color: subText }]}>
          {tbdEvents.length} unscheduled {tbdEvents.length === 1 ? 'event' : 'events'}
        </Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Root render
  // -------------------------------------------------------------------------

  if (!userId && !loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderHeader()}
        <View style={styles.centred}>
          <Ionicons name="lock-closed-outline" size={48} color={subText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Sign in to view your Calendar.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderHeader()}

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : (
        <>
          {view === 'month' && renderMonth()}
          {view === 'week'  && renderWeek()}
          {view === 'day'   && renderDay()}
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

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  navArrow:    { padding: 4 },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  viewSwitcher: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  viewSwitcherBtn: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  viewSwitcherText: { fontSize: 12, fontWeight: '700' },
  planBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // ── Month view ───────────────────────────────────────────────────────────
  weekdayHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  weekdayInitial: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: { fontSize: 14, fontWeight: '500' },
  dotRow:    { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot:       { width: 4, height: 4, borderRadius: 2 },

  // ── Day panel (Month view bottom + Day view) ─────────────────────────────
  dayPanel: {
    flex: 1,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  dayPanelTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  dayPanelEmpty: { alignItems: 'center', paddingTop: 12 },
  dayPanelEmptyText: { fontSize: 14 },

  dayViewLabel: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },

  // ── Week view ────────────────────────────────────────────────────────────
  weekStrip: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  weekStripDay: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  weekDayHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  weekDayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  emptyWeek: { alignItems: 'center', paddingTop: 48 },
  emptyWeekText: { marginTop: 12, fontSize: 14 },

  // ── Day view (time grid) ─────────────────────────────────────────────────
  hourLabel: { fontSize: 10, fontWeight: '600', textAlign: 'right', paddingRight: 8 },
  hourRow:   { height: HOUR_HEIGHT, borderTopWidth: 1 },

  nowLine: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  nowDot: { width: 10, height: 10, borderRadius: 5, marginLeft: -4 },
  nowBar: { flex: 1, height: 1.5, marginLeft: 2 },

  eventBlock: {
    position: 'absolute',
    left: 4,
    borderRadius: 6,
    padding: 6,
    zIndex: 2,
  },
  eventBlockTime:     { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  eventBlockTitle:    { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 1 },
  eventBlockLocation: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  // ── Event row (compact, used in Month panel + Week list) ─────────────────
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    marginHorizontal: 14,
    marginBottom: 6,
    paddingRight: 12,
    paddingVertical: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  eventRowAccent: { width: 3, alignSelf: 'stretch', marginRight: 10, borderRadius: 2 },
  eventRowBody:   { flex: 1 },
  eventRowTitle:  { fontSize: 14, fontWeight: '700' },
  eventRowMeta:   { fontSize: 12, marginTop: 1 },
  eventRowTime:   { fontSize: 12, fontWeight: '700', marginLeft: 8, flexShrink: 0 },

  // ── TBD banner ───────────────────────────────────────────────────────────
  tbdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginVertical: 4,
    borderRadius: 6,
    marginHorizontal: 14,
  },
  tbdText: { fontSize: 12 },

  // ── Generic empty / centred ──────────────────────────────────────────────
  centred:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
});
