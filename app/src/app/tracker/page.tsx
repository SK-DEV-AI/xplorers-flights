"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AirportInfo, LiveAircraft } from "@/lib/aviation/keyless";

const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false });

interface Weather {
  temp: number;
  label: string;
  wind: number;
  high: number;
  low: number;
}

/**
 * Tracker page. Keyless live data, no signup:
 * airport lookup (name, codes, position) + live aircraft near it.
 * Proves the site answers more than booking questions.
 */
export default function TrackerPage() {
  const [code, setCode] = useState("JFK");
  const [airport, setAirport] = useState<AirportInfo | null>(null);
  const [traffic, setTraffic] = useState<LiveAircraft[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <>
      <section className="hero fade-up">
        <p className="muted mono">KEYLESS · NO SIGNUP · LIVE DATA</p>
        <h1>Track any airport, live.</h1>
        <p>
          Airport details plus aircraft currently in the air nearby —
          from public feeds, no key needed.
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
            <div style={{ marginTop: 12 }}>
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
      </div>
    </>
  );
}
