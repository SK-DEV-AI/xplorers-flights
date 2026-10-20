import { NextResponse } from "next/server";

interface Aircraft {
  hex: string;
  flight: string;
  country: string;
  lat: number;
  lon: number;
  altitudeMeters: number | null;
  groundSpeedKt: number | null;
  heading: number | null;
  onGround: boolean;
}

/**
 * Compact wire format. The radar renders thousands of contacts, so the
 * payload is minimised: short keys, coordinates rounded to 2 decimals
 * (~1.1 km, far more precise than a 1080p screen), altitude in km to 1
 * decimal, speed in knots as an integer. This cuts the response from
 * ~630 KB to ~250 KB before compression.
 */
interface WireAircraft {
  h: string;  // hex
  f: string;  // flight / callsign
  c: string;  // country
  x: number;  // lat
  y: number;  // lon
  a: number | null;  // altitude, km
  s: number | null;  // ground speed, knots
  d: number | null;  // heading
  g: 0 | 1;  // on ground
}

const MAX_AIRCRAFT = 4000;

interface OpenSkyResponse {
  time?: number;
  states?: Array<
    [
      string | null, string | null, string | null, number, number,
      number | null, number | null, number | null, boolean, number | null,
      number | null, number | null, unknown, number | null, string | null, boolean, number | null,
    ]
  >;
}

/**
 * GET /api/global-traffic — keyless OpenSky live aircraft over the whole world.
 *
 * Source: https://opensky-network.org/api/states/all
 * Docs:   https://opensky-network.org/apis/states/all/
 *
 * The upstream payload is a positional array per aircraft, not an object, so
 * every field is read by index. Rows without coordinates are dropped.
 */
export async function GET() {
  try {
    return await buildResponse();
  } catch {
    return NextResponse.json(
      { error: "Live traffic is unavailable right now. Please try again in a moment." },
      { status: 502 },
    );
  }
}

async function buildResponse() {
  const url = "https://opensky-network.org/api/states/all";
  const res = await fetch(url, {
    headers: { "User-Agent": "XplorersFlights/1.0 (student project)" },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Live traffic unavailable (${res.status}).`);
  }

  const json = (await res.json()) as OpenSkyResponse;
  const states = json.states ?? [];
  const aircraft: WireAircraft[] = [];

  for (const state of states) {
    if (aircraft.length >= MAX_AIRCRAFT) break;
    const lon = state[5];
    const lat = state[6];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const callsign = (state[1] ?? "").trim();
    const baro = state[7];
    const velocity = state[9];
    const track = state[10];
    aircraft.push({
      h: state[0] ?? "",
      f: callsign || "\u2014",
      c: state[2] ?? "",
      x: Math.round(lat * 100) / 100,
      y: Math.round(lon * 100) / 100,
      a: typeof baro === "number" ? Math.round(baro / 100) / 10 : null,
      s: typeof velocity === "number" ? Math.round(velocity * 1.94384) : null,
      d: typeof track === "number" ? Math.round(track) : null,
      g: state[8] === true ? 1 : 0,
    });
  }

  const body = JSON.stringify({
    n: aircraft.length,
    t: json.time ? new Date(json.time * 1000).toISOString() : new Date().toISOString(),
    a: aircraft,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
    },
  });
}
