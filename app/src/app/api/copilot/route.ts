import { NextResponse } from "next/server";
import { parseWithProxy, type CopilotSlots } from "@/lib/copilot/proxy";
import { getProvider } from "@/lib/flights";
import { flightStatus } from "@/lib/status/aviationstack";
import { flightSchedule } from "@/lib/status/aerodatabox";
import { lookupAirport } from "@/lib/aviation/keyless";

/**
 * POST /api/copilot { message } — the agent router.
 *
 * The MODEL never touches an API key and never calls a provider.
 * It only reads intent + slots out of the sentence. Then OUR code runs
 * the matching tool, server-side, with the secret keys, and returns a
 * narrated transcript the UI renders.
 *
 * Tools: search (Duffel) · status (Aviationstack) · schedule (AeroDataBox)
 *        weather / time (Open-Meteo + timeapi) · currency (Frankfurter)
 *        places (Nominatim) · airport (airportsapi)
 */

const DEFAULT_DATE = "2026-11-14";

/** A failure envelope: always carries a human-readable reply. */
function failBody(message: string) {
  return { reply: message, ok: false as const };
}

/** Send a failure with the shared envelope merged in. */
function fail(base: Record<string, unknown>, message: string, status = 200) {
  return NextResponse.json({ ...base, ...failBody(message) }, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json(
        { via: "none", intent: "unknown", steps: [], ...failBody("Tell me where you want to fly, or ask about weather, time, rates, or a flight number.") },
        { status: 400 },
      );
    }

    // Two round trips (model parse, then the airline feed) are the cost. The
    // local parser is instant, so for plain "X to Y" requests we skip the model
    // call entirely and go straight to the airline feed. Anything fancier
    // (weather, currency, time, status, places) still uses the model.
    const { slots, via } = await parseWithProxy(message);
    const steps: string[] = [];
    const base = { via, intent: slots.intent, slots, steps };

    switch (slots.intent) {
      case "status": {
        const code = slots.flightNo;
        if (!code) return fail(base, "Which flight? Give me a number like BA117.");
        steps.push(`Looking up live status for ${code}…`);
        try {
          const rows = await flightStatus(code, 3);
          const first = rows[0];
          return NextResponse.json({
            ...base,
            ok: true,
            flights: rows,
            reply: first
              ? `${first.flightNo} (${first.airline}) is ${first.status} on ${first.departure} → ${first.arrival}.` +
                (first.delayMin != null ? ` Running ${first.delayMin} minutes late.` : "") +
                (first.terminal ? ` Terminal ${first.terminal}${first.gate ? `, gate ${first.gate}` : ""}.` : "")
              : `No live status for ${code} yet — it may not have departed.`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Status lookup failed.");
        }
      }

      case "schedule": {
        const code = slots.flightNo;
        if (!code) return fail(base, "Which flight's schedule? Try BA117.");
        const date = slots.departureDate ?? new Date().toISOString().slice(0, 10);
        steps.push(`Fetching the ${code} schedule for ${date}…`);
        try {
          const legs = await flightSchedule(code, date);
          const first = legs[0];
          return NextResponse.json({
            ...base,
            ok: true,
            legs,
            reply: first
              ? `${first.flightNo ?? code}: ${first.origin} → ${first.destination}` +
                (first.scheduledUtc ? `, scheduled ${first.scheduledUtc}` : "") +
                (first.distanceKm ? `, ${first.distanceKm.toLocaleString()} km` : "") + "."
              : `No schedule found for ${code} on ${date}.`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Schedule lookup failed.");
        }
      }

      case "weather": {
        const code = slots.airport ?? slots.origin ?? slots.destination;
        const city = slots.place;
        steps.push(code ? `Checking conditions near ${code}…` : city ? `Checking the forecast for ${city}…` : "Checking the forecast…");
        const coords = await resolveCoords(code, city);
        if (!coords) return fail(base, "Which place? Name a city or airport code.");
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
            `&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min` +
            `&timezone=auto`;
          const res = await fetch(url, { next: { revalidate: 900 } });
          if (!res.ok) throw new Error("Weather service is busy right now.");
          const json = (await res.json()) as {
            current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
            daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
            timezone?: string;
          };
          const temp = json.current?.temperature_2m;
          return NextResponse.json({
            ...base,
            ok: true,
            weather: {
              label: coords.label,
              temp,
              code: json.current?.weather_code,
              wind: json.current?.wind_speed_10m,
              high: json.daily?.temperature_2m_max?.[0],
              low: json.daily?.temperature_2m_min?.[0],
            },
            reply:
              `${coords.label} right now: ${wmo(json.current?.weather_code)}, ${temp ?? "—"}°C` +
              (json.daily?.temperature_2m_max?.[0] != null ? ` (high ${json.daily.temperature_2m_max[0]}° / low ${json.daily?.temperature_2m_min?.[0]}°)` : "") +
              (json.current?.wind_speed_10m != null ? `, wind ${json.current.wind_speed_10m} km/h.` : "."),
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Weather lookup failed.");
        }
      }

      case "time": {
        const zone = slots.timezone ?? zoneFor(slots.airport ?? slots.origin ?? slots.destination ?? slots.place);
        steps.push(`Checking local time${zone ? ` in ${zone}` : ""}…`);
        if (!zone) return fail(base, "Where? Name a city or airport.");
        try {
          const res = await fetch(`https://timeapi.io/api/time/current/zone?timeZone=${encodeURIComponent(zone)}`, {
            next: { revalidate: 60 },
          });
          if (!res.ok) throw new Error("Time service is busy right now.");
          const json = (await res.json()) as { timeZone?: string; dateTime?: string; time?: string; date?: string };
          return NextResponse.json({
            ...base,
            ok: true,
            time: json,
            reply: `Local time in ${slots.place ?? slots.airport ?? zone} is ${json.time ?? "—"} (${zone}).`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Time lookup failed.");
        }
      }

      case "airquality": {
        const code = slots.airport ?? slots.origin ?? slots.destination;
        const city = slots.place;
        steps.push(code ? `Checking air quality near ${code}…` : city ? `Checking air quality in ${city}…` : "Checking air quality…");
        const coords = await resolveCoords(code, city);
        if (!coords) return NextResponse.json({ ...base, ...fail(base, "Which place? Name a city or airport code.") });
        try {
          const url =
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}` +
            `&current=pm2_5,us_aqi,european_aqi`;
          const res = await fetch(url, { next: { revalidate: 1800 } });
          if (!res.ok) throw new Error("Air quality service is busy right now.");
          const json = (await res.json()) as {
            current?: { pm2_5?: number | null; us_aqi?: number | null; european_aqi?: number | null };
          };
          const aqi = json.current?.us_aqi ?? null;
          const pm = json.current?.pm2_5 ?? null;
          return NextResponse.json({
            ...base,
            ok: true,
            airQuality: {
              label: coords.label,
              pm25: pm,
              usAqi: aqi,
              europeanAqi: json.current?.european_aqi ?? null,
              band: aqiBand(aqi),
            },
            reply:
              `Air quality in ${coords.label}: ${aqiBand(aqi)}` +
              (aqi != null ? ` (AQI ${aqi})` : "") +
              (pm != null ? `, PM2.5 ${pm} µg/m³.` : "."),
          });
        } catch (err) {
          return NextResponse.json({ ...base, ...fail(base, err instanceof Error ? err.message : "Air quality lookup failed.") });
        }
      }

      case "sun": {
        const code = slots.airport ?? slots.origin ?? slots.destination;
        const city = slots.place;
        steps.push(code ? `Checking daylight hours at ${code}…` : city ? `Checking daylight hours in ${city}…` : "Checking daylight hours…");
        const coords = await resolveCoords(code, city);
        if (!coords) return NextResponse.json({ ...base, ...fail(base, "Which place? Name a city or airport code.") });
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
            `&daily=sunrise,sunset&timezone=auto`;
          const res = await fetch(url, { next: { revalidate: 3600 } });
          if (!res.ok) throw new Error("Sun service is busy right now.");
          const json = (await res.json()) as {
            daily?: { sunrise?: string[]; sunset?: string[] };
            utc_offset_seconds?: number;
          };
          const sunrise = json.daily?.sunrise?.[0] ?? null;
          const sunset = json.daily?.sunset?.[0] ?? null;
          const length = dayLength(sunrise, sunset);
          return NextResponse.json({
            ...base,
            ok: true,
            sun: { label: coords.label, sunrise, sunset, dayLength: length },
            reply:
              `In ${coords.label}, sunrise is ${clock(sunrise)} and sunset is ${clock(sunset)}` +
              (length ? ` — ${length} of daylight.` : "."),
          });
        } catch (err) {
          return NextResponse.json({ ...base, ...fail(base, err instanceof Error ? err.message : "Sun lookup failed.") });
        }
      }

      case "earthquake": {
        steps.push("Checking seismic activity in the last day…");
        try {
          const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson", {
            next: { revalidate: 300 },
          });
          if (!res.ok) throw new Error("Seismic service is busy right now.");
          const json = (await res.json()) as {
            features?: Array<{
              id: string;
              properties?: { mag?: number | null; place?: string; time?: number };
              geometry?: { coordinates?: number[] };
            }>;
          };
          const quakes = (json.features ?? []).map((f) => ({
            magnitude: f.properties?.mag ?? null,
            place: f.properties?.place ?? "Unknown area",
            timeIso: f.properties?.time ? new Date(f.properties.time).toISOString() : null,
            lat: f.geometry?.coordinates?.[1] ?? null,
            lon: f.geometry?.coordinates?.[0] ?? null,
          }));
          const strongest = quakes[0];
          return NextResponse.json({
            ...base,
            ok: true,
            quakes: quakes.slice(0, 6),
            reply: quakes.length
              ? `${quakes.length} earthquake${quakes.length === 1 ? "" : "s"} above 4.5 in the last day.` +
                (strongest?.magnitude != null ? ` Strongest: magnitude ${strongest.magnitude} near ${strongest.place}.` : "")
              : "No earthquakes above magnitude 4.5 in the last day.",
          });
        } catch (err) {
          return NextResponse.json({ ...base, ...fail(base, err instanceof Error ? err.message : "Seismic lookup failed.") });
        }
      }

      case "currency": {
        const from = slots.currencyFrom ?? "USD";
        const to = slots.currencyTo ?? "INR";
        steps.push(`Fetching the ${from} → ${to} rate…`);
        try {
          const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
            next: { revalidate: 3600 },
          });
          if (!res.ok) throw new Error("Rate service is busy right now.");
          const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
          const rate = json.rates?.[to];
          return NextResponse.json({
            ...base,
            ok: true,
            rate: { base: from, quote: to, value: rate, date: json.date },
            reply: rate
              ? `1 ${from} = ${rate} ${to} (reference rate, ${json.date}).`
              : `No rate available for ${from} → ${to}.`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Rate lookup failed.");
        }
      }

      case "places": {
        const q = slots.place ?? slots.airport ?? slots.destination;
        if (!q) return fail(base, "Where? Name a city or airport.");
        steps.push(`Looking up places near ${q}…`);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5`,
            { headers: { "User-Agent": "XplorersFlights/1.0 (student project)" }, next: { revalidate: 86400 } },
          );
          if (!res.ok) throw new Error("Place search is busy right now.");
          const list = (await res.json()) as Array<{ name?: string; display_name?: string; lat?: string; lon?: string; type?: string }>;
          return NextResponse.json({
            ...base,
            ok: true,
            places: list.map((x) => ({ name: x.name ?? x.display_name ?? q, displayName: x.display_name ?? "", lat: Number(x.lat), lon: Number(x.lon), type: x.type ?? "" })),
            reply: list.length
              ? `Near ${q}: ${list.slice(0, 3).map((x) => x.name ?? x.display_name).join(", ")}.`
              : `Nothing found for "${q}".`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Place lookup failed.");
        }
      }

      case "search":
      case "unknown":
      default: {
        if (!slots.origin || !slots.destination) {
          return fail(base, "Which airports? Try “SFO to Tokyo for 2 adults”, or tap Do it yourself to set it manually.");
        }
        const date = slots.departureDate ?? DEFAULT_DATE;
        steps.push(`Searching ${slots.origin} → ${slots.destination} on ${date} for ${slots.passengers}…`);
        try {
          const offers = await getProvider().searchOffers({
            origin: slots.origin,
            destination: slots.destination,
            departureDate: date,
            passengers: slots.passengers,
            cabinClass: slots.cabinClass as "economy" | "premium_economy" | "business" | "first",
          });
          const top = offers[0];
          return NextResponse.json({
            ...base,
            ok: true,
            totalOffers: offers.length,
            // Send the full list so the chat can render "show more"; the
            // client decides how many to show at first.
            offers: offers.slice(0, 25),
            reply: offers.length
              ? `${offers.length} option${offers.length === 1 ? "" : "s"} from ${slots.origin} to ${slots.destination}.` +
                (top ? ` Best is ${top.airline} ${top.flightNo} at ${top.price} ${top.currency}.` : "")
              : `Nothing found on ${slots.origin} → ${slots.destination} for ${date}. Try another date or nearby airport.`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Search failed.");
        }
      }
    }
  } catch {
    return NextResponse.json(
      { via: "none", intent: "unknown", steps: [], ...failBody("Something went wrong on my side. Please try again."), error: "Something went wrong on my side." },
      { status: 500 },
    );
  }
}

/** Turn an airport code or city name into coordinates. */
async function resolveCoords(
  code: string | null,
  city: string | null,
): Promise<{ lat: number; lon: number; label: string } | null> {
  if (code) {
    try {
      const a = await lookupAirport(code);
      return { lat: a.latitude, lon: a.longitude, label: a.name };
    } catch {
      /* fall through to city lookup */
    }
  }
  if (!city) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`,
      { headers: { "User-Agent": "XplorersFlights/1.0 (student project)" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ lat?: string; lon?: string; name?: string; display_name?: string }>;
    const first = list[0];
    if (!first) return null;
    return { lat: Number(first.lat), lon: Number(first.lon), label: first.name ?? city };
  } catch {
    return null;
  }
}

const AIRPORT_ZONES: Record<string, string> = {
  JFK: "America/New_York", LHR: "Europe/London", CDG: "Europe/Paris", HND: "Asia/Tokyo",
  SFO: "America/Los_Angeles", LAX: "America/Los_Angeles", BOM: "Asia/Kolkata", DEL: "Asia/Kolkata",
  MAA: "Asia/Kolkata", DXB: "Asia/Dubai", SIN: "Asia/Singapore",
};

function zoneFor(hint: string | null): string | null {
  if (!hint) return null;
  const upper = hint.toUpperCase();
  if (AIRPORT_ZONES[upper]) return AIRPORT_ZONES[upper];
  const known: Record<string, string> = {
    india: "Asia/Kolkata", chennai: "Asia/Kolkata", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata",
    london: "Europe/London", paris: "Europe/Paris", tokyo: "Asia/Tokyo", "new york": "America/New_York",
    dubai: "Asia/Dubai", singapore: "Asia/Singapore",
  };
  return Object.keys(known).find((k) => hint.toLowerCase().includes(k)) ? known[hint.toLowerCase().split(" ").find((k) => known[k]) ?? ""] ?? null : null;
}

function aqiBand(aqi: number | null): string {
  if (aqi == null) return "unknown";
  if (aqi <= 20) return "good";
  if (aqi <= 40) return "moderate";
  if (aqi <= 60) return "unhealthy for sensitive groups";
  if (aqi <= 80) return "unhealthy";
  if (aqi <= 100) return "very unhealthy";
  return "hazardous";
}

/** "2026-10-20T06:34" -> "6:34 AM" */
function clock(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m[2]} ${suffix}`;
}

/** Difference between two ISO local times, as "12h 05m". */
function dayLength(sunrise: string | null, sunset: string | null): string | null {
  if (!sunrise || !sunset) return null;
  const a = Date.parse(`${sunrise}Z`);
  const b = Date.parse(`${sunset}Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const mins = Math.round((b - a) / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function wmo(code: number | undefined): string {
  if (code === undefined) return "Conditions unknown";
  if (code === 0) return "clear sky";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow showers";
  if (code === 95) return "thunderstorms";
  return "storms with hail";
}
