import { getProvider } from "@/lib/flights";
import { flightStatus } from "@/lib/status/aviationstack";
import { flightSchedule } from "@/lib/status/aerodatabox";
import { lookupAirport } from "@/lib/aviation/keyless";

/**
 * The tools the agent may call. Each one runs server-side with our secret
 * keys — the model only ever chooses which one and with what arguments.
 *
 * Every tool returns the same shape so the router can turn it into a
 * narrated transcript.
 */

export interface ToolResult {
  ok: boolean;
  /** Human-readable one-liner, used in the transcript. */
  summary: string;
  /** The data, shaped for the UI. */
  data: Record<string, unknown>;
  /** A friendly message when the tool could not deliver. */
  message: string;
}

/** Where a traveller usually starts from, for drive estimates. */
const AIRPORT_CITY: Record<string, string> = {
  DEL: "Delhi", BOM: "Mumbai", MAA: "Chennai", BLR: "Bengaluru", HYD: "Hyderabad",
  JFK: "New York", LHR: "London", CDG: "Paris", HND: "Tokyo", SFO: "San Francisco",
  LAX: "Los Angeles", DXB: "Dubai", SIN: "Singapore", ORD: "Chicago", YYZ: "Toronto",
};

const TRANSIT_UA =
  "XplorersFlights/1.0 (student project; open source; https://github.com/SK-DEV-AI/xplorers-flights)";

