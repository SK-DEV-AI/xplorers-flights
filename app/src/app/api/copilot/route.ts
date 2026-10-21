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

/**
 * Our own origin, for the route-to-route calls (a relative URL has no
 * origin inside a server handler).
 */
const SELF_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3100");

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

      case "drive": {
        const to = slots.airport ?? slots.destination;
        if (!to) return fail(base, "Which airport should I plan the drive to? Name it, e.g. DEL or Chennai airport.");
        steps.push(`Working out the drive to ${to}…`);
        try {
          const airport = await lookupAirport(to);
          // A stand-in for "where the user is now": the airport's own city
          // centre. The real product takes a GPS fix from the browser.
          const city = AIRPORT_CITY[airport.iata ?? ""] ?? null;
          const origin = city ? await resolveCoords(null, city) : null;
          if (!origin) {
            return NextResponse.json({
              ...base,
              ok: true,
              drive: { airport: airport.name, code: airport.iata ?? to, minutes: null, distanceKm: null, origin: null },
              reply: `I know ${airport.name}. Tell me where you are now and I will work out the drive time.`,
            });
          }
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${airport.longitude},${airport.latitude}?overview=false`,
            { next: { revalidate: 600 } },
          );
          if (!res.ok) throw new Error("The routing service is busy right now.");
          const route = (await res.json()) as {
            routes?: Array<{ duration: number; distance: number }>;
            code?: string;
          };
          const leg = route.routes?.[0];
          if (!leg) throw new Error("I could not work out that route.");
          const minutes = Math.round(leg.duration / 60);
          const distanceKm = Math.round(leg.distance / 1000);
          return NextResponse.json({
            ...base,
            ok: true,
            drive: {
              airport: airport.name,
              code: airport.iata ?? to,
              minutes,
              distanceKm,
              origin: city,
            },
            reply:
              `Drive to ${airport.name} is about ${minutes} minutes (${distanceKm} km) from ${city}.` +
              ` Leave by ${leaveBy(minutes, 90)} to be at the airport 90 minutes before departure.`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Drive time lookup failed.");
        }
      }

      case "airquality": {
        const code = slots.airport ?? slots.origin ?? slots.destination;
        const city = slots.place;
        steps.push(code ? `Checking air quality near ${code}…` : city ? `Checking air quality in ${city}…` : "Checking air quality…");
        const coords = await resolveCoords(code, city);
        if (!coords) return fail(base, "Which place? Name a city or airport code.");
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
          return fail(base, err instanceof Error ? err.message : "Air quality lookup failed.");
        }
      }

      case "sun": {
        const code = slots.airport ?? slots.origin ?? slots.destination;
        const city = slots.place;
        steps.push(code ? `Checking daylight hours at ${code}…` : city ? `Checking daylight hours in ${city}…` : "Checking daylight hours…");
        const coords = await resolveCoords(code, city);
        if (!coords) return fail(base, "Which place? Name a city or airport code.");
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
          return fail(base, err instanceof Error ? err.message : "Sun lookup failed.");
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
          return fail(base, err instanceof Error ? err.message : "Seismic lookup failed.");
        }
      }

      case "waittime": {
        const code = (slots.airport ?? slots.destination ?? "").toUpperCase();
        steps.push("Checking the security queue…");
        try {
          const res = await fetch("https://securitywaittimes.com/wp-json/swt/v1/wait", {
            headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
            signal: AbortSignal.timeout(20000),
          });
          if (!res.ok) throw new Error("Security wait times are unavailable right now.");
          const json = (await res.json()) as {
            live_count?: number;
            modelled_count?: number;
            airports?: Array<{
              iata: string; name: string; city?: string; state?: string;
              standard_minutes?: number | null; precheck_minutes?: number | null;
              measurement?: string; precheck_measurement?: string;
            }>;
          };
          const row = code ? (json.airports ?? []).find((a) => a.iata === code) : undefined;
          if (code && !row) {
            return fail(base, `No security wait data for ${code}. It covers 440 US airports.`);
          }
          const live = row?.measurement === "live";
          return NextResponse.json({
            ...base,
            ok: true,
            waitTime: row
              ? {
                  iata: row.iata,
                  name: row.name,
                  city: row.city ?? null,
                  standardMinutes: row.standard_minutes ?? null,
                  precheckMinutes: row.precheck_minutes ?? null,
                  live,
                  source: live ? "live" : "estimated",
                }
              : null,
            reply: row
              ? `Security at ${row.name} is about ${row.standard_minutes ?? "—"} minutes` +
                (row.precheck_minutes != null ? ` (${row.precheck_minutes} min with PreCheck)` : "") +
                `. ${live ? "That figure is live from the airport." : "That is an estimate, not a live reading."}`
              : `Security wait times cover 440 US airports (${json.live_count ?? 0} live right now).`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Wait time lookup failed.");
        }
      }

      case "parking":
      case "places": {
        const code = slots.airport ?? slots.destination ?? slots.origin;
        const city = slots.place;
        steps.push(code ? `Looking for parking and transport near ${code}…` : city ? `Looking up places near ${city}…` : "Looking up nearby places…");
        const coords = await resolveCoords(code, city);
        if (!coords) return fail(base, "Which place? Name a city or airport code.");
        try {
          const json = await nearbyPlaces(coords.lat, coords.lon, 2000);
          const places = json.places ?? [];
          const parking = places.filter((p) => p.kind === "parking");
          const transit = places.filter((p) => p.kind === "transit");
          const taxi = places.filter((p) => p.kind === "taxi");
          const shown = slots.intent === "parking" ? parking : places;
          return NextResponse.json({
            ...base,
            ok: true,
            nearby: {
              label: coords.label,
              parking: parking.slice(0, 5),
              transit: transit.slice(0, 5),
              taxi: taxi.slice(0, 3),
            },
            reply: shown.length
              ? `Near ${coords.label}: ${shown.slice(0, 4).map((p) => p.name).join(", ")}.` +
                (parking.length ? ` ${parking.length} parking option${parking.length === 1 ? "" : "s"} nearby.` : "") +
                (transit.length ? ` ${transit.length} transit stop${transit.length === 1 ? "" : "s"} nearby.` : "")
              : `I could not find parking or transit stops near ${coords.label} in OpenStreetMap.`,
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Places lookup failed.");
        }
      }

      case "transit": {
        const to = slots.airport ?? slots.destination;
        if (!to) return fail(base, "Which airport should I plan the trip to? Name it, e.g. BLR or Heathrow.");
        steps.push(`Planning the public transport route to ${to}…`);
        try {
          const airport = await lookupAirport(to);
          const originCity = AIRPORT_CITY[airport.iata ?? ""] ?? null;
          const origin = originCity ? await resolveCoords(null, originCity) : null;
          if (!origin) {
            return NextResponse.json({
              ...base,
              ok: true,
              transit: null,
              reply: `I can plan bus and metro routes to ${airport.name}, but I need a starting point. Which city are you travelling from?`,
            });
          }
          // Transitous routes between STOPS, not city centroids, so we ask its
          // own geocoder for the nearest stop to each end first. Without this
          // it returns zero itineraries.
          const [fromStop, toStop] = await Promise.all([
            transitStop(originCity ?? "", origin.lat, origin.lon),
            transitStop(airport.name, airport.longitude, airport.latitude),
          ]);
          if (!fromStop || !toStop) {
            return NextResponse.json({
              ...base,
              ok: true,
              transit: { label: airport.name, count: 0, legs: [] },
              reply: `The open transit dataset does not have a stop I can route from for ${airport.name}. It covers Bengaluru, Hyderabad, London and Berlin well.`,
            });
          }
          const when = new Date(Date.now() + 3600000).toISOString();
          const res = await fetch(
            `https://api.transitous.org/api/v1/plan?fromPlace=${fromStop.lat},${fromStop.lon}` +
            `&toPlace=${toStop.lat},${toStop.lon}&time=${encodeURIComponent(when)}` +
            `&mode=TRANSIT,WALK&numItineraries=1`,
            {
              headers: { "User-Agent": TRANSIT_UA, Accept: "application/json" },
              signal: AbortSignal.timeout(40000),
            },
          );
          if (!res.ok) throw new Error("Transit directions are unavailable right now.");
          const raw = (await res.json()) as {
            itineraries?: Array<{
              duration?: number;
              legs?: Array<{
                mode?: string;
                routeShortName?: string;
                agencyName?: string;
                from?: { name?: string };
                to?: { name?: string };
                duration?: number;
              }>;
            }>;
          };
          const json = {
            count: raw.itineraries?.length ?? 0,
            itineraries: (raw.itineraries ?? []).map((it) => ({
              durationMinutes: it.duration ? Math.round(it.duration / 60) : null,
              legs: (it.legs ?? []).map((leg) => ({
                mode: leg.mode ?? "WALK",
                route: leg.routeShortName ?? null,
                agency: leg.agencyName ?? null,
                from: leg.from?.name ?? null,
                to: leg.to?.name ?? null,
                minutes: leg.duration ? Math.round(leg.duration / 60) : null,
              })),
            })),
          };
          const it = json.itineraries?.[0];
          if (!it) {
            return NextResponse.json({
              ...base,
              ok: true,
              transit: { label: airport.name, count: 0, legs: [] },
              reply: `I could not find a public transport route to ${airport.name} in the open dataset. It covers Bengaluru, Hyderabad, London and Berlin well, but not every city yet.`,
            });
          }
          return NextResponse.json({
            ...base,
            ok: true,
            transit: {
              label: airport.name,
              count: json.count ?? 1,
              durationMinutes: it.durationMinutes ?? null,
              legs: it.legs ?? [],
            },
            reply:
              `Bus and metro to ${airport.name}: about ${it.durationMinutes ?? "—"} minutes.` +
              (it.legs?.[0]?.route ? ` Take ${it.legs[0].route}${it.legs[0].agency ? ` (${it.legs[0].agency})` : ""}.` : ""),
          });
        } catch (err) {
          return fail(base, err instanceof Error ? err.message : "Transit lookup failed.");
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

/** Where a traveller usually starts from, per airport, for drive estimates. */
const AIRPORT_CITY: Record<string, string> = {
  DEL: "Delhi", BOM: "Mumbai", MAA: "Chennai", BLR: "Bengaluru", HYD: "Hyderabad",
  JFK: "New York", LHR: "London", CDG: "Paris", HND: "Tokyo", SFO: "San Francisco",
  LAX: "Los Angeles", DXB: "Dubai", SIN: "Singapore", ORD: "Chicago", YYZ: "Toronto",
};

/**
 * "Leave by" time for an airport arrival buffer (default 90 minutes before
 * departure), given a drive time. Returns a plain local clock time.
 */
function leaveBy(minutes: number, bufferMinutes: number): string {
  const departBy = new Date(Date.now() + (minutes + bufferMinutes) * 60000);
  return departBy.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Find the nearest Transitous stop to a point, using its own geocoder.
 * Transitous routes between stops, so a city centroid finds nothing.
 */
async function transitStop(
  label: string,
  lat: number,
  lon: number,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://api.transitous.org/api/v1/geocode?text=${encodeURIComponent(label)}`,
      { headers: { "User-Agent": TRANSIT_UA }, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ lat?: number; lon?: number; type?: string }>;
    const stop = list.find((x) => x.type === "STOP") ?? list[0];
    if (!stop || typeof stop.lat !== "number" || typeof stop.lon !== "number") return null;
    return { lat: stop.lat, lon: stop.lon };
  } catch {
    return null;
  }
}

/** Descriptive User-Agent — Overpass and Transitous both require one. */
const TRANSIT_UA =
  "XplorersFlights/1.0 (student project; open source; https://github.com/SK-DEV-AI/xplorers-flights)";

/**
 * Parking, transit stops and taxi ranks near a point, from OpenStreetMap
 * via Overpass. The public Overpass instance is frequently at capacity, so
 * we fall back to a Nominatim reverse lookup, which names the area.
 */
async function nearbyPlaces(
  lat: number,
  lon: number,
  radius: number,
): Promise<{ count: number; places: Array<{ kind: string; name: string; detail: string }> }> {
  const query =
    `[out:json][timeout:20];(` +
    `node["amenity"="parking"](around:${radius},${lat},${lon});` +
    `node["public_transport"="stop_position"](around:${radius},${lat},${lon});` +
    `node["amenity"="taxi"](around:${radius},${lat},${lon});` +
    `);out body 40;`;
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": TRANSIT_UA },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(22000),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("json")) continue;
      const json = (await res.json()) as {
        elements?: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
      };
      const elements = json.elements ?? [];
      if (elements.length === 0) continue;
      return {
        count: elements.length,
        places: elements.map((el) => {
          const tags = el.tags ?? {};
          const kind =
            tags.amenity === "parking" ? "parking" : tags.amenity === "taxi" ? "taxi" : tags.public_transport ? "transit" : "place";
          return {
            kind,
            name: tags["name:en"] ?? tags.name ?? "Unnamed",
            detail:
              kind === "parking"
                ? [tags.parking, tags.capacity ? `${tags.capacity} spaces` : null, tags.fee === "yes" ? "paid" : null]
                    .filter(Boolean).join(" · ") || "Parking"
                : kind === "transit"
                  ? [tags.network ?? tags.operator, tags.railway === "subway" ? "metro" : tags.bus === "yes" ? "bus" : null]
                      .filter(Boolean).join(" · ") || "Transit stop"
                  : kind === "taxi" ? "Taxi" : "Place",
          };
        }),
      };
    } catch {
      // Try the next mirror.
    }
  }
  // Fallback: search Nominatim for named parking and transit near the
  // point. Overpass is frequently at capacity, and Nominatim is steadier.
  for (const term of ["parking", "metro station", "bus station"]) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(term)}&viewbox=${lon - 0.02},${lat + 0.02},${lon + 0.02},${lat - 0.02}&bounded=1`,
        { headers: { "User-Agent": TRANSIT_UA }, signal: AbortSignal.timeout(9000) },
      );
      if (!res.ok) continue;
      const list = (await res.json()) as Array<{ name?: string; display_name?: string; type?: string; category?: string }>;
      if (list.length > 0) {
        const kind = term === "parking" ? "parking" : "transit";
        return {
          count: list.length,
          places: list.map((x) => ({
            kind,
            name: x.name ?? x.display_name ?? "Unnamed",
            detail: x.display_name?.split(",").slice(1, 3).join(",").trim() ?? "",
          })),
        };
      }
    } catch {
      // Try the next term.
    }
  }

  // Last resort: name the area around the point.
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&namedetails=1`,
      { headers: { "User-Agent": TRANSIT_UA }, signal: AbortSignal.timeout(10000) },
    );
    if (res.ok) {
      const json = (await res.json()) as { name?: string; display_name?: string; category?: string; type?: string; address?: Record<string, string> };
      const name = json.name ?? json.address?.aeroway ?? json.address?.road ?? json.address?.suburb;
      if (name) {
        return {
          count: 1,
          places: [
            {
              kind: json.category ?? json.type ?? "area",
              name,
              detail: json.display_name?.split(",").slice(1, 3).join(",").trim() ?? "",
            },
          ],
        };
      }
    }
  } catch {
    // Fall through.
  }
  return { count: 0, places: [] };
}

/** Security Wait Times only answers a browser-like User-Agent. */
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

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
