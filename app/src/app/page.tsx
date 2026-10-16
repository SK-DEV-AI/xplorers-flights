"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { FlightOffer } from "@/lib/flights/types";

/**
 * Homepage: AI prompt hero first, usable sections on scroll.
 * Hero (full viewport): one clean prompt bar — type naturally, hit enter,
 * the site parses slots, searches, and glides you to results.
 * Below: trip details + filters + offers, then live-data cards.
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

interface Slots {
  origin: string;
  destination: string;
  cabin: string;
  pax: number;
}

/** Tiny natural-language slot fill, ported from the Stitch screen script. */
function parseQuery(q: string): Slots {
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

/** Fades a section in the first time it scrolls into view. */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
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
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [bookingAllowed, setBookingAllowed] = useState(false);
  const [review, setReview] = useState<FlightOffer | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3200);
  }

  function scrollToResults() {
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function doSearch(slots: { origin: string; destination: string; departureDate: string; passengers: number; cabinClass: string }) {
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
      if ((json.offers ?? []).length === 0) setError("No flights found for this route and date.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  const [aiNote, setAiNote] = useState("");

  async function onHeroSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    // AI bar: big-pickle proxy parses, OUR code runs the tools.
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Copilot failed.");
      for (const s of json.steps ?? []) showToast(s);
      if (json.intent === "search" && json.slots?.origin && json.slots?.destination) {
        const sl = json.slots;
        setOrigin(sl.origin);
        setDestination(sl.destination);
        setCabinClass(sl.cabinClass ?? "economy");
        setPassengers(sl.passengers ?? 1);
        if (sl.departureDate) setDepartureDate(sl.departureDate);
        setAiNote(json.reply ?? "");
        showToast(json.reply ?? "Slots parsed — searching…");
        await doSearch({
          origin: sl.origin,
          destination: sl.destination,
          departureDate: sl.departureDate ?? departureDate,
          passengers: sl.passengers ?? 1,
          cabinClass: sl.cabinClass ?? "economy",
        });
      } else {
        setAiNote(json.reply ?? "");
        showToast(json.reply ?? "");
      }
    } catch {
      // Proxy down? Local parse keeps the bar usable.
      const s = parseQuery(q);
      setOrigin(s.origin);
      setDestination(s.destination);
      setCabinClass(s.cabin);
      setPassengers(s.pax);
      showToast(`Slots: ${s.origin} → ${s.destination} (${s.cabin}, ${s.pax} pax)`);
      await doSearch({ origin: s.origin, destination: s.destination, departureDate, passengers: s.pax, cabinClass: s.cabin });
    }
    scrollToResults();
  }

  function onSearch(e?: FormEvent) {
    e?.preventDefault();
    void doSearch({ origin, destination, departureDate, passengers, cabinClass });
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
      {/* HERO — one clean AI bar, full viewport */}
      <section className="hero-ai">
        <p className="muted mono hero-kicker">AUTONOMOUS FLIGHT SEARCH · TEST MODE</p>
        <h1 className="hero-title">
          Tell us where.
          <br />
          We handle the rest.
        </h1>
        <p className="hero-sub">
          Describe the trip in plain words. The site extracts the route,
          queries flight data, and lists bookable options below.
        </p>
        <form className="prompt-wrap" onSubmit={onHeroSubmit}>
          <input
            className="prompt"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find non-stop flights from SFO to Tokyo for 2 adults"
            aria-label="Describe your trip"
          />
          <button className="primary prompt-btn" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="chip-row">
          {QUICK_PROMPTS.map((p, i) => (
            <button
              key={p}
              type="button"
              className="chip hero-chip"
              style={{ "--d": `${i * 90}ms` } as CSSProperties}
              onClick={() => {
                setQuery(p);
                const s = parseQuery(p);
                setOrigin(s.origin);
                setDestination(s.destination);
                setCabinClass(s.cabin);
                setPassengers(s.pax);
                showToast(`Slots: ${s.origin} → ${s.destination} (${s.cabin}, ${s.pax} pax)`);
                void doSearch({ origin: s.origin, destination: s.destination, departureDate, passengers: s.pax, cabinClass: s.cabin });
                scrollToResults();
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <StatusLine />
        <button type="button" className="scroll-cue" onClick={scrollToResults} aria-label="Scroll to search results">
          <span>scroll to explore</span>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      {/* RESULTS — usable search section on scroll */}
      <div ref={resultsRef} className="scroll-anchor" />
      <div className="grid">
        <Reveal>
          <section className="card">
            <h2>Trip details</h2>
            <p className="desc">Refine the slots, filter, and review each offer.</p>
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
          </section>
        </Reveal>

        <Reveal delay={110}>
          <section className="card">
            {aiNote !== "" && <div className="notice ai-note">{aiNote}</div>}
          <h2>Available options</h2>
            <p className="desc">
              {!searched
                ? "Search above — results glide in here."
                : visible.length === 0
                  ? loading
                    ? "Searching live inventory…"
                    : "No options match these filters."
                  : `${visible.length} option${visible.length === 1 ? "" : "s"} shown.`}
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
              <article className="offer offer-in" style={{ "--d": `${Math.min(i, 5) * 70}ms` } as CSSProperties} key={o.id}>
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
        </Reveal>
      </div>

      {/* DISCOVER — the rest of the site, one scroll further */}
      <Reveal>
        <section className="discover">
          <h2>More ways to explore</h2>
          <p className="desc">Live tracking, the narrated agent, and your tickets.</p>
          <div className="discover-grid">
            <Link className="discover-card" href="/tracker">
              <div className="discover-kicker mono">LIVE · NO SIGNUP</div>
              <div className="discover-title">Flight tracker</div>
              <p>Airport lookup, live map, aircraft nearby, plus status and schedules.</p>
              <span className="discover-go">Open tracker →</span>
            </Link>
            <Link className="discover-card" href="/copilot">
              <div className="discover-kicker mono">AGENT TRANSCRIPT</div>
              <div className="discover-title">AI copilot</div>
              <p>Every step narrated: slot checks, the search call, and results.</p>
              <span className="discover-go">Talk to copilot →</span>
            </Link>
            <Link className="discover-card" href="/bookings">
              <div className="discover-kicker mono">TICKETS</div>
              <div className="discover-title">My bookings</div>
              <p>Confirmed tickets with references — live history from Supabase.</p>
              <span className="discover-go">View bookings →</span>
            </Link>
          </div>
        </section>
      </Reveal>

      {toast !== "" && (
        <div className="notice toast" role="status" style={{ position: "fixed", bottom: 20, right: 20, maxWidth: 360, zIndex: 60 }}>
          {toast}
        </div>
      )}

      {review && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review flight reservation"
          className="modal-backdrop"
          onClick={() => setReview(null)}
        >
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
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
    <p className="muted hero-status">
      <button
        type="button"
        className="ghost hero-status-btn"
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
