# Xplorers Flights

**An AI agent that books flights, and answers the whole airport journey.**

Type a sentence in plain English. The agent works out what you mean, calls the
real flight-booking API with our server-side key, and shows bookable options
right inside the chat.

> *"SFO to Tokyo for 2 adults"* → live fares, in the conversation.
> *"I'm late — how long to the airport, and is security busy?"* → drive time,
> leave-by time, and the live security queue.

**Team:** The Xplorers · B.E. Computer Science, First Year
**Stack:** Next.js 16 · TypeScript · Tailwind · Supabase · three.js · Leaflet

---

## What it does

| Ask it | It uses | You get |
|---|---|---|
| "SFO to Tokyo for 2 adults" | Duffel | Real flight offers and prices |
| "Status of BA117" | Aviationstack | Live delay, gate, terminal |
| "Schedule of BA117" | AeroDataBox | Per-leg times, distance, terminal |
| "How long to Chennai airport" | OSRM | Drive minutes, km, when to leave |
| "Bus to Bengaluru airport" | Transitous | Leg-by-leg bus and metro route |
| "Security line at JFK" | Security Wait Times | Queue minutes, marked live or estimated |
| "Parking at Chennai airport" | OpenStreetMap | Nearby parking, transit stops, taxis |
| "Weather in Tokyo" | Open-Meteo | Now, high/low, wind |
| "Air quality in Delhi" | Open-Meteo | AQI, PM2.5, health band |
| "Sunset in Mumbai" | Open-Meteo | Sunrise, sunset, daylight length |
| "Any earthquakes today?" | USGS | Magnitude, place, count |
| "1 USD to INR" | Frankfurter | ECB reference rate |
| "Time in London" | timeapi.io | Local time and timezone |

Fifteen tools, every one of them on a free tier or fully keyless.

---

## The architecture

```
User: "SFO to Tokyo for 2 adults"
   │
   ├─► The model reads the message with the full tool list.
   │     It never calls an API — it only picks a tool and its arguments.
   │
   ├─► Our server runs that tool with our secret key.
   │     → Duffel Offer Request → 83 real offers
   │
   └─► We feed the result back; the model writes the final answer,
         and the offer cards render inside the conversation.
```

**The rule that makes it safe:** the model never holds a key. The browser only
ever calls our own `/api/*` routes. All secrets live in `.env.local`
(chmod 600, git-ignored) or in the host's environment settings.

**Provider-agnostic:** `FlightProvider` in `src/lib/flights/types.ts` is an
interface. Duffel implements it today; a train or bus provider drops in as one
more file plus one line in `src/lib/flights/index.ts`. Nothing else changes.

---

## Pages

| Page | What it is |
|---|---|
| `/` | The product. Chat-first, with a manual-search mode for people who want the controls. |
| `/radar` | A 3D globe with 4,000+ aircraft broadcasting their real positions right now. Click one to lock on. |
| `/tracker` | Airport lookup, live map, aircraft nearby, flight status and schedule. |
| `/copilot` | The audit trail — every tool call the agent makes, in order. |
| `/passengers` | Passenger details, validated before anything is booked. |
| `/bookings` | Ticket history, stored in Supabase behind row-level security. |

---

## Running it locally

```bash
cd app
npm install
cp .env.example .env.local     # then fill in the keys
npm run dev -- --port 3100
```

Open http://localhost:3100.

**Required environment variables** are listed in `app/.env.example`. The
booking path stays disabled until a live Duffel key is supplied — in test mode
the API still issues real orders with real PNRs, just against a sandbox
airline and with no money involved.

---

## Status

- Flight search, prices, status, schedules, live aircraft, weather, air
  quality, sunrise, earthquakes, exchange rates, local time, drive time,
  transit, security queues and nearby parking all run against **real public
  APIs**.
- Booking runs against the Duffel **test environment**. Turning it on for real
  needs a live key (KYC, a card on file, and a balance) — no code change.
- Supabase Auth is not wired yet; `/login` is a local demo sign-in.
- The open transit dataset covers Bengaluru, Hyderabad, London and Berlin
  well. Delhi and Mumbai are not in it yet, and the app says so rather than
  pretending.

---

## Licences and attribution

- Flight content: [Duffel](https://duffel.com) (approved seller programme).
- Map data and tiles: © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors (ODbL). Tiles are served by OpenStreetMap — see their
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- Security queue data: Security Wait Times (CC BY 4.0).
- Transit data: [Transitous](https://transitous.org) / MOTIS, via
  OpenStreetMap.
- Aircraft positions: the [OpenSky Network](https://opensky-network.org) and
  adsb.lol public feeds.
- Weather and air quality: [Open-Meteo](https://open-meteo.com).
- Earthquakes: [USGS](https://earthquake.usgs.gov).
- Exchange rates: [Frankfurter](https://www.frankfurter.org) (ECB reference
  rates).
- Earth imagery: NASA Blue Marble, via the three.js examples.

© 2026 The Xplorers.
