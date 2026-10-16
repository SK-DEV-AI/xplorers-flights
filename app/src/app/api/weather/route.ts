import { NextResponse } from "next/server";

/** GET /api/weather?lat=..&lon=.. — keyless Open-Meteo current + today. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "Pass lat and lon query parameters." }, { status: 400 });
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) return NextResponse.json({ error: `Weather unavailable (${res.status}).` }, { status: 502 });
  const json = await res.json();
  return NextResponse.json({
    temp: json.current?.temperature_2m,
    code: json.current?.weather_code,
    wind: json.current?.wind_speed_10m,
    high: json.daily?.temperature_2m_max?.[0],
    low: json.daily?.temperature_2m_min?.[0],
    label: wmo(json.current?.weather_code),
  });
}

function wmo(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96) return "Storm with hail";
  return "—";
}
