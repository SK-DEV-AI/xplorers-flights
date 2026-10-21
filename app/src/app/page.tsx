"use client";

import React, { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FlightOffer } from "@/lib/flights/types";

/**
 * Home: one chat, two ways in.
 *
 * Casual users type plain English; the agent reads intent + slots, runs the
 * matching server-side tool, and renders results INSIDE the conversation.
 * People who want control get the same tools one click away: filters, a
 * manual form, and per-result tracking — never a dead end.
 *
 * Every tool call is narrated so a reviewer can see what the agent did.
 */

const PROMPTS = [
  "SFO to Tokyo for 2 adults",
  "Weather in Tokyo right now",
  "Air quality in Delhi",
  "Local time in London",
  "1 USD to INR",
  "Status of BA117",
  "Sunrise time in Mumbai",
  "Any earthquakes today?",
];

const CAPABILITIES = [
  { icon: "\u2708", title: "Find flights", example: "SFO to Tokyo for 2 adults" },
  { icon: "\u2713", title: "Track a flight", example: "Status of BA117" },
  { icon: "\u2600", title: "Weather", example: "Weather in Tokyo" },
  { icon: "\u25c9", title: "Air quality", example: "Air quality in Delhi" },
  { icon: "\u25d4", title: "Sunrise & sunset", example: "Sunset in Mumbai" },
  { icon: "\u25b2", title: "Earthquakes", example: "Any quakes today?" },
  { icon: "\u29c9", title: "Exchange rates", example: "1 USD to INR" },
  { icon: "\u29c9", title: "Local time", example: "Time in London" },
  { icon: "\u2313", title: "Places nearby", example: "Places near Heathrow" },
  { icon: "\u25c9", title: "Live radar", example: "Open the radar" },
];

/**
 * Tool payloads the agent can hand back. `/api/agent` nests them under
 * `data`; the deterministic fallback router returns them flat. These mirror
 * the shapes `runTool` produces in `src/lib/copilot/tools.ts`.
 */
interface AgentData {
  offers?: FlightOffer[];
  flights?: Array<{ flightNo: string; airline: string; status: string; departure: string; arrival: string; delayMin: number | null; terminal?: string | null; gate?: string | null }>;
  legs?: Array<{ flightNo: string | null; origin: string; destination: string; scheduledUtc: string | null; distanceKm: number | null }>;
  weather?: { label: string; temp: number; code?: number; wind?: number; high?: number; low?: number };
  airQuality?: { label: string; pm25: number | null; usAqi: number | null; band: string };
  sun?: { label: string; sunrise: string | null; sunset: string | null; dayLength: string | null };
  quakes?: Array<{ magnitude: number | null; place: string; timeIso: string | null }>;
  places?: Array<{ name: string; displayName: string }>;
  rate?: { base: string; quote: string; value: number; date: string };
  time?: { time: string; zone: string };
  drive?: {
    airport: string; code: string; minutes: number | null; distanceKm: number | null;
    origin?: string; budgetMinutes?: number | null; budgetLabel?: string | null;
  };
  waitTime?: { iata: string; name: string; city: string | null; standardMinutes: number | null; precheckMinutes: number | null; live: boolean };
  transit?: {
    label: string;
    count: number;
    durationMinutes?: number | null;
    legs: Array<{ mode: string; route: string | null; agency: string | null; from: string | null; to: string | null; minutes: number | null }>;
  };
  nearby?: {
    label: string;
    count: number;
    parking: Array<{ name: string; detail: string }>;
    transit: Array<{ name: string; detail: string }>;
    taxi: Array<{ name: string; detail: string }>;
  };
}

interface ToolRun extends Partial<AgentData> {
  id: number;
  role: "user" | "agent" | "tool";
  text: string;
}

/** What `/api/agent` (or the fallback router) hands back. */
interface AgentReply {
  reply: string;
  ok: boolean;
  intent?: string;
  steps?: string[];
  /** `/api/agent` nests payloads here; the fallback router returns them flat. */
  data?: AgentData;
}

