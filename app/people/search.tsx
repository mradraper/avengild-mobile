/**
 * app/people/search.tsx — People Search & Connection Management
 *
 * Allows the user to:
 *   - Search profiles by full name or username
 *   - Send a connection request (status='pending')
 *   - See when a connection request is already pending (sent by either side)
 *   - See when already connected (status='accepted')
 *   - Message connected users directly (navigates to /messages/[userId])
 *
 * Connection model (user_connections, Migration 013):
 *   - requester_id sends a request to addressee_id with status='pending'
 *   - addressee accepts → status='accepted'
 *   - Either party can remove a connection at any time
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

type ProfileResult = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

type EnrichedResult = ProfileResult & {
  connectionStatus: ConnectionStatus;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PeopleSearchScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const [myUserId, setMyUserId]   = useState<string | null>(null);
  const [query,    setQuery]      = useState('');
  const [results,  setResults]    = useState<EnrichedResult[]>([]);
  const [loading,  setLoading]    = useState(false);
  const [myConnections, setMyConnections] = useState<Array<{ requester_id: string; addressee_id: string; status: string }>>([]);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Auth + pre-load existing connections (for status overlay)
  // -------------------------------------------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setMyUserId(user.id);
      loadMyConnections(user.id);
    });
  }, []);

  async function loadMyConnections(userId: string) {
    const { data } = await supabase
      .from('user_connections')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    setMyConnections(data ?? []);
  }

  // -------------------------------------------------------------------------
  // Derive connection status for a given profile ID
  // -------------------------------------------------------------------------
  function getConnectionStatus(profileId: string): ConnectionStatus {
    if (!myUserId) return 'none';
    const row = myConnections.find(
      c =>
        (c.requester_id === myUserId && c.addressee_id === profileId) ||
        (c.requester_id === profileId && c.addressee_id === myUserId),
    );
    if (!row) return 'none';
    if (row.status === 'accepted') return 'accepted';
    // pending — which direction?
    return row.requester_id === myUserId ? 'pending_sent' : 'pending_received';
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------
  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => runSearch(text.trim()), 350);
  }

  async function runSearch(q: string) {
    if (!myUserId) return;
    setLoading(true);

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
      .neq('id', myUserId)    // exclude self
      .limit(30);

    const enriched: EnrichedResult[] = (data ?? []).map((p: ProfileResult) => ({
      ...p,
      connectionStatus: getConnectionStatus(p.id),
    }));

    setResults(enriched);
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Connection actions
  // -------------------------------------------------------------------------
  async function sendConnectionRequest(profileId: string) {
    if (!myUserId) return;
    const { error } = await supabase
      .from('user_connections')
      .insert({ requester_id: myUserId, addressee_id: profileId });

    if (!error) {
      await loadMyConnections(myUserId);
      // Re-enrich results to show updated status without re-querying profiles
      setResults(prev =>
        prev.map(r =>
          r.id === profileId ? { ...r, connectionStatus: 'pending_sent' as ConnectionStatus } : r,
        ),
      );
    }
  }

  async function removeConnection(profileId: string) {
    if (!myUserId) return;
    await supabase
      .from('user_connections')
      .delete()
      .or(
        `and(requester_id.eq.${myUserId},addressee_id.eq.${profileId}),` +
        `and(requester_id.eq.${profileId},addressee_id.eq.${myUserId})`,
      );
    await loadMyConnections(myUserId);
    setResults(prev =>
      prev.map(r =>
        r.id === profileId ? { ...r, connectionStatus: 'none' as ConnectionStatus } : r,
      ),
    );
  }

  async function acceptRequest(profileId: string) {
    if (!myUserId) return;
    await supabase
      .from('user_connections')
      .update({ status: 'accepted' })
      .eq('requester_id', profileId)
      .eq('addressee_id', myUserId);
    await loadMyConnections(myUserId);
    setResults(prev =>
      prev.map(r =>
        r.id === profileId ? { ...r, connectionStatus: 'accepted' as ConnectionStatus } : r,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  function renderActionButton(item: EnrichedResult) {
    const { connectionStatus } = item;

    if (connectionStatus === 'accepted') {
      return (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.tint }]}
            onPress={() => router.push({ pathname: '/messages/[userId]', params: { userId: item.id } })}
          >
            <Ionicons name="chatbubble-outline" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>Message</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: isDark ? '#2a2f3e' : '#e8e8e8' }]}
            onPress={() => removeConnection(item.id)}
          >
            <Text style={[styles.actionBtnText, { color: subText }]}>Connected ✓</Text>
          </Pressable>
        </View>
      );
    }

    if (connectionStatus === 'pending_sent') {
      return (
        <Pressable
          style={[styles.actionBtn, { backgroundColor: isDark ? '#2a2f3e' : '#e8e8e8' }]}
          onPress={() => removeConnection(item.id)}
        >
          <Text style={[styles.actionBtnText, { color: subText }]}>Pending…</Text>
        </Pressable>
      );
    }

    if (connectionStatus === 'pending_received') {
      return (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.tint }]}
            onPress={() => acceptRequest(item.id)}
          >
            <Text style={styles.actionBtnText}>Accept</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: isDark ? '#2a2f3e' : '#e8e8e8' }]}
            onPress={() => removeConnection(item.id)}
          >
            <Text style={[styles.actionBtnText, { color: subText }]}>Decline</Text>
          </Pressable>
        </View>
      );
    }

    // none
    return (
      <Pressable
        style={[styles.actionBtn, { backgroundColor: theme.tint }]}
        onPress={() => sendConnectionRequest(item.id)}
      >
        <Ionicons name="person-add-outline" size={14} color="#fff" />
        <Text style={styles.actionBtnText}>Connect</Text>
      </Pressable>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Find People',
          headerTintColor: theme.tint,
          headerStyle: { backgroundColor: theme.cardBackground },
        }}
      />

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.cardBackground, borderColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <Ionicons name="search-outline" size={18} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name or username…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={handleQueryChange}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color={theme.tint} style={{ marginLeft: 8 }} />}
        {query.length > 0 && !loading && (
          <Pressable onPress={() => { setQuery(''); setResults([]); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#999" />
          </Pressable>
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query.length > 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={{ color: subText, fontSize: 14 }}>No results for "{query}"</Text>
            </View>
          ) : query.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={{ color: subText, marginTop: 12, fontSize: 14 }}>
                Search for friends by name or username
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const name    = item.full_name ?? item.username ?? 'Member';
          const initial = name.charAt(0).toUpperCase();
          return (
            <View style={[styles.resultRow, { backgroundColor: theme.cardBackground }]}>
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>

              {/* Name + username */}
              <View style={styles.resultBody}>
                <Text style={[styles.resultName, { color: theme.text }]}>{name}</Text>
                {item.username ? (
                  <Text style={[styles.resultUsername, { color: subText }]}>@{item.username}</Text>
                ) : null}
                {renderActionButton(item)}
              </View>
            </View>
          );
        }}
      />
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
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },

  list: { padding: 12, paddingTop: 4 },
  empty: { alignItems: 'center', paddingTop: 48 },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  resultBody: { flex: 1, gap: 2 },
  resultName:     { fontSize: 16, fontWeight: '700' },
  resultUsername: { fontSize: 13 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
