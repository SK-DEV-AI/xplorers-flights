# Xplorers Flights — Complete Technical Overview

**Team: The Xplorers** · B.E. Computer Science and Engineering (First Year) · 4 members
Repo: https://github.com/SK-DEV-AI/xplorers-flights

This is the full map of the codebase: what it does, how it works, every API
and library used, and where each piece of code lives. Use it to answer any
question in the meeting.

---

## 1. THE PRODUCT IN ONE PARAGRAPH

A conversational website where a user describes a travel need in plain
English ("SFO to Tokyo for 2 adults"), and an AI agent figures out what is
being asked, calls the right live APIs on the server, and answers with real
data — fares, flight status, security queues, drive times, transit routes,
weather, air quality. The initial scope is flights; the design is
provider-agnostic so trains and buses can be added later.

---

## 2. THE ARCHITECTURE — THE ONE THING TO EXPLAIN

```
  Browser
    │  "SFO to Tokyo for 2 adults"
    ▼
  POST /api/agent
    │
    ├─► THE MODEL  (OpenAI-compatible chat endpoint, big-pickle)
    │     • receives the user's message AND the full list of 15 tools
    │     • replies with EITHER a tool call OR plain conversational text
    │     • never holds a key, never calls an API
    │
    ├─► WE RUN THE TOOL  (server-side, with our secret keys)
    │     • runTool(name, args) in src/lib/copilot/tools.ts
    │     • hits the real API (Duffel, Aviationstack, OSRM, …)
    │     • returns facts as PROSE, not JSON
    │
    ├─► FEED THE FACTS BACK  ──┐
    │                         │  the model decides again: another tool
    │                         │  (chain) or the final answer
    │◄────────────────────────┘
    ▼
  Model writes the reply → the page renders it + rich cards
```

**The rule that must never break:** *the model never holds a key and never
calls an API. It only chooses which tool to run and with what arguments.*

**Why this matters:** swapping the free model for a paid one is a change of
three environment variables. Zero code changes. The same applies to flight
providers — a new airline API is one file plus one line.

### The agent loop is a real loop, not a parser

- Up to **4 rounds** per question (`MAX_ROUNDS` in `src/app/api/agent/route.ts`).
- The model may chain tools. Verified live: *"how late am I going to be if I
  drive to Heathrow"* → it called `drive_time_to_airport`, then
  `security_wait_time`, then `local_time_at`, and wrote one answer.
- If the model reaches for tools every round, we compose the final answer
  from everything gathered.

### Two safety nets on the model's output

| Guard | What it catches | File |
|---|---|---|
| `looksLikeData()` | The model echoing raw JSON instead of answering | `src/lib/copilot/agent.ts` |
| `numbersAreSupported()` | The model inventing a number (it once turned £655.14 into £621) | `src/lib/copilot/agent.ts` |

If either trips, we fall back to our own tool summary — which is written to
stand alone.

---

## 3. FILE-BY-FILE MAP

### Pages (`src/app/`)

| File | What it does |
|---|---|
| `page.tsx` | **Home.** Chat-first. "Ask the agent" ⇄ "Search manually" toggle. Posts to `/api/agent`. "What I can do" panel (AI mode only). Price/non-stop filters. Journey cards. Renders rich cards for every tool result. |
| `radar/page.tsx` + `radar/Globe.tsx` | **The showpiece.** 3D globe (three.js), 4,000+ live aircraft, coloured by altitude, click to lock on. Auto-spins at 1.1°/s. |
| `tracker/page.tsx` + `tracker/LiveMap.tsx` | Airport lookup, Leaflet map, aircraft nearby, live status + schedule. Auto-runs from `?flight=BA117`. |
| `copilot/page.tsx` | Audit trail of tool calls — shows exactly what the agent did. Uses the deterministic router. |
| `passengers/page.tsx` | Step 2 of booking. `?offer=` prefills. Remove passenger. |
| `bookings/page.tsx` | Step 4 of booking. Honest empty state; sample ticket behind a disclosure. |
| `login/page.tsx` | Demo sign-in (localStorage). Real Supabase Auth is NOT wired yet. |

### The agent layer (`src/lib/copilot/`)

| File | What it does |
|---|---|
| `agent.ts` | `AGENT_TOOLS` — the 15 tools in OpenAI-style function schema. `askModel()` — one model call with tools. `composeAnswer()` — facts → reply. The SYSTEM prompt. The two output guards. |
| `tools.ts` | `runTool(name, args)` — runs each tool server-side. `describeToolResult()` — turns tool data into PROSE for the model. Helpers: `resolveCoords`, `transitStop`, `nearbyPlaces`, `aqiBand`, `budgetMinutes`, `zoneForPlace`. |
| `proxy.ts` | The OLD slot parser. Still used by `/api/copilot` (the deterministic fallback router). |

### The rest of `src/lib/`

