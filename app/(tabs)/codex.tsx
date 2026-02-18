import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

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

  // CORE FETCH FUNCTION
  async function fetchCodex(userId: string) {
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
      .eq('user_id', userId);

    if (error) {
      console.error(error);
    } else {
      const mockedData: CodexEntry[] = (data || []).map((item: any) => ({
        id: item.id,
        status: item.status,
        guide: Array.isArray(item.guide) ? item.guide[0] : item.guide,
        total_steps: 7,       
        completed_steps: 2,   
      }));
      setEntries(mockedData);
    }
    setLoading(false);
  }

  // FOCUS EFFECT: Runs every time you tap the tab
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function checkSession() {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isActive) return;

        if (session?.user) {
          setUser(session.user);
          fetchCodex(session.user.id);
        } else {
          setUser(null);
          setLoading(false);
        }
      }

      checkSession();

      return () => { isActive = false; };
    }, [])
  );

  const iconColor = theme.text; 

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.headerContainer}>
        <Text style={[styles.header, { color: theme.text }]}>My Codex</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : !user ? (
        // LOCKED STATE
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={iconColor} />
          <Text style={[styles.emptyText, { color: theme.text }]}>Sign in to view your history.</Text>
          <Link href="/(tabs)/profile" asChild>
             <Pressable style={{ marginTop: 20, padding: 10, backgroundColor: theme.cardBackground, borderRadius: 8 }}>
                <Text style={{ color: theme.tint, fontWeight: 'bold' }}>Go to Profile</Text>
             </Pressable>
          </Link>
        </View>
      ) : entries.length === 0 ? (
        // EMPTY STATE (Logged in, but no trips)
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
                {/* HERO IMAGE */}
                {item.guide.hero_media_url && (
                    <Image 
                        source={{ uri: item.guide.hero_media_url }} 
                        style={styles.cardImage}
                        resizeMode="cover"
                    />
                )}
                
                <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.title, { color: theme.text }]}>{item.guide.title}</Text>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
                        </View>
                    </View>

                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBar, { width: '30%', backgroundColor: '#BC8A2F' }]} />
                    </View>
                    <Text style={styles.progressText}>In Progress</Text>
                </View>
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
  
  card: {
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden', // Ensures image stays inside rounded corners
  },
  cardImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#eee',
  },
  cardContent: {
    padding: 16,
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