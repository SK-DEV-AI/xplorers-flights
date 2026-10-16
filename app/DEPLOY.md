# Xplorers Flights — run + deploy notes

## Run locally (2 minutes)

```bash
cd app
cp .env.example .env.local   # then paste DUFFEL_TEST_KEY inside
npm install
npm run dev                  # open http://localhost:3000
```

Get the free key: duffel.com → dashboard → Test Mode → create token
(starts with `duffel_test_`). No card needed for test mode.

## What works without any key

- All pages render: `/` search, `/copilot`, `/passengers`, `/bookings`, `/login`
- `/api/status` reports provider/mode/key state (no secrets)
- Search without a key returns a helpful message telling you where to get one

## Plug-and-play keys (the whole point)

| Want | Set in `.env.local` or host dashboard |
|---|---|
| Practice search (free) | `DUFFEL_TEST_KEY=duffel_test_…`, `DUFFEL_MODE=test` |
| Live search (needs Duffel KYC + card on file) | `DUFFEL_LIVE_KEY=duffel_live_…`, `DUFFEL_MODE=live` |
| Live booking (needs all three at once) | live mode + live key + `BOOKING_ENABLED=true` |

No code changes for any of these. Restart the server after changing env.

## Switch providers later

1. Add `src/lib/providers/<name>.ts` implementing `FlightProvider`
   (see `src/lib/flights/types.ts` + `duffel.ts` as the reference).
2. Add one `case` in `src/lib/flights/index.ts`.
3. Set `FLIGHT_PROVIDER=<name>`.

UI and API routes stay untouched.

## Deploy free — Vercel Hobby (recommended)

Why: zero-config Next.js, 100 GB transfer + 1M function calls/month free.
Fine for a college demo. Non-commercial use.

```bash
npm i -g vercel
cd app
vercel          # first run links the project
vercel --prod   # ship it
```

Then in the Vercel dashboard → project → Settings → Environment
Variables, add the same keys as `.env.local` (test key is enough for
the demo). Redeploy after adding variables.

Backup free option: Cloudflare Pages + Workers (unlimited bandwidth,
100k requests/day) via the OpenNext adapter. Use only if Vercel
limits ever bite — same code, different adapter.

## Free APIs used (no signup) vs keys to register

Used now, keyless:
- Airport reference: `GET /api/airports?code=JFK` → airportsapi.com
- Live aircraft: `GET /api/traffic?lat=..&lon=..` → adsb.lol, OpenSky fallback

Register (all free tiers):
1. Duffel test key — duffel.com → Test Mode. Gives sandbox search+book.
   Paste into `.env.local` as DUFFEL_TEST_KEY. Done already on this machine.
2. Gemini API key — Google AI Studio (free tier) — for the copilot model.
   Cheapest reliable: Gemini Flash. Alternative: Groq (free tier, fastest).
3. Supabase project — free Postgres + Auth — for bookings history + login
   (after exams).
4. Navitia key (free tier) — ONLY if sir asks for ground transport
   (airport ↔ city trains/buses). Europe-focused; needs signup.

NOT free / skip: live Duffel booking (needs KYC + card + balance),
Amadeus (enterprise-only since Jul 2026), Skyscanner (partner approval).

## AI model for the copilot (cheap, with tool calling)

Pick Gemini Flash via Google AI Studio: free tier, tool/function calling
supported, cheapest per-token of the reliable options. Fallback: Groq
Llama 3.1 8B (free tier, sub-100ms). Wire via Vercel AI SDK `streamText`
+ `tools` — same pattern as our search/book tools. Cost at demo scale:
effectively zero.

## Revenue model (college-plausible)

1. Markup per booking: add a fixed service fee (e.g. ₹99–199) on top of
   the Duffel fare at checkout. Duffel charges ~$3/order — fee covers it.
2. Ancillary cut: seat/baggage upsells carry margin.
3. No subscriptions, no ads for the demo. Show the fee line on the
   review modal so sir sees the business logic, not hidden charges.

## College demo script (5 minutes)

1. `/api/status` → shows `duffel/test`, key set, booking off.
2. `/` → type “SFO to Tokyo for 2 adults” → slots fill → search →
   real-structured offers → review modal.
3. `/copilot` → narrated transcript of the same search.
4. `/passengers` → fill form → submit → 403 “Booking is disabled”
   proves the guard works without spending anything.
5. Explain: flip three env values with a live key and the same
   site books for real. No rewrite.
