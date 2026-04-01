import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

function TabIcon({
  name,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons name={name} size={24} color={color} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: isDark ? '#555' : '#999',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: isDark ? '#1e2330' : '#e8e8e8',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: 'Chivo_700Bold',
          fontSize: 10,
          marginBottom: 4,
        },
      }}
    >
      {/* ── Hidden screens — not rendered as tabs ─────────────────────── */}
      {/* index.tsx: Discovery content is now the Discover segment of Codex */}
      <Tabs.Screen name="index"   options={{ href: null }} />
      {/* profile.tsx: Auth + profile content is now within the Guilds tab */}
      <Tabs.Screen name="profile" options={{ href: null }} />

      {/* ── 1. CALENDAR (leftmost) ─────────────────────────────────────── */}
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <TabIcon name="calendar-outline" color={color} />,
        }}
      />

      {/* ── 2. CODEX (centre) ─────────────────────────────────────────── */}
      <Tabs.Screen
        name="codex"
        options={{
          title: 'Codex',
          tabBarIcon: ({ color }) => <TabIcon name="book-outline" color={color} />,
        }}
      />

      {/* ── 3. GUILDS (rightmost) ─────────────────────────────────────── */}
      <Tabs.Screen
        name="guilds"
        options={{
          title: 'Guilds',
          tabBarIcon: ({ color }) => <TabIcon name="shield-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
