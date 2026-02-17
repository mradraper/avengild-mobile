import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Codex } from '@/lib/codex';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Step = {
  id: string;
  atomic_action: string;
  curation_note: string;
  step_order: number;
};

type UserGuild = {
  guild_id: string;
  guild: { name: string };
};

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [userGuilds, setUserGuilds] = useState<UserGuild[]>([]);
  
  // Track completed step IDs
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    loadData();
    fetchUserGuilds(); // Pre-load guilds for the share menu
  }, [id]);

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

  // Fetch the list of guilds the user belongs to
  async function fetchUserGuilds() {
    const { data } = await supabase
      .from('guild_members')
      .select('guild_id, guild:guilds(name)')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      
    if (data) setUserGuilds(data as any);
  }

  // --- ACTIONS ---

  const handleStepPress = (stepId: string) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

    Codex.completeStep(id!, stepId).catch(err => {
      console.log('Codex Save Failed (Anon User):', err.message);
    });
  };

  const handleShareToGuild = async (guildId: string, guildName: string) => {
    if (!id) return;

    // The "Airlock" Insert
    const { error } = await supabase
      .from('guide_access')
      .insert({
        guide_id: id,
        guild_id: guildId,
        granted_by: (await supabase.auth.getUser()).data.user?.id
      });

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        Alert.alert('Already Posted', `This guide is already on the ${guildName} Hearth.`);
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      Alert.alert('Success', `Posted to ${guildName}!`);
      setShowShareModal(false);
    }
  };

  // --- STYLES ---
  const cardBackgroundColor = theme.cardBackground;
  const textColor = theme.text;
  const subTextColor = colorScheme === 'dark' ? '#ccc' : '#666';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{ 
          title: 'Guide Details',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowShareModal(true)} style={{ marginRight: 10 }}>
              <Ionicons name="bonfire-outline" size={24} color={theme.tint} />
            </TouchableOpacity>
          )
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
                  isCompleted && { opacity: 0.8 } 
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

      {/* SHARE MODAL */}
      <Modal
        visible={showShareModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowShareModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Share to Hearth</Text>
              <TouchableOpacity onPress={() => setShowShareModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ color: '#999', marginBottom: 16 }}>
              Select a Guild to pin this guide to:
            </Text>

            {userGuilds.length === 0 ? (
               <Text style={{ color: theme.text, fontStyle: 'italic' }}>You haven't joined any Guilds yet.</Text>
            ) : (
              <FlatList 
                data={userGuilds}
                keyExtractor={(item) => item.guild_id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.guildOption, { borderBottomColor: theme.background }]}
                    onPress={() => handleShareToGuild(item.guild_id, item.guild.name)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                       <Ionicons name="shield-outline" size={20} color={theme.tint} style={{ marginRight: 12 }} />
                       <Text style={[styles.guildOptionText, { color: theme.text }]}>{item.guild.name}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color="#999" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

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

  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '50%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  guildOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  guildOptionText: { fontSize: 16, fontWeight: 'bold' },
});