import ChatView from '@/components/chat/ChatView';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, Keyboard, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  image_url?: string | null;
  is_pinned?: boolean;
};

type ForumThread = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  author_id: string;
  author: { full_name: string; username: string } | null;
  reply_count: number;
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
  // Lazily resolved: undefined until the first message is sent or the thread
  // is discovered from the DB. ChatView handles creation automatically.
  const [chatThreadId, setChatThreadId] = useState<string | undefined>(undefined);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Default tab is Chat — the primary social interaction surface of a Guild.
  const [activeTab, setActiveTab] = useState<'hearth' | 'chat' | 'forums' | 'roster'>('chat');

  // --- FORUMS STATE ---
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [forumsLoaded, setForumsLoaded] = useState(false);
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadBody, setNewThreadBody] = useState('');
  const [savingThread, setSavingThread] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // When the keyboard opens in Chat tab, collapse the Guild header so the
  // full screen height is available for messages and the input bar.
  const headerAnim = useRef(new Animated.Value(1)).current;
  const [chatKeyboardOpen, setChatKeyboardOpen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      if (activeTab === 'chat') {
        setChatKeyboardOpen(true);
        Animated.timing(headerAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: false,
        }).start();
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setChatKeyboardOpen(false);
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [activeTab]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
    loadAllData();
  }, [id]);

  async function loadAllData() {
    if (!id || typeof id !== 'string') return;
    if (!guild) setLoading(true);
    await Promise.all([fetchGuild(), fetchMembers(), fetchHearth(), fetchChatThread()]);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    const tasks: Promise<any>[] = [fetchMembers(), fetchHearth()];
    if (activeTab === 'forums') tasks.push(fetchThreads());
    await Promise.all(tasks);
    setRefreshing(false);
  }

  // Lazy-load forums when tab first opened; also resolve role for pin/admin controls.
  useEffect(() => {
    if (activeTab === 'forums' && !forumsLoaded) {
      fetchThreads();
      if (currentUserId) resolveCurrentUserRole();
    }
  }, [activeTab, forumsLoaded, currentUserId]);

  // --- ACTIONS ---

  async function handleLeaveGuild() {
    if (!currentUserId || !id) return;
    Alert.alert(
      'Leave Guild',
      `Are you sure you want to leave ${guild?.name ?? 'this guild'}? You will need to apply again to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('guild_members')
              .delete()
              .eq('guild_id', id)
              .eq('user_id', currentUserId);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              router.replace('/(tabs)/guilds');
            }
          },
        },
      ],
    );
  }

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

  // Look up the guild's existing chat thread (if one has already been created).
  // ChatView will create it lazily on first send if it doesn't exist yet.
  async function fetchChatThread() {
    if (!id) return;
    const { data } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('guild_id', id)
      .maybeSingle();
    if (data) setChatThreadId(data.id);
  }

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

  // --- FORUMS ---

  async function fetchThreads() {
    if (!id || typeof id !== 'string') return;
    const { data } = await supabase
      .from('forum_threads')
      .select('id, title, body, is_pinned, created_at, author_id')
      .eq('guild_id', id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (!data) return;

    // Fetch author profiles + reply counts in parallel
    const authorIds = [...new Set(data.map((t: any) => t.author_id))];
    const [profilesResult, countsResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, username').in('id', authorIds),
      Promise.all(
        data.map((t: any) =>
          supabase.from('forum_replies').select('id', { count: 'exact', head: true }).eq('thread_id', t.id)
        )
      ),
    ]);

    const profileMap: Record<string, { full_name: string; username: string }> = {};
    (profilesResult.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    setThreads(
      data.map((t: any, i: number) => ({
        ...t,
        author: profileMap[t.author_id] ?? null,
        reply_count: countsResult[i].count ?? 0,
      }))
    );
    setForumsLoaded(true);
  }

  async function resolveCurrentUserRole() {
    if (!id || !currentUserId) return;
    const { data } = await supabase
      .from('guild_members')
      .select('role:guild_roles(name)')
      .eq('guild_id', id)
      .eq('user_id', currentUserId)
      .maybeSingle();
    if (data) setCurrentUserRole((data as any).role?.name ?? null);
  }

  async function createThread() {
    if (!id || !currentUserId || !newThreadTitle.trim() || !newThreadBody.trim()) return;
    setSavingThread(true);
    const { error } = await supabase.from('forum_threads').insert({
      guild_id: id,
      author_id: currentUserId,
      title: newThreadTitle.trim(),
      body: newThreadBody.trim(),
    });
    setSavingThread(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setNewThreadTitle('');
    setNewThreadBody('');
    setShowNewThreadModal(false);
    fetchThreads();
  }

  // --- RENDER ---
  const renderTab = (key: 'hearth' | 'chat' | 'forums' | 'roster', label: string, icon: any) => (
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
          // When the chat keyboard is open, collapse the native header and
          // show a focused "[Guild] Chat" title. The back button in this state
          // dismisses the keyboard (returning to Guild Hall view) rather than
          // navigating all the way back to the Guilds list.
          title: chatKeyboardOpen ? `${guild?.name ?? 'Guild'} Chat` : 'Guild Hall',
          headerTitleStyle: {
            fontFamily: 'Chivo_900Black',
            fontSize: chatKeyboardOpen ? 17 : 20,
          },
          headerBackTitle: '',
          headerTintColor: theme.tint,
          headerLeft: chatKeyboardOpen ? () => (
            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={12}
              style={{ paddingHorizontal: 8 }}
            >
              <Ionicons name="chevron-back" size={28} color={theme.tint} />
            </Pressable>
          ) : undefined,
          headerRight: !chatKeyboardOpen && currentUserId && guild?.owner_id === currentUserId ? () => (
            <Pressable
              onPress={() => router.push({ pathname: '/guild/settings', params: { id: id as string } })}
              hitSlop={12}
              style={{ paddingHorizontal: 8 }}
            >
              <Ionicons name="settings-outline" size={22} color={theme.tint} />
            </Pressable>
          ) : undefined,
        }}
      />

      {/* Guild identity + tab bar — animated out when chat keyboard opens */}
      <Animated.View
        style={[
          styles.header,
          { backgroundColor: theme.cardBackground },
          {
            maxHeight: headerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 200],
            }),
            opacity: headerAnim,
            overflow: 'hidden',
          },
        ]}
      >
        <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={[styles.guildName, { color: theme.text }]}>{guild?.name || 'Loading...'}</Text>
            <Text style={{ color: '#999' }}>@{guild?.handle}</Text>
        </View>
        <View style={styles.tabBar}>
            {renderTab('hearth',  'Hearth',  'bonfire-outline')}
            {renderTab('chat',    'Chat',    'chatbubbles-outline')}
            {renderTab('forums',  'Forums',  'newspaper-outline')}
            {renderTab('roster',  'Roster',  'people-outline')}
        </View>
      </Animated.View>

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

        {activeTab === 'chat' && typeof id === 'string' && (
          <ChatView
            threadId={chatThreadId}
            guildId={id}
            onThreadCreated={(tid) => setChatThreadId(tid)}
          />
        )}

        {/* Forums — threaded discussion board */}
        {activeTab === 'forums' && (
          <>
            <FlatList
              data={threads}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                forumsLoaded ? (
                  <View style={styles.placeholderContainer}>
                    <Ionicons name="newspaper-outline" size={64} color="#ccc" />
                    <Text style={{ color: '#999', marginTop: 16, fontSize: 17, fontWeight: 'bold' }}>
                      No threads yet
                    </Text>
                    <Text style={{ color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                      Start the conversation — tap the button below to post the first thread.
                    </Text>
                  </View>
                ) : <ActivityIndicator style={{ marginTop: 40 }} color={theme.tint} />
              }
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.threadCard,
                    { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
                  ]}
                  onPress={() =>
                    router.push({ pathname: '/forum/[threadId]', params: { threadId: item.id, guildId: id as string } })
                  }
                >
                  <View style={styles.threadCardHeader}>
                    {item.is_pinned && (
                      <Ionicons name="pin" size={14} color={theme.tint} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[styles.threadTitle, { color: theme.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={styles.threadPreview} numberOfLines={2}>{item.body}</Text>
                  <View style={styles.threadMeta}>
                    <Text style={styles.threadMetaText}>
                      {item.author?.full_name ?? 'Member'} · {new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="chatbubble-outline" size={13} color="#999" style={{ marginRight: 4 }} />
                      <Text style={styles.threadMetaText}>{item.reply_count}</Text>
                    </View>
                  </View>
                </Pressable>
              )}
            />
            {/* New Thread FAB */}
            <Pressable
              style={[styles.fab, { backgroundColor: theme.tint }]}
              onPress={() => setShowNewThreadModal(true)}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </Pressable>

            {/* New Thread Modal */}
            <Modal
              visible={showNewThreadModal}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setShowNewThreadModal(false)}
            >
              <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowNewThreadModal(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </Pressable>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>New Thread</Text>
                  <Pressable
                    onPress={createThread}
                    disabled={savingThread || !newThreadTitle.trim() || !newThreadBody.trim()}
                  >
                    {savingThread ? (
                      <ActivityIndicator size="small" color={theme.tint} />
                    ) : (
                      <Text style={[styles.modalPost, { color: newThreadTitle.trim() && newThreadBody.trim() ? theme.tint : '#999' }]}>
                        Post
                      </Text>
                    )}
                  </Pressable>
                </View>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                  <TextInput
                    style={[styles.threadTitleInput, { color: theme.text, borderBottomColor: theme.tint + '44' }]}
                    placeholder="Thread title"
                    placeholderTextColor="#999"
                    value={newThreadTitle}
                    onChangeText={setNewThreadTitle}
                    maxLength={200}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.threadBodyInput, { color: theme.text }]}
                    placeholder="Share your thoughts, trip report, question, or resource…"
                    placeholderTextColor="#999"
                    value={newThreadBody}
                    onChangeText={setNewThreadBody}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                  />
                </ScrollView>
              </View>
            </Modal>
          </>
        )}

        {/* Roster — accessible as a 4th tab, not in the primary three */}
        {activeTab === 'roster' && (
            <FlatList
                data={members}
                keyExtractor={(item) => item.user_id}
                contentContainerStyle={{ padding: 20 }}
                renderItem={({ item }) => (
                    <Pressable
                      style={[styles.memberCard, { backgroundColor: theme.cardBackground }]}
                      onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.user_id } })}
                    >
                        <Image source={{ uri: item.profile?.avatar_url || 'https://via.placeholder.com/50' }} style={styles.avatar} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.memberName, { color: theme.text }]}>{item.profile?.full_name}</Text>
                            <Text style={{ color: '#999', fontSize: 12 }}>@{item.profile?.username}</Text>
                        </View>
                        <View style={[styles.roleBadge, { backgroundColor: '#eee' }]}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#666' }}>{item.role?.name.toUpperCase()}</Text>
                        </View>
                    </Pressable>
                )}
                ListFooterComponent={
                  // Owners cannot leave — they must transfer ownership or delete the guild.
                  currentUserId && currentUserId !== guild?.owner_id ? (
                    <Pressable
                      style={styles.leaveBtn}
                      onPress={handleLeaveGuild}
                    >
                      <Ionicons name="exit-outline" size={18} color="#BC2F38" style={{ marginRight: 8 }} />
                      <Text style={styles.leaveBtnText}>Leave Guild</Text>
                    </Pressable>
                  ) : null
                }
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

  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BC2F38',
  },
  leaveBtnText: { color: '#BC2F38', fontWeight: '700', fontSize: 15 },

  // FORUMS
  threadCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  threadCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  threadTitle: { flex: 1, fontSize: 15, fontFamily: 'Chivo_700Bold', lineHeight: 20 },
  threadPreview: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 8 },
  threadMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  threadMetaText: { fontSize: 12, color: '#999' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 17, fontFamily: 'Chivo_700Bold' },
  modalPost: { fontSize: 16, fontWeight: '700' },
  threadTitleInput: {
    fontSize: 18,
    fontFamily: 'Chivo_700Bold',
    paddingVertical: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  threadBodyInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 200,
  },
});