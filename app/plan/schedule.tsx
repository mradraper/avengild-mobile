/**
 * plan/schedule.tsx
 *
 * The Schedule screen — the final step in the Event creation flow.
 *
 * The user sets a date and time for the event. On confirmation, this screen
 * writes the complete event to the database:
 *   1. Creates the `events` row.
 *   2. Creates `event_participants` rows for all invited friends.
 *   3. Creates `event_step_additions` rows for all adapted steps.
 *   4. Updates the source Guide's `instantiation_count` (increment by 1).
 *   5. Updates the user's `codex_entries` status to 'Scheduled' (upsert).
 *
 * After writing, navigates back to the Codex tab where the entry will
 * now show as "Scheduled."
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a Date as "Mon 29 Mar 2026, 7:00 PM" (Canadian locale). */
function formatDateTime(date: Date): string {
  return date.toLocaleString('en-CA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Returns the next round hour (e.g., 3:47 PM → 4:00 PM). */
function nextRoundHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
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

  const [selectedDate, setSelectedDate] = useState<Date>(nextRoundHour());
  const [saving,       setSaving]       = useState(false);

  // Quick time selector: common relative options
  const quickOptions: { label: string; getDate: () => Date }[] = [
    { label: 'Tonight',   getDate: () => { const d = new Date(); d.setHours(19, 0, 0, 0); return d; } },
    { label: 'Tomorrow',  getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; } },
    { label: 'This Weekend', getDate: () => {
        const d = new Date();
        const day = d.getDay();
        const daysUntilSat = (6 - day + 7) % 7 || 7;
        d.setDate(d.getDate() + daysUntilSat);
        d.setHours(12, 0, 0, 0);
        return d;
      }
    },
    { label: 'Next Week', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(12, 0, 0, 0); return d; } },
  ];

  // -------------------------------------------------------------------------
  // Hour adjuster buttons (+/- 1 hour)
  // -------------------------------------------------------------------------

  function adjustHour(delta: number) {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setHours(d.getHours() + delta);
      return d;
    });
  }

  // -------------------------------------------------------------------------
  // Confirm: write the full event to the database
  // -------------------------------------------------------------------------

  async function handleConfirm() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');

      const guideId     = params.guideId;
      const guideTitle  = params.guideTitle;
      const additions   = JSON.parse(params.additions ?? '[]');
      const invitedIds  = JSON.parse(params.invitedUserIds ?? '[]') as string[];
      const removedIds  = JSON.parse(params.removedStepIds ?? '[]') as string[];

      // 1. Create the event row
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          guide_id:    guideId,
          creator_id:  user.id,
          title:       guideTitle,
          start_time:  selectedDate.toISOString(),
          is_published: false,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // 2. Add the creator as a confirmed participant
      const participantRows = [
        { event_id: event.id, user_id: user.id, status: 'confirmed' },
        ...invitedIds.map((uid: string) => ({
          event_id:   event.id,
          user_id:    uid,
          invited_by: user.id,
          status:     'invited',
        })),
      ];
      const { error: partError } = await supabase
        .from('event_participants')
        .insert(participantRows);
      if (partError) console.warn('[Schedule] event_participants insert warn:', partError);

      // 3. Write the adapted step additions
      if (additions.length > 0) {
        const additionRows = additions.map((a: any) => ({
          event_id:           event.id,
          atomic_action_text: a.atomic_action_text,
          location_name:      a.location_name || null,
          curation_notes:     a.curation_notes || null,
          step_index:         a.step_index,
        }));
        const { error: addErr } = await supabase
          .from('event_step_additions')
          .insert(additionRows);
        if (addErr) console.warn('[Schedule] event_step_additions insert warn:', addErr);
      }

      // 4. Increment the source Guide's instantiation_count
      await supabase.rpc('increment_guide_stat', {
        guide_id_param: guideId,
        column_name:    'instantiation_count',
      }).catch(() => {
        // Non-critical: silently ignore if RPC not yet created
      });

      // 5. Upsert the user's codex_entry to 'Scheduled'
      await supabase
        .from('codex_entries')
        .upsert(
          { user_id: user.id, guide_id: guideId, status: 'Scheduled' },
          { onConflict: 'user_id,guide_id' },
        );

      // Navigate back to the Codex, resetting the plan flow stack
      router.dismissAll();
      router.replace('/(tabs)/codex');
    } catch (err: any) {
      console.error('[Schedule] handleConfirm error:', err);
      Alert.alert('Could not save event', err.message ?? 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'When?',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      <View style={styles.body}>
        {/* Selected date display */}
        <View style={[styles.dateDisplay, { backgroundColor: isDark ? '#121620' : '#f4f4f4', borderColor: isDark ? '#1e2330' : '#ddd' }]}>
          <Ionicons name="calendar-outline" size={22} color={theme.tint} />
          <Text style={[styles.dateText, { color: theme.text }]}>
            {formatDateTime(selectedDate)}
          </Text>
        </View>

        {/* Hour nudge */}
        <View style={styles.hourRow}>
          <TouchableOpacity
            style={[styles.hourBtn, { backgroundColor: isDark ? '#121620' : '#eee' }]}
            onPress={() => adjustHour(-1)}
          >
            <Text style={[styles.hourBtnText, { color: theme.text }]}>− 1 hr</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hourBtn, { backgroundColor: isDark ? '#121620' : '#eee' }]}
            onPress={() => adjustHour(1)}
          >
            <Text style={[styles.hourBtnText, { color: theme.text }]}>+ 1 hr</Text>
          </TouchableOpacity>
        </View>

        {/* Quick-pick options */}
        <Text style={[styles.sectionLabel, { color: subText }]}>QUICK PICK</Text>
        {quickOptions.map(opt => {
          const d = opt.getDate();
          const isSelected = formatDateTime(d) === formatDateTime(selectedDate);
          return (
            <TouchableOpacity
              key={opt.label}
              style={StyleSheet.flatten([
                styles.quickOption,
                { borderColor: isSelected ? theme.tint : (isDark ? '#1e2330' : '#ddd') },
                isSelected && { backgroundColor: isDark ? 'rgba(188,138,47,0.1)' : 'rgba(55,94,63,0.08)' },
              ])}
              onPress={() => setSelectedDate(d)}
              activeOpacity={0.75}
            >
              <View style={styles.quickOptionBody}>
                <Text style={[styles.quickOptionLabel, { color: isSelected ? theme.tint : theme.text }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.quickOptionDate, { color: subText }]}>
                  {formatDateTime(d)}
                </Text>
              </View>
              {isSelected && <Ionicons name="checkmark-circle" size={20} color={theme.tint} />}
            </TouchableOpacity>
          );
        })}

        {/* TBD / no time option */}
        <TouchableOpacity
          style={[styles.tbdBtn, { borderColor: isDark ? '#1e2330' : '#ddd' }]}
          onPress={() => {
            // Proceed without a start_time (nullable)
            handleConfirm();
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tbdBtnText, { color: subText }]}>Set time later (TBD)</Text>
        </TouchableOpacity>
      </View>

      {/* Confirm button */}
      <View style={[styles.footer, { borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: theme.tint }]}
          onPress={handleConfirm}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.confirmBtnText}>Create Event  ✓</Text>
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
  body:      { flex: 1, padding: 20 },

  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  dateText: { fontSize: 17, fontWeight: '700', flex: 1 },

  hourRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  hourBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  hourBtnText: { fontSize: 15, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },

  quickOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  quickOptionBody:  { flex: 1 },
  quickOptionLabel: { fontSize: 16, fontWeight: '700' },
  quickOptionDate:  { fontSize: 13, marginTop: 3 },

  tbdBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  tbdBtnText: { fontSize: 14 },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  confirmBtn:     { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
