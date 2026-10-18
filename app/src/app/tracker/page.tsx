"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AirportInfo, LiveAircraft } from "@/lib/aviation/keyless";

const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

/** Carrier IATA prefix -> the airport we fly out of. Used to paint the map
 *  when the user arrives from a "Track NN live" link. */
const AIRPORT_BY_IATA: Record<string, string> = {
  BA: "LHR", AA: "JFK", DL: "ATL", UA: "ORD", AS: "SEA", B6: "JFK",
  EK: "DXB", QR: "DXB", SQ: "SIN", AI: "DEL", "6E": "MAA", KL: "AMS",
  LH: "FRA", AF: "CDG", IB: "MAD", QF: "SYD", AC: "YYZ", CX: "HKG",
};

interface Weather {
  temp: number;
  label: string;
  wind: number;
  high: number;
  low: number;
}

interface StatusRow {
  flightNo: string;
  airline: string;
  status: string;
  departure: string;
  arrival: string;
  delayMin: number | null;
}

interface SchedRow {
  origin: string;
  destination: string;
  scheduledUtc: string | null;
  revisedUtc: string | null;
  terminal: string | null;
  flightNo: string | null;
  distanceKm: number | null;
}

/**
 * Tracker page. Keyless live data, no signup:
 * airport lookup (name, codes, position) + live aircraft near it,
 * plus flight status (Aviationstack) and schedules (AeroDataBox).
 * Proves the site answers more than booking questions.
 */
