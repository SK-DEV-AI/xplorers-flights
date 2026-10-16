"use client";

import { useEffect, useRef } from "react";
import type { LiveAircraft } from "@/lib/aviation/keyless";

/**
 * Live map: airport marker + aircraft markers, auto-refreshed by parent.
 * Leaflet loaded client-side only (no SSR). Tiles: OpenStreetMap.
 */
export default function LiveMap({
  center,
  airportName,
  aircraft,
}: {
  center: [number, number];
  airportName: string;
  aircraft: LiveAircraft[];
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (!divRef.current || mapRef.current || cancelled) return;
      const map = L.map(divRef.current).setView(center, 8);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapRef.current as any) = { map, L, markers: [] as unknown[] };
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      L.marker(center).addTo(map).bindPopup(airportName);
    })();
    return () => {
      cancelled = true;
    };
  }, []); // init once

  useEffect(() => {
    const entry = mapRef.current as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map: any; L: typeof import("leaflet"); markers: unknown[];
    } | null;
    if (!entry) return;
    entry.markers.forEach((m) => entry.map.removeLayer(m as never));
    entry.markers = [];
    entry.map.setView(center, 8);
    const L = entry.L;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry.markers as any[]).push(L.marker(center).addTo(entry.map).bindPopup(airportName));
    for (const a of aircraft.slice(0, 25)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entry.markers as any[]).push(
        L.circleMarker([a.lat, a.lon], { radius: 5 }).addTo(entry.map).bindPopup(`${a.flight} · ${a.altitudeFt ?? "?"} ft`),
      );
    }
  }, [center, aircraft, airportName]);

  return <div ref={divRef} style={{ height: 320, borderRadius: 8, border: "1px solid var(--line)" }} role="img" aria-label={`Live map around ${airportName}`} />;
}
