/**
 * ChatView.tsx
 *
 * Reusable real-time chat component used by both Guild Chat and Event Chat.
 *
 * Architecture:
 *   - Pass a `threadId` to stream messages from an existing thread.
 *   - Pass `guildId` OR `eventId` (not both) to enable lazy thread creation
 *     on the first message send — no thread row is created until someone
 *     actually types a message.
 *   - Pass `dmUserId` (the other participant's UUID) to enable a DM thread.
 *     The `get_or_create_dm_thread` SECURITY DEFINER RPC is used so there is
 *     always at most one thread between any two users, regardless of who
 *     initiates.
 *   - Supabase Realtime (`postgres_changes`) delivers new messages live.
 *   - The component owns its own subscription lifecycle (subscribe on mount,
 *     unsubscribe on unmount).
 *   - After each sent message the component fires-and-forgets an update to
 *     `chat_threads.last_message_at` and `last_message_preview` so the inbox
 *     can sort by recency.
 *
 * Limitations (v1 — text only):
 *   - No image or file attachments.
 *   - No message editing UI (though the DB supports it via edited_at).
 *   - Soft-delete replaces message body with "[Message removed]".
 *   - Reply threading is stored in reply_to_id but not rendered as a tree.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { ChatMessage } from '@/lib/database.types';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type MessageWithSender = ChatMessage & {
  sender: { full_name: string | null; username: string | null } | null;
};

type ChatViewProps = {
  /** The thread UUID to load. Undefined until the thread is lazily created. */
  threadId: string | undefined;
  /** Provide to enable lazy thread creation for a guild context. */
  guildId?: string;
  /** Provide to enable lazy thread creation for an event context. */
  eventId?: string;
  /** Provide the other participant's UUID to open or create a DM thread. */
  dmUserId?: string;
  /** Called when a thread is lazily created, so the parent can cache the ID. */
  onThreadCreated?: (threadId: string) => void;
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function ChatView({
  threadId: initialThreadId,
  guildId,
  eventId,
  dmUserId,
  onThreadCreated,
}: ChatViewProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  // Safe-area insets ensure the input bar clears the Android gesture/button
  // navigation bar and the iOS home indicator.
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name: string | null; username: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Tracks the keyboard height via Reanimated's native-driven hook, which works
  // correctly with new architecture (Fabric) on both platforms.
  // Note: edgeToEdgeEnabled:true in app.json disables Android's
  // softwareKeyboardLayoutMode="resize", so we must handle avoidance here on
  // all platforms rather than delegating to the system on Android.
  const keyboard = useAnimatedKeyboard();
  const keyboardAvoidStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        // Cache the sender's own profile so handleSend can attach it
        // without an extra round-trip. chat_messages.sender_id → auth.users
        // (not profiles), so all profile joins must be done as separate queries.
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', uid)
          .maybeSingle();
        setCurrentUserProfile(profile ?? null);
      }
    });
  }, []);

  // -------------------------------------------------------------------------
  // Sync prop → state when parent resolves the thread after lazy creation
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (initialThreadId && !threadId) {
      setThreadId(initialThreadId);
    }
  }, [initialThreadId]);

  // -------------------------------------------------------------------------
  // Initial message load + Realtime subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      setLoading(true);
      const { data } = await supabase
        .from('chat_messages')
        .select('id, thread_id, sender_id, body, reply_to_id, is_deleted, created_at, edited_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (!cancelled) {
        if (data && data.length > 0) {
          // Two-step join: sender_id → auth.users (not profiles), so PostgREST
          // cannot resolve profiles directly. Fetch profiles separately.
          const senderIds = [...new Set(data.map((m: any) => m.sender_id).filter(Boolean))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, username')
            .in('id', senderIds);
          const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
          const enriched = data.map((m: any) => ({
            ...m,
            sender: profileMap.get(m.sender_id) ?? null,
          }));
          if (!cancelled) setMessages(enriched as MessageWithSender[]);
        } else {
          setMessages([]);
        }
        setLoading(false);
      }
    }

    loadMessages();

    // Realtime: append new messages as they arrive
    const channel = supabase
      .channel(`chat:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          // Fetch the bare row, then resolve the sender profile separately.
          // (sender_id → auth.users, not profiles — no direct FK for PostgREST.)
          const { data: msg } = await supabase
            .from('chat_messages')
            .select('id, thread_id, sender_id, body, reply_to_id, is_deleted, created_at, edited_at')
            .eq('id', payload.new.id)
            .single();

          if (msg) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, username')
              .eq('id', (msg as any).sender_id)
              .maybeSingle();

            const enriched = { ...(msg as any), sender: profile ?? null } as MessageWithSender;

            setMessages((prev) => {
              // Deduplicate: our own sent message is already in state from
              // the optimistic append in handleSend; skip if already present.
              if (prev.some((m) => m.id === enriched.id)) return prev;
              return [...prev, enriched];
            });
            // Scroll to bottom on new message from another member
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  // -------------------------------------------------------------------------
  // Scroll to bottom on initial load
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [loading]);

  // -------------------------------------------------------------------------
  // Lazy thread creation
  // -------------------------------------------------------------------------
  async function ensureThread(): Promise<string | null> {
    if (threadId) return threadId;

    if (!guildId && !eventId && !dmUserId) return null;

    let tid: string | null = null;

    if (dmUserId) {
      // DM threads use a dedicated SECURITY DEFINER RPC that handles both
      // orderings (A↔B and B↔A) so there is always at most one thread
      // between any two users.
      const { data, error } = await supabase.rpc('get_or_create_dm_thread', {
        p_other_user_id: dmUserId,
      });
      if (error || !data) {
        console.error('[ChatView] DM thread creation error:', error?.message);
        return null;
      }
      tid = data as string;
    } else {
      // Use a SECURITY DEFINER RPC rather than a direct INSERT so that the
      // membership check runs in the function's own privilege context. A direct
      // INSERT calls auth_is_guild_member() from inside an RLS WITH CHECK
      // expression, where auth.uid() can return null and block the INSERT.
      const { data, error } = await supabase.rpc('get_or_create_chat_thread', {
        p_guild_id: guildId ?? null,
        p_event_id: eventId ?? null,
      });
      if (error || !data) {
        console.error('[ChatView] thread creation error:', error?.message);
        return null;
      }
      tid = data as string;
    }

    setThreadId(tid);
    onThreadCreated?.(tid);
    return tid;
  }

  // -------------------------------------------------------------------------
  // Send
  // -------------------------------------------------------------------------
  async function handleSend() {
    const body = inputText.trim();
    if (!body || sending || !currentUserId) return;

    setSending(true);
    setInputText('');

    const tid = await ensureThread();
    if (!tid) {
      setSending(false);
      return;
    }

    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert({
        thread_id: tid,
        sender_id: currentUserId,
        body,
      })
      .select('id, thread_id, sender_id, body, reply_to_id, is_deleted, created_at, edited_at')
      .single();

    if (error) {
      // Restore text so user doesn't lose their message
      setInputText(body);
      console.error('[ChatView] send error:', error.message);
    } else if (newMsg) {
      // Attach cached profile — no extra round-trip needed for the sender's own message
      const enriched = { ...(newMsg as any), sender: currentUserProfile } as MessageWithSender;
      // Append immediately — don't wait for the Realtime event
      setMessages((prev) => [...prev, enriched]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

      // Fire-and-forget: keep inbox metadata current for sorting and preview
      const preview = body.length > 80 ? body.slice(0, 77) + '…' : body;
      supabase
        .from('chat_threads')
        .update({ last_message_at: newMsg.created_at, last_message_preview: preview })
        .eq('id', tid)
        .then(({ error: updateErr }) => {
          if (updateErr) console.warn('[ChatView] inbox update error:', updateErr.message);
        });
    }

    setSending(false);
  }

  // -------------------------------------------------------------------------
  // RENDER HELPERS
  // -------------------------------------------------------------------------

  function renderMessage({ item }: { item: MessageWithSender }) {
    const isOwn = item.sender_id === currentUserId;
    const senderName = item.sender?.full_name ?? item.sender?.username ?? 'Member';
    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        {!isOwn && (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {senderName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={[
          styles.bubble,
          isOwn
            ? [styles.bubbleOwn,  { backgroundColor: theme.tint }]
            : [styles.bubbleOther, { backgroundColor: theme.cardBackground }],
        ]}>
          {!isOwn && (
            <Text style={[styles.senderName, { color: theme.tint }]}>
              {senderName}
            </Text>
          )}
          {item.is_deleted ? (
            <Text style={styles.deletedText}>Message removed</Text>
          ) : (
            <Text style={[
              styles.bodyText,
              { color: isOwn ? '#fff' : theme.text },
            ]}>
              {item.body}
            </Text>
          )}
          <Text style={[
            styles.timeText,
            { color: isOwn ? 'rgba(255,255,255,0.65)' : '#999' },
          ]}>
            {time}
            {item.edited_at ? '  (edited)' : ''}
          </Text>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // STATES: loading / not signed in / empty
  // -------------------------------------------------------------------------
  if (!currentUserId) {
    return (
      <View style={styles.centred}>
        <Text style={{ color: '#999' }}>Sign in to join the conversation.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // MAIN RENDER
  // -------------------------------------------------------------------------
  return (
    <Animated.View style={[styles.outer, keyboardAvoidStyle]}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.messageScroller}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.centred}>
            <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 12 }}>
              No messages yet. Say something!
            </Text>
          </View>
        }
      />

      {/* Input bar — safe-area inset clears home indicator / Android nav bar */}
      <View style={[
        styles.inputBar,
        {
          backgroundColor: theme.cardBackground,
          borderTopColor: '#eee',
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}>
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
          placeholder="Message..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: inputText.trim() ? theme.tint : '#ccc' },
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  outer: { flex: 1 },

  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },

  messageScroller: { flex: 1 },
  messageList: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  messageRowOwn: {
    flexDirection: 'row-reverse',
  },

  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#BC8A2F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },

  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
    marginLeft: 40,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
    marginRight: 40,
  },

  senderName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 21,
  },
  deletedText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#aaa',
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