/** Tools whose answer is better shown on the map. */
const MAP_INTENTS = new Set([
  // agent tool names
  "local_time_at",
  "nearby_places",
  "nearby_parking_and_transit",
  // fallback router intent names
  "time",
  "places",
]);

let seq = 1;
const mk = (m: Omit<ToolRun, "id">): ToolRun => ({ ...m, id: seq++ });

/** Airline-qualified flight number, e.g. BA117 — needed for live lookups. */
function trackCode(o: FlightOffer): string {
  const airline = o.airlineIata || o.airline.slice(0, 2).toUpperCase();
  return `${airline}${o.flightNo.replace(/\D/g, "") || o.flightNo}`;
}

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [manual, setManual] = useState(params.get("mode") === "manual");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ToolRun[]>([
    mk({ role: "agent", text: "Tell me the trip in your own words — “SFO to Tokyo for 2 adults”, or ask about weather, time, rates, or a flight number." }),
  ]);
  const [showAll, setShowAll] = useState(false);
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState(1000);
  const [review, setReview] = useState<FlightOffer | null>(null);
  const [hint, setHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log, busy]);

  // Cold airline feeds are slow on the first call; say so instead of
  // spinning silently (measured: 31s for the first search, 3s after).
  useEffect(() => {
    if (!busy) return;
    const slow = window.setTimeout(() => setHint("Still working — reading your request and querying live inventory."), 6000);
    return () => window.clearTimeout(slow);
  }, [busy]);

  useEffect(() => {
    if (review) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [review]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setHint("");
    const draft: ToolRun[] = [...log, mk({ role: "user", text: q })];
    setLog(draft);
    setShowAll(false);
    try {
      const json = await callAgent(q);
      // `/api/agent` nests payloads under `data`; the fallback router is flat.
      const data: AgentData = json.data ?? (json as unknown as AgentData);
      const out: ToolRun[] = [...draft];
      for (const s of json.steps ?? []) out.push(mk({ role: "tool", text: s }));
      const base = json.reply || "I didn't catch that. Try naming two airports, or a flight number like BA117.";
      // Nudge the user to the tool that actually answers geography questions,
      // instead of silently answering from a guessed airport.
      const reply = json.intent && MAP_INTENTS.has(json.intent)
        ? `${base}\n\nOpen the tracker for the full map and details.`
        : base;
      out.push(
        mk({
          role: "agent",
          text: reply,
          offers: data.offers,
          flights: data.flights,
          legs: data.legs,
          weather: data.weather,
          airQuality: data.airQuality,
          sun: data.sun,
          quakes: data.quakes,
          places: data.places,
          rate: data.rate,
          time: data.time,
          drive: data.drive,
          waitTime: data.waitTime,
          transit: data.transit,
          nearby: data.nearby,
        }),
      );
      setLog(out);
    } catch (err) {
      setLog([...draft, mk({ role: "agent", text: err instanceof Error ? err.message : "Something went wrong." })]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ask the real agent. It gets the full tool list and answers in its own
   * words — no slot parsing, no canned replies.
   *
   * If the model is unreachable (proxy down, network down) we fall back to
   * the deterministic router so the site still answers instead of erroring.
   */
  async function callAgent(message: string): Promise<AgentReply> {
    const post = async (path: string): Promise<AgentReply> => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      return (await res.json()) as AgentReply;
    };

    let json: AgentReply;
    try {
      json = await post("/api/agent");
    } catch {
      json = { reply: "", ok: false };
    }
    if (json.ok !== false) return json;

    // The agent route reports model failures as ok:false rather than a 500.
    const fallback = await post("/api/copilot");
    return {
      ...fallback,
      reply: fallback.reply ?? "Something went wrong. Try again in a moment.",
      ok: true,
      steps: ["Model unavailable — answered with the rule-based router.", ...(fallback.steps ?? [])],
    };
  }

  function switchMode(next: boolean) {
    setManual(next);
    router.replace(next ? "/?mode=manual" : "/", { scroll: false });
  }

  const filtered = (list: FlightOffer[]) =>
    list.filter((o) => (!nonstopOnly || o.stops === 0) && Number(o.price) <= maxPrice);

  return (
    <>
      <h1 className="visually-hidden">Xplorers Flights — search flights by chat or by hand</h1>

      <header className="home-head">
        <div className="mode-toggle" role="group" aria-label="Search mode">
          <button type="button" aria-pressed={!manual} className={!manual ? "active" : ""} onClick={() => switchMode(false)}>
            Ask the agent
          </button>
          <button type="button" aria-pressed={manual} className={manual ? "active" : ""} onClick={() => switchMode(true)}>
            Search manually
          </button>
        </div>
      </header>

      {manual ? (
        <ManualPanel onBack={() => switchMode(false)} onDone={(text) => void send(text)} />
      ) : (
        <>
        <section className="card chat-shell fade-up" aria-label="Flight agent chat">
          <div className="chat-log" ref={logRef}>
            {log.map((m) => (
              <Bubble key={m.id} m={m} showAll={showAll} setShowAll={setShowAll} onReview={setReview} onFilter={setNonstopOnly} />
            ))}
            {busy && (
              <div className="bubble-row agent">
                <div className="bubble agent">
                  <div className="typing" aria-label="Agent working"><span /><span /><span /></div>
                  <p className="busy-note">
                    Live airline feeds are slow to answer — usually 20–30 seconds. Ask about weather,
                    time or rates and I answer in about a second.
                  </p>
                </div>
              </div>
            )}
          </div>
          <form className="chat-input" onSubmit={(e: FormEvent) => { e.preventDefault(); const q = input; setInput(""); void send(q); }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const q = input;
                  setInput("");
                  void send(q);
                }
              }}
              placeholder="SFO to Tokyo for 2 adults"
              aria-label="Ask the agent"
            />
            <button className="primary" type="submit" disabled={busy} aria-label="Send">
              {busy ? "…" : "Send"}
            </button>
          </form>
          <div className="chip-row chat-chips">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="chip"
                onClick={() => { inputRef.current?.focus(); setInput(p); }}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* What this can do — plain language, so nobody has to guess. */}
        <details className="card capabilities fade-up">
          <summary>
            <span className="cap-summary-title">What I can do</span>
            <span className="cap-summary-sub">Everything below runs on real, free public data</span>
          </summary>
          <div className="cap-grid">
            {CAPABILITIES.map((c) => (
              <button
                key={c.title}
                type="button"
                className="cap-item"
                onClick={() => { inputRef.current?.focus(); setInput(c.example); }}
              >
                <span className="cap-icon" aria-hidden="true">{c.icon}</span>
                <span className="cap-body">
                  <span className="cap-title">{c.title}</span>
                  <span className="cap-example">try: {c.example}</span>
                </span>
              </button>
            ))}
          </div>
          <Link className="cap-radar" href="/radar">
            <span className="cap-icon" aria-hidden="true">◉</span>
            <span className="cap-body">
              <span className="cap-title">Live radar</span>
              <span className="cap-example">See every aircraft in the sky right now</span>
            </span>
            <span className="cap-arrow" aria-hidden="true">→</span>
          </Link>
        </details>
        </>
      )}


      {/* Power tools — the same data, one click from the conversation. */}
      <section className="card power fade-up" aria-label="Filter and track tools">
        <div className="power-row">
          <label className="power-check">
            <input type="checkbox" checked={nonstopOnly} onChange={(e) => setNonstopOnly(e.target.checked)} />
            Non-stop only
          </label>
          <label className="power-range">
            Up to ${maxPrice.toLocaleString()}
            <input type="range" min={200} max={3000} step={50} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
          </label>
          <Link className="syn-link" href="/tracker">Open the live tracker →</Link>
        </div>
      </section>

      <section className="card journey fade-up" aria-label="Your journey so far">
        <h2 className="journey-title">Journey</h2>
        <div className="journey-grid">
          <Link className="discover-card" href="/radar">
            <div className="discover-title">Live radar</div>
            <p>Every aircraft in the sky right now, on a radar scope.</p>
          </Link>
          <Link className="discover-card" href="/tracker">
            <div className="discover-title">Track a flight</div>
            <p>Airport maps, aircraft nearby, status and schedules.</p>
          </Link>
          <Link className="discover-card" href="/passengers">
            <div className="discover-title">Passenger details</div>
            <p>Names and dates — checked before anything is booked.</p>
          </Link>
          <Link className="discover-card" href="/bookings">
            <div className="discover-title">My bookings</div>
            <p>Tickets and references once a booking exists.</p>
          </Link>
          <Link className="discover-card" href="/copilot">
            <div className="discover-title">Agent transcript</div>
            <p>Every tool call, step by step, for review.</p>
          </Link>
        </div>
      </section>

      <dialog className="modal" ref={dialogRef} onClose={() => setReview(null)} onClick={(e) => { if (e.target === dialogRef.current) setReview(null); }}>
        {review && (
          <div className="card modal-card">
            <h2>Review this flight</h2>
            <p className="desc">{review.airline} {review.flightNo} · {review.origin} → {review.destination}</p>
            <p className="price">{review.price} {review.currency}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Link className="primary syn-cta" href={`/passengers?offer=${encodeURIComponent(review.id)}`}>
                Continue to passenger details
              </Link>
              <Link className="ghost syn-cta" href={`/tracker?flight=${encodeURIComponent(trackCode(review))}`}>
                Track {trackCode(review)} live
              </Link>
              <button className="ghost" type="button" onClick={() => setReview(null)}>Revise</button>
            </div>
            <div className="notice">Booking runs against a live Duffel key, which this demo does not have. Test mode never issues real tickets.</div>
          </div>
        )}
      </dialog>

      {hint !== "" && <p className="muted" role="status">{hint}</p>}
    </>
  );
}

