/**
 * Copilot model backend: local big-pickle proxy (OpenAI-compatible).
 * Endpoint: http://127.0.0.1:8787/v1/chat/completions, model "big-pickle".
 * For team testing only — the team buys a real API key afterwards, then
 * swap COPILOT_MODEL + COPILOT_BASE_URL to the vendor. The parser and
 * tools contract below stays unchanged.
 * Secret (if any) stays server-side: this module is imported only by
 * the /api/copilot route, never by client components.
 */

export type CopilotIntent =
  | "search"
  | "status"
  | "schedule"
  | "weather"
  | "airquality"
  | "sun"
  | "earthquake"
  | "drive"
  | "transit"
  | "waittime"
  | "parking"
  | "currency"
  | "time"
  | "places"
  | "unknown";

export interface CopilotSlots {
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  passengers: number;
  cabinClass: string;
  intent: CopilotIntent;
  /** Flight number for status/schedule, e.g. BA117. */
  flightNo: string | null;
  /** Place or city name for weather/places, e.g. "Tokyo". */
  place: string | null;
  /** Airport code for aviation weather, e.g. LHR or KJFK. */
  airport: string | null;
  /** Currency codes for the currency intent. */
  currencyFrom: string | null;
  currencyTo: string | null;
  /** IANA timezone for the time intent, e.g. Asia/Kolkata. */
  timezone: string | null;
}

const CITY_TO_IATA: Record<string, string> = {
  "new york": "JFK", "london": "LHR", "paris": "CDG", tokyo: "HND",
  "san francisco": "SFO", "los angeles": "LAX", mumbai: "BOM", delhi: "DEL",
};

export function cityToIata(name: string): string | null {
  const t = name.trim().toLowerCase();
  if (/^[a-z]{3}$/.test(t)) return t.toUpperCase();
  return CITY_TO_IATA[t] ?? null;
}

const SYSTEM = `You are the intent + slot parser for a flight and airport-journey agent.
Given ONE user message, reply with ONLY compact JSON (no prose, no code fences) using exactly these keys:
{"origin":null,"destination":null,"departureDate":null,"passengers":1,"cabinClass":"economy","intent":"search","flightNo":null,"place":null,"airport":null,"currencyFrom":null,"currencyTo":null,"timezone":null}

Rules:
- intent MUST be one of: search, status, schedule, weather, airquality, sun, earthquake, currency, time, places, unknown.
  search     = find or book flights (origin + destination)
  status     = one flight's live status (flight number like BA117 present)
  schedule   = one flight's schedule or timetable (flight number present)
  weather    = weather, temperature, rain, storm, forecast
  airquality = air quality, pollution, AQI, PM2.5, smog
  sun        = sunrise, sunset, daylight hours, golden hour
  earthquake = earthquakes, quakes, tremors, seismic activity
  drive      = how long to the airport, traffic, drive time, am I late, leave by when
  transit    = bus, metro, train or public transport to the airport, how to get there
  waittime   = security queue, how long the line is, TSA wait times
  parking    = parking at the airport, where to park, car park
  currency   = exchange rates, currency conversion
  time       = local time, time zone
  places     = what is near / around an airport or city
  unknown    = genuinely unclear
- origin/destination: 3-letter IATA uppercase or null. Map cities: Tokyo->HND, London->LHR,
  Paris->CDG, New York->JFK, San Francisco->SFO, Los Angeles->LAX, Mumbai->BOM, Delhi->DEL,
  Chennai->MAA, Dubai->DXB, Singapore->SIN, Bengaluru->BLR, Hyderabad->HYD.
- departureDate: YYYY-MM-DD or null.
- passengers: number (also accept the keys "adults" or "pax" if you emit them).
- cabinClass: one of economy, premium_economy, business, first.
- flightNo: flight number without space, uppercase, e.g. BA117. null otherwise.
- place: city or place name for weather/airquality/sun/places intents, e.g. "Tokyo". null otherwise.
- airport: airport code mentioned for weather/time intents, e.g. LHR, JFK, KJFK. null otherwise.
- currencyFrom/currencyTo: 3-letter uppercase ISO codes, e.g. "USD","INR". null when not mentioned.
- timezone: IANA zone when a city/country is clearly implied, e.g. "Asia/Kolkata". null otherwise.`;

