/**
 * Copilot model backend: local big-pickle proxy (OpenAI-compatible).
 * Endpoint: http://127.0.0.1:8787/v1/chat/completions, model "big-pickle".
 * For team testing only — the team buys a real API key afterwards, then
 * swap COPILOT_MODEL + COPILOT_BASE_URL to the vendor. The parser and
 * tools contract below stays unchanged.
 * Secret (if any) stays server-side: this module is imported only by
 * the /api/copilot route, never by client components.
 */

export interface CopilotSlots {
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  passengers: number;
  cabinClass: string;
  intent: "search" | "status" | "schedule" | "unknown";
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

const SYSTEM = `You extract flight-search slots from one user sentence.
Reply with ONLY compact JSON, no prose, no code fences:
{"origin":"SFO"|null,"destination":"HND"|null,"departureDate":"2026-11-14"|null,"passengers":2,"cabinClass":"economy","intent":"search"}
Rules: origin/destination are 3-letter IATA uppercase or null (map city names: Tokyo->HND, London->LHR, Paris->CDG). departureDate is YYYY-MM-DD or null. passengers is a number (also accept "adults" or "pax" keys). cabinClass one of economy, premium_economy, business, first. intent is "status" if a flight number like BA117 is present, "schedule" if schedule/itinerary asked, else "search".`;

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
  return {
    origin,
    destination,
    departureDate: m ? m[1] : null,
    passengers: /1 passenger|solo|1 pax/.test(t) ? 1 : paxM ? Number(paxM[1]) : 1,
    cabinClass: t.includes("business") ? "business" : t.includes("premium") ? "premium_economy" : t.includes("first") ? "first" : "economy",
    intent: flightNo ? "status" : /schedule|itinerary/.test(t) ? "schedule" : origin || destination ? "search" : "unknown",
  };
}

/** Ask big-pickle for slots; fall back to local parse on any failure. */
export async function parseWithProxy(q: string): Promise<{ slots: CopilotSlots; flightNo: string | null; via: "proxy" | "local" }> {
  const base = process.env.COPILOT_BASE_URL ?? "http://127.0.0.1:8787/v1";
  const model = process.env.COPILOT_MODEL ?? "big-pickle";
  const key = process.env.COPILOT_API_KEY ?? "local-dev-key";
  const flightNo = (q.match(/\b[A-Za-z]{2}\s?\d{1,4}\b/) ?? [])[0]?.toUpperCase().replace(/\s+/g, "") ?? null;
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
      adults?: number; pax?: number; from?: string; to?: string;
    };
    // Lenient: accept city names, from/to, adults/pax aliases from any model.
    const origin = parsed.origin ?? (parsed.from ? cityToIata(parsed.from) : null) ?? cityToIata(String(parsed.origin ?? ""));
    const destination = parsed.destination ?? (parsed.to ? cityToIata(parsed.to) : null) ?? cityToIata(String(parsed.destination ?? ""));
    const pax = parsed.passengers ?? parsed.adults ?? parsed.pax ?? 1;
    const fb = fallbackParse(q);
    return {
      slots: {
        origin: origin ?? fb.origin,
        destination: destination ?? fb.destination,
        departureDate: parsed.departureDate ?? fb.departureDate,
        passengers: typeof pax === "number" && pax >= 1 ? Math.min(9, Math.floor(pax)) : fb.passengers,
        cabinClass: parsed.cabinClass ?? fb.cabinClass,
        intent: parsed.intent === "status" || parsed.intent === "schedule" || parsed.intent === "search" ? parsed.intent : fb.intent,
      },
      flightNo,
      via: "proxy",
    };
  } catch {
    return { slots: fallbackParse(q), flightNo, via: "local" };
  }
}