async function resolveCoords(
  code: string | null,
  city: string | null,
): Promise<{ lat: number; lon: number; label: string } | null> {
  if (code) {
    try {
      const a = await lookupAirport(code);
      return { lat: a.latitude, lon: a.longitude, label: a.name };
    } catch {
      /* fall through to a city lookup */
    }
  }
  if (!city) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`,
      { headers: { "User-Agent": TRANSIT_UA }, next: { revalidate: 86400 } },
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

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Run the tool the model chose. */
export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      // ---------------------------------------------------------------- flights
      case "search_flights": {
        const origin = str(args.origin).toUpperCase();
        const destination = str(args.destination).toUpperCase();
        if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
          return fail("Give me two 3-letter airport codes and I will search — for example SFO to HND.");
        }
        const offers = await getProvider().searchOffers({
          origin,
          destination,
          departureDate: str(args.departure_date) || "2026-11-14",
          passengers: Math.max(1, Math.min(9, num(args.passengers, 1))),
          cabinClass: (str(args.cabin_class) || "economy") as "economy" | "premium_economy" | "business" | "first",
        });
        return {
          ok: true,
          summary: `${offers.length} offer${offers.length === 1 ? "" : "s"} found for ${origin} to ${destination}.`,
          data: { offers: offers.slice(0, 12), total: offers.length },
          message: "",
        };
      }

      case "flight_status": {
        const flight = str(args.flight_number).toUpperCase();
        if (!flight) return fail("Which flight? A number like BA117 works best.");
        const rows = await flightStatus(flight, 3);
        const first = rows[0];
        return {
          ok: true,
          summary: first ? `${first.flightNo} is ${first.status} on ${first.departure} to ${first.arrival}.` : `No live rows for ${flight}.`,
          data: { flights: rows },
          message: "",
        };
      }

      case "flight_schedule": {
        const flight = str(args.flight_number).toUpperCase();
        if (!flight) return fail("Which flight's schedule? Try BA117.");
        const date = str(args.date) || new Date().toISOString().slice(0, 10);
        const legs = await flightSchedule(flight, date);
        const first = legs[0];
        return {
          ok: true,
          summary: first ? `${first.flightNo ?? flight}: ${first.origin} to ${first.destination}.` : `No schedule for ${flight} on ${date}.`,
          data: { legs },
          message: "",
        };
      }

      // ------------------------------------------------------------- the journey
      case "drive_time_to_airport": {
        const target = str(args.airport);
        if (!target) return fail("Which airport am I driving to?");
        const airport = await lookupAirport(target);
        const city = AIRPORT_CITY[airport.iata ?? ""] ?? null;
        const origin = city ? await resolveCoords(null, city) : null;
        if (!origin) {
          return {
            ok: true,
            summary: `I know ${airport.name}, but I need a starting point.`,
            data: { drive: { airport: airport.name, code: airport.iata ?? target, minutes: null, distanceKm: null } },
            message: "",
          };
        }
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${airport.longitude},${airport.latitude}?overview=false`,
          { next: { revalidate: 600 }, signal: AbortSignal.timeout(20000) },
        );
        if (!res.ok) throw new Error("routing service busy");
        const route = (await res.json()) as { routes?: Array<{ duration: number; distance: number }> };
        const leg = route.routes?.[0];
        if (!leg) throw new Error("no route");
        const minutes = Math.round(leg.duration / 60);
        const distanceKm = Math.round(leg.distance / 1000);
        return {
          ok: true,
          summary: `Drive to ${airport.name} is about ${minutes} minutes (${distanceKm} km) from ${city}.`,
          data: { drive: { airport: airport.name, code: airport.iata ?? target, minutes, distanceKm, origin: city, leaveBy: leaveBy(minutes) } },
          message: "",
        };
      }

      case "public_transit_to_airport": {
        const target = str(args.airport);
        if (!target) return fail("Which airport should I plan the route to?");
        const airport = await lookupAirport(target);
        const city = AIRPORT_CITY[airport.iata ?? ""] ?? null;
        const origin = city ? await resolveCoords(null, city) : null;
        if (!origin) {
          return {
            ok: true,
            summary: `I can plan routes to ${airport.name}, but I need a starting city.`,
            data: { transit: { label: airport.name, count: 0, legs: [] } },
            message: "",
          };
        }
        const [fromStop, toStop] = await Promise.all([
          transitStop(city ?? "", origin.lat, origin.lon),
          transitStop(airport.name, airport.longitude, airport.latitude),
        ]);
        if (!fromStop || !toStop) {
          return {
            ok: true,
            summary: `The open transit dataset has no stop I can route to ${airport.name} from.`,
            data: { transit: { label: airport.name, count: 0, legs: [] } },
            message: "",
          };
        }
        const when = new Date(Date.now() + 3600000).toISOString();
        const res = await fetch(
          `https://api.transitous.org/api/v1/plan?fromPlace=${fromStop.lat},${fromStop.lon}` +
            `&toPlace=${toStop.lat},${toStop.lon}&time=${encodeURIComponent(when)}&mode=TRANSIT,WALK&numItineraries=1`,
          { headers: { "User-Agent": TRANSIT_UA }, signal: AbortSignal.timeout(40000) },
        );
        if (!res.ok) throw new Error("transit service busy");
        const raw = (await res.json()) as {
          itineraries?: Array<{
            duration?: number;
            legs?: Array<{ mode?: string; routeShortName?: string; agencyName?: string; from?: { name?: string }; to?: { name?: string }; duration?: number }>;
          }>;
        };
        const it = raw.itineraries?.[0];
        return {
          ok: true,
          summary: it ? `Transit route to ${airport.name}: about ${Math.round((it.duration ?? 0) / 60)} minutes.` : `No transit route to ${airport.name} found.`,
          data: {
            transit: {
              label: airport.name,
              count: raw.itineraries?.length ?? 0,
              durationMinutes: it?.duration ? Math.round(it.duration / 60) : null,
              legs: (it?.legs ?? []).map((leg) => ({
                mode: leg.mode ?? "WALK",
                route: leg.routeShortName ?? null,
                agency: leg.agencyName ?? null,
                from: leg.from?.name ?? null,
                to: leg.to?.name ?? null,
                minutes: leg.duration ? Math.round(leg.duration / 60) : null,
              })),
            },
          },
          message: "",
        };
      }

      case "security_wait_time": {
        const code = str(args.airport).toUpperCase();
        const res = await fetch("https://securitywaittimes.com/wp-json/swt/v1/wait", {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error("wait times busy");
        const json = (await res.json()) as {
          live_count?: number;
          airports?: Array<{ iata: string; name: string; city?: string; standard_minutes?: number | null; precheck_minutes?: number | null; measurement?: string }>;
        };
        const row = json.airports?.find((a) => a.iata === code);
        if (!row) {
          return {
            ok: true,
            summary: `No security wait data for ${code}. It covers 440 US airports.`,
            data: { waitTime: null },
            message: "",
          };
        }
        return {
          ok: true,
          summary: `Security at ${row.name} is about ${row.standard_minutes ?? "—"} minutes.`,
          data: {
            waitTime: {
              iata: row.iata,
              name: row.name,
              city: row.city ?? null,
              standardMinutes: row.standard_minutes ?? null,
              precheckMinutes: row.precheck_minutes ?? null,
              live: row.measurement === "live",
            },
          },
          message: "",
        };
      }

      case "nearby_parking_and_transit":
      case "nearby_places": {
        const place = str(args.airport) || str(args.place);
        const coords = await resolveCoords(place || null, place || null);
        if (!coords) return fail("Which place should I look around? Name a city or airport.");
        const places = await nearbyPlaces(coords.lat, coords.lon, 2000);
        return {
          ok: true,
          summary: places.count ? `${places.count} places near ${coords.label}.` : `Nothing found near ${coords.label}.`,
          data: { nearby: { label: coords.label, ...places } },
          message: "",
        };
      }

      // ----------------------------------------------------------- weather & air
      case "weather_at": {
        const place = str(args.place);
        const coords = await resolveCoords(place || null, place || null);
        if (!coords) return fail("Which place? Name a city or airport.");
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
          `&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error("weather busy");
        const json = (await res.json()) as {
          current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
          daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
        };
        return {
          ok: true,
          summary: `${coords.label}: ${json.current?.temperature_2m ?? "—"} degrees.`,
          data: {
            weather: {
              label: coords.label,
              temp: json.current?.temperature_2m ?? 0,
              code: json.current?.weather_code,
              wind: json.current?.wind_speed_10m,
              high: json.daily?.temperature_2m_max?.[0],
              low: json.daily?.temperature_2m_min?.[0],
            },
          },
          message: "",
        };
      }

      case "air_quality_at": {
        const place = str(args.place);
        const coords = await resolveCoords(place || null, place || null);
        if (!coords) return fail("Which place? Name a city or airport.");
        const url =
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}` +
          `&current=pm2_5,us_aqi,european_aqi`;
        const res = await fetch(url, { next: { revalidate: 1800 } });
        if (!res.ok) throw new Error("air quality busy");
        const json = (await res.json()) as { current?: { pm2_5?: number | null; us_aqi?: number | null } };
        const aqi = json.current?.us_aqi ?? null;
        return {
          ok: true,
          summary: `Air quality in ${coords.label}: AQI ${aqi ?? "—"}.`,
          data: {
            airQuality: {
              label: coords.label,
              pm25: json.current?.pm2_5 ?? null,
              usAqi: aqi,
              band: aqiBand(aqi),
            },
          },
          message: "",
        };
      }

      case "sun_times_at": {
        const place = str(args.place);
        const coords = await resolveCoords(place || null, place || null);
        if (!coords) return fail("Which place? Name a city or airport.");
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=sunrise,sunset&timezone=auto`;
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) throw new Error("sun service busy");
        const json = (await res.json()) as { daily?: { sunrise?: string[]; sunset?: string[] } };
        const sunrise = json.daily?.sunrise?.[0] ?? null;
        const sunset = json.daily?.sunset?.[0] ?? null;
        return {
          ok: true,
          summary: `Sunrise ${sunrise ?? "—"}, sunset ${sunset ?? "—"} in ${coords.label}.`,
          data: { sun: { label: coords.label, sunrise, sunset, dayLength: dayLength(sunrise, sunset) } },
          message: "",
        };
      }

      case "recent_earthquakes": {
        const min = str(args.minimum_magnitude) || "4.5";
        const allowed = ["2.5", "4.5", "10", "25", "all"];
        const use = allowed.includes(min) ? min : "4.5";
        const res = await fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${use}_day.geojson`, {
          next: { revalidate: 300 },
        });
        if (!res.ok) throw new Error("seismic service busy");
        const json = (await res.json()) as {
          features?: Array<{ properties?: { mag?: number | null; place?: string; time?: number } }>;
        };
        const quakes = (json.features ?? []).map((f) => ({
          magnitude: f.properties?.mag ?? null,
          place: f.properties?.place ?? "Unknown area",
          timeIso: f.properties?.time ? new Date(f.properties.time).toISOString() : null,
        }));
        return {
          ok: true,
          summary: `${quakes.length} earthquake${quakes.length === 1 ? "" : "s"} above ${use} in the last day.`,
          data: { quakes: quakes.slice(0, 6) },
          message: "",
        };
      }

      // ------------------------------------------------------------ money & time
      case "exchange_rate": {
        const from = (str(args.from_currency) || "USD").toUpperCase();
        const to = (str(args.to_currency) || "INR").toUpperCase();
        const res = await fetch(
          `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { next: { revalidate: 3600 } },
        );
        if (!res.ok) throw new Error("rate service busy");
        const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
        const value = json.rates?.[to] ?? null;
        return {
          ok: true,
          summary: `1 ${from} = ${value ?? "—"} ${to}.`,
          data: { rate: { base: from, quote: to, value, date: json.date ?? "" } },
          message: "",
        };
      }

      case "local_time_at": {
        const place = str(args.place);
        const zone = zoneFor(place);
        if (!zone) return fail("Where? Name a city or country.");
        const res = await fetch(
          `https://timeapi.io/api/time/current/zone?timeZone=${encodeURIComponent(zone)}`,
          { next: { revalidate: 60 } },
        );
        if (!res.ok) throw new Error("time service busy");
        const json = (await res.json()) as { timeZone?: string; dateTime?: string; time?: string };
        return {
          ok: true,
          summary: `Local time in ${place} is ${json.time ?? "—"}.`,
          data: { time: { time: json.time ?? "", zone: json.timeZone ?? zone } },
          message: "",
        };
      }

      default:
        return {
          ok: false,
          summary: "",
          data: {},
          message: `I do not have a tool for that yet. I can search flights, check flight status and schedules, plan the drive and transit to an airport, and answer weather, air quality, sunrise, earthquake, exchange rate and local time questions.`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool failed";
    return {
      ok: false,
      summary: "",
      data: {},
      message: `I could not complete that just now (${message}). The upstream service may be busy — try again in a moment.`,
    };
  }
}

