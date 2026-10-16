"use client";

import React, { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { FlightOffer } from "@/lib/flights/types";

/**
 * Homepage: chat-first. The whole booking flow lives INSIDE the chat —
 * user talks, agent parses (big-pickle proxy), tools run, offer cards
 * render inline with Select buttons, review modal on top.
 * "Do it yourself" toggle flips to the manual form for users who
 * do not trust the AI. Both modes share slots + results + synergy links.
 */

const QUICK_PROMPTS = [
  "SFO to Tokyo for 2 adults",
  "Status of BA117",
  "JFK to LHR nonstop under $650",
];

interface ChatMsg {
  id: number;
  role: "user" | "agent" | "tool";
  text: string;
  offers?: FlightOffer[];
  flightRows?: Array<{
    flightNo: string;
    airline: string;
    status: string;
    departure: string;
    arrival: string;
    delayMin: number | null;
  }>;
}

let nextId = 1;
function msg(m: Omit<ChatMsg, "id">): ChatMsg {
  return { ...m, id: nextId++ };
}

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"ai" | "manual">(params.get("mode") === "manual" ? "manual" : "ai");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ChatMsg[]>([
    msg({ role: "agent", text: "Where to? Say it plainly — e.g. SFO to Tokyo for 2 adults, or ask status of BA117." }),
  ]);
  // Manual form state (shared slots with AI mode)
  const [origin, setOrigin] = useState("SFO");
  const [destination, setDestination] = useState("HND");
  const [departureDate, setDepartureDate] = useState("2026-11-14");
  const [passengers, setPassengers] = useState(2);
  const [cabinClass, setCabinClass] = useState("economy");
  const [stopFilter, setStopFilter] = useState<"any" | "nonstop" | "onestop">("any");
  const [maxPrice, setMaxPrice] = useState(2400);
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bookingAllowed, setBookingAllowed] = useState(false);
  const [review, setReview] = useState<FlightOffer | null>(null);
  const [toast, setToast] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  function showToast(t: string) {
    setToast(t);
    window.setTimeout(() => setToast(""), 3200);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [log.length, busy]);

  function flip(next: "ai" | "manual") {
    setMode(next);
    router.replace(`/?mode=${next}`, { scroll: false });
  }

  async function runSearch(slots: { origin: string; destination: string; departureDate: string; passengers: number; cabinClass: string }) {
    setLoading(true);
    setError("");
    setOffers([]);
    setSearched(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slots),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setOffers(json.offers ?? []);
      setBookingAllowed(Boolean(json.bookingAllowed));
      return (json.offers ?? []) as FlightOffer[];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      return [] as FlightOffer[];
    } finally {
      setLoading(false);
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const trail: ChatMsg[] = [...log, msg({ role: "user", text: q }), msg({ role: "tool", text: "Asking the agent to parse…" })];
    setLog(trail);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Copilot failed.");
      const out: ChatMsg[] = [...trail];
      for (const s of json.steps ?? []) out.push(msg({ role: "tool", text: s }));
      // Sync shared slots so manual mode + tracker links continue the trip.
      if (json.slots?.origin) setOrigin(json.slots.origin);
      if (json.slots?.destination) setDestination(json.slots.destination);
      if (json.slots?.departureDate) setDepartureDate(json.slots.departureDate);
      if (json.slots?.passengers) setPassengers(json.slots.passengers);
      if (json.slots?.cabinClass) setCabinClass(json.slots.cabinClass);
      if (json.intent === "status") {
        out.push(msg({ role: "agent", text: json.reply, flightRows: json.flights ?? [] }));
      } else if (json.offers) {
        const found = (json.offers ?? []) as FlightOffer[];
        setOffers(found);
        setSearched(true);
        setBookingAllowed(false);
        out.push(msg({ role: "agent", text: json.reply, offers: found.slice(0, 3) }));
      } else {
        out.push(msg({ role: "agent", text: json.reply }));
      }
      setLog(out);
    } catch (err) {
      setLog([...trail, msg({ role: "agent", text: err instanceof Error ? err.message : "Copilot failed." })]);
    } finally {
      setBusy(false);
    }
  }

  function onManual(e: FormEvent) {
    e.preventDefault();
    void runSearch({ origin, destination, departureDate, passengers, cabinClass });
  }

  const visible = offers.filter((o) => {
    if (stopFilter === "nonstop" && o.stops !== 0) return false;
    if (stopFilter === "onestop" && o.stops !== 1) return false;
    const n = Number(o.price);
    if (Number.isFinite(n) && n > maxPrice) return false;
    return true;
  });

  return (
    <>
      {/* MODE BAR — AI first, manual one tap away */}
      <section className="modebar fade-up">
        <div className="mode-toggle" role="tablist" aria-label="Search mode">
          <button type="button" role="tab" aria-selected={mode === "ai"} className={mode === "ai" ? "active" : ""} onClick={() => flip("ai")}>
            AI chat
          </button>
          <button type="button" role="tab" aria-selected={mode === "manual"} className={mode === "manual" ? "active" : ""} onClick={() => flip("manual")}>
            Do it yourself
          </button>
        </div>
        <p className="muted mode-hint">
          {mode === "ai" ? "Talk naturally — results appear inside the chat." : "Prefer control? Fill the form yourself — same live inventory."}
        </p>
      </section>

      {mode === "ai" ? (
        <section className="card chat-shell fade-up" aria-label="Flight chat">
          <div className="chat-log">
            {log.map((m) => (
              <div key={m.id} className={`bubble-row ${m.role}`}>
                <div className={`bubble ${m.role} bubble-in`}>
                  {m.role === "tool" && <span className="mono tool-tag">{m.text}</span>}
                  {m.role !== "tool" && <p>{m.text}</p>}
                  {m.offers && m.offers.length > 0 && (
                    <div className="inline-offers">
                      {m.offers.map((o) => (
                        <article key={o.id} className="mini-offer">
                          <div className="route">{o.origin} → {o.destination}</div>
                          <div className="meta">{o.airline} {o.flightNo} · {o.stops === 0 ? "Non-stop" : `${o.stops} stop${o.stops === 1 ? "" : "s"}`}</div>
                          <div className="price-row">
                            <span className="price">{o.price} {o.currency}</span>
                            <button type="button" className="primary mini-btn" onClick={() => setReview(o)}>
                              Select
                            </button>
                          </div>
                          <Link className="syn-link" href={`/tracker?flight=${encodeURIComponent(o.flightNo)}`}>
                            Track {o.flightNo} live →
                          </Link>
                        </article>
                      ))}
                      <Link className="syn-link" href={`/?mode=manual`}>
                        Refine manually instead →
                      </Link>
                    </div>
                  )}
                  {m.flightRows && m.flightRows.length > 0 && (
                    <div className="inline-offers">
                      {m.flightRows.map((f, i) => (
                        <article key={i} className="mini-offer">
                          <div className="route">{f.flightNo} · {f.airline}</div>
                          <div className="meta">{f.departure} → {f.arrival} · {f.status}{f.delayMin != null ? ` · delay ${f.delayMin} min` : ""}</div>
                          <Link className="syn-link" href={`/tracker?flight=${encodeURIComponent(f.flightNo)}`}>
                            Open in tracker →
                          </Link>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="bubble-row agent">
                <div className="bubble agent">
                  <div className="typing" aria-label="Agent is working">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="chip-row chat-chips">
            {QUICK_PROMPTS.map((p) => (
              <button key={p} type="button" className="chip" disabled={busy} onClick={() => { setInput(p); }}>
                {p}
              </button>
            ))}
          </div>
          <form className="chat-input" onSubmit={onChat}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="SFO to Tokyo for 2 adults…" aria-label="Chat with flight agent" />
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "…" : "Send"}
            </button>
          </form>
        </section>
      ) : (
        <div className="grid">
          <section className="card fade-up">
            <h2>Trip details — your hands on the controls</h2>
            <p className="desc">Same live inventory the AI uses. No guessing.</p>
            <form onSubmit={onManual}>
              <div className="row">
                <div>
                  <label htmlFor="origin">From (IATA)</label>
                  <input id="origin" value={origin} maxLength={3} onChange={(e) => setOrigin(e.target.value.toUpperCase())} required />
                </div>
                <div>
                  <label htmlFor="destination">To (IATA)</label>
                  <input id="destination" value={destination} maxLength={3} onChange={(e) => setDestination(e.target.value.toUpperCase())} required />
                </div>
              </div>
              <div className="row">
                <div>
                  <label htmlFor="date">Departure date</label>
                  <input id="date" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="pax">Passengers</label>
                  <input id="pax" type="number" min={1} max={9} value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} />
                </div>
              </div>
              <label htmlFor="cabin">Cabin</label>
              <select id="cabin" value={cabinClass} onChange={(e) => setCabinClass(e.target.value)}>
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
              <button className="primary" type="submit" disabled={loading}>
                {loading ? "Searching…" : "Search flights"}
              </button>
            </form>
            {error !== "" && <div className="error">{error}</div>}
            <h2 style={{ marginTop: 20 }}>Filters</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {(["any", "nonstop", "onestop"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ghost"
                  style={{ width: "auto", marginTop: 0, fontSize: 13, padding: "8px 12px", borderColor: stopFilter === s ? "var(--accent)" : undefined, fontWeight: stopFilter === s ? 700 : 400 }}
                  onClick={() => setStopFilter(s)}
                >
                  {s === "any" ? "Any" : s === "nonstop" ? "Non-stop" : "1 stop"}
                </button>
              ))}
            </div>
            <label htmlFor="maxprice">Max total price: ${maxPrice.toLocaleString()}</label>
            <input id="maxprice" type="range" min={200} max={2400} step={50} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
          </section>
          <section className="card fade-up">
            <h2>Available options</h2>
            <p className="desc">
              {!searched ? "Search — results glide in here." : visible.length === 0 ? (loading ? "Searching live inventory…" : "No options match these filters.") : `${visible.length} option${visible.length === 1 ? "" : "s"} shown.`}
            </p>
            {loading && (
              <div aria-label="Loading offers">
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ borderTop: "1px solid var(--line)", padding: "14px 0" }}>
                    <div className="shimmer" style={{ height: 20, borderRadius: 6, width: "45%", marginBottom: 8 }} />
                    <div className="shimmer" style={{ height: 14, borderRadius: 6, width: "70%" }} />
                  </div>
                ))}
              </div>
            )}
            {visible.map((o, i) => (
              <article className="offer offer-in" style={{ "--d": `${Math.min(i, 5) * 70}ms` } as React.CSSProperties} key={o.id}>
                <div className="route">{o.origin} → {o.destination}</div>
                <div className="meta">{o.airline} {o.flightNo} · {o.stops === 0 ? "Non-stop" : `${o.stops} stop${o.stops === 1 ? "" : "s"}`} · <span className="mono">{o.id.slice(0, 18)}…</span></div>
                <div className="price">{o.price} {o.currency}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <button className="primary" style={{ width: "auto", marginTop: 0 }} type="button" onClick={() => setReview(o)}>
                    Select and review
                  </button>
                  <Link className="syn-link" href={`/tracker?flight=${encodeURIComponent(o.flightNo)}`}>
                    Track {o.flightNo} →
                  </Link>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {/* SYNERGY STRIP — every page reachable by context, not just nav */}
      <section className="card synergy fade-up">
        <h2>Continue this trip</h2>
        <p className="desc">Slots carry over — {origin} → {destination}, {departureDate}, {passengers} pax.</p>
        <div className="syn-grid">
          <Link className="discover-card" href={`/tracker?flight=${encodeURIComponent("BA117")}`}>
            <div className="discover-kicker mono">LIVE · NO SIGNUP</div>
            <div className="discover-title">Track it live</div>
            <p>Airport maps, aircraft nearby, status and schedules.</p>
            <span className="discover-go">Open tracker →</span>
          </Link>
          <Link className="discover-card" href="/passengers">
            <div className="discover-kicker mono">STEP 2 OF 4</div>
            <div className="discover-title">Passenger details</div>
            <p>Names, DOB, contact — checked before anything books.</p>
            <span className="discover-go">Add passengers →</span>
          </Link>
          <Link className="discover-card" href="/bookings">
            <div className="discover-kicker mono">TICKETS</div>
            <div className="discover-title">My bookings</div>
            <p>References and history, live from Supabase.</p>
            <span className="discover-go">View bookings →</span>
          </Link>
        </div>
      </section>

      {toast !== "" && (
        <div className="notice toast" role="status" style={{ position: "fixed", bottom: 20, right: 20, maxWidth: 360, zIndex: 60 }}>
          {toast}
        </div>
      )}

      {review && (
        <div role="dialog" aria-modal="true" aria-label="Review flight reservation" className="modal-backdrop" onClick={() => setReview(null)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Review flight reservation</h2>
            <p className="desc">{review.airline} {review.flightNo} · {review.origin} → {review.destination}</p>
            <p className="mono">Offer ID: {review.id}</p>
            <p className="price">Total: {review.price} {review.currency}</p>
            {!bookingAllowed && <div className="notice">Booking is disabled in this demo. It needs a live key and explicit approval.</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="ghost" type="button" style={{ marginTop: 0 }} onClick={() => setReview(null)}>Revise</button>
              <button
                className="primary"
                type="button"
                style={{ marginTop: 0 }}
                disabled={!bookingAllowed}
                onClick={() => { showToast(bookingAllowed ? "Booking continues after sign-in with passenger details." : "Booking is disabled in this demo."); setReview(null); }}
              >
                Confirm booking
              </button>
            </div>
            <Link className="syn-link" style={{ marginTop: 10, display: "inline-block" }} href={`/tracker?flight=${encodeURIComponent(review.flightNo)}`}>
              Track {review.flightNo} live before deciding →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<section className="card"><div className="shimmer" style={{ height: 300, borderRadius: 8 }} /></section>}>
      <HomeInner />
    </Suspense>
  );
}
