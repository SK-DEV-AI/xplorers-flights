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
  { text: "SFO to Tokyo for 2 adults", hint: "search" },
  { text: "What is the weather in Tokyo?", hint: "weather" },
  { text: "What's the local time in London?", hint: "time" },
  { text: "Status of BA117", hint: "status" },
  { text: "1 USD to INR", hint: "currency" },
];

interface ToolRun {
  id: number;
  role: "user" | "agent" | "tool";
  text: string;
  offers?: FlightOffer[];
  flights?: Array<{ flightNo: string; airline: string; status: string; departure: string; arrival: string; delayMin: number | null }>;
  legs?: Array<{ flightNo: string | null; origin: string; destination: string; scheduledUtc: string | null; distanceKm: number | null }>;
  weather?: { label: string; temp: number; code?: number; wind?: number; high?: number; low?: number };
  places?: Array<{ name: string; displayName: string }>;
  rate?: { base: string; quote: string; value: number; date: string };
  time?: { time: string; zone: string };
}

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
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      const out: ToolRun[] = [...draft];
      for (const s of json.steps ?? []) out.push(mk({ role: "tool", text: s }));
      // Nudge the user to the tool that actually answers geography questions,
      // instead of silently answering from a guessed airport.
      if (json.intent === "time" || json.intent === "places") {
        out.push(mk({
          role: "agent",
          text: `${json.reply} Open the tracker for the full map and details.`,
        }));
      }
      out.push(
        mk({
          role: "agent",
          text: json.reply ?? "I didn't catch that. Try naming two airports, or a flight number like BA117.",
          offers: json.offers,
          flights: json.flights,
          legs: json.legs,
          weather: json.weather,
          places: json.places,
          rate: json.rate,
          time: json.time,
        }),
      );
      setLog(out);
    } catch (err) {
      setLog([...draft, mk({ role: "agent", text: err instanceof Error ? err.message : "Something went wrong." })]);
    } finally {
      setBusy(false);
    }
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
                key={p.text}
                type="button"
                className="chip"
                onClick={() => { inputRef.current?.focus(); setInput(p.text); }}
              >
                {p.text}
              </button>
            ))}
          </div>
        </section>
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
        <p>{m.text}</p>

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
                  {f.departure} → {f.arrival} · {f.status}{f.delayMin != null ? ` · ${f.delayMin} min late` : ""}
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
