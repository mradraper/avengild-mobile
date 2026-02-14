import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Step = {
  id: string;
  atomic_action: string;
  curation_note: string;
  step_order: number;
};

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Track completed step IDs
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      
      try {
        // 1. Fetch Steps
        const { data } = await supabase
          .from('step_cards')
          .select('*')
          .eq('guide_id', id)
          .order('step_order', { ascending: true });

        if (data) setSteps(data);

        // 2. Fetch Progress (Silent fail if anon/offline)
        try {
          const progress = await Codex.getGuideProgress(id);
          if (progress.length > 0) setCompletedSteps(new Set(progress));
        } catch (e) {
          console.log('Codex: User is anonymous or offline');
        }

      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const handleStepPress = (stepId: string) => {
    // 1. Immediate Visual Update (Optimistic)
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId); // Uncheck
      } else {
        next.add(stepId);    // Check
      }
      return next;
    });

    // 2. Save to DB (Fire and Forget)
    Codex.completeStep(id!, stepId).catch(err => {
      console.log('Codex Save Failed (Anon User):', err.message);
      // Optional: We could revert the checkmark here if we wanted to be strict
    });
  };

  const cardBackgroundColor = theme.cardBackground;
  const textColor = theme.text;
  const subTextColor = colorScheme === 'dark' ? '#ccc' : '#666';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{ 
          title: 'Itinerary',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }} 
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={steps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isCompleted = completedSteps.has(item.id);

            return (
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => handleStepPress(item.id)}
                style={[
                  styles.stepCard, 
                  { backgroundColor: cardBackgroundColor },
                  isCompleted && { opacity: 0.8 } // Dim slightly if done
                ]}
              >
                  {/* DYNAMIC BUBBLE */}
                  <View style={[
                    styles.stepNumber, 
                    { backgroundColor: isCompleted ? '#A9E1A1' : theme.tint }
                  ]}>
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={20} color="#1a1a1a" />
                    ) : (
                      <Text style={styles.stepNumberText}>{item.step_order}</Text>
                    )}
                  </View>
                  
                  <View style={styles.stepContent}>
                    <Text style={[
                      styles.action, 
                      { 
                        color: textColor,
                        textDecorationLine: isCompleted ? 'line-through' : 'none',
                        textDecorationStyle: 'solid',
                        opacity: isCompleted ? 0.6 : 1
                      }
                    ]}>
                      {item.atomic_action}
                    </Text>
                    <Text style={[styles.note, { color: subTextColor }]}>{item.curation_note}</Text>
                  </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16 },
  stepCard: {
    flexDirection: 'row',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: { color: '#fff', fontWeight: 'bold' },
  stepContent: { flex: 1, justifyContent: 'center' },
  action: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  note: { fontSize: 14, lineHeight: 20 },
});