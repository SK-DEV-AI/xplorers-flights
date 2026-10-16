/**
 * AeroDataBox via RapidAPI — schedules + airport boards, display only.
 * Official usage: GET https://aerodatabox.p.rapidapi.com/<endpoint>
 *   Headers: X-RapidAPI-Key, X-RapidAPI-Host: aerodatabox.p.rapidapi.com
 * Verified live Oct 16 2026: /flights/number/BA117/2026-10-16 → 200 with
 * full LHR→JFK detail. Free Basic = 600 units/mo (units != requests).
 * Docs: https://doc.aerodatabox.com/rapidapi.html
 * Key rule: never call from the browser — route through /api/schedules.
 */

import { env } from "@/lib/env";

export interface ScheduleLeg {
  origin: string;
  destination: string;
  scheduledUtc: string | null;
  revisedUtc: string | null;
  terminal: string | null;
  flightNo: string | null;
  distanceKm: number | null;
}

interface AeroLeg {
  greatCircleDistance?: { km?: number };
  departure?: {
    airport?: { iata?: string };
    scheduledTime?: { utc?: string };
    revisedTime?: { utc?: string };
    terminal?: string | null;
  };
  arrival?: { airport?: { iata?: string } };
  number?: string;
}

function toLeg(l: AeroLeg): ScheduleLeg {
  return {
    origin: l.departure?.airport?.iata ?? "—",
    destination: l.arrival?.airport?.iata ?? "—",
    scheduledUtc: l.departure?.scheduledTime?.utc ?? null,
    revisedUtc: l.departure?.revisedTime?.utc ?? null,
    terminal: l.departure?.terminal ?? null,
    flightNo: l.number ?? null,
    distanceKm: typeof l.greatCircleDistance?.km === "number" ? Math.round(l.greatCircleDistance.km) : null,
  };
}

/** Schedule + history for a flight number on a date (YYYY-MM-DD). */
export async function flightSchedule(flightNo: string, date: string): Promise<ScheduleLeg[]> {
  const key = env.rapidApiKey;
  if (!key) throw new Error("RAPIDAPI_KEY is not set. Add it to .env.local.");
  const clean = flightNo.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2,7}$/.test(clean)) throw new Error("Enter a flight number like BA117.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a date like 2026-10-16.");
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(clean)}/${encodeURIComponent(date)}`;
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
    next: { revalidate: 600 },
  });
  if (res.status === 403) throw new Error("AeroDataBox subscription missing — subscribe to Basic (free) on RapidAPI.");
  if (res.status === 429) throw new Error("AeroDataBox quota used — try again later.");
  if (!res.ok) throw new Error(`Schedules unavailable (${res.status}).`);
  const json = (await res.json()) as AeroLeg[] | { message?: string };
  if (!Array.isArray(json)) throw new Error("Schedules unavailable right now.");
  return json.map(toLeg);
}
