"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Contact } from "./Globe";

/**
 * Live radar — the one "wow" surface.
 *
 * A real 3D globe with every aircraft currently broadcasting its position
 * (OpenSky public ADS-B network). The globe is lazy-loaded, so the three.js
 * library is only downloaded when someone opens this page — the rest of the
 * site stays fast.
 */

const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => (
    <div className="globe-host">
      <div className="shimmer" style={{ height: "100%", borderRadius: 12 }} />
    </div>
  ),
});

interface Snapshot {
  n: number;
  t: string;
  aircraft: Contact[];
}

export default function RadarPage() {
  const [stats, setStats] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [error, setError] = useState("");
  const globeApi = useRef<{ reset: () => void; zoom: (d: number) => void } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/global-traffic");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Radar feed unavailable.");
      const aircraft: Contact[] = (json.a ?? []).map((w: {
        h: string; f: string; c: string; x: number; y: number;
        a: number | null; s: number | null; d: number | null; g: 0 | 1;
      }) => ({
        hex: w.h,
        flight: w.f,
        country: w.c,
        lat: w.x,
        lon: w.y,
        altKm: w.a,
        speedKt: w.s,
        heading: w.d,
        onGround: w.g === 1,
      }));
      setStats({ n: json.n, t: json.t, aircraft });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Radar feed unavailable.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const countries = new Set((stats?.aircraft ?? []).map((c) => c.country).filter(Boolean)).size;
  const cruising = (stats?.aircraft ?? []).filter((c) => (c.altKm ?? 0) >= 8).length;

  return (
    <>
      <section className="radar-head fade-up">
        <div>
          <p className="muted mono">LIVE · PUBLIC DATA · NO SIGNUP</p>
          <h1>Live radar</h1>
          <p className="radar-sub">
            Every contact is an aircraft broadcasting its real position right now.
            Drag to spin, scroll to zoom, click one to lock on.
          </p>
        </div>
        <div className="radar-stats">
          <div className="radar-stat">
            <span className="radar-num">{stats?.n ?? "—"}</span>
            <span className="radar-label">aircraft</span>
          </div>
          <div className="radar-stat">
            <span className="radar-num">{cruising || "—"}</span>
            <span className="radar-label">at cruise</span>
          </div>
          <div className="radar-stat">
            <span className="radar-num">{countries || "—"}</span>
            <span className="radar-label">countries</span>
          </div>
        </div>
      </section>

      {error !== "" && <div className="error">{error}</div>}

      <div className="radar-wrap fade-up">
        <Globe
          aircraft={stats?.aircraft ?? []}
          selected={selected}
          onSelect={setSelected}
          onReady={(api) => { globeApi.current = api; }}
        />
        <div className="radar-controls">
          <button type="button" className="ghost" onClick={() => globeApi.current?.zoom(-0.35)} aria-label="Zoom in">+</button>
          <button type="button" className="ghost" onClick={() => globeApi.current?.zoom(0.35)} aria-label="Zoom out">&minus;</button>
          <button type="button" className="ghost" onClick={() => globeApi.current?.reset()}>Reset</button>
        </div>
        {selected && (
          <aside className="radar-panel">
            <button type="button" className="radar-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
            <div className="radar-call">{selected.flight}</div>
            <dl className="radar-dl">
              <div><dt>Country</dt><dd>{selected.country || "—"}</dd></div>
              <div><dt>Altitude</dt><dd>{selected.altKm != null ? `${selected.altKm.toLocaleString()} km` : "—"}</dd></div>
              <div><dt>Speed</dt><dd>{selected.speedKt != null ? `${selected.speedKt} kt` : "—"}</dd></div>
              <div><dt>Heading</dt><dd>{selected.heading != null ? `${selected.heading}°` : "—"}</dd></div>
              <div><dt>Position</dt><dd>{selected.lat.toFixed(2)}, {selected.lon.toFixed(2)}</dd></div>
              <div><dt>Hex</dt><dd className="mono">{selected.hex}</dd></div>
            </dl>
            <Link className="syn-link" href={`/tracker?flight=${encodeURIComponent(selected.flight.replace(/\s+/g, ""))}`}>
              Open in tracker →
            </Link>
          </aside>
        )}
      </div>

      <div className="radar-legend">
        {[
          { c: "#60a5fa", l: "Below 3 km" },
          { c: "#34d399", l: "3–8 km" },
          { c: "#fbbf24", l: "8–11 km" },
          { c: "#f472b6", l: "Cruising" },
          { c: "#94a3b8", l: "On the ground" },
        ].map((x) => (
          <span key={x.l} className="legend-item">
            <span className="legend-dot" style={{ background: x.c }} />
            {x.l}
          </span>
        ))}
        <span className="legend-note">
          OpenSky Network (public ADS-B) · updated {stats?.t ? new Date(stats.t).toUTCString().slice(17, 25) : "—"} UTC
        </span>
      </div>
    </>
  );
}
