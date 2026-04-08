/**
 * guilds.tsx
 *
 * Social hub — message-inbox-first layout (like Signal).
 *
 * Signed-in layout:
 *   1. Compact profile strip (avatar + name + Profile caret)
 *   2. Messages section — DM threads + Guild chat threads, sorted by
 *      last_message_at DESC. Tapping a DM row → /messages/[userId].
 *      Tapping a Guild chat row → /guild/[id] (Chat tab).
 *   3. Communities section — guild membership list; "Start a Guild" + button.
 *      "Find a Guild" discovery row at bottom.
 *
 * Signed-out layout:
 *   Full-screen auth form (email + password), same as before.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { consumePendingDeepLink } from '@/lib/pendingDeepLink';
import { registerPushToken } from '@/lib/notifications';
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

type InboxThread = {
  id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  // DM thread — one of these is the current user, the other is the contact
  dm_user_a: string | null;
  dm_user_b: string | null;
  // Guild thread
  guild_id: string | null;
  // Resolved display data (filled in after profile lookup)
  displayName: string;
  displaySub: string;
  otherUserId?: string;   // set for DM rows so we can navigate to /messages/[userId]
};

type PendingRequest = {
  requester_id: string;
  requesterName: string;
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

  const [session,          setSession]          = useState<Session | null>(null);
  const [guilds,           setGuilds]           = useState<GuildMembership[]>([]);
  const [inbox,            setInbox]            = useState<InboxThread[]>([]);
  const [pendingRequests,  setPendingRequests]  = useState<PendingRequest[]>([]);
  const [authLoading,      setAuthLoading]      = useState(false);
  const [pageLoading,      setPageLoading]      = useState(true);

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
        if (sess?.user) {
          await Promise.all([
            fetchGuilds(sess.user.id),
            fetchInbox(sess.user.id),
            fetchPendingRequests(sess.user.id),
          ]);
        }
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

  async function fetchInbox(userId: string) {
    // Fetch all threads the user participates in, ordered by last activity
    const { data: threads, error } = await supabase
      .from('chat_threads')
      .select('id, last_message_at, last_message_preview, dm_user_a, dm_user_b, guild_id')
      .or(
        `dm_user_a.eq.${userId},` +
        `dm_user_b.eq.${userId},` +
        `guild_id.in.(${
          // We'll filter to user's guilds by fetching guild IDs inline below.
          // Supabase doesn't support subqueries here, so we use a two-step approach.
          'placeholder'
        })`,
      )
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(30);

    // Two-step: fetch user's guild IDs first, then query threads
    const { data: memberRows } = await supabase
      .from('guild_members')
      .select('guild_id')
      .eq('user_id', userId);

    const guildIds = (memberRows ?? []).map((r: any) => r.guild_id as string);

    // Re-query with proper filter
    let query = supabase
      .from('chat_threads')
      .select('id, last_message_at, last_message_preview, dm_user_a, dm_user_b, guild_id')
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(30);

    if (guildIds.length > 0) {
      query = query.or(
        `dm_user_a.eq.${userId},` +
        `dm_user_b.eq.${userId},` +
        `guild_id.in.(${guildIds.join(',')})`,
      );
    } else {
      query = query.or(`dm_user_a.eq.${userId},dm_user_b.eq.${userId}`);
    }

    const { data: threadData } = await query;

    if (!threadData || threadData.length === 0) {
      setInbox([]);
      return;
    }

    // Collect other-user IDs from DM threads so we can bulk-fetch profiles
    const otherUserIds = threadData
      .filter((t: any) => t.dm_user_a || t.dm_user_b)
      .map((t: any) => t.dm_user_a === userId ? t.dm_user_b : t.dm_user_a)
      .filter(Boolean) as string[];

    const { data: profiles } = otherUserIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', otherUserIds)
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((p: any) => [p.id, p.full_name ?? p.username ?? 'Member']),
    );

    // Build guild name map from already-fetched guilds (populated after fetchGuilds)
    // We'll do a quick guild name lookup directly from threadData's guild_id
    const uniqueGuildIds = [...new Set(
      threadData.filter((t: any) => t.guild_id).map((t: any) => t.guild_id as string),
    )];
    const { data: guildRows } = uniqueGuildIds.length > 0
      ? await supabase
          .from('guilds')
          .select('id, name')
          .in('id', uniqueGuildIds)
      : { data: [] };
    const guildNameMap = new Map((guildRows ?? []).map((g: any) => [g.id, g.name as string]));

    const inboxItems: InboxThread[] = threadData.map((t: any) => {
      if (t.dm_user_a || t.dm_user_b) {
        const otherId = t.dm_user_a === userId ? t.dm_user_b : t.dm_user_a;
        return {
          ...t,
          displayName: profileMap.get(otherId) ?? 'Member',
          displaySub:  t.last_message_preview ?? 'New conversation',
          otherUserId: otherId,
        };
      }
      return {
        ...t,
        displayName: guildNameMap.get(t.guild_id) ?? 'Guild Chat',
        displaySub:  t.last_message_preview ?? 'No messages yet',
      };
    });

    setInbox(inboxItems);
  }

  async function fetchPendingRequests(userId: string) {
    // Requests where I am the addressee (someone wants to connect with me).
    // Two-step: the FK points to auth.users, not profiles, so we fetch profiles separately.
    const { data: rows } = await supabase
      .from('user_connections')
      .select('requester_id')
      .eq('addressee_id', userId)
      .eq('status', 'pending');

    if (!rows || rows.length === 0) {
      setPendingRequests([]);
      return;
    }

    const requesterIds = rows.map((r: any) => r.requester_id as string);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', requesterIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const requests: PendingRequest[] = rows.map((r: any) => {
      const profile = profileMap.get(r.requester_id);
      return {
        requester_id:  r.requester_id,
        requesterName: profile?.full_name ?? profile?.username ?? 'Someone',
      };
    });
    setPendingRequests(requests);
  }

  async function acceptConnectionRequest(requesterId: string, userId: string) {
    await supabase
      .from('user_connections')
      .update({ status: 'accepted' })
      .eq('requester_id', requesterId)
      .eq('addressee_id', userId);
    await fetchPendingRequests(userId);
  }

  async function declineConnectionRequest(requesterId: string, userId: string) {
    await supabase
      .from('user_connections')
      .delete()
      .eq('requester_id', requesterId)
      .eq('addressee_id', userId);
    await fetchPendingRequests(userId);
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
        await Promise.all([
          fetchGuilds(data.session.user.id),
          fetchInbox(data.session.user.id),
          fetchPendingRequests(data.session.user.id),
          registerPushToken(),
        ]);

        // If the user arrived via a deep link while unauthenticated, send
        // them to the screen they were originally trying to reach.
        const pending = consumePendingDeepLink();
        if (pending) router.replace(pending as any);
      }
    }
    setAuthLoading(false);
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function GuildAvatar({ name, size = 44 }: { name: string; size?: number }) {
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

  function formatRelativeTime(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'now';
    if (mins < 60)  return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `${days}d`;
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
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
      {/* ── Compact profile strip ───────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.profileStrip, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}
        activeOpacity={0.85}
        onPress={() => router.push('/profile/me')}
      >
        <View style={[styles.profileAvatar, { backgroundColor: theme.tint }]}>
          <Text style={styles.profileAvatarText}>{avatarInitial}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.text }]}>{displayName}</Text>
        </View>
        <View style={styles.profileEditHint}>
          <Text style={[styles.profileEditText, { color: theme.tint }]}>Profile</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.tint} />
        </View>
      </TouchableOpacity>

      {/* ── Pending connection requests ─────────────────────────────────── */}
      {pendingRequests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Requests
            </Text>
            <View style={[styles.requestBadge, { backgroundColor: theme.tint }]}>
              <Text style={styles.requestBadgeText}>{pendingRequests.length}</Text>
            </View>
          </View>
          {pendingRequests.map(req => (
            <View
              key={req.requester_id}
              style={[styles.requestRow, { backgroundColor: theme.cardBackground }]}
            >
              <View style={[styles.requestAvatar, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
                <Text style={[styles.requestAvatarText, { color: theme.tint }]}>
                  {req.requesterName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.requestName, { color: theme.text }]}>
                  {req.requesterName}
                </Text>
                <Text style={[styles.requestSub, { color: subText }]}>
                  wants to connect
                </Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.requestBtn, { backgroundColor: theme.tint }]}
                  onPress={() => session && acceptConnectionRequest(req.requester_id, session.user.id)}
                >
                  <Text style={styles.requestBtnText}>Accept</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestBtn, { backgroundColor: isDark ? '#2a2f3e' : '#e8e8e8' }]}
                  onPress={() => session && declineConnectionRequest(req.requester_id, session.user.id)}
                >
                  <Text style={[styles.requestBtnText, { color: subText }]}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Messages inbox ──────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Messages</Text>
          <Pressable
            onPress={() => router.push('/people/search')}
            hitSlop={8}
          >
            <Ionicons name="person-add-outline" size={22} color={theme.tint} />
          </Pressable>
        </View>

        {inbox.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#ccc' }]}>
            <Ionicons name="chatbubbles-outline" size={32} color={subText} style={{ marginBottom: 8 }} />
            <Text style={[styles.emptyText, { color: subText }]}>No conversations yet.</Text>
            <Text style={[styles.emptyText, { color: subText, fontSize: 12, marginTop: 4 }]}>
              Messages from Guilds and direct chats will appear here.
            </Text>
          </View>
        ) : (
          inbox.map(thread => {
            const isDm = !!thread.otherUserId;
            const initials = thread.displayName.substring(0, 2).toUpperCase();
            return (
              <Pressable
                key={thread.id}
                style={({ pressed }) => [
                  styles.inboxRow,
                  { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() => {
                  if (isDm && thread.otherUserId) {
                    router.push({ pathname: '/messages/[userId]', params: { userId: thread.otherUserId } });
                  } else if (thread.guild_id) {
                    router.push({ pathname: '/guild/[id]', params: { id: thread.guild_id } });
                  }
                }}
              >
                {/* Avatar */}
                <View style={[
                  styles.inboxAvatar,
                  { backgroundColor: isDm ? (isDark ? '#1e2330' : '#e8e8e8') : 'rgba(188,138,47,0.15)' },
                ]}>
                  <Text style={[styles.inboxAvatarText, { color: theme.tint }]}>{initials}</Text>
                  {isDm && (
                    <View style={[styles.dmBadge, { backgroundColor: theme.tint }]}>
                      <Ionicons name="person" size={7} color="#fff" />
                    </View>
                  )}
                </View>

                {/* Text */}
                <View style={styles.inboxBody}>
                  <Text style={[styles.inboxName, { color: theme.text }]} numberOfLines={1}>
                    {thread.displayName}
                  </Text>
                  <Text style={[styles.inboxPreview, { color: subText }]} numberOfLines={1}>
                    {thread.displaySub}
                  </Text>
                </View>

                {/* Timestamp */}
                {thread.last_message_at && (
                  <Text style={[styles.inboxTime, { color: subText }]}>
                    {formatRelativeTime(thread.last_message_at)}
                  </Text>
                )}
              </Pressable>
            );
          })
        )}
      </View>

      {/* ── Communities ─────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Communities</Text>
          <Link href="/guild/create" asChild>
            <Pressable hitSlop={10}>
              <Ionicons name="add-circle" size={28} color={theme.tint} />
            </Pressable>
          </Link>
        </View>

        {guilds.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#ccc' }]}>
            <Ionicons name="shield-outline" size={32} color={subText} style={{ marginBottom: 8 }} />
            <Text style={[styles.emptyText, { color: subText }]}>No active memberships.</Text>
            <Link href="/guild/create" asChild>
              <Pressable style={{ marginTop: 8 }}>
                <Text style={{ color: theme.tint, fontWeight: '700', fontSize: 14 }}>Start a Guild</Text>
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
              <GuildAvatar name={membership.guild.name} size={44} />
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

        {/* Discover entry point */}
        <Pressable
          style={[styles.discoverRow, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}
          onPress={() => router.push('/guild/discover')}
        >
          <View style={[styles.discoverIcon, { backgroundColor: isDark ? '#1e2330' : '#f5f0e8' }]}>
            <Ionicons name="compass-outline" size={20} color={theme.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.discoverTitle, { color: theme.text }]}>Find a Guild</Text>
            <Text style={[styles.discoverSub, { color: subText }]}>Browse and join public guilds</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={subText} />
        </Pressable>
      </View>

    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:     { flex: 1, paddingTop: 60 },
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

  // ── Compact profile strip ─────────────────────────────────────────────────
  profileStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  profileInfo:       { flex: 1 },
  profileName:       { fontSize: 15, fontWeight: '700' },
  profileEditHint:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  profileEditText:   { fontSize: 13, fontWeight: '600' },

  // ── Section chrome ────────────────────────────────────────────────────────
  section: { paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },

  // ── Inbox rows ────────────────────────────────────────────────────────────
  inboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 6,
    gap: 12,
  },
  inboxAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  inboxAvatarText: { fontWeight: '800', fontSize: 15 },
  dmBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBody:    { flex: 1 },
  inboxName:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  inboxPreview: { fontSize: 13 },
  inboxTime:    { fontSize: 11, flexShrink: 0 },

  // ── Guild rows ────────────────────────────────────────────────────────────
  guildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  guildAvatar: { alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  guildAvatarText: { fontWeight: '800' },
  guildRowBody: { flex: 1 },
  guildName:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  guildMeta:    { fontSize: 12 },

  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    gap: 12,
  },
  discoverIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverTitle: { fontSize: 14, fontWeight: '700' },
  discoverSub:   { fontSize: 12, marginTop: 1 },

  emptyCard: {
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: 10,
  },
  emptyText: { fontSize: 13 },

  // ── Connection requests ───────────────────────────────────────────────────
  requestBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    gap: 10,
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarText: { fontWeight: '800', fontSize: 16 },
  requestName: { fontSize: 15, fontWeight: '700' },
  requestSub:  { fontSize: 12, marginTop: 1 },

  requestActions: { flexDirection: 'row', gap: 6 },
  requestBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  requestBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
