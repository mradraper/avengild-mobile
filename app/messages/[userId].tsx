/**
 * app/messages/[userId].tsx — Direct Message Screen
 *
 * Opens (or lazily creates) a 1:1 DM thread between the current user and
 * the person identified by `userId`. Uses the `get_or_create_dm_thread`
 * SECURITY DEFINER RPC via ChatView's `dmUserId` prop.
 *
 * Entry points:
 *   - Guilds tab inbox (DM rows)
 *   - Profile screen "Message" button (future)
 */

import ChatView from '@/components/chat/ChatView';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function DirectMessageScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [headerName, setHeaderName] = useState<string>('Direct Message');

  // Look up the other user's display name for the navigation header,
  // and check whether a thread already exists so ChatView can start
  // loading messages immediately.
  useEffect(() => {
    if (!userId) return;

    async function init() {
      // Fetch the other user's profile for the header title
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        setHeaderName(profile.full_name ?? profile.username ?? 'Direct Message');
      }

      // Check for an existing DM thread in either direction so the message
      // history loads without waiting for the first send.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: thread } = await supabase
        .from('chat_threads')
        .select('id')
        .or(
          `and(dm_user_a.eq.${user.id},dm_user_b.eq.${userId}),` +
          `and(dm_user_a.eq.${userId},dm_user_b.eq.${user.id})`,
        )
        .maybeSingle();

      if (thread) setThreadId(thread.id);
    }

    init();
  }, [userId]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          title: headerName,
          headerTintColor: theme.tint,
          headerStyle: { backgroundColor: theme.cardBackground },
        }}
      />
      <ChatView
        threadId={threadId}
        dmUserId={userId}
        onThreadCreated={setThreadId}
      />
    </View>
  );
}
