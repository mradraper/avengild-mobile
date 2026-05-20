/**
 * guild/discover.tsx
 *
 * Guild Discovery screen — search publicly visible guilds and join them.
 *
 * Privacy-setting logic:
 *   public  → "Join" button → join_guild RPC (instant, no approval required)
 *   private → "Apply" button → apply_to_guild RPC → pending badge
 *   secret  → never surfaces here (filtered out on query)
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiscoverableGuild = {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  privacy_setting: 'public' | 'private';
  member_count: number;
};

type MembershipStatus = 'none' | 'member' | 'pending' | 'rejected';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuildDiscoverScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [guilds, setGuilds] = useState<DiscoverableGuild[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, MembershipStatus>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    fetchGuilds();
  }, []);

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  async function fetchGuilds() {
    setLoading(true);

    // Fetch all discoverable guilds with member count.
    const { data: guildRows, error } = await supabase
      .from('guilds')
      .select('id, name, handle, description, privacy_setting, guild_members(count)')
      .in('privacy_setting', ['public', 'private'])
      .order('name', { ascending: true });

    if (error || !guildRows) {
      setLoading(false);
      return;
    }

    const discoverable: DiscoverableGuild[] = guildRows.map((g: any) => ({
      id: g.id,
      name: g.name,
      handle: g.handle,
      description: g.description,
      privacy_setting: g.privacy_setting,
      member_count: (g.guild_members as { count: number }[])?.[0]?.count ?? 0,
    }));

    setGuilds(discoverable);

    // Fetch current user's membership and application statuses.
    const { data: user } = await supabase.auth.getUser();
    if (user.user) {
      await loadStatuses(user.user.id, discoverable.map(g => g.id));
    }

    setLoading(false);
  }

  async function loadStatuses(userId: string, guildIds: string[]) {
    const map: Record<string, MembershipStatus> = {};
    guildIds.forEach(id => (map[id] = 'none'));

    // Memberships.
    const { data: memberships } = await supabase
      .from('guild_members')
      .select('guild_id')
      .eq('user_id', userId)
      .in('guild_id', guildIds);

    memberships?.forEach((m: any) => { map[m.guild_id] = 'member'; });

    // Applications.
    const { data: applications } = await supabase
      .from('guild_applications')
      .select('guild_id, status')
      .eq('applicant_id', userId)
      .in('guild_id', guildIds);

    applications?.forEach((a: any) => {
      if (map[a.guild_id] !== 'member') {
        map[a.guild_id] = a.status === 'pending' ? 'pending' : 'rejected';
      }
    });

    setStatusMap(map);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleJoin(guildId: string) {
    setActionLoading(guildId);
    const { error } = await supabase.rpc('join_guild', { p_guild_id: guildId });

    if (error) {
      if (error.message.includes('already_member')) {
        setStatusMap(prev => ({ ...prev, [guildId]: 'member' }));
      } else {
        Alert.alert('Could not join', error.message);
      }
    } else {
      setStatusMap(prev => ({ ...prev, [guildId]: 'member' }));
      // Navigate to the guild hall.
      router.replace({ pathname: '/guild/[id]', params: { id: guildId } });
    }
    setActionLoading(null);
  }

  async function handleApply(guild: DiscoverableGuild) {
    Alert.prompt(
      `Apply to ${guild.name}`,
      'Add an optional message to your application (optional).',
      async (message) => {
        setActionLoading(guild.id);
        const { error } = await supabase.rpc('apply_to_guild', {
          p_guild_id: guild.id,
          p_message: message ?? null,
        });

        if (error) {
          if (error.message.includes('already_member')) {
            setStatusMap(prev => ({ ...prev, [guild.id]: 'member' }));
          } else {
            Alert.alert('Could not apply', error.message);
          }
        } else {
          setStatusMap(prev => ({ ...prev, [guild.id]: 'pending' }));
          Alert.alert('Application sent', `Your request to join ${guild.name} has been submitted. The guild owner will review it shortly.`);
        }
        setActionLoading(null);
      },
      'plain-text',
      '',
    );
  }

  // -------------------------------------------------------------------------
  // Filtered list
  // -------------------------------------------------------------------------

  const filtered = query.trim()
    ? guilds.filter(g =>
        g.name.toLowerCase().includes(query.toLowerCase()) ||
        g.handle.toLowerCase().includes(query.toLowerCase()),
      )
    : guilds;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function ActionButton({ guild }: { guild: DiscoverableGuild }) {
    const status = statusMap[guild.id] ?? 'none';
    const busy = actionLoading === guild.id;

    if (status === 'member') {
      return (
        <View style={[styles.badge, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
          <Ionicons name="checkmark-circle" size={13} color={theme.tint} style={{ marginRight: 4 }} />
          <Text style={[styles.badgeText, { color: theme.tint }]}>Joined</Text>
        </View>
      );
    }

    if (status === 'pending') {
      return (
        <View style={[styles.badge, { backgroundColor: isDark ? '#1e2330' : '#fff3dc' }]}>
          <Ionicons name="time-outline" size={13} color="#BC8A2F" style={{ marginRight: 4 }} />
          <Text style={[styles.badgeText, { color: '#BC8A2F' }]}>Pending</Text>
        </View>
      );
    }

    if (guild.privacy_setting === 'public') {
      return (
        <Pressable
          style={[styles.actionBtn, { backgroundColor: theme.tint }]}
          onPress={() => handleJoin(guild.id)}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.actionBtnText}>Join</Text>
          }
        </Pressable>
      );
    }

    // Private guild.
    return (
      <Pressable
        style={[styles.actionBtn, { backgroundColor: isDark ? '#2a2d3a' : '#f0f0f0', borderWidth: 1, borderColor: theme.tint }]}
        onPress={() => handleApply(guild)}
        disabled={busy}
      >
        {busy
          ? <ActivityIndicator size="small" color={theme.tint} />
          : <Text style={[styles.actionBtnText, { color: theme.tint }]}>Apply</Text>
        }
      </Pressable>
    );
  }

  function renderGuild({ item }: { item: DiscoverableGuild }) {
    const isPrivate = item.privacy_setting === 'private';

    return (
      <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.cardLeft}>
          {/* Initials avatar */}
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
            <Text style={[styles.avatarText, { color: theme.tint }]}>
              {item.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.nameRow}>
              <Text style={[styles.guildName, { color: theme.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {isPrivate && (
                <View style={[styles.privacyBadge, { backgroundColor: isDark ? '#2a2d3a' : '#f0f0f0' }]}>
                  <Ionicons name="lock-closed" size={10} color="#999" />
                  <Text style={styles.privacyText}>Private</Text>
                </View>
              )}
            </View>
            <Text style={[styles.handle, { color: isDark ? '#888' : '#999' }]}>@{item.handle}</Text>
            {item.description ? (
              <Text style={[styles.description, { color: isDark ? '#aaa' : '#666' }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <Text style={[styles.memberCount, { color: isDark ? '#666' : '#bbb' }]}>
              {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>
        <ActionButton guild={item} />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Find a Guild', headerTintColor: theme.tint }} />

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <Ionicons name="search-outline" size={18} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name or @handle"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#999" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centred}>
          <Ionicons name="search-outline" size={48} color="#ccc" />
          <Text style={{ color: '#999', marginTop: 12, textAlign: 'center' }}>
            {query ? `No guilds matching "${query}"` : 'No guilds available yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderGuild}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },

  list: { padding: 16, gap: 10 },

  card: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 12 },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  avatarText: { fontWeight: '800', fontSize: 15 },

  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  guildName: { fontSize: 15, fontWeight: '700' },
  handle: { fontSize: 12, marginTop: 1, marginBottom: 4 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  memberCount: { fontSize: 11 },

  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  privacyText: { fontSize: 10, color: '#999', fontWeight: '600' },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexShrink: 0,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 68,
    alignItems: 'center',
    flexShrink: 0,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
