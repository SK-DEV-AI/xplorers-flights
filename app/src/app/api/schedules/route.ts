import { NextResponse } from "next/server";
import { flightSchedule } from "@/lib/status/aerodatabox";

/** GET /api/schedules?flight=BA117&date=2026-10-16 — schedules, display only. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const flight = searchParams.get("flight") ?? "";
  const date = searchParams.get("date") ?? "";
  try {
    const legs = await flightSchedule(flight, date);
    return NextResponse.json({ count: legs.length, legs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Schedules unavailable.";
    const status = /not set/.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
