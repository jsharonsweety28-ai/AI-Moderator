"use client";

// Browser Supabase client with the public (anon) key, used only for Realtime
// broadcast subscriptions — all data flows through our server routes. The URL and
// key are handed over by the server at render time, so nothing has to be baked in
// at build time.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function browserDb(url: string, anonKey: string): SupabaseClient {
  cached ??= createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
