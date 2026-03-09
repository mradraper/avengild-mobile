import { createClient } from '@supabase/supabase-js';

// This file is the web entry point for the Supabase client.
// Metro's platform-specific resolution picks supabase.native.ts on iOS and
// Android, and falls back to this file on web. AsyncStorage is intentionally
// absent here — importing it on web triggers a ReferenceError during SSR
// because its web implementation accesses window.localStorage at module
// evaluation time, before window exists in a Node.js server context.

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL     || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// window.localStorage is structurally compatible with Supabase's
// SupportedStorage interface (getItem, setItem, removeItem) and is the
// correct persistence mechanism for web auth sessions.
//
// During SSR, window is not defined. We omit storage entirely so Supabase
// falls back to its built-in in-memory store — sessions are re-established
// once the client hydrates in the browser, and no server-side state is leaked.
const isClient = typeof window !== 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:          isClient ? (window.localStorage as any) : undefined,
    autoRefreshToken: isClient,
    persistSession:   isClient,
    detectSessionInUrl: false,
  },
});
