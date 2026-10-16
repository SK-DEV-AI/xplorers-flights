import { NextResponse } from "next/server";

/** GET /api/time?zone=Asia/Kolkata — keyless local time via timeapi.io. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zone = searchParams.get("zone") ?? "Asia/Kolkata";
  const res = await fetch(`https://timeapi.io/api/time/current/zone?timeZone=${encodeURIComponent(zone)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return NextResponse.json({ error: `Time unavailable (${res.status}).` }, { status: 502 });
  const json = await res.json();
  return NextResponse.json({ zone: json.timeZone ?? zone, dateTime: json.dateTime, time: json.time, date: json.date });
}
