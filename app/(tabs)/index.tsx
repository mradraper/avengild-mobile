import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors'; // Import your new Palette
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
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
  
  // Ask the phone: "Are we in Dark Mode?"
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light']; // Load the correct palette

  useEffect(() => {
    async function fetchGuide() {
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .limit(1)
        .single();

      if (error) console.error('Error:', error);
      else setGuide(data);
      
      setLoading(false);
    }

    fetchGuide();
  }, []);

  return (
    // Dynamic Background Color (Mist White or River Night)
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      
      {/* Dynamic Text Color */}
      <Text style={[styles.header, { color: theme.text }]}>Avengild Discovery</Text>
      
      {loading ? (
        <Text style={{ color: theme.text }}>Loading...</Text>
      ) : guide ? (
        <Link 
          href={{ pathname: '/guide/[id]', params: { id: guide.id } }} 
          asChild
        >
          <Pressable style={styles.card}>
            {guide.hero_media_url && (
              <Image 
                source={{ uri: guide.hero_media_url }} 
                style={styles.image} 
              />
            )}
            
            <View style={styles.textContainer}>
              {/* BRAND MOMENT: The Gold Label */}
              <Text style={styles.label}>FEATURED TRIP</Text>
              
              <Text style={styles.title}>{guide.title}</Text>
              <View style={styles.separator} />
              <Text style={styles.description}>{guide.summary}</Text>
            </View>
          </Pressable>
        </Link>
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
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    // Color is now handled dynamically in the component
  },
  card: {
    backgroundColor: 'white', // We keep cards white for now for contrast
    borderRadius: 15,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden', 
  },
  image: {
    width: '100%',
    height: 200, 
    resizeMode: 'cover',
  },
  textContainer: {
    padding: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BC8A2F', // BURNISHED GOLD (The Guild)
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a', // Keep card text dark (since card bg is white)
    marginBottom: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
});