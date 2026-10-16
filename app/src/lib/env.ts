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
 *  To switch providers later (Amadeus, another aggregator), add a new file
 *  under src/lib/providers/ implementing FlightProvider and set
 *  FLIGHT_PROVIDER to its name. Nothing else changes.
 */

export type FlightMode = "test" | "live";

export const env = {
  provider: process.env.FLIGHT_PROVIDER ?? "duffel",
  mode: (process.env.DUFFEL_MODE ?? "test") as FlightMode,
  testKey: process.env.DUFFEL_TEST_KEY ?? "",
  liveKey: process.env.DUFFEL_LIVE_KEY ?? "",
  bookingEnabled: process.env.BOOKING_ENABLED === "true",
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
