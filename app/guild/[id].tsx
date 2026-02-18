import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

// --- TYPES ---
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

type HearthItem = {
  type: 'idea' | 'plan';
  id: string;
  timestamp: string;
  poster: { full_name: string } | null;
  poster_id: string;
  title: string;
  subtitle: string;
  guide_id?: string;
  image_url?: string | null; // <--- NEW FIELD
  is_pinned?: boolean;
};

export default function GuildScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [guild, setGuild] = useState<GuildData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [hearthFeed, setHearthFeed] = useState<HearthItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'hearth' | 'chat' | 'members'>('hearth');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
    loadAllData();
  }, [id]);

  async function loadAllData() {
    if (!id || typeof id !== 'string') return;
    if (!guild) setLoading(true); 
    await Promise.all([fetchGuild(), fetchMembers(), fetchHearth()]);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchMembers(), fetchHearth()]);
    setRefreshing(false);
  }

  // --- ACTIONS ---

  const handleLongPress = (item: HearthItem) => {
    // Check if user owns the post (or is admin - simplified for now to owner)
    if (item.poster_id !== currentUserId) return;

    Alert.alert(
      'Manage Post',
      'Do you want to remove this from the Hearth?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive', 
          onPress: () => deletePost(item) 
        }
      ]
    );
  };

  const deletePost = async (item: HearthItem) => {
    let error;
    if (item.type === 'idea') {
      const result = await supabase.from('guide_access').delete().eq('id', item.id);
      error = result.error;
    } else {
      const result = await supabase.from('guild_events').delete().eq('id', item.id);
      error = result.error;
    }

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      // Optimistic Update
      setHearthFeed(prev => prev.filter(i => i.id !== item.id));
    }
  };

  // --- FETCHERS ---
  async function fetchGuild() {
    if (!id) return;
    const { data } = await supabase.from('guilds').select('*').eq('id', id).single();
    if (data) setGuild(data);
  }

  async function fetchMembers() {
    if (!id) return;
    const { data } = await supabase
      .from('guild_members')
      .select(`user_id, role:guild_roles(name), profile:profiles(full_name, username, avatar_url)`)
      .eq('guild_id', id);

    if (data) {
      setMembers(data.map((m: any) => ({ user_id: m.user_id, role: m.role, profile: m.profile })));
    }
  }

  async function fetchHearth() {
    if (!id) return;

    // A. Fetch "Ideas" (Shared Guides)
    // We get the hero_media_url here
    const { data: ideas } = await supabase
      .from('guide_access')
      .select(`
        id, granted_at, granted_by,
        guide:guides(id, title, summary, difficulty_level, hero_media_url),
        poster:profiles!guide_access_to_profiles_fkey(full_name)
      `)
      .eq('guild_id', id);

    // B. Fetch "Plans" (Events)
    // UPDATE: We added 'guide:guides(hero_media_url)' here too!
    const { data: plans } = await supabase
      .from('guild_events')
      .select(`
        id, start_time, title, location_name, guide_id, created_by,
        guide:guides(hero_media_url),
        poster:profiles!guild_events_to_profiles_fkey(full_name)
      `)
      .eq('guild_id', id)
      .eq('is_cancelled', false);

    // C. Merge & Sort
    const feed: HearthItem[] = [];

    if (ideas) {
      ideas.forEach((item: any) => {
        feed.push({
          type: 'idea',
          id: item.id,
          timestamp: item.granted_at,
          poster: item.poster,
          poster_id: item.granted_by,
          title: item.guide?.title || 'Unknown Guide',
          subtitle: `Suggested Idea • ${item.guide?.difficulty_level || 'Normal'}`,
          guide_id: item.guide?.id,
          image_url: item.guide?.hero_media_url // <--- Image from Guide
        });
      });
    }

    if (plans) {
      plans.forEach((item: any) => {
        feed.push({
          type: 'plan',
          id: item.id,
          timestamp: item.start_time,
          poster: item.poster,
          poster_id: item.created_by,
          title: item.title,
          subtitle: `Event • ${new Date(item.start_time).toLocaleDateString()} @ ${item.location_name || 'TBD'}`,
          guide_id: item.guide_id,
          image_url: item.guide?.hero_media_url // <--- Image from the linked Guide
        });
      });
    }

    // Sort by newest first
    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setHearthFeed(feed);
  }

  // --- RENDER ---
  const renderTab = (key: 'hearth' | 'chat' | 'members', label: string, icon: any) => (
    <Pressable 
      style={[styles.tab, activeTab === key && { borderBottomColor: theme.tint, borderBottomWidth: 3 }]}
      onPress={() => setActiveTab(key)}
    >
      <Ionicons name={icon} size={20} color={activeTab === key ? theme.tint : '#999'} />
      <Text style={[styles.tabText, { color: activeTab === key ? theme.tint : '#999' }]}>{label}</Text>
    </Pressable>
  );

  if (loading && !refreshing && !guild) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{
          title: 'Guild Hall', 
          headerTitleStyle: {
            fontFamily: 'Chivo_900Black', 
            fontSize: 20, 
          },
          headerBackTitle: '',
          headerTintColor: theme.tint,
        }} 
      />
      
      <View style={[styles.header, { backgroundColor: theme.cardBackground }]}>
        <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={[styles.guildName, { color: theme.text }]}>{guild?.name || 'Loading...'}</Text>
            <Text style={{ color: '#999' }}>@{guild?.handle}</Text>
        </View>
        <View style={styles.tabBar}>
            {renderTab('hearth', 'The Hearth', 'bonfire-outline')}
            {renderTab('chat', 'Chat', 'chatbubbles-outline')}
            {renderTab('members', 'Roster', 'people-outline')}
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 'hearth' && (
           <FlatList
             data={hearthFeed}
             keyExtractor={(item) => item.id}
             refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
             contentContainerStyle={{ padding: 16 }}
             ListEmptyComponent={
               <View style={styles.placeholderContainer}>
                   <Ionicons name="bonfire-outline" size={64} color="#ccc" />
                   <Text style={{ color: '#999', marginTop: 16 }}>The Hearth is cold.</Text>
                   <Text style={{ color: '#666', textAlign: 'center', marginTop: 8 }}>
                       Stoke the fire by sharing a Guide or planning an Event!
                   </Text>
               </View>
             }
             renderItem={({ item }) => (
               <Pressable 
                 style={({ pressed }) => [
                    styles.card, 
                    { 
                        backgroundColor: theme.cardBackground, 
                        borderLeftColor: item.type === 'plan' ? theme.tint : 'transparent', 
                        borderLeftWidth: item.type === 'plan' ? 4 : 0,
                        opacity: pressed ? 0.9 : 1
                    }
                 ]}
                 onPress={() => item.guide_id && router.push({ pathname: '/guide/[id]', params: { id: item.guide_id } })}
                 onLongPress={() => handleLongPress(item)}
                 delayLongPress={500}
               >
                 {/* NEW: HERO IMAGE BANNER */}
                 {item.image_url && (
                   <Image 
                     source={{ uri: item.image_url }} 
                     style={styles.cardImage}
                     resizeMode="cover"
                   />
                 )}

                 <View style={styles.cardContent}>
                   <View style={styles.cardHeader}>
                     <Text style={[styles.cardTitle, { color: theme.text }]}>{item.title}</Text>
                     {item.type === 'plan' && <Ionicons name="calendar" size={16} color={theme.tint} />}
                   </View>
                   
                   <Text style={{ color: '#666', marginBottom: 8 }}>{item.subtitle}</Text>
                   
                   <View style={styles.cardFooter}>
                     <Text style={styles.posterText}>
                       {item.type === 'idea' ? 'Shared by' : 'Organized by'} {item.poster?.full_name || 'Member'}
                     </Text>
                     <Text style={styles.timeText}>
                        {new Date(item.timestamp).toLocaleDateString()}
                     </Text>
                   </View>
                 </View>
               </Pressable>
             )}
           />
        )}

        {/* Keeping other tabs same as before... */}
        {activeTab === 'chat' && (
            <View style={styles.placeholderContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
                <Text style={{ color: '#999', marginTop: 16 }}>Guild Chat Coming Soon</Text>
            </View>
        )}

        {activeTab === 'members' && (
            <FlatList
                data={members}
                keyExtractor={(item) => item.user_id}
                contentContainerStyle={{ padding: 20 }}
                renderItem={({ item }) => (
                    <View style={[styles.memberCard, { backgroundColor: theme.cardBackground }]}>
                        <Image source={{ uri: item.profile?.avatar_url || 'https://via.placeholder.com/50' }} style={styles.avatar} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.memberName, { color: theme.text }]}>{item.profile?.full_name}</Text>
                            <Text style={{ color: '#999', fontSize: 12 }}>@{item.profile?.username}</Text>
                        </View>
                        <View style={[styles.roleBadge, { backgroundColor: '#eee' }]}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#666' }}>{item.role?.name.toUpperCase()}</Text>
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
  container: { flex: 1 },
  header: { paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#eee' },
  guildName: { 
    fontSize: 28, 
    fontFamily: 'Chivo_900Black', // <--- This calls the heavy weight
    fontWeight: 'normal', // Reset bold so the font file handles it
    marginBottom: 4,
    textTransform: 'uppercase', // Optional: Makes it look more like a sign
    letterSpacing: 1
  },
  
  tabBar: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  
  content: { flex: 1 },
  placeholderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  
  // CARD STYLES
  card: { 
    borderRadius: 12, 
    marginBottom: 12, 
    marginHorizontal: 4, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 3, 
    overflow: 'hidden' 
  },
  cardImage: { 
    width: '100%', 
    height: 150, 
    backgroundColor: '#eee' // Grey placeholder while loading
  }, 
  cardContent: { 
    padding: 16 
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  
  // TEXT STYLES
  posterText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  timeText: { fontSize: 12, color: '#999' },
  
  // MEMBER CARD STYLES
  memberCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  memberName: { fontSize: 16, fontWeight: 'bold' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
});