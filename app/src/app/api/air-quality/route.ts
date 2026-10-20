import { NextResponse } from "next/server";

/**
 * GET /api/air-quality?lat=..&lon=.. — keyless Open-Meteo air quality.
 *
 * Source: https://air-quality-api.open-meteo.com/v1/air-quality
 * Docs:   https://open-meteo.com/en/docs/air-quality-api
 *
 * Returns PM2.5 plus the US and European AQI readings with a plain-English
 * label so the UI does not have to re-implement the thresholds.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "Pass lat and lon query parameters." }, { status: 400 });
  }
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
    return NextResponse.json({ error: "lat and lon must be numbers." }, { status: 400 });
  }
  if (Number(lat) < -90 || Number(lat) > 90 || Number(lon) < -180 || Number(lon) > 180) {
    return NextResponse.json({ error: "lat must be between -90 and 90, lon between -180 and 180." }, { status: 400 });
  }

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}&current=pm2_5,us_aqi,european_aqi`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) return NextResponse.json({ error: `Air quality unavailable (${res.status}).` }, { status: 502 });

  const json = (await res.json()) as AirQualityResponse;
  const pm25 = numberOrNull(json.current?.pm2_5);
  const usAqi = numberOrNull(json.current?.us_aqi);
  const europeanAqi = numberOrNull(json.current?.european_aqi);
  const label = aqiLabel(usAqi ?? europeanAqi);

  return NextResponse.json({ pm25, usAqi, europeanAqi, label });
}

interface AirQualityResponse {
  current?: {
    pm2_5?: number | null;
    us_aqi?: number | null;
    european_aqi?: number | null;
  };
}

/** Keep upstream nulls as null — a missing reading is not a reading of zero. */
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFiniteNumber(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

/** AQI bands, coarse on purpose — this is a student demo, not a regulator. */
function aqiLabel(aqi: number | null): string {
  if (aqi === null) return "unknown";
  if (aqi <= 20) return "Good";
  if (aqi <= 40) return "Moderate";
  if (aqi <= 60) return "Unhealthy for sensitive groups";
  if (aqi <= 80) return "Unhealthy";
  if (aqi <= 100) return "Very unhealthy";
  return "Hazardous";
}