function fallbackParse(q: string): CopilotSlots {
  const t = q.toLowerCase();
  const codes = (t.match(/\b[a-z]{3}\b/g) ?? []).map((s) => s.toUpperCase());
  const pick = (names: string[], code: string) =>
    names.some((n) => t.includes(n)) || codes.includes(code) ? code : null;
  const origin = pick(["jfk", "new york"], "JFK") ?? pick(["lax", "los angeles"], "LAX") ?? pick(["sfo"], "SFO");
  const destination = pick(["lhr", "london"], "LHR") ?? pick(["cdg", "paris"], "CDG") ?? pick(["hnd", "tokyo"], "HND");
  const flightNo = (t.match(/\b[a-z]{2}\s?\d{1,4}\b/) ?? [])[0]?.toUpperCase().replace(/\s+/g, "") ?? null;
  const m = t.match(/(\d{4}-\d{2}-\d{2})/);
  const paxM = t.match(/(\d+)\s*(passenger|people|adult)/);
  const airport = (q.match(/\b[K]?[A-Z]{3,4}\b/) ?? [])[0]?.toUpperCase() ?? null;
  const money = Array.from(q.matchAll(/\b(USD|EUR|INR|GBP|JPY|AUD|CAD|SGD|AED|CHF|THB|MYR)\b/gi)).map((x) => x[1].toUpperCase());
  const zoneHint: Record<string, string> = {
    india: "Asia/Kolkata", chennai: "Asia/Kolkata", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata",
    london: "Europe/London", paris: "Europe/Paris", tokyo: "Asia/Tokyo", "new york": "America/New_York",
    dubai: "Asia/Dubai", singapore: "Asia/Singapore",
  };
  const zone = Object.keys(zoneHint).find((k) => t.includes(k)) ?? null;
  const place = Object.keys(CITY_TO_IATA).find((k) => t.includes(k)) ?? null;
  const intent: CopilotIntent = flightNo
    ? /schedule|timetable/.test(t)
      ? "schedule"
      : "status"
    : /air ?quality|pollution|\baqi\b|pm2\.5|smog/.test(t)
      ? "airquality"
      : /sunrise|sunset|daylight|golden hour/.test(t)
        ? "sun"
        : /earthquake|\bquake|tremor|seismic/.test(t)
          ? "earthquake"
          : /drive|traffic|how long to .*airport|am i late|leave by|reach the airport/.test(t)
            ? "drive"
          : /weather|forecast|temperature|rain|storm/.test(t)
            ? "weather"
            : /rate|exchange|currency|convert|how much is .* in/.test(t)
              ? "currency"
              : /\btime\b|timezone|local time/.test(t)
                ? "time"
                : /near|around|at the airport|things to do|hotel|food|sight/.test(t)
                  ? "places"
                  : origin || destination
                    ? "search"
                    : "unknown";
  return {
    origin,
    destination,
    departureDate: m ? m[1] : null,
    passengers: /1 passenger|solo|1 pax/.test(t) ? 1 : paxM ? Number(paxM[1]) : 1,
    cabinClass: t.includes("business") ? "business" : t.includes("premium") ? "premium_economy" : t.includes("first") ? "first" : "economy",
    intent,
    flightNo,
    place,
    airport,
    currencyFrom: money[0] ?? "USD",
    currencyTo: money[1] ?? "INR",
    timezone: zone ? zoneHint[zone] : null,
  };
}

/** Ask big-pickle for slots; fall back to local parse on any failure. */
export async function parseWithProxy(q: string): Promise<{ slots: CopilotSlots; via: "proxy" | "local" }> {
  const base = process.env.COPILOT_BASE_URL ?? "http://127.0.0.1:8787/v1";
  const model = process.env.COPILOT_MODEL ?? "big-pickle";
  const key = process.env.COPILOT_API_KEY ?? "local-dev-key";
  const fb = fallbackParse(q);

  // Fast path: a plain "SFO to HND" request parses perfectly well without the
  // model. Skipping the round trip removes ~8s from the first search, which was
  // measured at 28s end to end (audit16). We only call the model when the local
  // parse is unsure, so intent-heavy questions still get real understanding.
  const plainRouteSearch =
    fb.intent === "search" &&
    fb.origin !== null &&
    fb.destination !== null &&
    !/\b(weather|status|schedule|rate|exchange|currency|time|nonstop|non-stop|under|cheapest|business|premium|first|class|direct|fly|price|cost)\b/i.test(q);
  if (plainRouteSearch) {
    return { slots: fb, via: "local" };
  }

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: q },
        ],
        max_tokens: 400,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<CopilotSlots> & {
      adults?: number; pax?: number; from?: string; to?: string; city?: string; code?: string;
    };
    // Lenient: any model shape is folded back onto our contract, with the
    // local parse filling any hole the model left. Never trust it blindly.
    const asIata = (v: unknown): string | null => {
      if (typeof v !== "string" || v.trim() === "") return null;
      return cityToIata(v);
    };
    const pax = parsed.passengers ?? parsed.adults ?? parsed.pax;
    const intents: CopilotIntent[] = [
      "search", "status", "schedule", "weather", "airquality", "sun",
      "earthquake", "drive", "transit", "waittime", "parking", "currency",
      "time", "places", "unknown",
    ];
    const intent = intents.includes(parsed.intent as CopilotIntent) ? (parsed.intent as CopilotIntent) : fb.intent;
    return {
      slots: {
        origin: asIata(parsed.origin ?? parsed.from) ?? fb.origin,
        destination: asIata(parsed.destination ?? parsed.to ?? parsed.city) ?? fb.destination,
        departureDate: parsed.departureDate ?? fb.departureDate,
        passengers: typeof pax === "number" && pax >= 1 ? Math.min(9, Math.floor(pax)) : fb.passengers,
        cabinClass: parsed.cabinClass ?? fb.cabinClass,
        intent,
        flightNo: parsed.flightNo ?? fb.flightNo,
        place: typeof parsed.place === "string" ? parsed.place : fb.place,
        airport: (typeof parsed.airport === "string" ? parsed.airport : fb.airport)?.toUpperCase() ?? null,
        currencyFrom: typeof parsed.currencyFrom === "string" ? parsed.currencyFrom.toUpperCase() : fb.currencyFrom,
        currencyTo: typeof parsed.currencyTo === "string" ? parsed.currencyTo.toUpperCase() : fb.currencyTo,
        timezone: typeof parsed.timezone === "string" ? parsed.timezone : fb.timezone,
      },
      via: "proxy",
    };
  } catch {
    return { slots: fb, via: "local" };
  }
}