export default function TrackerPage() {
  const [code, setCode] = useState("JFK");
  const [flight, setFlight] = useState("BA117");
  const [flightInit, setFlightInit] = useState(false);
  const [airport, setAirport] = useState<AirportInfo | null>(null);
  const [traffic, setTraffic] = useState<LiveAircraft[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusRows, setStatusRows] = useState<StatusRow[]>([]);
  const [schedRows, setSchedRows] = useState<SchedRow[]>([]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");

  // A ?flight= link must actually run the lookup, not just fill the box
  // (audit C2: "Track it live" left an empty panel).
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get("flight");
      if (f && !flightInit) {
        setFlight(f.toUpperCase());
        setFlightInit(true);
      }
    } catch { /* non-browser — ignore */ }
  }, [flightInit]);

  useEffect(() => {
    if (flightInit) {
      void runStatus(flight);
      // Paint the map too: use the flight's departure airport when we can,
      // falling back to the default so the page is never blank.
      const origin = flight.slice(0, 2);
      const guess = AIRPORT_BY_IATA[origin];
      void lookupAirport(guess ? guess : "JFK");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightInit]);

  /** Wraps onLookup so the autoload path reuses the same fetch sequence. */
  async function lookupAirport(target: string) {
    try {
      const res = await fetch(`/api/airports?code=${encodeURIComponent(target)}`);
      const json = await res.json();
      if (!res.ok) return;
      setAirport(json);
      const [tRes, wRes] = await Promise.all([
        fetch(`/api/traffic?lat=${json.latitude}&lon=${json.longitude}&radius=50`),
        fetch(`/api/weather?lat=${json.latitude}&lon=${json.longitude}`),
      ]);
      const tJson = await tRes.json();
      if (tRes.ok) setTraffic(tJson.aircraft ?? []);
      const wJson = await wRes.json();
      if (wRes.ok) setWeather(wJson);
    } catch {
      /* a failed map lookup must not break the status rows */
    }
  }

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setAirport(null);
    setTraffic([]);
    setWeather(null);
    try {
      const aRes = await fetch(`/api/airports?code=${encodeURIComponent(code)}`);
      const aJson = await aRes.json();
      if (!aRes.ok) throw new Error(aJson.error ?? "Airport lookup failed.");
      setAirport(aJson);
      const [tRes, wRes] = await Promise.all([
        fetch(`/api/traffic?lat=${aJson.latitude}&lon=${aJson.longitude}&radius=50`),
        fetch(`/api/weather?lat=${aJson.latitude}&lon=${aJson.longitude}`),
      ]);
      const tJson = await tRes.json();
      if (!tRes.ok) throw new Error(tJson.error ?? "Traffic unavailable.");
      setTraffic(tJson.aircraft ?? []);
      const wJson = await wRes.json();
      if (wRes.ok) setWeather(wJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runStatus(code: string) {
    setStatusBusy(true);
    setStatusError("");
    setStatusRows([]);
    setSchedRows([]);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [sRes, cRes] = await Promise.all([
        fetch(`/api/flight-status?flight=${encodeURIComponent(code)}`),
        fetch(`/api/schedules?flight=${encodeURIComponent(code)}&date=${today}`),
      ]);
      const sJson = await sRes.json();
      if (!sRes.ok) throw new Error(sJson.error ?? "Status unavailable.");
      setStatusRows(sJson.flights ?? []);
      const cJson = await cRes.json();
      if (cRes.ok) setSchedRows(cJson.legs ?? []);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setStatusBusy(false);
    }
  }

  function onStatus(e: React.FormEvent) {
    e.preventDefault();
    void runStatus(flight);
  }

  return (
    <>
      <section className="hero fade-up">
        <p className="muted mono">LIVE DATA · STATUS + SCHEDULES + TRACKING</p>
        <h1>Track any airport, live.</h1>
        <p>
          Airport details plus aircraft currently in the air nearby —
          from public feeds, no key needed. Check any flight number
          for live status and schedule below.
        </p>
      </section>
      <div className="grid">
        <section className="card fade-up">
          <h2>Airport lookup</h2>
          <p className="desc">3-letter IATA or 4-letter ICAO code.</p>
          <form onSubmit={onLookup} style={{ display: "flex", gap: 8 }}>
            <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="JFK" aria-label="Airport code" />
            <button className="primary" style={{ width: "auto", marginTop: 0 }} type="submit" disabled={loading}>
              {loading ? "…" : "Look up"}
            </button>
          </form>
          {error !== "" && <div className="error">{error}</div>}
          {loading && (
            <div style={{ marginTop: 12 }} aria-label="Loading">
              <div className="shimmer" style={{ height: 18, borderRadius: 6, marginBottom: 8 }} />
              <div className="shimmer" style={{ height: 14, borderRadius: 6, width: "70%", marginBottom: 8 }} />
              <div className="shimmer" style={{ height: 14, borderRadius: 6, width: "50%" }} />
            </div>
          )}
          {airport && (
            <div style={{ marginTop: 12 }} className="fade-up">
              <div className="route" style={{ fontWeight: 700, fontSize: 18 }}>{airport.name}</div>
              <div className="meta muted">
                {airport.type} · {airport.latitude.toFixed(2)}, {airport.longitude.toFixed(2)} · elev {airport.elevation} ft
              </div>
              <div className="mono">IATA {airport.iata ?? "—"} · ICAO {airport.icao ?? "—"}</div>
              {weather && (
                <div className="meta" style={{ marginTop: 6 }}>
                  {weather.label} · {weather.temp}°C (high {weather.high}° / low {weather.low}°) · wind {weather.wind} km/h
                </div>
              )}
            </div>
          )}
        </section>
        <section className="card fade-up">
          <h2>Live map</h2>
          <p className="desc">{airport ? `Around ${airport.name} — markers update on each lookup.` : "Look up an airport to see its live map."}</p>
          {airport ? (
            <LiveMap center={[airport.latitude, airport.longitude]} airportName={airport.name} aircraft={traffic} />
          ) : (
            <div className="shimmer" style={{ height: 320, borderRadius: 8 }} />
          )}
        </section>
      </div>
      <div className="grid" style={{ marginTop: -20 }}>
        <section className="card fade-up">
          <h2>Live traffic nearby</h2>
          <p className="desc">
            {traffic.length === 0 ? "Aircraft appear here after a lookup." : `${traffic.length} aircraft in the air within 50 nm.`}
          </p>
          {traffic.map((a) => (
            <div key={a.hex} className="offer stagger">
              <div className="route" style={{ fontSize: 16 }}>{a.flight}</div>
              <div className="meta">
                {a.altitudeFt != null ? `${a.altitudeFt.toLocaleString()} ft` : "alt —"} ·{" "}
                {a.speedKt != null ? `${a.speedKt} kt` : "speed —"} ·{" "}
                {a.track != null ? `heading ${a.track}°` : "heading —"}
              </div>
            </div>
          ))}
        </section>
        <section className="card fade-up">
          <h2>Flight status + schedule</h2>
          <p className="desc">Live status (Aviationstack) and schedule (AeroDataBox). Display only.</p>
          <form onSubmit={onStatus} style={{ display: "flex", gap: 8 }}>
            <input value={flight} maxLength={7} onChange={(e) => setFlight(e.target.value.toUpperCase())} placeholder="BA117" aria-label="Flight number" />
            <button className="primary" style={{ width: "auto", marginTop: 0 }} type="submit" disabled={statusBusy}>
              {statusBusy ? "…" : "Check"}
            </button>
          </form>
          {statusError !== "" && <div className="error">{statusError}</div>}
          {statusBusy && <div className="shimmer" style={{ height: 14, borderRadius: 6, marginTop: 12 }} />}
          {statusRows.map((s, i) => (
            <div key={i} className="offer stagger">
              <div className="route" style={{ fontSize: 16 }}>{s.flightNo} · {s.airline}</div>
              <div className="meta">
                {s.departure} → {s.arrival} · {s.status}
                {s.delayMin != null ? ` · delay ${s.delayMin} min` : ""}
              </div>
            </div>
          ))}
          {schedRows.map((s, i) => (
            <div key={`sched-${i}`} className="offer stagger">
              <div className="route" style={{ fontSize: 16 }}>{s.flightNo ?? "Schedule"}</div>
              <div className="meta">
                {s.origin} → {s.destination}
                {s.scheduledUtc ? ` · sched ${s.scheduledUtc}` : ""}
                {s.revisedUtc ? ` · revised ${s.revisedUtc}` : ""}
                {s.terminal ? ` · T${s.terminal}` : ""}
                {s.distanceKm != null ? ` · ${s.distanceKm.toLocaleString()} km` : ""}
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