/** A compact, factual summary of a tool result, fed back to the model. */
export function describeToolResult(name: string, data: Record<string, unknown>): string {
  try {
    switch (name) {
      case "search_flights": {
        const offers = (data.offers ?? []) as Array<{ airline: string; flightNo: string; origin: string; destination: string; price: string; currency: string; departAt: string; arriveAt: string; stops: number }>;
        const total = data.total ?? offers.length;
        return JSON.stringify({
          total,
          top: offers.slice(0, 6).map((o) => ({
            airline: o.airline,
            flight: o.flightNo,
            route: `${o.origin}-${o.destination}`,
            departs: o.departAt,
            arrives: o.arriveAt,
            stops: o.stops,
            price: `${o.price} ${o.currency}`,
          })),
        });
      }
      case "flight_status":
        return JSON.stringify(data.flights ?? []);
      case "flight_schedule":
        return JSON.stringify(data.legs ?? []);
      case "drive_time_to_airport":
        return JSON.stringify(data.drive ?? {});
      case "public_transit_to_airport":
        return JSON.stringify(data.transit ?? {});
      case "security_wait_time":
        return JSON.stringify(data.waitTime ?? {});
      case "nearby_parking_and_transit":
      case "nearby_places":
        return JSON.stringify(data.nearby ?? {});
      case "weather_at":
        return JSON.stringify(data.weather ?? {});
      case "air_quality_at":
        return JSON.stringify(data.airQuality ?? {});
      case "sun_times_at":
        return JSON.stringify(data.sun ?? {});
      case "recent_earthquakes":
        return JSON.stringify(data.quakes ?? []);
      case "exchange_rate":
        return JSON.stringify(data.rate ?? {});
      case "local_time_at":
        return JSON.stringify(data.time ?? {});
      default:
        return JSON.stringify(data);
    }
  } catch {
    return JSON.stringify(data);
  }
}

