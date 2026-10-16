"use client";

import { useState } from "react";
import type { FlightOffer } from "@/lib/flights/types";

/**
 * Search page. Ports the Stitch "Search & Book Flights" screen into React:
 * natural-language box with quick prompts, slot chips, stop filters,
 * price cap, offer ledger, and a review modal before booking.
 * Search hits /api/search (test key today, live key later, same code).
 */

const QUICK_PROMPTS = [
  "SFO to HND, 2 passengers, direct",
  "JFK to LHR nonstop under $650",
  "LAX to CDG premium economy in November",
];

const CITY_NAMES: Record<string, string> = {
  SFO: "San Francisco",
  HND: "Tokyo Haneda",
  JFK: "New York",
  LHR: "London Heathrow",
  LAX: "Los Angeles",
  CDG: "Paris",
  BOM: "Mumbai",
  DEL: "Delhi",
};

function city(code: string): string {
  return CITY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** Tiny natural-language slot fill, ported from the Stitch screen script. */
function parseQuery(q: string): { origin: string; destination: string; cabin: string; pax: number } {
  const t = q.toLowerCase();
  const codes = (t.match(/\b[a-z]{3}\b/g) ?? []).map((s) => s.toUpperCase());
  const pick = (names: string[], code: string, fallback: string) =>
    names.some((n) => t.includes(n)) || codes.includes(code) ? code : fallback;
  const origin = pick(["jfk", "new york"], "JFK", pick(["lax", "los angeles"], "LAX", pick(["sea", "seattle"], "SEA", "SFO")));
  const destination = pick(["lhr", "london"], "LHR", pick(["cdg", "paris"], "CDG", "HND"));
  const cabin = t.includes("business") ? "business" : t.includes("premium") ? "premium_economy" : "economy";
  const pax = /1 passenger|solo|1 pax/.test(t) ? 1 : 2;
  return { origin, destination, cabin, pax };
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("SFO");
  const [destination, setDestination] = useState("HND");
  const [departureDate, setDepartureDate] = useState("2026-11-14");
  const [passengers, setPassengers] = useState(2);
  const [cabinClass, setCabinClass] = useState("economy");
  const [stopFilter, setStopFilter] = useState<"any" | "nonstop" | "onestop">("any");
  const [maxPrice, setMaxPrice] = useState(2400);
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [bookingAllowed, setBookingAllowed] = useState(false);
  const [review, setReview] = useState<FlightOffer | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3200);
  }

  function applyQuery(q: string) {
    const s = parseQuery(q);
    setOrigin(s.origin);
    setDestination(s.destination);
    setCabinClass(s.cabin);
    setPassengers(s.pax);
    showToast(`Slots: ${s.origin} → ${s.destination} (${s.cabin}, ${s.pax} pax)`);
  }

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setOffers([]);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, departureDate, passengers, cabinClass }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setOffers(json.offers ?? []);
      setBookingAllowed(Boolean(json.bookingAllowed));
      if ((json.offers ?? []).length === 0) setError("No flights found for this route and date.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
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
      <section className="hero fade-up">
        <p className="muted mono">AUTONOMOUS FLIGHT SEARCH · TEST MODE</p>
        <h1>Where would you like to fly next?</h1>
        <p>
          Describe the trip in plain words. The site extracts the route,
          queries flight data, and lists bookable options.
        </p>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Describe the trip</h2>
          <p className="desc">Type naturally, or tap a quick prompt.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyQuery(query);
              onSearch();
            }}
          >
            <label htmlFor="nlq">Trip in plain words</label>
            <input
              id="nlq"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find non-stop flights from SFO to Tokyo for 2 adults"
            />
            <button className="primary" type="submit" disabled={loading}>
              {loading ? "Searching…" : "Parse and search"}
            </button>
          </form>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="ghost"
                style={{ width: "auto", marginTop: 0, fontSize: 13, padding: "8px 12px" }}
                onClick={() => {
                  setQuery(p);
                  applyQuery(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: 20 }}>Trip details</h2>
          <div className="chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span className="pill">
              {origin} · {city(origin)}
            </span>
            <span className="pill">
              {destination} · {city(destination)}
            </span>
            <span className="pill">{departureDate}</span>
            <span className="pill">
              {passengers} adult{passengers === 1 ? "" : "s"}
            </span>
            <span className="pill">{cabinClass.replace("_", " ")}</span>
          </div>
          <form onSubmit={onSearch}>
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
                style={{
                  width: "auto",
                  marginTop: 0,
                  fontSize: 13,
                  padding: "8px 12px",
                  borderColor: stopFilter === s ? "var(--accent)" : undefined,
                  fontWeight: stopFilter === s ? 700 : 400,
                }}
                onClick={() => {
                  setStopFilter(s);
                  showToast(`Filtered by: ${s === "any" ? "any stops" : s === "nonstop" ? "non-stop" : "1 stop"}`);
                }}
              >
                {s === "any" ? "Any" : s === "nonstop" ? "Non-stop" : "1 stop"}
              </button>
            ))}
          </div>
          <label htmlFor="maxprice">
            Max total price: ${maxPrice.toLocaleString()}
          </label>
          <input id="maxprice" type="range" min={200} max={2400} step={50} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
          <StatusLine />
        </section>

        <section className="card">
          <h2>Available options</h2>
          <p className="desc">
            {visible.length === 0 ? "Results appear here after a search." : `${visible.length} option${visible.length === 1 ? "" : "s"} shown.`}
          </p>
          {visible.map((o) => (
            <article className="offer stagger" key={o.id}>
              <div className="route">
                {o.origin} → {o.destination}
              </div>
              <div className="meta">
                {o.airline} {o.flightNo} · {o.stops === 0 ? "Non-stop" : `${o.stops} stop${o.stops === 1 ? "" : "s"}`} ·{" "}
                <span className="mono">{o.id.slice(0, 18)}…</span>
              </div>
              <div className="price">
                {o.price} {o.currency}
              </div>
              <button className="primary" type="button" onClick={() => setReview(o)}>
                Select and review
              </button>
            </article>
          ))}
        </section>
      </div>

      {toast !== "" && (
        <div className="notice" role="status" style={{ position: "fixed", bottom: 20, right: 20, maxWidth: 360 }}>
          {toast}
        </div>
      )}

      {review && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review flight reservation"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setReview(null)}
        >
          <div className="card" style={{ maxWidth: 520, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h2>Review flight reservation</h2>
            <p className="desc">
              {review.airline} {review.flightNo} · {review.origin} → {review.destination}
            </p>
            <p className="mono">
              Offer ID: {review.id}
            </p>
            <p className="price">
              Total: {review.price} {review.currency}
            </p>
            {!bookingAllowed && (
              <div className="notice">Booking is disabled in this demo. It needs a live key and explicit approval.</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="ghost" type="button" style={{ marginTop: 0 }} onClick={() => setReview(null)}>
                Revise
              </button>
              <button
                className="primary"
                type="button"
                style={{ marginTop: 0 }}
                disabled={!bookingAllowed}
                onClick={() => {
                  showToast(bookingAllowed ? "Booking continues after sign-in with passenger details." : "Booking is disabled in this demo.");
                  setReview(null);
                }}
              >
                Confirm booking
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusLine() {
  const [status, setStatus] = useState<{ provider: string; mode: string; hasKey: boolean; bookingEnabled: boolean } | null>(null);
  return (
    <p className="muted" style={{ marginTop: 12 }}>
      <button
        type="button"
        className="ghost"
        style={{ width: "auto", padding: "6px 12px", fontSize: 13, marginTop: 0 }}
        onClick={async () => {
          const res = await fetch("/api/status");
          setStatus(await res.json());
        }}
      >
        Check system status
      </button>{" "}
      {status && (
        <span className="mono">
          {status.provider}/{status.mode}
          {status.hasKey ? " · key set" : " · no key yet"}
          {status.bookingEnabled ? " · booking on" : " · booking off"}
        </span>
      )}
    </p>
  );
}
