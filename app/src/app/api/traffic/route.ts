import { NextResponse } from "next/server";
import { liveTraffic } from "@/lib/aviation/keyless";

/** GET /api/traffic?lat=51.5&lon=-0.12&radius=50 — keyless live aircraft. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  const radius = Number(searchParams.get("radius") ?? "50");
  if (latRaw == null || lonRaw == null || latRaw === "" || lonRaw === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Pass lat and lon query parameters." }, { status: 400 });
  }
  try {
    const aircraft = await liveTraffic(lat, lon, radius);
    return NextResponse.json({ count: aircraft.length, aircraft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Traffic unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
