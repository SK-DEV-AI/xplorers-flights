import { NextResponse } from "next/server";

/**
 * GET /api/earthquakes?min=4.5&limit=50 — keyless USGS earthquake feed.
 *
 * Source: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/
 * Docs:   https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 *
 * `min` picks one of the USGS magnitude thresholds for the last day.
 * Results come back sorted largest-first and are capped so the payload stays
 * small enough for a browser map.
 *
 * Upstream quirk (found Oct 20, 2026): the summary feed only ships the
 * 2.5 / 4.5 / all thresholds. Asking for 10 or 25 answers HTTP 200 with the
 * body "404 File Not Found", which is not JSON at all. For those two
 * thresholds we use the USGS query API instead, which returns the same
 * GeoJSON shape over a rolling 24-hour window.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const min = searchParams.get("min") ?? "4.5";
  const limitRaw = searchParams.get("limit") ?? "50";

  if (!ALLOWED_MIN.includes(min)) {
    return NextResponse.json(
      { error: "min must be one of 2.5, 4.5, 10, 25, all." },
      { status: 400 },
    );
  }

  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return NextResponse.json(
      { error: "limit must be a whole number between 1 and 200." },
      { status: 400 },
    );
  }

  const res = await fetch(feedUrl(min), { next: { revalidate: 300 } });
  if (!res.ok) {
    return NextResponse.json({ error: `Earthquake feed unavailable (${res.status}).` }, { status: 502 });
  }

  const body = await res.text();
  let json: GeoJsonFeed;
  try {
    json = JSON.parse(body) as GeoJsonFeed;
  } catch {
    return NextResponse.json(
      { error: "The earthquake feed returned an unreadable response." },
      { status: 502 },
    );
  }
  const quakes = (json.features ?? [])
    .map(toQuake)
    .filter((q): q is Quake => q !== null)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, limit);

  return NextResponse.json({ count: quakes.length, quakes });
}

const ALLOWED_MIN = ["2.5", "4.5", "10", "25", "all"];

/** The summary feed only publishes these thresholds per day. */
const SUMMARY_FEEDS = new Set(["2.5", "4.5", "all"]);

function feedUrl(min: string): string {
  if (SUMMARY_FEEDS.has(min)) {
    return `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${min}_day.geojson`;
  }
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    format: "geojson",
    minmagnitude: min,
    starttime: start.toISOString(),
    endtime: end.toISOString(),
  });
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`;
}

interface Quake {
  id: string;
  magnitude: number;
  place: string;
  timeIso: string;
  lat: number;
  lon: number;
  depth: number;
  url: string;
}

interface GeoJsonFeed {
  features?: Array<{
    id?: string;
    properties?: {
      mag?: number | null;
      place?: string | null;
      time?: number | null;
      url?: string | null;
    };
    geometry?: {
      coordinates?: number[];
    };
  }>;
}

/** A feature is only usable when it has a magnitude, a time and coordinates. */
function toQuake(feature: NonNullable<GeoJsonFeed["features"]>[number]): Quake | null {
  const mag = feature.properties?.mag;
  const time = feature.properties?.time;
  const coords = feature.geometry?.coordinates;
  if (typeof mag !== "number" || typeof time !== "number" || !coords || coords.length < 3) {
    return null;
  }
  const [lon, lat, depth] = coords;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  return {
    id: feature.id ?? "",
    magnitude: mag,
    place: feature.properties?.place ?? "Unknown location",
    timeIso: new Date(time).toISOString(),
    lat,
    lon,
    depth: typeof depth === "number" ? depth : 0,
    url: feature.properties?.url ?? "",
  };
}
