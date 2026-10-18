/**
 * Real aviation weather (METAR / TAF) — keyless, no signup, no API key.
 *
 * Source (verified live Oct 18, 2026):
 * - NOAA/NWS Aviation Weather Center Data API
 *   https://aviationweather.gov/api/data/metar?ids=<CODE>&format=json
 *   https://aviationweather.gov/api/data/taf?ids=<CODE>&format=json
 *   Docs: https://aviationweather.gov/data/api/
 *
 * Free for non-commercial use with a working User-Agent. Reports refresh
 * roughly hourly; we cache for 5 minutes so the demo never shows a report
 * more stale than that.
 *
 * Quirks worth remembering:
 * - METAR elements use `rawOb` for the raw text; TAF elements use `rawTAF`.
 * - `temp`, `dewp` and `altim` are JSON numbers but are frequently missing or
 *   null (e.g. temperature below sensor range) — keep them null, never 0.
 * - `visib` is a string ("10+", "6", "1/2SM") because it can contain fractions.
 * - An unknown station with no report comes back as HTTP 204 with an EMPTY body,
 *   not as `[]` — so JSON parsing must be skipped in that case.
 */

export interface MetarReport {
  icao: string;
  airportName: string;
  /** The raw METAR string exactly as the station reported it. */
  raw: string;
  /** ISO timestamp of the observation (reportTime). */
  observedAt: string;
  tempC: number | null;
  dewC: number | null;
  windDirDeg: number | null;
  windKt: number | null;
  /** Visibility as reported, e.g. "10+" (statute miles). */
  visibilitySm: string | null;
  altimeterInHg: number | null;
}

export interface MetarResult {
  count: number;
  metars: MetarReport[];
}

export interface TafForecast {
  icao: string;
  airportName: string;
  /** The raw TAF string exactly as it was issued. */
  raw: string;
}

export interface TafResult {
  count: number;
  tafs: TafForecast[];
}

type ReportKind = "metar" | "taf";

/** One element of either upstream array; the two feeds share most fields. */
interface AviationWeatherElement {
  icaoId?: string;
  name?: string;
  reportTime?: string;
  issueTime?: string;
  rawOb?: string;
  rawTAF?: string;
  temp?: number | null;
  dewp?: number | null;
  wdir?: number | null;
  wspd?: number | null;
  visib?: string | null;
  altim?: number | null;
}

const USER_AGENT = "XplorersFlights/1.0 (student project)";

/** Which report kinds the route accepts. Anything else is a 400. */
export function isReportKind(value: string | null): value is ReportKind {
  return value === "metar" || value === "taf";
}

/** Latest METAR for an airport. Empty array from upstream yields count 0. */
export async function fetchMetars(code: string): Promise<MetarResult> {
  const url = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(code)}&format=json`;
  const rows = await fetchRows(url);
  const metars = rows.map(toMetar).filter((m): m is MetarReport => m !== null);
  return { count: metars.length, metars };
}

/** Latest TAF for an airport. Empty array from upstream yields count 0. */
export async function fetchTafs(code: string): Promise<TafResult> {
  const url = `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(code)}&format=json`;
  const rows = await fetchRows(url);
  const tafs = rows
    .map((r) => {
      const raw = (r.rawTAF ?? "").trim();
      if (!r.icaoId || !raw) return null;
      return { icao: r.icaoId, airportName: (r.name ?? "").trim() || r.icaoId, raw };
    })
    .filter((t): t is TafForecast => t !== null);
  return { count: tafs.length, tafs };
}

async function fetchRows(url: string): Promise<AviationWeatherElement[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 300 }, // METARs update about hourly; stay well inside that
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Aviation weather is unavailable right now (${res.status}).`);
  }
  // 204 means "no report for this station" — an empty body, not `[]`.
  if (res.status === 204) return [];
  const json: unknown = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("Aviation weather returned an unexpected response.");
  }
  return json as AviationWeatherElement[];
}

function toMetar(r: AviationWeatherElement): MetarReport | null {
  const raw = (r.rawOb ?? "").trim();
  if (!r.icaoId || !raw) return null;
  return {
    icao: r.icaoId,
    airportName: (r.name ?? "").trim() || r.icaoId,
    raw,
    observedAt: r.reportTime ?? "",
    tempC: oneDecimal(r.temp),
    dewC: oneDecimal(r.dewp),
    windDirDeg: typeof r.wdir === "number" ? Math.round(r.wdir) : null,
    windKt: typeof r.wspd === "number" ? Math.round(r.wspd) : null,
    visibilitySm: typeof r.visib === "string" && r.visib.length > 0 ? r.visib : null,
    altimeterInHg: oneDecimal(r.altim),
  };
}

/** Round to one decimal place; keep null/missing as null, never coerce to 0. */
function oneDecimal(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}