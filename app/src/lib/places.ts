/**
 * Free place + airport search — keyless, no signup, no API key.
 *
 * Source (verified live Oct 18, 2026):
 * - Nominatim / OpenStreetMap geocoder
 *   https://nominatim.openstreetmap.org/search?q=<text>&format=jsonv2&limit=5
 *   Docs: https://nominatim.org/release-docs/develop/api/Search/
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * max 1 request per second, a real identifying User-Agent is mandatory,
 * and results may not be bulk-downloaded. The Next.js data cache plus the
 * 24h revalidate window keeps us far under the limit for a demo app.
 *
 * The User-Agent below is required — Nominatim blocks requests without one.
 */

export interface Place {
  /** Short label: the place name, falling back to the first display_name part. */
  name: string;
  /** Full human-readable address, e.g. "London Heathrow Airport, Inner Ring West, ...". */
  displayName: string;
  lat: number;
  lon: number;
  /** Nominatim feature type, e.g. "aerodrome", "city", "administrative". */
  type: string;
  /** Stable OpenStreetMap identifier, e.g. "relation:14001268". */
  id: string;
}

export interface PlaceSearchResult {
  count: number;
  places: Place[];
}

/** Nominatim returns strings for coordinates — keep the raw shape honest. */
interface NominatimResult {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  class?: string;
  type?: string;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
}

const USER_AGENT = "XplorersFlights/1.0 (student project; contact via GitHub SK-DEV-AI)";

/**
 * Search OpenStreetMap for places and airports.
 * Returns an empty list when nothing matches — an empty result is not an error.
 */
export async function searchPlaces(query: string): Promise<PlaceSearchResult> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&limit=5`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 86400 }, // reference data barely changes
  });

  if (!res.ok) {
    throw new Error(`Place search is unavailable right now (${res.status}).`);
  }

  const json = (await res.json()) as NominatimResult[];
  if (!Array.isArray(json)) {
    throw new Error("Place search returned an unexpected response.");
  }

  const places: Place[] = json
    .map((r) => toPlace(r))
    .filter((p): p is Place => p !== null);

  return { count: places.length, places };
}

function toPlace(r: NominatimResult): Place | null {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const displayName = (r.display_name ?? "").trim();
  // Some features have no `name`; fall back to the head of the display name.
  const name = (r.name ?? "").trim() || (displayName.split(",")[0] ?? "").trim() || "Unnamed place";
  const id = r.osm_type && r.osm_id !== undefined ? `${r.osm_type}:${r.osm_id}` : `place:${r.place_id ?? 0}`;

  return {
    name,
    displayName: displayName || name,
    lat,
    lon,
    type: (r.type ?? r.class ?? "place").replace(/_/g, " "),
    id,
  };
}