| File | What it does |
|---|---|
| `env.ts` | Every environment variable in one typed contract. |
| `flights/types.ts` | `FlightOffer`, `SearchInput`, `Passenger`, `BookingResult`, and the `FlightProvider` interface. |
| `flights/duffel.ts` | The Duffel provider (search, create order, cancel). |
| `flights/index.ts` | `getProvider()` — one `case` per provider. |
| `aviation/airports.ts` | **New.** Local table of ~130 major airports: code, name, city, lat, lon, country, timezone. Plus a country→timezone map. |
| `aviation/keyless.ts` | Keyless aviation data: airport lookup (local table first, live service as fallback), live aircraft from adsb.lol and OpenSky. |
| `status/aviationstack.ts` | Live flight status. **Filters to the EXACT flight match** — never falls back to the raw list. |
| `status/aerodatabox.ts` | Flight schedules (departure/arrival times, distance). |
| `supabase/client.ts`, `supabase/bookings.ts` | Supabase access, RLS-aware. |
| `geo.ts` | Globe geometry: lat/lon → 3D vector, latitude circles, topojson → line segments. |
| `metar.ts`, `places.ts` | METAR/TAF parsing, place search. |

---

## 4. EVERY API WE USE

### The flight APIs (need keys)

| API | Used for | Key needed? | Live result |
|---|---|---|---|
| **Duffel Flights** | Live fares, booking, cancellation | Yes (`DUFFEL_TEST_KEY`) | SFO→HND: **83 real offers**, BA 0117 at £619.38, non-stop |
| **Aviationstack** | Live flight status | Yes (`AVIATIONSTACK_KEY`) | BA117: LHR→JFK, landed, 23 min late, Terminal 5, Gate C54 |
| **AeroDataBox** (RapidAPI) | Flight schedules | Yes (`RAPIDAPI_KEY`) | BA 117, 5,555 km, scheduled times |
| **Supabase** | Database + row-level security | Yes | `bookings` table, RLS on, anon INSERT → 401 |

### The journey APIs (no key needed)

| API | Used for | Live result |
|---|---|---|
| **OSRM** (router.project-osrm.org) | Drive time to the airport | Heathrow: 39 min / 28 km from London → "allow 2 h 9 min door to gate" |
| **Transitous** | Bus/metro/train route to the airport | Bengaluru→KIA: 77 min, leg by leg |
| **Security Wait Times** | Security queue times (440 US airports) | JFK: 25 min standard, 7 min PreCheck (live reading) |
| **Overpass API** (OSM) | Parking lots, transit stops, taxi ranks nearby | 5 parking options near an airport |
| **Nominatim** (OSM) | Geocoding, place names, timezones | Tokyo, Sydney, Chennai → coordinates + country |
| **Open-Meteo** | Weather, high/low, wind | Tokyo: 22.6 °C, wind 4.8 km/h, 15.4–22.8 °C |
| **Open-Meteo Air Quality** | AQI, PM2.5 | Delhi: AQI 186 hazardous, PM2.5 119.7 |
| **Open-Meteo** | Sunrise, sunset, daylight length | Mumbai: sunrise 6:34, sunset 6:12 |
| **USGS** | Recent earthquakes (4.5+) | 25 quakes in the last 24 h |
| **Frankfurter** | Exchange rates | 1 USD = 94.47 INR |
| **timeapi.io** | Local time by timezone | London 15:30, Sydney 05:30 |
| **aviationweather.gov** | METAR / TAF | Live pilot reports |
| **adsb.lol** | Live aircraft near an airport | Real positions |
| **OpenSky** | Worldwide live aircraft (radar) | 6,585 aircraft in the compact feed |
| **airportsapi.com** | Airport lookup fallback | Only for codes not in our local table |

### The model

| Service | Model | Notes |
|---|---|---|
| **OpenAI-compatible proxy** | `big-pickle` | Chosen because it is free. Supports `tools` / `tool_calls`. Swap for any paid model by changing `COPILOT_BASE_URL`, `COPILOT_MODEL`, `COPILOT_API_KEY`. |

---

## 5. THE 15 TOOLS THE AGENT CAN CALL

Defined in `src/lib/copilot/agent.ts` (schema) and `src/lib/copilot/tools.ts`
(implementation). **Add a tool in BOTH files.**

| Tool | Question it answers | Source |
|---|---|---|
| `search_flights` | "Find me a flight from SFO to HND" | Duffel |
| `flight_status` | "Is BA117 on time?" | Aviationstack |
| `flight_schedule` | "When does BA117 depart?" | AeroDataBox |
| `drive_time_to_airport` | "How long to the airport?" | OSRM |
| `public_transit_to_airport` | "How do I get there by bus/metro?" | Transitous |
| `security_wait_time` | "How long is the security queue?" | Security Wait Times |
| `nearby_parking_and_transit` | "Where do I park?" | Overpass + Nominatim |
| `nearby_places` | "What's near the airport?" | Overpass + Nominatim |
| `weather_at` | "What's the weather there?" | Open-Meteo |
| `air_quality_at` | "Is the air safe?" | Open-Meteo AQ |
| `sun_times_at` | "When does the sun set?" | Open-Meteo |
| `recent_earthquakes` | "Any quakes today?" | USGS |
| `exchange_rate` | "What's the rate?" | Frankfurter |
| `local_time_at` | "What time is it there?" | timeapi.io |

