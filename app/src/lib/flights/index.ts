import { env } from "@/lib/env";
import { DuffelProvider } from "./duffel";
import type { FlightProvider } from "./types";

/**
 * Single place that picks the flight backend.
 * To add a provider: implement FlightProvider, add one case here,
 * set FLIGHT_PROVIDER=<name>. UI and API routes stay untouched.
 */
export function getProvider(): FlightProvider {
  switch (env.provider) {
    case "duffel":
    default:
      return new DuffelProvider();
  }
}
