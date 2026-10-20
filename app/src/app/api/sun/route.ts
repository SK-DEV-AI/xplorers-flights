import { NextResponse } from "next/server";

/**
 * GET /api/sun?lat=..&lon=.. — keyless sunrise/sunset for a location.
 *
 * Source: https://api.open-meteo.com/v1/forecast
 * Docs:   https://open-meteo.com/en/docs
 *
 * The response carries the location's own timezone plus `utc_offset_seconds`,
 * so "is it daylight there right now" is answered with the location's clock
 * rather than the server's clock.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "Pass lat and lon query parameters." }, { status: 400 });
  }
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return NextResponse.json({ error: "lat and lon must be numbers." }, { status: 400 });
  }
  if (Number(lat) < -90 || Number(lat) > 90 || Number(lon) < -180 || Number(lon) > 180) {
    return NextResponse.json({ error: "lat must be between -90 and 90, lon between -180 and 180." }, { status: 400 });
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}&daily=sunrise,sunset&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return NextResponse.json({ error: `Sun times unavailable (${res.status}).` }, { status: 502 });

  const json = (await res.json()) as SunResponse;
  const sunrise = json.daily?.sunrise?.[0] ?? null;
  const sunset = json.daily?.sunset?.[0] ?? null;

  if (!sunrise || !sunset) {
    return NextResponse.json({ sunrise: null, sunset: null, dayLength: null, isDaytime: null });
  }

  const sunriseSec = secondsOfDay(sunrise);
  const sunsetSec = secondsOfDay(sunset);
  const offset = typeof json.utc_offset_seconds === "number" ? json.utc_offset_seconds : null;
  const nowSec = offset === null ? null : localSecondsOfDay(offset);

  return NextResponse.json({
    sunrise,
    sunset,
    dayLength: formatDuration(sunsetSec - sunriseSec),
    isDaytime: nowSec === null ? null : nowSec >= sunriseSec && nowSec < sunsetSec,
  });
}

interface SunResponse {
  utc_offset_seconds?: number;
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
}

/** "2026-10-20T07:11" -> seconds since local midnight. */
function secondsOfDay(value: string): number {
  const parts = value.split("T");
  const time = parts[1] ?? "00:00";
  const [h, m, s] = time.split(":");
  return Number(h) * 3600 + Number(m ?? "0") * 60 + Number(s ?? "0");
}

/** The clock in the location's timezone, expressed as seconds since midnight. */
function localSecondsOfDay(offsetSeconds: number): number {
  const shifted = new Date(Date.now() + offsetSeconds * 1000);
  return (
    shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds()
  );
}

/** 43200 -> "12h 0m" */
function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
