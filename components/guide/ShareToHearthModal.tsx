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
  guideTitle?: string;
  userGuilds: UserGuild[];
  onClose: () => void;
};

/**
 * Bottom-sheet modal for sharing a Guide to the Hearth of one of the user's
 * Guilds. Inserts a row into guide_access; handles the duplicate-key case
 * (error code 23505) gracefully with an "Already Posted" alert.
 */
export function ShareToHearthModal({ visible, guideId, guideTitle, userGuilds, onClose }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const handleShareToHearth = async (guildId: string, guildName: string) => {
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
      Alert.alert('Success', `Posted to ${guildName} Hearth!`);
      onClose();
    }
  };

  const handleShareToForum = async (guildId: string, guildName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const title = guideTitle ? `Guide: ${guideTitle}` : 'Shared Guide';
    const body = guideTitle
      ? `I wanted to share the guide "${guideTitle}" with the guild. Check it out and let me know your thoughts!`
      : 'Check out this guide — happy to discuss it here.';

    const { error } = await supabase.from('forum_threads').insert({
      guild_id: guildId,
      author_id: user.id,
      title,
      body,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Posted to Forum', `Thread created in ${guildName} Forums.`);
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
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Share to Guild</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>Choose a guild and where to share:</Text>

          {userGuilds.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.text }]}>
              You haven't joined any Guilds yet.
            </Text>
          ) : (
            <FlatList
              data={userGuilds}
              keyExtractor={(item) => item.guild_id}
              renderItem={({ item }) => (
                <View style={[styles.guildRow, { borderBottomColor: theme.background }]}>
                  <View style={styles.guildRowLeft}>
                    <Ionicons name="shield-outline" size={20} color={theme.tint} style={styles.guildIcon} />
                    <Text style={[styles.guildName, { color: theme.text }]}>{item.guild.name}</Text>
                  </View>
                  <View style={styles.guildActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: theme.tint }]}
                      onPress={() => handleShareToHearth(item.guild_id, item.guild.name)}
                    >
                      <Ionicons name="bonfire-outline" size={14} color={theme.tint} />
                      <Text style={[styles.actionBtnText, { color: theme.tint }]}>Hearth</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: '#888' }]}
                      onPress={() => handleShareToForum(item.guild_id, item.guild.name)}
                    >
                      <Ionicons name="newspaper-outline" size={14} color="#888" />
                      <Text style={[styles.actionBtnText, { color: '#888' }]}>Forum</Text>
                    </TouchableOpacity>
                  </View>
                </View>
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
  guildRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  guildRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  guildIcon: { marginRight: 12 },
  guildName: { fontSize: 15, fontWeight: 'bold', flex: 1 },
  guildActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
});
