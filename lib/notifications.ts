/**
 * lib/notifications.ts
 *
 * Push notification setup for Avengild.
 *
 * Responsibilities:
 *   1. Request permission from the OS (iOS prompts; Android auto-grants for SDK 33+).
 *   2. Obtain the Expo push token.
 *   3. Store the token in profiles.push_token so the server (or Edge Functions)
 *      can send targeted notifications.
 *   4. Register a foreground notification handler that shows an in-app alert
 *      instead of a system banner (keeps the UX consistent while the app is open).
 *
 * Usage (call once on sign-in, from _layout.tsx or guilds.tsx):
 *   import { registerPushToken } from '@/lib/notifications';
 *   await registerPushToken();
 *
 * Note: expo-notifications must be in package.json and app.json must declare
 * the notification permissions plugin.  If the package isn't installed yet,
 * this module is a no-op (the dynamic require guard at the bottom protects it).
 */

import { supabase } from './supabase';

// We import expo-notifications lazily so the app still builds even if the
// package hasn't been added yet.  Once `npx expo install expo-notifications`
// has been run and app.json is updated, the functions will become active.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // expo-notifications not installed yet — all functions below are no-ops.
}

/**
 * Requests push permission and writes the Expo push token to
 * profiles.push_token for the currently authenticated user.
 *
 * Safe to call on every sign-in — it only writes when the token has changed
 * or hasn't been stored yet.
 */
export async function registerPushToken(): Promise<void> {
  if (!Notifications) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;
  if (!token) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', user.id);
}

/**
 * Registers a foreground notification handler.
 * When the app is in the foreground, Expo suppresses the system banner by
 * default.  This handler opts in to showing the alert/badge/sound anyway.
 *
 * Call once from _layout.tsx on app startup (before sign-in check).
 */
export function setupForegroundNotificationHandler(): () => void {
  if (!Notifications) return () => {};

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge:  false,
    }),
  });

  // Return a no-op cleanup since setNotificationHandler has no teardown
  return () => {};
}
