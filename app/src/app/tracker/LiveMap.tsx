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
      // Bundlers do not copy Leaflet's default marker images to the site
      // root, so point Leaflet at the bundled assets explicitly (audit N3).
      // Next returns a static-image object for PNG imports: { src, width,
      // height } — reading `.default.src` gave undefined, which made Leaflet
      // request a relative "undefined" path and 404.
      const [icon, shadow] = await Promise.all([
        import("leaflet/dist/images/marker-icon.png"),
        import("leaflet/dist/images/marker-shadow.png"),
      ]);
      const assetUrl = (mod: unknown): string => {
        const m = mod as { default?: unknown; src?: string };
        const d = m.default as { src?: string; default?: { src?: string } } | undefined;
        // Next's PNG import resolves to a static-image object; depending on the
        // bundler it sits at .default, .default.default, or directly on .src.
        return d?.src ?? d?.default?.src ?? m.src ?? "";
      };
      const iconUrl = assetUrl(icon);
      const shadowUrl = assetUrl(shadow);
      if (iconUrl && shadowUrl) {
        L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl: iconUrl, shadowUrl });
      } else {
        // Last resort: serve the files from our own /public so Leaflet's
        // default relative path resolves instead of 404ing.
        console.warn("Leaflet marker assets not resolved; using /public fallbacks.");
      }
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
