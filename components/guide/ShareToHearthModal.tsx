import React from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type UserGuild = {
  guild_id: string;
  guild: { name: string };
};

type Props = {
  visible: boolean;
  guideId: string;
  userGuilds: UserGuild[];
  onClose: () => void;
};

/**
 * Bottom-sheet modal for sharing a Guide to the Hearth of one of the user's
 * Guilds. Inserts a row into guide_access; handles the duplicate-key case
 * (error code 23505) gracefully with an "Already Posted" alert.
 */
export function ShareToHearthModal({ visible, guideId, userGuilds, onClose }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const handleShareToGuild = async (guildId: string, guildName: string) => {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('guide_access')
      .insert({
        guide_id: guideId,
        guild_id: guildId,
        granted_by: user?.id,
      });

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already Posted', `This guide is already on the ${guildName} Hearth.`);
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      Alert.alert('Success', `Posted to ${guildName}!`);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Share to Hearth</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>Select a Guild to pin this guide to:</Text>

          {userGuilds.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.text }]}>
              You haven't joined any Guilds yet.
            </Text>
          ) : (
            <FlatList
              data={userGuilds}
              keyExtractor={(item) => item.guild_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.guildRow, { borderBottomColor: theme.background }]}
                  onPress={() => handleShareToGuild(item.guild_id, item.guild.name)}
                >
                  <View style={styles.guildRowLeft}>
                    <Ionicons name="shield-outline" size={20} color={theme.tint} style={styles.guildIcon} />
                    <Text style={[styles.guildName, { color: theme.text }]}>{item.guild.name}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="#999" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '50%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold' },
  hint: { color: '#999', marginBottom: 16, fontSize: 14 },
  emptyText: { fontStyle: 'italic', fontSize: 14 },
  guildRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  guildRowLeft: { flexDirection: 'row', alignItems: 'center' },
  guildIcon: { marginRight: 12 },
  guildName: { fontSize: 16, fontWeight: 'bold' },
});
