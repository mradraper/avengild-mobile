/**
 * guild/settings.tsx
 *
 * Guild Settings — accessible to the guild owner only.
 *
 * Sections:
 *   1. Identity       — name, handle, description
 *   2. Membership     — privacy_setting (public / private / secret)
 *   3. Applications   — pending join requests (private guilds only)
 *   4. Danger zone    — delete guild
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
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PrivacySetting = 'public' | 'private' | 'secret';

type GuildForm = {
  name:            string;
  handle:          string;
  description:     string;
  privacy_setting: PrivacySetting;
};

type Application = {
  id:           string;
  applicant_id: string;
  message:      string | null;
  created_at:   string;
  applicant:    { full_name: string | null; username: string | null } | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuildSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  const [form, setForm] = useState<GuildForm>({
    name: '', handle: '', description: '', privacy_setting: 'public',
  });
  const [originalPrivacy, setOriginalPrivacy] = useState<PrivacySetting>('public');
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return;
    loadGuild();
  }, [id]);

  async function loadGuild() {
    setLoading(true);
    const { data } = await supabase
      .from('guilds')
      .select('name, handle, description, privacy_setting')
      .eq('id', id)
      .single();

    if (data) {
      setForm({
        name:            data.name ?? '',
        handle:          data.handle ?? '',
        description:     data.description ?? '',
        privacy_setting: (data.privacy_setting as PrivacySetting) ?? 'public',
      });
      setOriginalPrivacy(data.privacy_setting as PrivacySetting);
    }

    await loadApplications();
    setLoading(false);
  }

  async function loadApplications() {
    const { data } = await supabase
      .from('guild_applications')
      .select(`
        id, applicant_id, message, created_at,
        applicant:profiles!guild_applications_applicant_id_fkey(full_name, username)
      `)
      .eq('guild_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    setApplications((data ?? []) as Application[]);
  }

  // -------------------------------------------------------------------------
  // Save identity / settings
  // -------------------------------------------------------------------------

  async function handleSave() {
    if (!form.name.trim() || !form.handle.trim()) {
      Alert.alert('Missing fields', 'Name and handle are required.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('guilds')
      .update({
        name:            form.name.trim(),
        handle:          form.handle.trim().toLowerCase(),
        description:     form.description.trim() || null,
        privacy_setting: form.privacy_setting,
      })
      .eq('id', id);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setOriginalPrivacy(form.privacy_setting);
      Alert.alert('Saved', 'Guild settings updated.');
    }
  }

  // -------------------------------------------------------------------------
  // Application actions
  // -------------------------------------------------------------------------

  async function handleApprove(appId: string) {
    setActionLoading(appId);
    const { error } = await supabase.rpc('approve_application', { p_application_id: appId });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setApplications(prev => prev.filter(a => a.id !== appId));
    }
    setActionLoading(null);
  }

  async function handleReject(appId: string, applicantName: string) {
    Alert.alert(
      'Reject application',
      `Reject ${applicantName}'s application?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(appId);
            const { error } = await supabase.rpc('reject_application', { p_application_id: appId });
            if (error) Alert.alert('Error', error.message);
            else setApplications(prev => prev.filter(a => a.id !== appId));
            setActionLoading(null);
          },
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Delete guild
  // -------------------------------------------------------------------------

  function handleDelete() {
    Alert.alert(
      'Delete Guild',
      `Permanently delete ${form.name}? This cannot be undone. All chat history, events, and member records will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('guilds').delete().eq('id', id);
            if (error) Alert.alert('Error', error.message);
            else router.replace('/(tabs)/guilds');
          },
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  const privacyOptions: { value: PrivacySetting; label: string; icon: any; description: string }[] = [
    { value: 'public',  label: 'Public',  icon: 'earth-outline',        description: 'Visible in search. Anyone can join instantly.' },
    { value: 'private', label: 'Private', icon: 'lock-open-outline',    description: 'Visible in search. Members require approval.' },
    { value: 'secret',  label: 'Secret',  icon: 'lock-closed-outline',  description: 'Hidden from all discovery. Invite only.' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Guild Settings', headerTintColor: theme.tint }} />

      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Identity</Text>

        <Text style={[styles.label, { color: theme.text }]}>Guild Name</Text>
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}
          value={form.name}
          onChangeText={v => setForm(f => ({ ...f, name: v }))}
          placeholder="e.g. Edmonton Foodies"
          placeholderTextColor="#999"
        />

        <Text style={[styles.label, { color: theme.text }]}>Handle</Text>
        <View style={[styles.handleRow, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
          <Text style={{ color: '#999', marginRight: 4 }}>@</Text>
          <TextInput
            style={[styles.handleInput, { color: theme.text }]}
            value={form.handle}
            onChangeText={v => setForm(f => ({ ...f, handle: v.toLowerCase() }))}
            placeholder="yegfoodies"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={[styles.label, { color: theme.text }]}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: theme.text, backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}
          value={form.description}
          onChangeText={v => setForm(f => ({ ...f, description: v }))}
          placeholder="Tell people what your guild is about…"
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
        />
      </View>

      {/* ── Membership ────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Membership</Text>

        {privacyOptions.map(opt => {
          const active = form.privacy_setting === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.privacyCard,
                { backgroundColor: theme.cardBackground, borderColor: active ? theme.tint : (isDark ? '#1e2330' : '#e8e8e8') },
                active && { borderWidth: 2 },
              ]}
              onPress={() => setForm(f => ({ ...f, privacy_setting: opt.value }))}
            >
              <Ionicons
                name={opt.icon}
                size={22}
                color={active ? theme.tint : '#999'}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.privacyLabel, { color: active ? theme.tint : theme.text }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.privacyDesc, { color: isDark ? '#888' : '#999' }]}>
                  {opt.description}
                </Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color={theme.tint} />}
            </Pressable>
          );
        })}
      </View>

      {/* ── Save button ───────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.tint }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </Pressable>
      </View>

      {/* ── Pending applications (private guilds) ────────────────────────── */}
      {(form.privacy_setting === 'private' || originalPrivacy === 'private') && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Pending Applications
            {applications.length > 0 && (
              <Text style={{ color: theme.tint }}> ({applications.length})</Text>
            )}
          </Text>

          {applications.length === 0 ? (
            <Text style={[styles.emptyText, { color: isDark ? '#666' : '#bbb' }]}>
              No pending applications.
            </Text>
          ) : (
            applications.map(app => {
              const name = app.applicant?.full_name ?? app.applicant?.username ?? 'Unknown';
              const busy = actionLoading === app.id;
              return (
                <View
                  key={app.id}
                  style={[styles.appCard, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}
                >
                  <View style={[styles.appAvatar, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
                    <Text style={[styles.appAvatarText, { color: theme.tint }]}>
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.appName, { color: theme.text }]}>{name}</Text>
                    {app.message ? (
                      <Text style={[styles.appMessage, { color: isDark ? '#aaa' : '#666' }]} numberOfLines={2}>
                        "{app.message}"
                      </Text>
                    ) : null}
                    <Text style={[styles.appDate, { color: isDark ? '#666' : '#bbb' }]}>
                      {new Date(app.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.appActions}>
                    {busy ? (
                      <ActivityIndicator size="small" color={theme.tint} />
                    ) : (
                      <>
                        <Pressable
                          style={[styles.appBtn, { backgroundColor: theme.tint }]}
                          onPress={() => handleApprove(app.id)}
                        >
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        </Pressable>
                        <Pressable
                          style={[styles.appBtn, { backgroundColor: isDark ? '#2a2d3a' : '#f0f0f0' }]}
                          onPress={() => handleReject(app.id, name)}
                        >
                          <Ionicons name="close" size={16} color="#BC2F38" />
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ── Danger zone ───────────────────────────────────────────────────── */}
      <View style={[styles.section, { marginTop: 8 }]}>
        <Text style={[styles.sectionTitle, { color: '#BC2F38' }]}>Danger Zone</Text>
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color="#BC2F38" style={{ marginRight: 8 }} />
          <Text style={styles.deleteBtnText}>Delete Guild</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },

  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
    color: '#999',
  },

  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { height: 100, textAlignVertical: 'top' },

  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  handleInput: { flex: 1, fontSize: 15 },

  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  privacyLabel: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  privacyDesc:  { fontSize: 12, lineHeight: 16 },

  saveBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },

  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  appAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  appAvatarText: { fontWeight: '800', fontSize: 14 },
  appName:    { fontSize: 14, fontWeight: '700' },
  appMessage: { fontSize: 13, marginTop: 2, fontStyle: 'italic' },
  appDate:    { fontSize: 11, marginTop: 3 },
  appActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  appBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BC2F38',
  },
  deleteBtnText: { color: '#BC2F38', fontWeight: '700', fontSize: 15 },
});
