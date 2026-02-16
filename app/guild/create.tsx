import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

export default function CreateGuildScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'secret'>('public');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name || !handle) {
      Alert.alert("Missing Info", "Please provide a name and a unique handle.");
      return;
    }

    setLoading(true);
    
    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 2. Insert Guild 
    // The DB trigger 'on_guild_created' will auto-add you as the Guild Master
    const { data, error } = await supabase
      .from('guilds')
      .insert({
        name,
        handle: handle.toLowerCase(),
        privacy_setting: privacy,
        owner_id: user.id,
        created_by: user.id
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      // 3. Success! 
      // We will redirect to the [id] page later. For now, go back to profile.
      Alert.alert("Success", "Guild established!");
      router.back(); 
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
           <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>New Guild</Text>
      </View>

      <View style={styles.form}>
        
        {/* NAME INPUT */}
        <Text style={[styles.label, { color: theme.text }]}>Guild Name</Text>
        <TextInput 
          style={[styles.input, { color: theme.text, borderColor: theme.tabIconDefault }]}
          placeholder="e.g. Edmonton Foodies"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />

        {/* HANDLE INPUT */}
        <Text style={[styles.label, { color: theme.text }]}>Handle (Unique ID)</Text>
        <View style={[styles.inputContainer, { borderColor: theme.tabIconDefault }]}>
           <Text style={{ color: '#999', marginRight: 4 }}>@</Text>
           <TextInput 
             style={[styles.input, { flex: 1, borderWidth: 0, padding: 0, color: theme.text }]}
             placeholder="yegfoodies"
             placeholderTextColor="#999"
             value={handle}
             onChangeText={setHandle}
             autoCapitalize="none"
           />
        </View>

        {/* PRIVACY SELECTOR */}
        <Text style={[styles.label, { color: theme.text }]}>Privacy</Text>
        <View style={styles.privacyRow}>
           {['public', 'private', 'secret'].map((option) => (
             <Pressable 
               key={option}
               onPress={() => setPrivacy(option as any)}
               style={[
                 styles.privacyOption, 
                 privacy === option && { backgroundColor: theme.tint, borderColor: theme.tint }
               ]}
             >
               <Text style={[
                 styles.privacyText, 
                 privacy === option ? { color: 'white' } : { color: theme.text }
               ]}>
                 {option.toUpperCase()}
               </Text>
             </Pressable>
           ))}
        </View>
        
        {/* CREATE BUTTON */}
        <Pressable 
            style={[styles.createButton, { backgroundColor: theme.tint }]} 
            onPress={handleCreate}
            disabled={loading}
        >
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Establish Guild</Text>}
        </Pressable>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 30 },
  backButton: { padding: 8, marginRight: 10 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  
  form: { paddingHorizontal: 20 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 20 },
  
  input: { 
    borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 12 
  },
  
  privacyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  privacyOption: { 
    flex: 1, alignItems: 'center', paddingVertical: 12, 
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8 
  },
  privacyText: { fontSize: 12, fontWeight: 'bold' },
  
  createButton: { 
    marginTop: 40, padding: 16, borderRadius: 8, alignItems: 'center' 
  },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});