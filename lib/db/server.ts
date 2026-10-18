// Server-only Supabase client using the service-role key. Never import from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function adminDb(): SupabaseClient {
  if (!cached) {
    // SUPABASE_URL exists because Vercel's env policy forbids non-sensitive
    // NEXT_PUBLIC_* project vars; locally only the NEXT_PUBLIC one is set.
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars are not set");
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** The public Realtime settings the browser needs, read at request time (not build time).
 *  The anon key is the publishable key; null when unset, and live refresh just stays off. */
export function realtimeConfig(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}
