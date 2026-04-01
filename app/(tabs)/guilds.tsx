/**
 * guilds.tsx
 *
 * The Guilds tab — social hub combining guild navigation with profile access.
 *
 * Signed-in layout:
 * - Profile strip at top: avatar circle + display name/email + "Edit Profile" caret.
 *   More prominent than a WhatsApp header — full-width row with gold accent.
 * - "My Guilds" section with a WhatsApp-style list of guilds (avatar, name, role).
 * - Tapping a guild navigates to /guild/[id] (Hearth / Chat / Forums / Roster).
 * - "Start a Guild" + button in section header.
 * - Sign Out at the bottom.
 *
 * Signed-out layout:
 * - Full-screen auth form (email + password) identical to the legacy profile screen,
 *   since Guilds are the primary social feature requiring authentication.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { consumePendingDeepLink } from '@/lib/pendingDeepLink';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type GuildMembership = {
  role_name: string;
  guild: {
    id: string;
    name: string;
    handle: string;
    banner_url: string | null;
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuildsScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [guilds,  setGuilds]  = useState<GuildMembership[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Auth form state
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function init() {
        setPageLoading(true);
        const { data: { session: sess } } = await supabase.auth.getSession();
        if (!active) return;
        setSession(sess);
        if (sess?.user) await fetchGuilds(sess.user.id);
        if (active) setPageLoading(false);
      }

      init();
      return () => { active = false; };
    }, []),
  );

  async function fetchGuilds(userId: string) {
    const { data, error } = await supabase
      .from('guild_members')
      .select(`
        role:guild_roles(name),
        guild:guilds(id, name, handle, banner_url)
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('[Guilds] fetchGuilds error:', error);
      return;
    }

    setGuilds(
      (data ?? []).map((item: any) => ({
        role_name: item.role?.name ?? 'Member',
        guild: item.guild,
      })),
    );
  }

  // -------------------------------------------------------------------------
  // Auth actions
  // -------------------------------------------------------------------------

  async function handleAuth() {
    setAuthLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) Alert.alert('Sign Up Error', error.message);
      else Alert.alert('Success', 'Check your email for the confirmation link!');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        Alert.alert('Login Error', error.message);
      } else if (data.session) {
        setSession(data.session);
        fetchGuilds(data.session.user.id);

        // If the user arrived via a deep link while unauthenticated, send
        // them to the screen they were originally trying to reach.
        const pending = consumePendingDeepLink();
        if (pending) router.replace(pending as any);
      }
    }
    setAuthLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setGuilds([]);
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  /** Initials avatar for a guild (uses first two chars of name). */
  function GuildAvatar({ name, size = 48 }: { name: string; size?: number }) {
    const initials = name.substring(0, 2).toUpperCase();
    return (
      <View
        style={[
          styles.guildAvatar,
          {
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: isDark ? '#1e2330' : '#e8e8e8',
          },
        ]}
      >
        <Text style={[styles.guildAvatarText, { color: theme.tint, fontSize: size * 0.34 }]}>
          {initials}
        </Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Signed-out view (auth form)
  // -------------------------------------------------------------------------

  if (pageLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, styles.authContainer, { backgroundColor: theme.background }]}>
        <View style={styles.authHero}>
          <Ionicons name="shield-checkmark-outline" size={64} color={theme.tint} />
          <Text style={[styles.authTitle, { color: theme.text }]}>
            {isSignUp ? 'Join the Guild' : 'Member Access'}
          </Text>
          <Text style={[styles.authSubtitle, { color: subText }]}>
            {isSignUp
              ? 'Create an account to track your journeys and save your progress.'
              : 'Sign in to access your Codex, Guilds, and Events.'}
          </Text>
        </View>

        <View style={[styles.inputRow, { backgroundColor: theme.cardBackground }]}>
          <Ionicons name="mail-outline" size={20} color={subText} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            onChangeText={setEmail}
            value={email}
            placeholder="Email address"
            placeholderTextColor={subText}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={[styles.inputRow, { backgroundColor: theme.cardBackground }]}>
          <Ionicons name="lock-closed-outline" size={20} color={subText} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            onChangeText={setPassword}
            value={password}
            placeholder="Password"
            placeholderTextColor={subText}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={[styles.authBtn, { backgroundColor: theme.tint }]}
          onPress={handleAuth}
          disabled={authLoading}
          activeOpacity={0.8}
        >
          {authLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.authBtnText}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>
          }
        </TouchableOpacity>

        <Pressable
          style={styles.toggleRow}
          onPress={() => setIsSignUp(v => !v)}
        >
          <Text style={{ color: theme.tint, fontSize: 14 }}>
            {isSignUp ? 'Already have an account? Sign In' : 'New here? Create Account'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Signed-in view
  // -------------------------------------------------------------------------

  const displayName = session.user.user_metadata?.full_name
    ?? session.user.email?.split('@')[0]
    ?? 'Adventurer';
  const avatarInitial = displayName.substring(0, 1).toUpperCase();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile strip ───────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.profileStrip, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}
        activeOpacity={0.85}
        onPress={() => {/* Future: navigate to profile/settings screen */}}
      >
        {/* Avatar circle with initial */}
        <View style={[styles.profileAvatar, { backgroundColor: theme.tint }]}>
          <Text style={styles.profileAvatarText}>{avatarInitial}</Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.text }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, { color: subText }]}>{session.user.email}</Text>
        </View>

        <View style={styles.profileEditHint}>
          <Text style={[styles.profileEditText, { color: theme.tint }]}>Profile</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.tint} />
        </View>
      </TouchableOpacity>

      {/* ── My Guilds section ───────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>My Guilds</Text>
          <Link href="/guild/create" asChild>
            <Pressable hitSlop={10}>
              <Ionicons name="add-circle" size={28} color={theme.tint} />
            </Pressable>
          </Link>
        </View>

        {guilds.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#ccc' }]}>
            <Ionicons name="shield-outline" size={36} color={subText} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyText, { color: subText }]}>No active memberships.</Text>
            <Link href="/guild/create" asChild>
              <Pressable style={{ marginTop: 8 }}>
                <Text style={{ color: theme.tint, fontWeight: '700', fontSize: 15 }}>Start a Guild</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          guilds.map((membership, index) => (
            <Pressable
              key={index}
              style={({ pressed }) => [
                styles.guildRow,
                { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() =>
                router.push({ pathname: '/guild/[id]', params: { id: membership.guild.id } })
              }
            >
              <GuildAvatar name={membership.guild.name} size={48} />

              <View style={styles.guildRowBody}>
                <Text style={[styles.guildName, { color: theme.text }]}>
                  {membership.guild.name}
                </Text>
                <Text style={[styles.guildMeta, { color: subText }]}>
                  @{membership.guild.handle}  ·  {membership.role_name}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={subText} />
            </Pressable>
          ))
        )}
      </View>

      {/* ── Sign out ─────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.signOutBtn, { borderColor: '#BC2F38', backgroundColor: theme.cardBackground }]}
        onPress={handleSignOut}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={18} color="#BC2F38" style={{ marginRight: 8 }} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:   { flex: 1, paddingTop: 60 },
  scrollContent: { paddingBottom: 48 },

  // ── Auth form ─────────────────────────────────────────────────────────────
  authContainer: { paddingHorizontal: 28, justifyContent: 'center' },
  authHero: { alignItems: 'center', marginBottom: 36 },
  authTitle: { fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  authSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 14,
  },
  input: { flex: 1, fontSize: 16 },

  authBtn: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  authBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  toggleRow:   { marginTop: 20, alignItems: 'center' },

  // ── Profile strip ─────────────────────────────────────────────────────────
  profileStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  profileAvatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileInfo:       { flex: 1 },
  profileName:       { fontSize: 17, fontWeight: '700', marginBottom: 3 },
  profileEmail:      { fontSize: 13 },
  profileEditHint:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  profileEditText:   { fontSize: 13, fontWeight: '600' },

  // ── Guilds section ───────────────────────────────────────────────────────
  section: { paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700' },

  guildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  guildAvatar: { alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  guildAvatarText: { fontWeight: '800' },
  guildRowBody: { flex: 1 },
  guildName:    { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  guildMeta:    { fontSize: 12 },

  emptyCard: {
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: 10,
  },
  emptyText: { fontSize: 14 },

  // ── Sign out ─────────────────────────────────────────────────────────────
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 32,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
  },
  signOutText: { color: '#BC2F38', fontWeight: '700', fontSize: 16 },
});
