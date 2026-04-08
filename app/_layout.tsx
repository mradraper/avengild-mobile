import { useColorScheme } from '@/components/useColorScheme';
import { setupForegroundNotificationHandler } from '@/lib/notifications';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

// NEW: Import Chivo fonts
import {
  Chivo_400Regular,
  Chivo_700Bold,
  Chivo_900Black
} from '@expo-google-fonts/chivo';
import { guideCache } from '@/lib/guideCache';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Chivo_400Regular,
    Chivo_700Bold,
    Chivo_900Black,
    ...FontAwesome.font,
  });

  // Register foreground notification handler once on app startup
  useEffect(() => {
    const cleanup = setupForegroundNotificationHandler();
    return cleanup;
  }, []);

  // Start offline sync listener — flushes queued step completions when connectivity returns
  useEffect(() => {
    const unsub = guideCache.startSyncListener();
    return unsub;
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          // Apply Chivo globally to all Headers
          headerTitleStyle: {
            fontFamily: 'Chivo_900Black', // Heavy font
            fontSize: 20, 
            // Removed 'textTransform' and 'letterSpacing' (Fixes the error)
          },
          headerBackTitleStyle: {
            fontFamily: 'Chivo_400Regular', // Soft back button
          }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        {/* Plan flow — slides up as a full-screen modal from the Codex hub */}
        <Stack.Screen name="plan" options={{ presentation: 'modal', headerShown: false }} />
        {/* Guide Creation wizard — full-screen modal from the Codex hub */}
        <Stack.Screen name="create" options={{ presentation: 'modal', headerShown: false }} />
        {/* Event detail — pushes from Calendar or Codex */}
        <Stack.Screen name="event" options={{ headerShown: false }} />
        {/* Profile view — pushes from Guild roster or event crew */}
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        {/* Forum thread detail — pushes from Guild Forums tab */}
        <Stack.Screen name="forum" options={{ headerShown: true }} />
        {/* Profile edit — pushes from own public profile */}
        <Stack.Screen name="profile/edit" options={{ presentation: 'modal', headerShown: true }} />
      </Stack>
    </ThemeProvider>
  );
}