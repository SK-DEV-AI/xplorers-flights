import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places";

/** GET /api/places?q=London%20Heathrow — keyless OpenStreetMap place search. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json(
      { error: "Pass a search term of at least 2 characters." },
      { status: 400 },
    );
  }

  try {
    // An empty upstream result is a legitimate "nothing found", not an error.
    return NextResponse.json(await searchPlaces(query));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Place search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}