/** Renders **bold** without a markdown dependency. */
function renderLine(line: string): React.ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Bubble({
  m, showAll, setShowAll, onReview, onFilter,
}: {
  m: ToolRun; showAll: boolean; setShowAll: (v: boolean) => void;
  onReview: (o: FlightOffer) => void; onFilter: (v: boolean) => void;
}) {
  if (m.role === "tool") {
    return <div className="bubble-row tool"><span className="mono tool-tag">{m.text}</span></div>;
  }
  const list = m.offers ?? [];
  const visible = showAll ? list : list.slice(0, 3);
  const hiddenCount = list.length - visible.length;
  return (
    <div className={`bubble-row ${m.role}`}>
      <div className={`bubble ${m.role} bubble-in`}>
        {m.text.split("\n").map((line, i) => (
          <p key={i} className={line.trim() === "" ? "agent-gap" : undefined}>
            {renderLine(line)}
          </p>
        ))}

        {list.length > 0 && (
          <div className="inline-offers">
            {visible.map((o) => (
              <article className="mini-offer" key={o.id}>
                <div className="route">{o.origin} → {o.destination}</div>
                <div className="meta">
                  {o.airline} {o.flightNo} · {o.stops === 0 ? "Non-stop" : `${o.stops} stop${o.stops === 1 ? "" : "s"}`}
                </div>
                <div className="price-row">
                  <span className="price">{o.price} {o.currency}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="primary mini-btn" onClick={() => onReview(o)}>Review</button>
                    <Link className="ghost syn-cta" href={`/tracker?flight=${encodeURIComponent(trackCode(o))}`}>Track</Link>
                  </div>
                </div>
              </article>
            ))}
            {hiddenCount > 0 && (
              <button type="button" className="ghost more-btn" onClick={() => setShowAll(true)}>
                Show {hiddenCount} more
              </button>
            )}
          </div>
        )}

        {m.flights && m.flights.length > 0 && (
          <div className="inline-offers">
            {m.flights.map((f, i) => (
              <article className="mini-offer" key={i}>
                <div className="route">{f.flightNo} · {f.airline}</div>
                <div className="meta">
                  {f.departure} → {f.arrival} · {f.status}{f.delayMin != null ? ` · ${f.delayMin} min late` : ""}{f.terminal ? ` · Terminal ${f.terminal}` : ""}{f.gate ? ` · Gate ${f.gate}` : ""}
                </div>
                <Link className="syn-link" href={`/tracker?flight=${encodeURIComponent(f.flightNo)}`}>Open in tracker →</Link>
              </article>
            ))}
          </div>
        )}

        {m.legs && m.legs.length > 0 && (
          <div className="inline-offers">
            {m.legs.map((l, i) => (
              <article className="mini-offer" key={i}>
                <div className="route">{l.flightNo ?? "Flight"}</div>
                <div className="meta">
                  {l.origin} → {l.destination}{l.scheduledUtc ? ` · ${l.scheduledUtc}` : ""}{l.distanceKm ? ` · ${l.distanceKm.toLocaleString()} km` : ""}
                </div>
              </article>
            ))}
          </div>
        )}

        {m.weather && (
          <div className="mini-offer">
            <div className="route">{m.weather.label}</div>
            <div className="meta">
              {m.weather.temp}°C{m.weather.high != null ? ` · high ${m.weather.high}° / low ${m.weather.low}°` : ""}{m.weather.wind != null ? ` · wind ${m.weather.wind} km/h` : ""}
            </div>
          </div>
        )}

        {m.airQuality && (
          <div className="mini-offer">
            <div className="route">{m.airQuality.label}</div>
            <div className="meta">
              Air quality: {m.airQuality.band}
              {m.airQuality.usAqi != null ? ` · AQI ${m.airQuality.usAqi}` : ""}
              {m.airQuality.pm25 != null ? ` · PM2.5 ${m.airQuality.pm25} µg/m³` : ""}
            </div>
          </div>
        )}

        {m.sun && (
          <div className="mini-offer">
            <div className="route">{m.sun.label}</div>
            <div className="meta">
              Sunrise {m.sun.sunrise ?? "—"} · Sunset {m.sun.sunset ?? "—"}
              {m.sun.dayLength ? ` · ${m.sun.dayLength} of daylight` : ""}
            </div>
          </div>
        )}

        {m.quakes && m.quakes.length > 0 && (
          <ul className="plain-list">
            {m.quakes.map((q, i) => (
              <li key={i}>
                {q.magnitude != null ? `M${q.magnitude.toFixed(1)}` : "—"} · {q.place}
              </li>
            ))}
          </ul>
        )}

        {m.rate && (
          <div className="mini-offer">
            <div className="route">1 {m.rate.base} = {m.rate.value} {m.rate.quote}</div>
            <div className="meta">Reference rate · {m.rate.date}</div>
          </div>
        )}

        {m.time && (
          <div className="mini-offer">
            <div className="route">{m.time.time}</div>
            <div className="meta">{m.time.zone}</div>
          </div>
        )}

        {m.places && m.places.length > 0 && (
          <ul className="plain-list">
            {m.places.map((p, i) => (
              <li key={i}>{p.name}</li>
            ))}
          </ul>
        )}

        {m.drive && (
          <div className="mini-offer">
            <div className="route">Drive to {m.drive.airport} · {m.drive.code}</div>
            <div className="meta">
              {m.drive.minutes != null
                ? `About ${m.drive.minutes} min by car${m.drive.distanceKm != null ? ` · ${m.drive.distanceKm} km` : ""}${m.drive.origin ? ` from ${m.drive.origin}` : ""}`
                : "Tell me where you are starting from and I will work out the drive."}
              {m.drive.budgetLabel ? ` · allow ${m.drive.budgetLabel} door to gate` : ""}
            </div>
          </div>
        )}

        {m.waitTime && (
          <div className="mini-offer">
            <div className="route">Security at {m.waitTime.name}</div>
            <div className="meta">
              {m.waitTime.standardMinutes != null ? `~${m.waitTime.standardMinutes} min standard` : "No estimate"}
              {m.waitTime.precheckMinutes != null ? ` · ~${m.waitTime.precheckMinutes} min PreCheck` : ""}
              {m.waitTime.live ? " · live reading" : ""}
            </div>
          </div>
        )}

        {m.transit && (
          <div className="mini-offer">
            <div className="route">Transit to {m.transit.label}</div>
            <div className="meta">
              {m.transit.durationMinutes != null
                ? `About ${m.transit.durationMinutes} min`
                : m.transit.count > 0
                  ? "Route found"
                  : "No route in the open transit dataset for this airport"}
            </div>
            {m.transit.legs.length > 0 && (
              <ul className="plain-list">
                {m.transit.legs.map((l, i) => (
                  <li key={i}>
                    {l.mode}{l.route ? ` ${l.route}` : ""}
                    {l.from ? ` · ${l.from}${l.to ? ` → ${l.to}` : ""}` : ""}
                    {l.minutes != null ? ` (${l.minutes} min)` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {m.nearby && (
          <div className="mini-offer">
            <div className="route">Near {m.nearby.label}</div>
            <div className="meta">{m.nearby.count} place{m.nearby.count === 1 ? "" : "s"} within 2 km</div>
            {m.nearby.parking.length > 0 && (
              <>
                <div className="meta">Parking</div>
                <ul className="plain-list">
                  {m.nearby.parking.map((p, i) => (
                    <li key={`pk${i}`}>{p.name}{p.detail ? ` · ${p.detail}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
            {m.nearby.transit.length > 0 && (
              <>
                <div className="meta">Bus / metro stops</div>
                <ul className="plain-list">
                  {m.nearby.transit.map((p, i) => (
                    <li key={`tr${i}`}>{p.name}{p.detail ? ` · ${p.detail}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
            {m.nearby.taxi.length > 0 && (
              <>
                <div className="meta">Taxi</div>
                <ul className="plain-list">
                  {m.nearby.taxi.map((p, i) => (
                    <li key={`tx${i}`}>{p.name}{p.detail ? ` · ${p.detail}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {list.length > 3 && !showAll && (
          <p className="bubble-hint">
            Filtering everything? <button type="button" className="link-btn" onClick={() => onFilter(true)}>Show non-stop only</button>
          </p>
        )}
      </div>
    </div>
  );
}

function ManualPanel({ onBack, onDone }: { onBack: () => void; onDone: (text: string) => void }) {
  const [origin, setOrigin] = useState("SFO");
  const [destination, setDestination] = useState("HND");
  const [date, setDate] = useState("2026-11-14");
  const [pax, setPax] = useState(1);
  const [cabin, setCabin] = useState("economy");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, departureDate: date, passengers: pax, cabinClass: cabin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      onDone(`${origin} to ${destination} for ${pax} adult${pax === 1 ? "" : "s"} on ${date}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card fade-up" aria-label="Manual search">
      <p className="desc">Same live inventory, your hands on the controls.</p>
      <form onSubmit={submit}>
        <div className="row">
          <div>
            <label htmlFor="m-from">From</label>
            <input id="m-from" value={origin} maxLength={3} onChange={(e) => setOrigin(e.target.value.toUpperCase())} required />
          </div>
          <div>
            <label htmlFor="m-to">To</label>
            <input id="m-to" value={destination} maxLength={3} onChange={(e) => setDestination(e.target.value.toUpperCase())} required />
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="m-date">Date</label>
            <input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="m-pax">Passengers</label>
            <input id="m-pax" type="number" min={1} max={9} value={pax} onChange={(e) => setPax(Number(e.target.value))} />
          </div>
        </div>
        <label htmlFor="m-cabin">Cabin</label>
        <select id="m-cabin" value={cabin} onChange={(e) => setCabin(e.target.value)}>
          <option value="economy">Economy</option>
          <option value="premium_economy">Premium economy</option>
          <option value="business">Business</option>
          <option value="first">First</option>
        </select>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Searching…" : "Search flights"}</button>
      </form>
      {err !== "" && <div className="error">{err}</div>}
      <button type="button" className="ghost" onClick={onBack}>Back to the agent</button>
    </section>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<section className="card"><div className="shimmer" style={{ height: 280, borderRadius: 8 }} /></section>}>
      <HomeInner />
    </Suspense>
  );
}
