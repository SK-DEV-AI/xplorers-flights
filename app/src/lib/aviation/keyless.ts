/**
 * Keyless aviation data — no API keys, no signup. Inspired by the
 * gods-eye-view pattern: prefer public feeds, degrade honestly.
 *
 * Sources (verified live Oct 16, 2026):
 * - Airports: https://airportsapi.com/api/airports/{CODE} (ICAO or IATA)
 * - Live traffic: https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}
 * - Live traffic alt: https://opensky-network.org/api/states/all (anonymous)
 */

export interface AirportInfo {
  code: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  elevation: number;
  icao: string | null;
  iata: string | null;
}

export interface LiveAircraft {
  hex: string;
  flight: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  speedKt: number | null;
  track: number | null;
}

interface AirportsApiResponse {
  data?: {
    attributes?: {
      name?: string;
      type?: string;
      latitude?: number;
      longitude?: number;
      elevation?: number;
      icao_code?: string | null;
      iata_code?: string | null;
    };
  };
}

export async function lookupAirport(code: string): Promise<AirportInfo> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(clean)) {
    throw new Error("Enter a 3-letter IATA or 4-letter ICAO code.");
  }
  const res = await fetch(`https://airportsapi.com/api/airports/${clean}`, {
    next: { revalidate: 86400 }, // reference data barely changes
  });
  if (!res.ok) throw new Error(`No airport found for "${clean}".`);
  const json = (await res.json()) as AirportsApiResponse;
  const a = json.data?.attributes;
  if (!a?.name) throw new Error(`No airport found for "${clean}".`);
  return {
    code: clean,
    name: a.name,
    type: (a.type ?? "airport").replace(/_/g, " "),
    latitude: a.latitude ?? 0,
    longitude: a.longitude ?? 0,
    elevation: a.elevation ?? 0,
    icao: a.icao_code ?? null,
    iata: a.iata_code ?? null,
  };
}

interface AdsbLolResponse {
  ac?: Array<{
    hex?: string;
    flight?: string;
    lat?: number;
    lon?: number;
    alt_baro?: number | string;
    gs?: number;
    track?: number;
  }>;
}

/** Live aircraft within `radiusNm` of a point. Keyless, rate-limited upstream. */
export async function liveTraffic(lat: number, lon: number, radiusNm = 50): Promise<LiveAircraft[]> {
  try {
    return await fromAdsbLol(lat, lon, radiusNm);
  } catch {
    return fromOpenSky(lat, lon);
  }
}

async function fromAdsbLol(lat: number, lon: number, radiusNm: number): Promise<LiveAircraft[]> {
  const url = `https://api.adsb.lol/v2/lat/${lat.toFixed(2)}/lon/${lon.toFixed(2)}/dist/${radiusNm}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
  const json = (await res.json()) as AdsbLolResponse;
  return (json.ac ?? [])
    .filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
    .slice(0, 25)
    .map((a) => ({
      hex: a.hex ?? "",
      flight: (a.flight ?? "").trim() || "—",
      lat: a.lat as number,
      lon: a.lon as number,
      altitudeFt: typeof a.alt_baro === "number" ? a.alt_baro : null,
      speedKt: typeof a.gs === "number" ? Math.round(a.gs) : null,
      track: typeof a.track === "number" ? Math.round(a.track) : null,
    }));
}

/** OpenSky anonymous fallback: bounding-box states, no key. */
async function fromOpenSky(lat: number, lon: number): Promise<LiveAircraft[]> {
  const d = 1.5;
  const url =
    `https://opensky-network.org/api/states/all?lamin=${lat - d}&lomin=${lon - d}&lamax=${lat + d}&lomax=${lon + d}`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Live traffic unavailable (${res.status}).`);
  const json = (await res.json()) as { states?: Array<[string, string, string, number, number, number, number, number, boolean, number, number, number, unknown, number, string, boolean, number]> };
  return (json.states ?? []).slice(0, 25).map((s) => ({
    hex: s[0] ?? "",
    flight: (s[1] ?? "").trim() || "—",
    lat: s[6],
    lon: s[5],
    altitudeFt: typeof s[7] === "number" ? Math.round(s[7] * 3.28084) : null,
    speedKt: typeof s[9] === "number" ? Math.round(s[9] * 1.94384) : null,
    track: typeof s[10] === "number" ? Math.round(s[10]) : null,
  }));
}
