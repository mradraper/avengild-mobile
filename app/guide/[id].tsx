import { supabase } from '@/lib/supabase';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

// Define the shape of a "Step" based on your DB_SCHEMA.md
type Step = {
  id: string;
  atomic_action: string; // The title of the step
  curation_note: string; // The description
  step_order: number;
};

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams(); // Grab the ID from the URL
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSteps() {
      if (!id) return;

      console.log('Fetching steps for Guide ID:', id);

      const { data, error } = await supabase
        .from('step_cards') // Your table name
        .select('*')
        .eq('guide_id', id)
        .order('step_order', { ascending: true }); // Sort by 1, 2, 3...

      if (error) {
        console.error('Error fetching steps:', error);
      } else if (data) {
        console.log('Found steps:', data.length);
        setSteps(data);
      }
      setLoading(false);
    }

    fetchSteps();
  }, [id]);

  return (
    <View style={styles.container}>
      {/* Configure the Header Title dynamically */}
      <Stack.Screen options={{ title: 'Itinerary' }} />

      {loading ? (
        <ActivityIndicator size="large" color="#2e78b7" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={steps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.stepCard}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{item.step_order}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.action}>{item.atomic_action}</Text>
                <Text style={styles.note}>{item.curation_note}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No steps found for this guide.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  stepCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e1f5fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#0288d1',
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  action: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  note: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  empty: {
    textAlign: 'center',
    marginTop: 50,
    color: '#999',
    fontSize: 16,
  },
});