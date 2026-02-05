import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Define what a "Guide" looks like so TypeScript is happy
type Guide = {
  id: string;
  title: string;
  summary: string; // We are adding this!
};

export default function HomeScreen() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGuide() {
      // 1. Get EVERYTHING (*) for the guide
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .limit(1)
        .single();

      if (error) {
        console.error('Error:', error);
      } else {
        setGuide(data);
      }
      setLoading(false);
    }

    fetchGuide();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Avengild Discovery</Text>
      
      {loading ? (
        <Text>Loading...</Text>
      ) : guide ? (
        // The "Card"
        <View style={styles.card}>
          <Text style={styles.label}>FEATURED TRIP</Text>
          <Text style={styles.title}>{guide.title}</Text>
          <View style={styles.separator} />
          <Text style={styles.description}>{guide.summary}</Text>
        </View>
      ) : (
        <Text>No guides found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5', // Light grey background
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 25,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5, // Android shadow
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2e78b7',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
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