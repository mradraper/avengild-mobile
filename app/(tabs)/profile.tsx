import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // Toggle between Login/Signup

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    // 1. Get Initial Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 2. Listen for Changes (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- ACTIONS ---

  async function handleAuth() {
    setLoading(true);
    if (isSignUp) {
      // SIGN UP
      const { error } = await supabase.auth.signUp({
        email: email,
        password: password,
      });
      if (error) Alert.alert('Sign Up Error', error.message);
      else Alert.alert('Success', 'Check your email for the confirmation link!');
    } else {
      // SIGN IN
      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });
      if (error) Alert.alert('Login Error', error.message);
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
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
      <View style={[styles.container, { backgroundColor: theme.background }]}>
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

        <Pressable 
            onPress={handleSignOut}
            style={({ pressed }) => [
                styles.button, 
                { backgroundColor: theme.cardBackground, borderWidth: 1, borderColor: '#BC2F38' },
                pressed && { opacity: 0.8 }
            ]}
        >
            <Text style={[styles.buttonText, { color: '#BC2F38' }]}>Sign Out</Text>
        </Pressable>
      </View>
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