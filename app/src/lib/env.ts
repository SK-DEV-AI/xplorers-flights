/** App-wide environment contract. Keys are plug-and-play: add them to
 *  `.env.local` (never commit) or the host dashboard and restart.
 *
 *  Required for live search:
 *    FLIGHT_PROVIDER=duffel
 *    DUFFEL_TEST_KEY=duffel_test_...   (sandbox, free, fake tickets)
 *    DUFFEL_LIVE_KEY=duffel_live_...   (production, needs KYC + card on file)
 *    DUFFEL_MODE=test                  (test | live)
 *
 *  Booking stays OFF unless explicitly enabled:
 *    BOOKING_ENABLED=false             (true only with a live key + approval)
 *
 *  Flight status + schedules (free tiers, display only, never booking):
 *    AVIATIONSTACK_KEY=...             (aviationstack.com, free tier HTTP)
 *    RAPIDAPI_KEY=...                  (RapidAPI key subscribed to AeroDataBox)
 *
 *  Supabase (free tier) — client uses the anon JWT; the service_role key
 *  and personal token stay server-only and are never exposed to browsers:
 *    NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *    NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>
 *    SUPABASE_SERVICE_ROLE_KEY=<service_role JWT, server only>
 *    SUPABASE_PERSONAL_TOKEN=<sbp_..., server only>
 *
 *  To switch providers later (Amadeus, another aggregator), add a new file
 *  under src/lib/flights/ implementing FlightProvider and set
 *  FLIGHT_PROVIDER to its name. Nothing else changes.
 */

export type FlightMode = "test" | "live";

export const env = {
  provider: process.env.FLIGHT_PROVIDER ?? "duffel",
  mode: (process.env.DUFFEL_MODE ?? "test") as FlightMode,
  testKey: process.env.DUFFEL_TEST_KEY ?? "",
  liveKey: process.env.DUFFEL_LIVE_KEY ?? "",
  bookingEnabled: process.env.BOOKING_ENABLED === "true",
  aviationstackKey: process.env.AVIATIONSTACK_KEY ?? "",
  rapidApiKey: process.env.RAPIDAPI_KEY ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  // The agent model. Local big-pickle proxy for team testing; the team buys
  // a real key later and changes these three values — no code change.
  copilotBaseUrl: process.env.COPILOT_BASE_URL ?? "http://127.0.0.1:8787/v1",
  copilotModel: process.env.COPILOT_MODEL ?? "big-pickle",
  copilotApiKey: process.env.COPILOT_API_KEY ?? "local-dev-key",
} as const;

/** Server-only secrets. Never import these from client components. */
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabasePersonalToken: process.env.SUPABASE_PERSONAL_TOKEN ?? "",
} as const;

export function activeKey(): string {
  return env.mode === "live" ? env.liveKey : env.testKey;
}

export function isLive(): boolean {
  return env.mode === "live";
}

/** Booking is allowed only with: live mode + live key + explicit flag. */
export function bookingAllowed(): boolean {
  return env.bookingEnabled && isLive() && env.liveKey.length > 0;
}

/** Display-only flight data (status/schedules) is wired when keys exist. */
export function flightDataStatus(): { aviationstack: boolean; aerodatabox: boolean } {
  return {
    aviationstack: env.aviationstackKey.length > 0,
    aerodatabox: env.rapidApiKey.length > 0,
  };
}

export function supabaseConfigured(): boolean {
  return env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
}
