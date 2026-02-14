import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

type CodexEntry = {
  id: string;
  status: string;
  guide: {
    id: string;
    title: string;
    summary: string;
    hero_media_url: string;
  };
  total_steps: number;
  completed_steps: number;
};

export default function CodexScreen() {
  const [entries, setEntries] = useState<CodexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    async function fetchCodex() {
      // 1. Check User
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (!user) {
        setLoading(false);
        return;
      }

      // 2. Fetch Entries
      const { data, error } = await supabase
        .from('codex_entries')
        .select(`
          id,
          status,
          guide:guides (
            id,
            title,
            summary,
            hero_media_url
          )
        `)
        .eq('user_id', user.id);

      if (error) console.error(error);
      
      // 3. Map Data safely to satisfy TypeScript
      const mockedData: CodexEntry[] = (data || []).map((item: any) => ({
        id: item.id,
        status: item.status,
        // Handle case where Supabase returns guide as an array or object
        guide: Array.isArray(item.guide) ? item.guide[0] : item.guide,
        total_steps: 7,       // Placeholder
        completed_steps: 2,   // Placeholder
      }));

      setEntries(mockedData);
      setLoading(false);
    }

    fetchCodex();
  }, []);

  // Icon Color: Use Text color (White in dark mode) instead of generic grey
  const iconColor = theme.text; 

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.headerContainer}>
        <Text style={[styles.header, { color: theme.text }]}>My Codex</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.tint} />
      ) : !user ? (
        // EMPTY STATE: NOT LOGGED IN
        <View style={styles.center}>
          {/* Updated Icon Color for better contrast */}
          <Ionicons name="lock-closed-outline" size={48} color={iconColor} />
          <Text style={[styles.emptyText, { color: theme.text }]}>Sign in to view your history.</Text>
          <Text style={[styles.subText, { color: theme.text, opacity: 0.7 }]}>
            Go to the Profile tab to log in.
          </Text>
        </View>
      ) : entries.length === 0 ? (
        // EMPTY STATE: NO TRIPS
        <View style={styles.center}>
          <Ionicons name="compass-outline" size={48} color={iconColor} />
          <Text style={[styles.emptyText, { color: theme.text }]}>You haven't started any trips yet.</Text>
          <Link href="/" asChild>
            <Pressable style={{ marginTop: 20 }}>
              <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Find a Guide</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        // THE LIST
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Link 
              href={{ pathname: '/guide/[id]', params: { id: item.guide.id } }} 
              asChild
            >
              <Pressable style={[styles.card, { backgroundColor: theme.cardBackground }]}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.title, { color: theme.text }]}>{item.guide.title}</Text>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
                    </View>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: '30%', backgroundColor: '#BC8A2F' }]} />
                </View>
                <Text style={styles.progressText}>2 / 7 Steps Complete</Text>

              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  headerContainer: { paddingHorizontal: 20, marginBottom: 20 },
  header: { fontSize: 32, fontWeight: 'bold' },
  list: { paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  subText: { marginTop: 8, fontSize: 14 },
  
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: 'bold' },
  badge: { backgroundColor: '#F0F4F8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#666' },
  
  progressContainer: {
    height: 6,
    backgroundColor: '#eee',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: { height: '100%' },
  progressText: { fontSize: 12, color: '#666' },
});