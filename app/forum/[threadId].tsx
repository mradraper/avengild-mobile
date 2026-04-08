/**
 * app/forum/[threadId].tsx
 *
 * Thread detail screen for Guild Forums.
 *
 * Shows the original thread body, a list of replies with emoji reactions,
 * and a compose bar at the bottom.  Members can:
 *   - Read the thread and all replies
 *   - Post a reply
 *   - Edit / delete their own reply (long-press)
 *   - React with an emoji (👍 🙌 🔥 ❓ 🗺)
 *
 * Guild admins / owners additionally see a "Pin / Unpin" option in the
 * thread header menu.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Reply = {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author_id: string;
  author: { full_name: string; username: string } | null;
  reactions: Record<string, number>; // emoji → count
  myReactions: Set<string>;          // emojis the current user has toggled
};

type ThreadData = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  author_id: string;
  author: { full_name: string; username: string } | null;
};

const REACTION_EMOJIS = ['👍', '🙌', '🔥', '❓', '🗺'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ForumThreadScreen() {
  const { threadId, guildId } = useLocalSearchParams<{ threadId: string; guildId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [thread, setThread] = useState<ThreadData | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Compose bar
  const [composeText, setComposeText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit mode
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid && guildId) resolveRole(uid);
    });
    loadAll();
  }, [threadId]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async function loadAll() {
    if (!threadId) return;
    setLoading(true);
    await Promise.all([fetchThread(), fetchReplies()]);
    setLoading(false);
  }

  async function fetchThread() {
    if (!threadId) return;
    const { data } = await supabase
      .from('forum_threads')
      .select('id, title, body, is_pinned, created_at, author_id')
      .eq('id', threadId)
      .single();
    if (!data) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', data.author_id)
      .maybeSingle();

    setThread({ ...data, author: profile ?? null });
  }

  async function fetchReplies() {
    if (!threadId) return;
    const { data: replyRows } = await supabase
      .from('forum_replies')
      .select('id, body, created_at, edited_at, author_id')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (!replyRows || replyRows.length === 0) {
      setReplies([]);
      return;
    }

    const authorIds = [...new Set(replyRows.map((r: any) => r.author_id))];
    const replyIds = replyRows.map((r: any) => r.id);

    const [profilesResult, reactionsResult, uid] = await Promise.all([
      supabase.from('profiles').select('id, full_name, username').in('id', authorIds),
      supabase.from('forum_reactions').select('reply_id, user_id, emoji').in('reply_id', replyIds),
      supabase.auth.getUser().then(({ data }) => data.user?.id ?? null),
    ]);

    const profileMap: Record<string, { full_name: string; username: string }> = {};
    (profilesResult.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // Build reaction maps per reply
    const reactionCountMap: Record<string, Record<string, number>> = {};
    const myReactionMap: Record<string, Set<string>> = {};
    (reactionsResult.data ?? []).forEach((r: any) => {
      if (!reactionCountMap[r.reply_id]) reactionCountMap[r.reply_id] = {};
      reactionCountMap[r.reply_id][r.emoji] = (reactionCountMap[r.reply_id][r.emoji] ?? 0) + 1;
      if (r.user_id === uid) {
        if (!myReactionMap[r.reply_id]) myReactionMap[r.reply_id] = new Set();
        myReactionMap[r.reply_id].add(r.emoji);
      }
    });

    setReplies(
      replyRows.map((r: any) => ({
        ...r,
        author: profileMap[r.author_id] ?? null,
        reactions: reactionCountMap[r.id] ?? {},
        myReactions: myReactionMap[r.id] ?? new Set(),
      }))
    );
  }

  async function resolveRole(uid: string) {
    if (!guildId) return;
    const { data } = await supabase
      .from('guild_members')
      .select('role:guild_roles(name)')
      .eq('guild_id', guildId)
      .eq('user_id', uid)
      .maybeSingle();
    if (data) setCurrentUserRole((data as any).role?.name ?? null);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function submitReply() {
    if (!threadId || !currentUserId || !composeText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('forum_replies').insert({
      thread_id: threadId,
      author_id: currentUserId,
      body: composeText.trim(),
    });
    setSubmitting(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setComposeText('');
    await fetchReplies();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function saveEdit() {
    if (!editingReplyId || !editText.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from('forum_replies')
      .update({ body: editText.trim(), edited_at: new Date().toISOString() })
      .eq('id', editingReplyId);
    setSavingEdit(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setEditingReplyId(null);
    setEditText('');
    fetchReplies();
  }

  async function deleteReply(replyId: string) {
    Alert.alert('Delete Reply', 'Remove this reply permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('forum_replies').delete().eq('id', replyId);
          setReplies(prev => prev.filter(r => r.id !== replyId));
        },
      },
    ]);
  }

  async function toggleReaction(replyId: string, emoji: string) {
    if (!currentUserId) return;
    const reply = replies.find(r => r.id === replyId);
    if (!reply) return;
    const alreadyReacted = reply.myReactions.has(emoji);

    // Optimistic update
    setReplies(prev =>
      prev.map(r => {
        if (r.id !== replyId) return r;
        const newCounts = { ...r.reactions };
        const newMine = new Set(r.myReactions);
        if (alreadyReacted) {
          newCounts[emoji] = Math.max(0, (newCounts[emoji] ?? 1) - 1);
          if (newCounts[emoji] === 0) delete newCounts[emoji];
          newMine.delete(emoji);
        } else {
          newCounts[emoji] = (newCounts[emoji] ?? 0) + 1;
          newMine.add(emoji);
        }
        return { ...r, reactions: newCounts, myReactions: newMine };
      })
    );

    if (alreadyReacted) {
      await supabase
        .from('forum_reactions')
        .delete()
        .eq('reply_id', replyId)
        .eq('user_id', currentUserId)
        .eq('emoji', emoji);
    } else {
      await supabase
        .from('forum_reactions')
        .insert({ reply_id: replyId, user_id: currentUserId, emoji });
    }
  }

  async function togglePin() {
    if (!thread) return;
    const { error } = await supabase
      .from('forum_threads')
      .update({ is_pinned: !thread.is_pinned })
      .eq('id', thread.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setThread(prev => prev ? { ...prev, is_pinned: !prev.is_pinned } : prev);
  }

  async function deleteThread() {
    Alert.alert('Delete Thread', 'This will permanently delete the thread and all replies.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('forum_threads').delete().eq('id', thread!.id);
          router.back();
        },
      },
    ]);
  }

  function handleReplyLongPress(reply: Reply) {
    if (reply.author_id !== currentUserId) return;
    Alert.alert('Manage Reply', undefined, [
      {
        text: 'Edit',
        onPress: () => { setEditingReplyId(reply.id); setEditText(reply.body); },
      },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReply(reply.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const isAdmin = currentUserRole === 'Owner' || currentUserRole === 'Admin';

  function renderThreadHeader() {
    if (!thread) return null;
    return (
      <View style={[styles.threadHeader, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.threadTitleRow}>
          {thread.is_pinned && (
            <Ionicons name="pin" size={16} color={theme.tint} style={{ marginRight: 6, marginTop: 2 }} />
          )}
          <Text style={[styles.threadTitle, { color: theme.text, flex: 1 }]}>{thread.title}</Text>
        </View>
        <Text style={[styles.threadBody, { color: theme.text }]}>{thread.body}</Text>
        <View style={styles.threadMeta}>
          <Text style={styles.metaText}>
            {thread.author?.full_name ?? 'Member'} · {new Date(thread.created_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
          {/* Admin / author controls */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {isAdmin && (
              <Pressable onPress={togglePin} hitSlop={8}>
                <Ionicons name={thread.is_pinned ? 'pin' : 'pin-outline'} size={18} color={theme.tint} />
              </Pressable>
            )}
            {(thread.author_id === currentUserId || isAdmin) && (
              <Pressable onPress={deleteThread} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#BC2F38" />
              </Pressable>
            )}
          </View>
        </View>
        <View style={styles.divider} />
        <Text style={[styles.repliesLabel, { color: '#999' }]}>
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </Text>
      </View>
    );
  }

  function renderReply({ item }: { item: Reply }) {
    const isEditing = editingReplyId === item.id;
    return (
      <Pressable
        style={[styles.replyCard, { backgroundColor: theme.cardBackground }]}
        onLongPress={() => handleReplyLongPress(item)}
        delayLongPress={500}
      >
        <View style={styles.replyHeader}>
          <Text style={[styles.replyAuthor, { color: theme.text }]}>
            {item.author?.full_name ?? 'Member'}
          </Text>
          <Text style={styles.replyTime}>
            {new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
            {item.edited_at ? ' · edited' : ''}
          </Text>
        </View>

        {isEditing ? (
          <View>
            <TextInput
              style={[styles.editInput, { color: theme.text, borderColor: theme.tint + '66' }]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => { setEditingReplyId(null); setEditText(''); }} style={styles.editBtn}>
                <Text style={{ color: '#999', fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={savingEdit}
                style={[styles.editBtn, { backgroundColor: theme.tint, borderRadius: 8 }]}
              >
                {savingEdit
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                }
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={[styles.replyBody, { color: theme.text }]}>{item.body}</Text>
        )}

        {/* Emoji reactions row */}
        <View style={styles.reactionsRow}>
          {REACTION_EMOJIS.map(emoji => {
            const count = item.reactions[emoji] ?? 0;
            const mine = item.myReactions.has(emoji);
            return (
              <Pressable
                key={emoji}
                style={[
                  styles.reactionPill,
                  mine && { backgroundColor: theme.tint + '22', borderColor: theme.tint },
                ]}
                onPress={() => toggleReaction(item.id, emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 0 && (
                  <Text style={[styles.reactionCount, mine && { color: theme.tint }]}>{count}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: thread?.title ?? 'Thread',
          headerTitleStyle: { fontFamily: 'Chivo_700Bold', fontSize: 16 },
          headerBackTitle: '',
          headerTintColor: theme.tint,
        }}
      />

      <FlatList
        ref={listRef}
        data={replies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        ListHeaderComponent={renderThreadHeader}
        renderItem={renderReply}
        ListEmptyComponent={
          <Text style={[styles.noReplies, { color: '#999' }]}>
            No replies yet. Be the first to respond.
          </Text>
        }
      />

      {/* Compose bar */}
      <View style={[styles.composeBar, { backgroundColor: theme.cardBackground, borderTopColor: '#eee' }]}>
        <TextInput
          style={[styles.composeInput, { color: theme.text }]}
          placeholder="Write a reply…"
          placeholderTextColor="#999"
          value={composeText}
          onChangeText={setComposeText}
          multiline
          maxLength={2000}
        />
        <Pressable
          style={[styles.sendBtn, { backgroundColor: composeText.trim() ? theme.tint : '#ccc' }]}
          onPress={submitReply}
          disabled={submitting || !composeText.trim()}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color="#fff" />
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Thread header block
  threadHeader: { borderRadius: 12, padding: 16, marginBottom: 12 },
  threadTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  threadTitle: { fontSize: 20, fontFamily: 'Chivo_900Black', lineHeight: 26 },
  threadBody: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  threadMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#999' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  repliesLabel: { fontSize: 13, fontWeight: '600' },

  // Reply cards
  replyCard: { borderRadius: 10, padding: 12, marginBottom: 8 },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  replyAuthor: { fontSize: 13, fontFamily: 'Chivo_700Bold' },
  replyTime: { fontSize: 11, color: '#aaa' },
  replyBody: { fontSize: 14, lineHeight: 20 },
  noReplies: { textAlign: 'center', marginTop: 24, fontSize: 14 },

  // Edit mode
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    marginTop: 4,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 14, paddingVertical: 8 },

  // Reactions
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 6 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
  },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: 12, color: '#666', marginLeft: 4, fontWeight: '600' },

  // Compose bar
  composeBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  composeInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
