import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// The URL polyfill is required in the React Native runtime (JSCore, Hermes),
// where URL and URLSearchParams are not available as global primitives.
// This file is never loaded on web, so there is no SSR conflict.
// The FORCE LOAD comment preserves the original intent: this must execute
// before createClient, so it remains a require() rather than an import.
require('react-native-url-polyfill/auto');

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL     || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
