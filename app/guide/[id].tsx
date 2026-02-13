import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

// Define the shape of a "Step"
type Step = {
  id: string;
  atomic_action: string;
  curation_note: string;
  step_order: number;
};

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Get the current theme (Forest or River)
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    async function fetchSteps() {
      if (!id) return;
      
      const { data, error } = await supabase
        .from('step_cards')
        .select('*')
        .eq('guide_id', id)
        .order('step_order', { ascending: true });

      if (error) console.error('Error fetching steps:', error);
      else if (data) setSteps(data);
      
      setLoading(false);
    }

    fetchSteps();
  }, [id]);

  // Helper to choose the card background color based on mode
  const cardBackgroundColor = colorScheme === 'dark' ? '#5E3754' : '#ffffff'; // Badlands Dusk vs White
  const textColor = theme.text;
  const subTextColor = colorScheme === 'dark' ? '#ccc' : '#666';

  return (
    // Dynamic Background (Mist White or River Night)
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      
      {/* Dynamic Header */}
      <Stack.Screen 
        options={{ 
          title: 'Itinerary',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint, // Forest Green or Aurora Mint
          headerTitleStyle: { fontWeight: 'bold' },
          headerShadowVisible: false, // Cleaner look
        }} 
      />

      {loading ? (
        // Loading Spinner in Burnished Gold
        <ActivityIndicator size="large" color="#BC8A2F" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={steps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            
            // Dynamic Card Style
            <View style={[styles.stepCard, { backgroundColor: cardBackgroundColor }]}>
              
              {/* Step Number Bubble (Brand Tint) */}
              <View style={[styles.stepNumber, { backgroundColor: theme.tint }]}>
                <Text style={styles.stepNumberText}>{item.step_order}</Text>
              </View>
              
              <View style={styles.stepContent}>
                <Text style={[styles.action, { color: textColor }]}>{item.atomic_action}</Text>
                <Text style={[styles.note, { color: subTextColor }]}>{item.curation_note}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: subTextColor }]}>No steps found for this guide.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background color is handled dynamically above
  },
  listContent: {
    padding: 16,
  },
  stepCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    // Shadows for depth
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff', // Always white text inside the colored bubble
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
  },
  action: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});