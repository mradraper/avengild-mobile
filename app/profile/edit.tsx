/**
 * app/profile/edit.tsx
 *
 * Edit the current user's own profile: bio and location_name (added by
 * Migration 018). Full_name and username editing is intentionally excluded
 * here — those fields are set once at sign-up.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function ProfileEditScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [bio, setBio] = useState('');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from('profiles')
      .select('bio, location_name')
      .eq('id', user.id)
      .single();

    if (data) {
      setBio(data.bio ?? '');
      setLocationName(data.location_name ?? '');
    }
    setLoading(false);
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        bio: bio.trim() || null,
        location_name: locationName.trim() || null,
      })
      .eq('id', userId);
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <Stack.Screen options={{ title: 'Edit Profile', headerTintColor: theme.tint }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Edit Profile',
          headerTintColor: theme.tint,
          headerBackTitle: '',
          headerTitleStyle: { fontFamily: 'Chivo_700Bold', fontSize: 17 },
          headerStyle: { backgroundColor: theme.cardBackground },
          headerRight: () => (
            <Pressable onPress={save} disabled={saving} style={{ paddingHorizontal: 8 }}>
              {saving
                ? <ActivityIndicator size="small" color={theme.tint} />
                : <Text style={[styles.saveBtn, { color: theme.tint }]}>Save</Text>
              }
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Location */}
        <Text style={[styles.label, { color: '#999' }]}>Location</Text>
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.cardBackground, borderColor: '#ddd' }]}
          placeholder="e.g. Edmonton, AB"
          placeholderTextColor="#aaa"
          value={locationName}
          onChangeText={setLocationName}
          maxLength={100}
          returnKeyType="next"
        />

        {/* Bio */}
        <Text style={[styles.label, { color: '#999' }]}>Bio</Text>
        <TextInput
          style={[
            styles.input,
            styles.bioInput,
            { color: theme.text, backgroundColor: theme.cardBackground, borderColor: '#ddd' },
          ]}
          placeholder="Tell others a bit about yourself — your passions, areas of expertise, favourite adventures…"
          placeholderTextColor="#aaa"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{bio.length} / 500</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 16 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  bioInput: {
    minHeight: 120,
    paddingTop: 12,
  },
  charCount: { fontSize: 11, color: '#aaa', textAlign: 'right', marginTop: 4 },
  saveBtn: { fontSize: 16, fontWeight: '700' },
});
