import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

type Guide = {
  id: string;
  title: string;
  summary: string;
  hero_media_url: string;
};

export default function HomeScreen() {
  // 1. STATE: Now holds an array of guides instead of just one
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter(); 
  
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    async function fetchGuides() {
      // 2. QUERY: Removed limit(1) and single() to fetch all guides
      const { data, error } = await supabase
        .from('guides')
        .select('id, title, summary, hero_media_url, primary_location_name, difficulty_level, instantiation_count, total_step_completions')
        .eq('stewardship_level', 'Public')
        .eq('is_archived', false)
        .order('instantiation_count', { ascending: false })
        .order('total_step_completions', { ascending: false })
        .limit(40);

      if (error) {
        console.error('Error fetching guides:', error);
      } else {
        setGuides(data || []);
      }
      setLoading(false);
    }

    fetchGuides();
  }, []);

  // Extracted the card into a render function for the FlatList
  const renderGuide = ({ item: guide }: { item: Guide }) => (
    <Pressable 
      style={({ pressed }) => [
        styles.card, 
        { 
          backgroundColor: theme.cardBackground,
          opacity: pressed ? 0.9 : 1 
        }
      ]}
      onPress={() => router.push({ pathname: '/guide/[id]', params: { id: guide.id } })}
    >
      {guide.hero_media_url ? (
        <Image 
          source={{ uri: guide.hero_media_url }} 
          style={styles.image} 
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.image, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: '#fff' }}>No Image</Text>
        </View>
      )}
      
      <View style={styles.textContainer}>
        <Text style={styles.label}>DISCOVER</Text>
        <Text style={[styles.title, { color: theme.text }]}>{guide.title}</Text>
        <View style={styles.separator} />
        <Text style={[styles.description, { color: theme.text }]}>{guide.summary}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      
      <Text style={[styles.header, { color: theme.text }]}>Avengild Discovery</Text>
      
      {loading ? (
        <Text style={{ color: theme.text, fontFamily: 'Chivo_400Regular', textAlign: 'center' }}>Loading...</Text>
      ) : (
        // 3. LAYOUT: Using FlatList for smooth scrolling
        <FlatList
          data={guides}
          keyExtractor={(item) => item.id}
          renderItem={renderGuide}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={{ color: theme.text, textAlign: 'center' }}>No guides found.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40, 
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 28,
    fontFamily: 'Chivo_700Bold', 
    marginBottom: 20,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 40,
    gap: 24, // Adds spacing between the cards
  },
  card: {
    borderRadius: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden', 
  },
  image: {
    width: '100%',
    height: 250, 
    backgroundColor: '#2D3748', 
  },
  textContainer: {
    padding: 24,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Chivo_700Bold',
    color: '#BC8A2F',
    marginBottom: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Chivo_700Bold', 
    marginBottom: 12,
    lineHeight: 32,
  },
  separator: {
    height: 2,
    backgroundColor: '#BC8A2F',
    width: 40,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Chivo_400Regular',
    lineHeight: 26,
    opacity: 0.9,
  },
});