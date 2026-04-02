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
 *   - Supabase Realtime (`postgres_changes`) delivers new messages live.
 *   - The component owns its own subscription lifecycle (subscribe on mount,
 *     unsubscribe on unmount).
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
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // On iOS, track the exact keyboard height and apply it as paddingBottom on
  // the container. This is more reliable than KeyboardAvoidingView because it
  // doesn't depend on knowing the height of all the UI above this component
  // (navigation bar + any in-screen bars vary by caller and device).
  // Android uses softwareKeyboardLayoutMode="resize" in app.json so the
  // system already handles layout — no listener needed there.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard height tracking (iOS only)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      // Scroll to the latest messages as the keyboard slides up
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
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
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          id, thread_id, sender_id, body, reply_to_id,
          is_deleted, created_at, edited_at,
          sender:profiles!chat_messages_sender_id_fkey(full_name, username)
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (!cancelled) {
        if (data) setMessages(data as MessageWithSender[]);
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
          // Fetch the full row with sender joined, since payload.new is bare
          const { data } = await supabase
            .from('chat_messages')
            .select(`
              id, thread_id, sender_id, body, reply_to_id,
              is_deleted, created_at, edited_at,
              sender:profiles!chat_messages_sender_id_fkey(full_name, username)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev, data as MessageWithSender]);
            // Scroll to bottom on new message
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

    if (!guildId && !eventId) return null;

    const insertPayload = guildId
      ? { guild_id: guildId }
      : { event_id: eventId };

    // Use upsert so concurrent first-senders don't race
    const { data, error } = await supabase
      .from('chat_threads')
      .upsert(insertPayload, {
        onConflict: guildId ? 'guild_id' : 'event_id',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[ChatView] thread creation error:', error?.message);
      return null;
    }

    setThreadId(data.id);
    onThreadCreated?.(data.id);
    return data.id;
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

    const { error } = await supabase.from('chat_messages').insert({
      thread_id: tid,
      sender_id: currentUserId,
      body,
    });

    if (error) {
      // Restore text so user doesn't lose their message
      setInputText(body);
      console.error('[ChatView] send error:', error.message);
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
    <View style={[styles.outer, Platform.OS === 'ios' && { paddingBottom: keyboardHeight }]}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
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

      {/* Input bar
            - keyboardHeight > 0: the outer paddingBottom already clears the keyboard,
              so only use a small fixed gap at the bottom.
            - keyboardHeight === 0: use the safe-area inset so the bar clears the
              home indicator / Android nav bar. */}
      <View style={[
        styles.inputBar,
        {
          backgroundColor: theme.cardBackground,
          borderTopColor: '#eee',
          paddingBottom: keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 10),
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
    </View>
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
