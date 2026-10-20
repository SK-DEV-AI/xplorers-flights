/**
 * Geometry helpers for the 3D globe.
 *
 * We build the globe from a texture plus a coastline overlay, so no heavy
 * geometry library is needed: an equirectangular texture is mapped onto a
 * sphere, and country borders are drawn as lines on top of it.
 *
 * Coordinate conventions:
 * - lat/lon are the usual WGS84 degrees.
 * - We map them to a unit sphere with Y up, matching the texture's
 *   equirectangular layout (u = (lon+180)/360, v = (90-lat)/180).
 */

export function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/** Ring of points for a circle of latitude, used for the tropics/equator. */
export function latitudeCircle(lat: number, radius: number, segments = 128) {
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= segments; i++) {
    const lon = -180 + (360 * i) / segments;
    pts.push(latLonToVector3(lat, lon, radius));
  }
  return pts;
}

interface GeoJsonFeature {
  type: string;
  properties?: Record<string, unknown>;
  geometry?: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJson {
  type: string;
  objects?: Record<string, unknown>;
  arcs?: unknown[][];
  features?: GeoJsonFeature[];
}

/**
 * Turn a TopoJSON world file into a list of line segments, so the globe can
 * draw country borders. TopoJSON arcs are delta-encoded and quantised, so we
 * decode them here rather than shipping a topojson library.
 */
export function topoJsonToSegments(
  topo: GeoJson,
): Array<Array<{ x: number; y: number; z: number }>> {
  const arcs = (topo.arcs ?? []) as unknown[][];
  const transform = (topo as unknown as { transform?: { scale: [number, number]; translate: [number, number] } }).transform;
  const scale = transform?.scale ?? [1, 1];
  const translate = transform?.translate ?? [0, 0];

  // Decode each arc into absolute [lon, lat] points.
  const decoded: Array<Array<[number, number]>> = arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const out: Array<[number, number]> = [];
    for (const [dx, dy] of arc as Array<[number, number]>) {
      x += dx;
      y += dy;
      out.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
    }
    return out;
  });

  const segments: Array<Array<{ x: number; y: number; z: number }>> = [];
  const objects = topo.objects ?? {};
  for (const obj of Object.values(objects)) {
    const geometries = (obj as { geometries?: Array<{ type: string; arcs?: unknown[] }> }).geometries ?? [];
    for (const geom of geometries) {
      if (geom.type === "Polygon") {
        for (const ring of (geom.arcs ?? []) as unknown[][]) {
          const pts: Array<[number, number]> = [];
          for (const idx of ring as number[]) {
            const arc = decoded[Math.abs(idx)];
            if (!arc) continue;
            if (idx >= 0) {
              pts.push(...arc);
            } else {
              pts.push(...[...arc].reverse());
            }
          }
          if (pts.length > 1) {
            segments.push(pts.map(([lon, lat]) => latLonToVector3(lat, lon, 1)));
          }
        }
      } else if (geom.type === "MultiPolygon") {
        for (const poly of (geom.arcs ?? []) as unknown[][]) {
          for (const ring of poly as unknown[][]) {
            const pts: Array<[number, number]> = [];
            for (const idx of ring as number[]) {
              const arc = decoded[Math.abs(idx)];
              if (!arc) continue;
              if (idx >= 0) pts.push(...arc);
              else pts.push(...[...arc].reverse());
            }
            if (pts.length > 1) {
              segments.push(pts.map(([lon, lat]) => latLonToVector3(lat, lon, 1)));
            }
          }
        }
      }
    }
  }
  return segments;
}
