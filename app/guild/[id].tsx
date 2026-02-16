import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

type GuildData = {
  id: string;
  name: string;
  handle: string;
  description: string;
  banner_url: string | null;
  owner_id: string;
};

type MemberData = {
  user_id: string;
  role: { name: string };
  profile: { full_name: string; username: string; avatar_url: string | null };
};

type BoardItem = {
  id: string;
  is_pinned: boolean;
  shared_at: string;
  guide: {
    id: string;
    title: string;
    summary: string;
    difficulty_level: string;
  };
  sharer: {
    full_name: string;
  };
};

export default function GuildScreen() {
  const { id } = useLocalSearchParams(); // Get the ID from the URL
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [guild, setGuild] = useState<GuildData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'board' | 'chat' | 'members'>('board');
  const [boardItems, setBoardItems] = useState<BoardItem[]>([]);

  useEffect(() => {
    fetchGuildDetails();
  }, [id]);

  async function fetchGuildDetails() {
    if (!id || typeof id !== 'string') return;

    // 1. Fetch Guild Info
    const { data: guildData, error: guildError } = await supabase
      .from('guilds')
      .select('*')
      .eq('id', id)
      .single();

    if (guildError) {
      console.error("Error fetching guild:", guildError);
      setLoading(false);
      return;
    }
    setGuild(guildData);

    // 2. Fetch Members (for the Roster tab)
    const { data: memberData, error: memberError } = await supabase
      .from('guild_members')
      .select(`
        user_id,
        role:guild_roles(name),
        profile:profiles(full_name, username, avatar_url)
      `)
      .eq('guild_id', id);

    if (!memberError && memberData) {
      // Clean up the data structure
      const cleanedMembers = memberData.map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        profile: m.profile
      }));
      setMembers(cleanedMembers);
    }

    // 3. NEW: Fetch Board Items (Guild Guides)
    const { data: boardData, error: boardError } = await supabase
      .from('guild_guides')
      .select(`
        id,
        is_pinned,
        shared_at,
        guide:guides(id, title, summary, difficulty_level),
        sharer:profiles!guild_guides_shared_by_fkey(full_name)
      `)
      .eq('guild_id', id)
      .order('is_pinned', { ascending: false })
      .order('shared_at', { ascending: false });

    if (!boardError && boardData) {
      setBoardItems(boardData as any);
    }

    setLoading(false);
  }

  // --- RENDER HELPERS ---

  const renderTabButton = (tab: 'board' | 'chat' | 'members', label: string, icon: any) => (
    <Pressable 
      style={[styles.tab, activeTab === tab && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}
      onPress={() => setActiveTab(tab)}
    >
      <Ionicons name={icon} size={20} color={activeTab === tab ? theme.tint : '#999'} />
      <Text style={[styles.tabText, { color: activeTab === tab ? theme.tint : '#999' }]}>{label}</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!guild) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.text }}>Guild not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      
      {/* 1. HEADER */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={{ padding: 8 }}>
                <Ionicons name="arrow-back" size={24} color={theme.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center', marginRight: 40 }}>
                <Text style={[styles.guildName, { color: theme.text }]}>{guild.name}</Text>
                <Text style={{ color: '#999' }}>@{guild.handle}</Text>
            </View>
        </View>
        
        {/* TAB BAR */}
        <View style={styles.tabBar}>
            {renderTabButton('board', 'Board', 'newspaper-outline')}
            {renderTabButton('chat', 'Chat', 'chatbubbles-outline')}
            {renderTabButton('members', 'Roster', 'people-outline')}
        </View>
      </View>

      {/* 2. CONTENT AREA */}
      <View style={styles.content}>
        
        {/* A. BOARD */}
        {activeTab === 'board' && (
            <FlatList
                data={boardItems}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 20 }}
                ListEmptyComponent={
                  <View style={styles.placeholderContainer}>
                      <Ionicons name="newspaper-outline" size={64} color="#ccc" />
                      <Text style={{ color: '#999', marginTop: 16 }}>The Board is empty.</Text>
                      <Text style={{ color: '#666', textAlign: 'center', marginTop: 8 }}>
                          Be the first to pin a Guide or Event to this Guild Hall!
                      </Text>
                  </View>
                }
                renderItem={({ item }) => (
                    <Pressable 
                      style={[styles.boardCard, { backgroundColor: theme.cardBackground }]}
                      onPress={() => router.push({ pathname: '/guide/[id]', params: { id: item.guide.id } })}
                    >
                        <View style={styles.boardCardHeader}>
                          <Text style={[styles.guideTitle, { color: theme.text }]}>{item.guide.title}</Text>
                          {item.is_pinned && <Ionicons name="pin" size={16} color={theme.tint} />}
                        </View>
                        
                        <Text style={[styles.guideSummary, { color: '#666' }]} numberOfLines={2}>
                          {item.guide.summary}
                        </Text>
                        
                        <View style={styles.boardCardFooter}>
                          <Text style={styles.sharerText}>Shared by {item.sharer?.full_name}</Text>
                          <View style={[styles.difficultyBadge, { backgroundColor: '#eee' }]}>
                             <Text style={styles.difficultyText}>{item.guide.difficulty_level}</Text>
                          </View>
                        </View>
                    </Pressable>
                )}
            />
        )}

        {/* B. CHAT (Placeholder) */}
        {activeTab === 'chat' && (
            <View style={styles.placeholderContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 16 }}>Guild Chat Coming Soon</Text>
            </View>
        )}

        {/* C. ROSTER (Real Data) */}
        {activeTab === 'members' && (
            <FlatList
                data={members}
                keyExtractor={(item) => item.user_id}
                contentContainerStyle={{ padding: 20 }}
                renderItem={({ item }) => (
                    <View style={[styles.memberCard, { backgroundColor: theme.cardBackground }]}>
                        <Image 
                            source={{ uri: item.profile?.avatar_url || 'https://via.placeholder.com/50' }} 
                            style={styles.avatar} 
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.memberName, { color: theme.text }]}>
                                {item.profile?.full_name || 'Unknown Explorer'}
                            </Text>
                            <Text style={{ color: '#999', fontSize: 12 }}>@{item.profile?.username}</Text>
                        </View>
                        <View style={[styles.roleBadge, { backgroundColor: '#eee' }]}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#666' }}>
                                {item.role?.name.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                )}
            />
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#eee' },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 16 },
  guildName: { fontSize: 20, fontWeight: 'bold' },
  
  tabBar: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  
  content: { flex: 1 },
  
  placeholderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  
  memberCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  memberName: { fontSize: 16, fontWeight: 'bold' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },

  boardCard: { padding: 16, borderRadius: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  boardCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  guideTitle: { fontSize: 18, fontWeight: 'bold' },
  guideSummary: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  boardCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  sharerText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  difficultyBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  difficultyText: { fontSize: 10, fontWeight: 'bold', color: '#BC8A2F' },
});