/**
 * create/_layout.tsx
 *
 * Wraps the entire Guide Creation wizard in the GuideCreationProvider context,
 * so all wizard screens share the same in-progress draft state.
 *
 * Provides a Stack navigator with the Avengild header theme applied globally
 * across all wizard screens.
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { GuideCreationProvider } from '@/lib/GuideCreationContext';
import { Stack } from 'expo-router';

export default function CreateLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  return (
    <GuideCreationProvider>
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: theme.background },
          headerTintColor:  theme.tint,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: 'Chivo_700Bold', fontSize: 18 },
          contentStyle:     { backgroundColor: theme.background },
        }}
      />
    </GuideCreationProvider>
  );
}
