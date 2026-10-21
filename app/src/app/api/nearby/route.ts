import { NextResponse } from "next/server";

/**
 * GET /api/nearby?lat=12.9941&lon=77.7014&radius=2000
 *
 * Keyless Overpass API — finds parking, bus/metro stops, taxi ranks and
 * other useful things around a point (usually an airport).
 *
 * Docs: https://overpass-api.de/ · Data © OpenStreetMap contributors, ODbL.
 * Note: the Overpass front-end 406s browser-like User-Agents, so we always
 * send a descriptive one.
 */

const UA = "XplorersFlights/1.0 (student project; open source)";

/**
 * Overpass mirrors, tried in order.
 *
 * The main public instance (overpass-api.de) is often at capacity — it
 * returns 502 with an HTML "server is currently at capacity" page. The
 * regional mirrors (osm.ch is Switzerland-only) answer quickly but with
 * EMPTY results for other countries, so an empty answer is never accepted
 * from a mirror — we keep looking.
 */
const MIRRORS = [
  { url: "https://overpass-api.de/api/interpreter", global: true },
  { url: "https://overpass.kumi.systems/api/interpreter", global: true },
  { url: "https://overpass.osm.ch/api/interpreter", global: false },
  { url: "https://overpass.osm.jp/api/interpreter", global: false },
];

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const radius = Math.min(5000, Math.max(200, Number(searchParams.get("radius") ?? "2000")));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Pass lat and lon query parameters." }, { status: 400 });
  }

  const query =
    `[out:json][timeout:20];(` +
    `node["amenity"="parking"](around:${radius},${lat},${lon});` +
    `node["public_transport"="stop_position"](around:${radius},${lat},${lon});` +
    `node["amenity"="taxi"](around:${radius},${lat},${lon});` +
    `);out body 40;`;

  // Two passes: the public instance is flaky, and a second try often lands.
  for (let pass = 0; pass < 2; pass++) {
  for (const mirror of MIRRORS) {
    if (pass === 1 && !mirror.global) continue;
    try {
      const res = await fetch(mirror.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30000),
      });
      // The public instance answers with an HTML "at capacity" page, so check
      // the content type before trusting the body.
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("json")) continue;
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const elements = json.elements ?? [];
      // A regional mirror answers instantly with nothing. Only a global
      // mirror may report "no results"; otherwise keep trying.
      if (elements.length === 0 && mirror.global) {
        return NextResponse.json({
          count: 0,
          attribution: "© OpenStreetMap contributors",
          places: [],
        });
      }
      if (elements.length === 0) continue;
      return NextResponse.json({
        count: elements.length,
        attribution: "© OpenStreetMap contributors",
        places: elements.map((el) => {
          const point = el.lat !== undefined ? { lat: el.lat, lon: el.lon ?? 0 } : (el.center ?? { lat: 0, lon: 0 });
          const tags = el.tags ?? {};
          const kind =
            tags.amenity === "parking"
              ? "parking"
              : tags.amenity === "taxi"
                ? "taxi"
                : tags.public_transport
                  ? "transit"
                  : "place";
          return {
            kind,
            name: tags["name:en"] ?? tags.name ?? "Unnamed",
            lat: point.lat,
            lon: point.lon,
            detail:
              kind === "parking"
                ? [tags.parking, tags.capacity ? `${tags.capacity} spaces` : null, tags.fee === "yes" ? "paid" : null]
                    .filter(Boolean)
                    .join(" · ") || "Parking"
                : kind === "transit"
                  ? [tags.network ?? tags.operator, tags.railway === "subway" ? "metro" : tags.bus === "yes" ? "bus" : null]
                      .filter(Boolean)
                      .join(" · ") || "Transit stop"
                  : kind === "taxi"
                    ? "Taxi"
                    : "Place",
          };
        }),
      });
    } catch {
      // Try the next mirror.
    }
  }
  }

  // Overpass is at capacity, so fall back to Nominatim's reverse lookup,
  // which names the area around the point. It is steadier than Overpass and
  // is enough to answer "what is around the airport".
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&namedetails=1`,
      {
        headers: { "User-Agent": UA },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        name?: string;
        display_name?: string;
        lat?: string;
        lon?: string;
        category?: string;
        type?: string;
        address?: Record<string, string>;
      };
      const name = json.name ?? json.address?.aeroway ?? json.address?.road ?? json.address?.suburb;
      if (name) {
        return NextResponse.json({
          count: 1,
          attribution: "© OpenStreetMap contributors",
          fallback: true,
          places: [
            {
              kind: json.category ?? json.type ?? "area",
              name,
              lat: Number(json.lat ?? lat),
              lon: Number(json.lon ?? lon),
              detail: json.display_name?.split(",").slice(1, 3).join(",").trim() ?? "",
            },
          ],
        });
      }
    }
  } catch {
    // Fall through to the friendly error.
  }

  return NextResponse.json(
    { error: "The places service is busy right now. Please try again in a moment." },
    { status: 502 },
  );
}
