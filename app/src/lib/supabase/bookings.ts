/**
 * Bookings history helpers. Works only after the `bookings` table exists:
 *   create table bookings (
 *     id uuid default gen_random_uuid() primary key,
 *     user_id uuid references auth.users,
 *     offer_id text, order_id text, reference text,
 *     origin text, destination text, status text default 'confirmed',
 *     created_at timestamptz default now()
 *   );
 * Enable RLS + a policy scoping user_id = auth.uid(). Until then every
 * helper throws a named error the UI shows honestly.
 */

import { supabase } from "./client";

export interface BookingRow {
  id: string;
  offer_id: string | null;
  order_id: string | null;
  reference: string | null;
  origin: string | null;
  destination: string | null;
  status: string | null;
  created_at: string | null;
}

export async function listBookings(): Promise<{ rows?: BookingRow[]; demo?: true; error?: string }> {
  const sb = supabase();
  if (!sb) return { demo: true };
  const { data, error } = await sb.from("bookings").select("*").order("created_at", { ascending: false }).limit(25);
  if (error) {
    if (/relation .* does not exist|table/i.test(error.message)) {
      return { error: "TABLE_MISSING: create the bookings table in Supabase (see bookings.ts comment)." };
    }
    return { error: error.message };
  }
  return { rows: (data ?? []) as BookingRow[] };
}
