import { NextResponse } from "next/server";
import { lookupAirport } from "@/lib/aviation/keyless";

/** GET /api/airports?code=JFK — keyless airport reference lookup. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") ?? "";
  try {
    const info = await lookupAirport(code);
    return NextResponse.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