function fail(message: string): ToolResult {
  return { ok: false, summary: "", data: {}, message };
}

/** Find the nearest Transitous stop — it routes between stops, not centroids. */
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

/** Parking, transit stops and taxi ranks near a point, from OpenStreetMap. */
async function nearbyPlaces(
  lat: number,
  lon: number,
  radius: number,
): Promise<{ count: number; parking: unknown[]; transit: unknown[]; taxi: unknown[] }> {
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
        elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }>;
      };
      const elements = json.elements ?? [];
      if (elements.length === 0) continue;
      const parking: unknown[] = [];
      const transit: unknown[] = [];
      const taxi: unknown[] = [];
      for (const el of elements) {
        const tags = el.tags ?? {};
        const name = tags["name:en"] ?? tags.name ?? "Unnamed";
        if (tags.amenity === "parking") {
          parking.push({ name, detail: [tags.parking, tags.capacity ? `${tags.capacity} spaces` : null, tags.fee === "yes" ? "paid" : null].filter(Boolean).join(" · ") || "Parking" });
        } else if (tags.amenity === "taxi") {
          taxi.push({ name, detail: "Taxi" });
        } else if (tags.public_transport) {
          transit.push({ name, detail: [tags.network ?? tags.operator, tags.railway === "subway" ? "metro" : tags.bus === "yes" ? "bus" : null].filter(Boolean).join(" · ") || "Transit stop" });
        }
      }
      return { count: elements.length, parking: parking.slice(0, 5), transit: transit.slice(0, 5), taxi: taxi.slice(0, 3) };
    } catch {
      // Try the next mirror.
    }
  }
  return { count: 0, parking: [], transit: [], taxi: [] };
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

function dayLength(sunrise: string | null, sunset: string | null): string | null {
  if (!sunrise || !sunset) return null;
  const a = Date.parse(`${sunrise}Z`);
  const b = Date.parse(`${sunset}Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const mins = Math.round((b - a) / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function leaveBy(minutes: number): string {
  return new Date(Date.now() + (minutes + 90) * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function zoneFor(place: string): string | null {
  const t = place.trim().toLowerCase();
  const map: Record<string, string> = {
    india: "Asia/Kolkata", chennai: "Asia/Kolkata", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata",
    bengaluru: "Asia/Kolkata", bangalore: "Asia/Kolkata", hyderabad: "Asia/Kolkata",
    london: "Europe/London", paris: "Europe/Paris", tokyo: "Asia/Tokyo", "new york": "America/New_York",
    dubai: "Asia/Dubai", singapore: "Asia/Singapore", "san francisco": "America/Los_Angeles",
  };
  if (map[t]) return map[t];
  if (t.startsWith("asia/") || t.startsWith("europe/") || t.startsWith("america/")) return place;
  return null;
}
