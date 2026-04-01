/**
 * app/profile/[id].tsx — Public Profile View
 *
 * Displays a user's public profile using the existing `profiles` table columns:
 *   id, username, full_name, avatar_url, website,
 *   event_instantiations, global_step_completions
 *
 * No bio or location columns exist yet — those are planned for a future migration.
 *
 * Entry points:
 *   - Guild Roster (tapping a member row)
 *   - Event Crew tab (tapping a participant row)
 *   - Chat (tapping a sender name — future)
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type ProfileData = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  website: string | null;
  event_instantiations: number;
  global_step_completions: number;
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { id } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    fetchProfile(id);
  }, [id]);

  async function fetchProfile(userId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, website, event_instantiations, global_step_completions')
      .eq('id', userId)
      .single();

    if (data) setProfile(data as ProfileData);
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // LOADING / NOT FOUND
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Profile', headerTintColor: theme.tint }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Profile', headerTintColor: theme.tint }} />
        <Text style={{ color: '#999', textAlign: 'center' }}>User not found.</Text>
      </View>
    );
  }

  const displayName = profile.full_name ?? profile.username ?? 'Avengild Member';
  const initial = displayName.charAt(0).toUpperCase();

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: displayName,
          headerTintColor: theme.tint,
          headerBackTitle: '',
          headerTitleStyle: { fontFamily: 'Chivo_900Black', fontSize: 18 },
          headerStyle: { backgroundColor: theme.cardBackground },
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Avatar + Name */}
        <View style={styles.heroSection}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.tint }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}

          <Text style={[styles.displayName, { color: theme.text }]}>{displayName}</Text>
          {profile.username && (
            <Text style={styles.handle}>@{profile.username}</Text>
          )}
        </View>

        {/* Stats */}
        <View style={[styles.statsCard, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.tint }]}>
              {profile.event_instantiations.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Adventures Inspired</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.tint }]}>
              {profile.global_step_completions.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Steps Completed</Text>
          </View>
        </View>

        {/* Website link */}
        {profile.website && (
          <Pressable
            style={[styles.websiteRow, { backgroundColor: theme.cardBackground }]}
            onPress={() => {
              const url = profile.website!.startsWith('http')
                ? profile.website!
                : `https://${profile.website}`;
              Linking.openURL(url).catch(() => {});
            }}
          >
            <Ionicons name="link-outline" size={16} color={theme.tint} />
            <Text style={[styles.websiteText, { color: theme.tint }]} numberOfLines={1}>
              {profile.website}
            </Text>
            <Ionicons name="open-outline" size={14} color="#aaa" style={{ marginLeft: 'auto' }} />
          </Pressable>
        )}

      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },

  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 16,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  displayName: {
    fontSize: 24,
    fontFamily: 'Chivo_700Bold',
    fontWeight: 'normal',
  },
  handle: {
    color: '#999',
    fontSize: 15,
    marginTop: 4,
  },

  statsCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'Chivo_900Black',
    fontWeight: 'normal',
  },
  statLabel: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#eee',
  },

  websiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  websiteText: {
    fontSize: 14,
    flex: 1,
  },
});
