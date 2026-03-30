/**
 * plan/invite.tsx
 *
 * The Invite screen — social coordination step of the Event creation flow.
 *
 * The user can search for friends by username or email and add them as
 * participants. They may also choose to create a solo event (just themselves).
 *
 * Data passed in via route params (from adapt.tsx):
 *   guideId, guideTitle, removedStepIds, additions
 *
 * On "Continue", the screen passes all accumulated event data forward to
 * /plan/schedule, where the final event row will be written to the database.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FoundUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

export default function InviteScreen() {
  const params = useLocalSearchParams<{
    guideId: string;
    guideTitle: string;
    removedStepIds: string;
    additions: string;
  }>();

  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<FoundUser[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [invited,       setInvited]       = useState<FoundUser[]>([]);

  // -------------------------------------------------------------------------
  // Search profiles by username or full_name
  // -------------------------------------------------------------------------

  const handleSearch = useCallback(async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .or(`username.ilike.%${text.trim()}%,full_name.ilike.%${text.trim()}%`)
      .limit(8);

    if (!error) {
      // Filter out already-invited users and the current user
      const { data: { user } } = await supabase.auth.getUser();
      const invitedIds = new Set(invited.map(u => u.id));
      setSearchResults(
        (data ?? []).filter((u: FoundUser) => !invitedIds.has(u.id) && u.id !== user?.id),
      );
    }
    setSearching(false);
  }, [invited]);

  function addInvitee(user: FoundUser) {
    setInvited(prev => [...prev, user]);
    setSearchResults(prev => prev.filter(u => u.id !== user.id));
    setSearchQuery('');
  }

  function removeInvitee(userId: string) {
    setInvited(prev => prev.filter(u => u.id !== userId));
  }

  function handleContinue() {
    router.push({
      pathname: '/plan/schedule',
      params: {
        ...params,
        invitedUserIds: JSON.stringify(invited.map(u => u.id)),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Invite Friends',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      {/* Invited chips */}
      {invited.length > 0 && (
        <View style={styles.invitedRow}>
          {invited.map(u => (
            <TouchableOpacity
              key={u.id}
              style={[styles.chip, { backgroundColor: isDark ? '#121620' : '#eee' }]}
              onPress={() => removeInvitee(u.id)}
            >
              <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                {u.username ?? u.full_name ?? 'User'}
              </Text>
              <Ionicons name="close-circle" size={14} color={subText} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search input */}
      <View style={[styles.searchBar, { backgroundColor: isDark ? '#121620' : '#fff', borderColor: isDark ? '#1e2330' : '#ddd' }]}>
        <Ionicons name="person-add-outline" size={18} color={subText} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name or username…"
          placeholderTextColor={subText}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={theme.tint} />}
      </View>

      {/* Search results */}
      <FlatList
        data={searchResults}
        keyExtractor={item => item.id}
        style={styles.results}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.resultRow, { borderBottomColor: isDark ? '#1e2330' : '#f0f0f0' }]}
            onPress={() => addInvitee(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatar, { backgroundColor: isDark ? '#1e2330' : '#ddd' }]}>
              <Text style={[styles.avatarText, { color: subText }]}>
                {(item.username ?? item.full_name ?? '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.resultBody}>
              <Text style={[styles.resultName, { color: theme.text }]}>
                {item.full_name ?? item.username ?? 'Unknown'}
              </Text>
              {item.username && (
                <Text style={[styles.resultHandle, { color: subText }]}>@{item.username}</Text>
              )}
            </View>
            <Ionicons name="add-circle-outline" size={22} color={theme.tint} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          searchQuery.length >= 2 && !searching
            ? <Text style={[styles.emptyText, { color: subText }]}>No users found.</Text>
            : null
        }
      />

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <Text style={[styles.footerNote, { color: subText }]}>
          {invited.length === 0
            ? 'Creating a solo event. You can invite friends later.'
            : `${invited.length} friend${invited.length > 1 ? 's' : ''} invited.`}
        </Text>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: theme.tint }]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>
            {invited.length === 0 ? 'Solo Event  →' : 'Continue  →'}
          </Text>
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

  invitedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', maxWidth: 120 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15 },

  results: { flex: 1, paddingHorizontal: 16 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText:  { fontSize: 16, fontWeight: '700' },
  resultBody:  { flex: 1 },
  resultName:  { fontSize: 15, fontWeight: '600' },
  resultHandle: { fontSize: 13, marginTop: 2 },
  emptyText:   { textAlign: 'center', marginTop: 20, fontSize: 14 },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  footerNote:      { fontSize: 13, textAlign: 'center' },
  continueBtn:     { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
