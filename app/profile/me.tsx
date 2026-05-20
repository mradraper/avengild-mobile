/**
 * app/profile/me.tsx — My Profile (signed-in user)
 *
 * Displays the current user's public profile data and provides Sign Out.
 * Navigated to from the profile strip on the Guilds tab.
 *
 * Reads from the `profiles` table — same columns as the public profile view:
 *   username, full_name, avatar_url, website,
 *   event_instantiations, global_step_completions
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

export default function MyProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    setEmail(user.email ?? null);

    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, website, event_instantiations, global_step_completions')
      .eq('id', user.id)
      .single();

    if (data) setProfile(data as ProfileData);
    setLoading(false);
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
            // Navigate back to Guilds tab, which will show the sign-in form.
            router.replace('/(tabs)/guilds');
          },
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // LOADING
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'My Profile', headerTintColor: theme.tint }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  const displayName = profile?.full_name
    ?? profile?.username
    ?? email?.split('@')[0]
    ?? 'Adventurer';
  const initial = displayName.charAt(0).toUpperCase();

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'My Profile',
          headerTintColor: theme.tint,
          headerBackTitle: '',
          headerTitleStyle: { fontFamily: 'Chivo_900Black', fontSize: 18 },
          headerStyle: { backgroundColor: theme.cardBackground },
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + Name ───────────────────────────────────────────────── */}
        <View style={styles.heroSection}>
          <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>

          <Text style={[styles.displayName, { color: theme.text }]}>{displayName}</Text>

          {profile?.username && (
            <Text style={[styles.handle, { color: subText }]}>@{profile.username}</Text>
          )}

          {email && (
            <Text style={[styles.email, { color: subText }]}>{email}</Text>
          )}
        </View>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        {profile && (
          <View style={[styles.statsCard, { backgroundColor: theme.cardBackground }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.tint }]}>
                {profile.event_instantiations.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: subText }]}>Adventures Inspired</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? '#2a2f40' : '#eee' }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.tint }]}>
                {profile.global_step_completions.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: subText }]}>Steps Completed</Text>
            </View>
          </View>
        )}

        {/* ── Website ─────────────────────────────────────────────────────── */}
        {profile?.website && (
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

        {/* ── Sign Out ────────────────────────────────────────────────────── */}
        <Pressable
          style={[styles.signOutBtn, { backgroundColor: theme.cardBackground, borderColor: '#BC2F38' }]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color="#BC2F38" style={{ marginRight: 8 }} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },

  heroSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarInitial: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  displayName: {
    fontSize: 24,
    fontFamily: 'Chivo_700Bold',
    fontWeight: 'normal',
  },
  handle: { fontSize: 15, marginTop: 4 },
  email:  { fontSize: 13, marginTop: 4 },

  statsCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 28,
    fontFamily: 'Chivo_900Black',
    fontWeight: 'normal',
  },
  statLabel: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  statDivider: { width: 1, height: 40 },

  websiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  websiteText: { fontSize: 14, flex: 1 },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
  },
  signOutText: { color: '#BC2F38', fontWeight: '700', fontSize: 16 },
});
