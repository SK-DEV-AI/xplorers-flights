import { NextResponse } from "next/server";
import { flightStatus } from "@/lib/status/aviationstack";

/** GET /api/flight-status?flight=BA117 — live status, display only. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const flight = searchParams.get("flight") ?? "";
  try {
    const rows = await flightStatus(flight);
    return NextResponse.json({ count: rows.length, flights: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status unavailable.";
    const status = /not set/.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
