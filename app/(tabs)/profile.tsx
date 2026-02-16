import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

// TYPE DEFINITIONS
type GuildMembership = {
  role_name: string;
  guild: {
    id: string;
    name: string;
    handle: string;
    banner_url: string | null;
  };
};

export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [guilds, setGuilds] = useState<GuildMembership[]>([]);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); 

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  // 1. SESSION MANAGEMENT (Runs once on mount)
  // We keep this separate to handle the auth listener
  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        if (session?.user) fetchGuilds(session.user.id);
      });
    }, [])
  );

  // 2. FETCH GUILDS
  async function fetchGuilds(userId: string) {
    const { data, error } = await supabase
      .from('guild_members')
      .select(`
        role:guild_roles(name),
        guild:guilds(id, name, handle, banner_url)
      `)
      .eq('user_id', userId);

    if (error) {
      console.error("Guild fetch error:", error);
    } else {
      // Flatten the data for easier use
      const formatted = (data || []).map((item: any) => ({
        role_name: item.role?.name || 'Member',
        guild: item.guild
      }));
      setGuilds(formatted);
    }
  }

  // --- ACTIONS ---

  async function handleAuth() {
    setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email, password,
      });
      if (error) Alert.alert('Sign Up Error', error.message);
      else Alert.alert('Success', 'Check your email for the confirmation link!');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email, password,
      });
      if (error) Alert.alert('Login Error', error.message);
      else if (data.session) {
        setSession(data.session);
        fetchGuilds(data.session.user.id);
      }
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setGuilds([]);
  }

  // --- RENDER ---

  // 1. LOADING STATE
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#BC8A2F" />
      </View>
    );
  }

  // 2. LOGGED IN VIEW (The Profile)
  if (session && session.user) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Guild Member</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.avatarContainer}>
             <Ionicons name="person-circle-outline" size={80} color={theme.tint} />
          </View>
          
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <Text style={[styles.value, { color: theme.text }]}>{session.user.email}</Text>
          
          <Text style={[styles.label, { color: theme.text, marginTop: 16 }]}>Member ID</Text>
          <Text style={[styles.value, { color: '#666', fontSize: 12 }]}>{session.user.id}</Text>
        </View>

        {/* --- NEW SECTION: MY GUILDS --- */}
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
            <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground }]}>
              <Text style={{ color: theme.text, marginBottom: 8 }}>No active memberships.</Text>
              <Link href="/guild/create" asChild>
                  <Pressable>
                      <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Start a Guild</Text>
                  </Pressable>
              </Link>
            </View>
          ) : (
            guilds.map((membership, index) => (
              <Link 
                key={index} 
                href={{ pathname: '/guild/[id]', params: { id: membership.guild.id } }} 
                asChild
              >
                <Pressable style={[styles.guildCard, { backgroundColor: theme.cardBackground }]}>
                  <View style={styles.guildIcon}>
                      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
                        {membership.guild.name.substring(0,2).toUpperCase()}
                      </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                      <Text style={[styles.guildName, { color: theme.text }]}>{membership.guild.name}</Text>
                      <Text style={[styles.guildRole, { color: theme.tabIconDefault }]}>{membership.role_name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.tabIconDefault} />
                </Pressable>
              </Link>
            ))
          )}
        </View>

        <Pressable 
            onPress={handleSignOut}
            style={({ pressed }) => [
                styles.button, 
                { backgroundColor: theme.cardBackground, borderWidth: 1, borderColor: '#BC2F38', marginTop: 40, marginBottom: 40 },
                pressed && { opacity: 0.8 }
            ]}
        >
            <Text style={[styles.buttonText, { color: '#BC2F38' }]}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // 3. LOGGED OUT VIEW (The Gate)
  return (
    <View style={[styles.container, { backgroundColor: theme.background, padding: 30, justifyContent: 'center' }]}>
      
      <View style={{ alignItems: 'center', marginBottom: 40 }}>
        <Ionicons name="shield-checkmark-outline" size={64} color="#BC8A2F" />
        <Text style={[styles.title, { color: theme.text, marginTop: 16 }]}>
            {isSignUp ? 'Join the Guild' : 'Member Access'}
        </Text>
        <Text style={{ color: '#666', textAlign: 'center', marginTop: 8 }}>
            {isSignUp 
                ? 'Create an account to track your journeys and save your progress.' 
                : 'Sign in to access your Codex and sync your checklist.'}
        </Text>
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.cardBackground }]}>
        <Ionicons name="mail-outline" size={20} color="#666" style={{ marginRight: 10 }} />
        <TextInput
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="Email address"
          placeholderTextColor="#999"
          autoCapitalize="none"
          style={[styles.input, { color: theme.text }]}
        />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.cardBackground }]}>
        <Ionicons name="lock-closed-outline" size={20} color="#666" style={{ marginRight: 10 }} />
        <TextInput
          onChangeText={(text) => setPassword(text)}
          value={password}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry={true}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text }]}
        />
      </View>

      {/* GOLD BUTTON */}
      <Pressable 
        onPress={handleAuth}
        style={({ pressed }) => [
            styles.button, 
            { backgroundColor: '#BC8A2F', marginTop: 10 },
            pressed && { opacity: 0.8 }
        ]}
      >
        <Text style={[styles.buttonText, { color: '#fff' }]}>
            {isSignUp ? 'Sign Up' : 'Sign In'}
        </Text>
      </Pressable>

      {/* TOGGLE LINK */}
      <Pressable 
        onPress={() => setIsSignUp(!isSignUp)}
        style={{ marginTop: 20, alignItems: 'center' }}
      >
        <Text style={{ color: theme.tint }}>
            {isSignUp ? 'Already have an account? Sign In' : 'New here? Create Account'}
        </Text>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20 },
  header: { marginBottom: 30, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold' },
  
  card: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  value: { fontSize: 16, marginBottom: 8 },

  // GUILD LIST STYLES
  section: { marginTop: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold' },
  emptyCard: { padding: 20, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc' },
  guildCard: { 
    flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 12 
  },
  guildIcon: { 
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee', 
    alignItems: 'center', justifyContent: 'center', marginRight: 16 
  },
  guildName: { fontSize: 16, fontWeight: 'bold' },
  guildRole: { fontSize: 12 },

  // AUTH STYLES
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 16,
  },
  input: { flex: 1, fontSize: 16 },

  button: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 18, fontWeight: 'bold' },
});