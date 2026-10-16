/**
 * Aviationstack flight status — display only, never booking.
 * Official usage: GET http(s)://api.aviationstack.com/v1/flights
 *   ?access_key=<key>&flight_iata=BA117&limit=2
 * Free tier verified live Oct 16 2026: filtered queries (flight_iata,
 * dep_iata) and HTTPS both return 200 on this key.
 * Docs: https://aviationstack.com/faq, https://docs.apilayer.com/aviationstack/docs/quickstart-guide
 */

import { env } from "@/lib/env";

export interface FlightStatus {
  flightDate: string;
  status: string;
  airline: string;
  flightNo: string;
  departure: string;
  arrival: string;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  delayMin: number | null;
  terminal: string | null;
  gate: string | null;
}

interface AviationstackFlight {
  flight_date?: string;
  flight_status?: string;
  airline?: { name?: string };
  flight?: { iata?: string; number?: string };
  departure?: {
    iata?: string;
    scheduled?: string | null;
    estimated?: string | null;
    actual?: string | null;
    delay?: number | null;
    terminal?: string | null;
    gate?: string | null;
  };
  arrival?: { iata?: string };
}

function toStatus(f: AviationstackFlight): FlightStatus {
  return {
    flightDate: f.flight_date ?? "",
    status: f.flight_status ?? "unknown",
    airline: f.airline?.name ?? "—",
    flightNo: f.flight?.iata ?? f.flight?.number ?? "—",
    departure: f.departure?.iata ?? "—",
    arrival: f.arrival?.iata ?? "—",
    scheduled: f.departure?.scheduled ?? null,
    estimated: f.departure?.estimated ?? null,
    actual: f.departure?.actual ?? null,
    delayMin: typeof f.departure?.delay === "number" ? f.departure.delay : null,
    terminal: f.departure?.terminal ?? null,
    gate: f.departure?.gate ?? null,
  };
}

/** Live departure/arrival status for a flight number (e.g. BA117). */
export async function flightStatus(flightIata: string, limit = 3): Promise<FlightStatus[]> {
  const key = env.aviationstackKey;
  if (!key) throw new Error("AVIATIONSTACK_KEY is not set. Add it to .env.local.");
  const clean = flightIata.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2,7}$/.test(clean)) throw new Error("Enter a flight number like BA117.");
  const url =
    `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}` +
    `&flight_iata=${encodeURIComponent(clean)}&limit=${limit}`;
  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) throw new Error(`Flight status unavailable (${res.status}).`);
  const json = (await res.json()) as { data?: AviationstackFlight[]; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Flight status unavailable.");
  return (json.data ?? []).map(toStatus);
}
