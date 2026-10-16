/**
 * Supabase browser client (anon JWT only — safe to expose).
 * Returns null when the anon URL/key are not configured, so pages
 * degrade to local demo state instead of crashing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "@/lib/env";

let cached: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  if (!supabaseConfigured()) {
    cached = null;
    return cached;
  }
  cached = createClient(env.supabaseUrl, env.supabaseAnonKey);
  return cached;
}

/** Demo login name stored locally until Supabase Auth is wired. */
export function demoUser(): { email: string } | null {
  try {
    const raw = localStorage.getItem("xplorers-user");
    if (!raw) return null;
    const json = JSON.parse(raw) as { email?: string };
    return json.email ? { email: json.email } : null;
  } catch {
    return null;
  }
}