---

## 6. LIBRARIES AND FRAMEWORK

| Package | Version | Why we use it |
|---|---|---|
| **next** | 16.4.2 | App Router — same code serves the UI and the API routes |
| **react / react-dom** | 19.3.1 | UI |
| **typescript** | ^5.7.0 | All application and AI logic |
| **tailwindcss** | (Next default) | Styling |
| **three** | ^0.186.1 | The 3D radar globe. Lazy-loaded so the rest of the site stays fast |
| **leaflet** | ^1.9.4 | The map on the tracker page |
| **@supabase/supabase-js** | ^2.118.0 | Database + auth |
| **zod** | ^3.23.8 | Validating search input at the API boundary |
| **world-atlas** + topojson | (vendored) | Country borders on the globe (107 KB) |
| **earth-blue-marble.jpg** | (vendored) | Earth texture (1.4 MB) |

**Total: 6,761 lines of TypeScript across 50 files.**

---

## 7. THE 21 API ROUTES

`/api/agent` · `/api/copilot` · `/api/search` · `/api/book` ·
`/api/flight-status` · `/api/schedules` · `/api/global-traffic` ·
`/api/metar` · `/api/transit` · `/api/nearby` · `/api/wait-times` ·
`/api/air-quality` · `/api/sun` · `/api/earthquakes` · `/api/weather` ·
`/api/currency` · `/api/time` · `/api/places` · `/api/airports` ·
`/api/traffic` · `/api/status`

Each one is a thin server-side wrapper so **no API key ever reaches the
browser**.

---

## 8. HOW TO ADD A TRANSPORT (train, bus)

The whole point of the provider interface:

```ts
// src/lib/flights/types.ts
export interface FlightProvider {
  readonly name: string;
  readonly mode: "test" | "live";
  searchOffers(input: SearchInput): Promise<FlightOffer[]>;
  createOrder(offerId: string, passengers: Passenger[]): Promise<BookingResult>;
  cancelOrder(orderId: string): Promise<{ status: string }>;
}
```

1. Write `src/lib/flights/yourprovider.ts` implementing that interface.
2. Add one `case` in `src/lib/flights/index.ts`.
3. Set `FLIGHT_PROVIDER=yourprovider` in the environment.

Nothing else changes — the agent, the UI, the booking flow all keep working.
This is the "plug and play" promise.

---

## 9. SAFETY AND HONESTY (what the write-up asks for)

- **Keys stay on the server.** Every API call goes through a Next.js route.
- **Booking is guarded.** `BOOKING_ENABLED=false` until a live Duffel key
  exists. `createOrder` refuses unless the provider is live AND booking is
  enabled.
- **No invented data.** The model never holds a key; the numeric guard
  rejects any number that is not in the tool facts.
- **Honest degradation.** If the open transit dataset has no route, the site
  says so instead of pretending. If Overpass is at capacity, Nominatim
  answers instead of showing a blank panel.
- **User confirmation before any order.** Passenger details are collected
  and shown before an order is created.
- **Sandbox tickets are marked as such.**

---

## 10. HONEST LIMITATIONS (if asked)

1. **Booking is not live.** It needs a live Duffel key (KYC + card + balance).
   Test mode never issues a real ticket.
2. **Supabase Auth is not wired.** `/login` is a localStorage demo.
3. **The model is a local proxy** pointed at `127.0.0.1:8787`. In production
   it must point at a real API URL — otherwise the agent falls back to the
   deterministic router.
4. **The 3D globe and the map need internet** — they pull live data.
5. **Transit coverage is open-data limited.** Delhi and Mumbai are missing
   from the dataset; the app says so.
6. **Free APIs are flaky by nature.** Overpass goes to capacity, and
   airportsapi.com intermittently times out — we keep a local airport table
   precisely because of that.

---

## 11. HOW TO RUN IT

```bash
cd app
npm install
cp .env.example .env.local     # then fill in the keys
npm run dev                     # http://localhost:3000
```

Environment variables (all in `src/lib/env.ts`):

```
FLIGHT_PROVIDER=duffel         DUFFEL_MODE=test
DUFFEL_TEST_KEY=...            DUFFEL_LIVE_KEY=        BOOKING_ENABLED=false
AVIATIONSTACK_KEY=...          RAPIDAPI_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
COPILOT_BASE_URL=...           COPILOT_MODEL=...       COPILOT_API_KEY=...
```

Deployment steps are in `app/DEPLOY.md` (Vercel Hobby).

---

## 12. WHAT TO SHOW IN THE MEETING

1. **Home** — type "status of BA117", then "SFO to Tokyo for 2 adults".
   Show the offer cards.
2. **Radar** — the 3D globe with thousands of live aircraft.
3. **Tracker** — the map and live status.
4. **Agent transcript** (`/copilot`) — shows the tool calls, proving the
   agent really works rather than faking it.

The strongest demo is asking something that needs **two** facts, e.g.
*"how late am I going to be if I drive to Heathrow"* — it chains the drive
time, the security queue and the local time, then answers in one sentence.
