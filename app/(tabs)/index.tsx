import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router'; // <--- NEW IMPORT
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type Guide = {
  id: string;
  title: string;
  summary: string;
  hero_media_url: string;
};

export default function HomeScreen() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter(); // <--- Initialize Router
  
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    async function fetchGuide() {
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching guide:', error);
      } else {
        setGuide(data);
      }
      setLoading(false);
    }

    fetchGuide();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      
      <Text style={[styles.header, { color: theme.text }]}>Avengild Discovery</Text>
      
      {loading ? (
        <Text style={{ color: theme.text, fontFamily: 'Chivo_400Regular' }}>Loading...</Text>
      ) : guide ? (
        // REPLACED <LINK> WITH DIRECT ONPRESS
        <Pressable 
          style={({ pressed }) => [
            styles.card, 
            { 
              backgroundColor: theme.cardBackground,
              opacity: pressed ? 0.9 : 1 // Add subtle feedback
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
            <Text style={styles.label}>FEATURED TRIP</Text>
            <Text style={[styles.title, { color: theme.text }]}>{guide.title}</Text>
            <View style={styles.separator} />
            <Text style={[styles.description, { color: theme.text }]}>{guide.summary}</Text>
          </View>
        </Pressable>
      ) : (
        <Text style={{ color: theme.text }}>No guides found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontFamily: 'Chivo_700Bold', 
    marginBottom: 30,
    textAlign: 'center',
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
    backgroundColor: '#2D3748', // You should at least see this grey box now
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