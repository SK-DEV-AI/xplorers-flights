import { NextResponse } from "next/server";

/**
 * GET /api/transit?from=12.9716,77.5946&to=12.9941,77.7014
 *
 * Keyless public-transit itinerary (MOTIS 2 / Transitous): how to reach an
 * airport by bus, metro or train, leg by leg, with real times.
 *
 * Docs: https://transitous.org/api/ · Open data via OpenStreetMap (ODbL).
 * Transitous asks for a descriptive User-Agent and a link to
 * https://transitous.org/sources/ — we do both.
 * Coverage is uneven: Bengaluru and Hyderabad are good, Delhi and Mumbai
 * are not covered yet, so an empty result is a normal outcome, not an error.
 */

const UA = "XplorersFlights/1.0 (student project; open source; https://github.com/SK-DEV-AI/xplorers-flights)";

interface Leg {
  mode?: string;
  routeShortName?: string;
  agencyName?: string;
  duration?: number;
  distance?: number;
  from?: { name?: string; lat?: number; lon?: number; departure?: string; arrival?: string; stopId?: string };
  to?: { name?: string; lat?: number; lon?: number; arrival?: string; stopId?: string };
  cancelled?: boolean;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") ?? "").trim();
  const to = (searchParams.get("to") ?? "").trim();

  const coord = (v: string) => {
    const m = v.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  };
  const a = coord(from);
  const b = coord(to);
  if (!a || !b) {
    return NextResponse.json(
      { error: 'Pass from and to as "lat,lon" — e.g. from=12.9716,77.5946' },
      { status: 400 },
    );
  }

  const time = searchParams.get("time") ?? new Date(Date.now() + 3600000).toISOString();
  const url =
    `https://api.transitous.org/api/v1/plan?fromPlace=${a.lat},${a.lon}&toPlace=${b.lat},${b.lon}` +
    `&time=${encodeURIComponent(time)}&mode=TRANSIT,WALK&numItineraries=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = (await res.json()) as {
      itineraries?: Array<{ duration?: number; startTime?: string; endTime?: string; walkDistance?: number; legs?: Leg[] }>;
    };
    const itineraries = (json.itineraries ?? []).map((it) => ({
      durationMinutes: it.duration ? Math.round(it.duration / 60) : null,
      startTime: it.startTime ?? null,
      endTime: it.endTime ?? null,
      legs: (it.legs ?? []).map((leg) => ({
        mode: leg.mode ?? "WALK",
        route: leg.routeShortName ?? null,
        agency: leg.agencyName ?? null,
        from: leg.from?.name ?? null,
        to: leg.to?.name ?? null,
        departure: leg.from?.departure ?? null,
        arrival: leg.to?.arrival ?? null,
        minutes: leg.duration ? Math.round(leg.duration / 60) : null,
        cancelled: leg.cancelled === true,
      })),
    }));
    return NextResponse.json({
      count: itineraries.length,
      attribution: "Transitous / MOTIS — data via OpenStreetMap contributors",
      sources: "https://transitous.org/sources/",
      itineraries,
    });
  } catch {
    return NextResponse.json(
      { error: "Transit directions are unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
