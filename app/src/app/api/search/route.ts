import { NextResponse } from "next/server";
import { bookingAllowed } from "@/lib/env";
import { getProvider } from "@/lib/flights";
import { SearchInput } from "@/lib/flights/types";

/** POST /api/search — search flights via the configured provider. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = SearchInput.parse(body);
    const offers = await getProvider().searchOffers(input);
    return NextResponse.json({ offers, bookingAllowed: bookingAllowed() });
  } catch (err) {
    // Never leak raw provider or validator payloads into the UI.
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Check your search details: airports need 3-letter codes and the date must be YYYY-MM-DD." },
        { status: 400 },
      );
    }
    const raw = err instanceof Error ? err.message : "";
    if (/\(4\d\d\)|validation|invalid|too_small|too_big|expected/.test(raw)) {
      return NextResponse.json(
        { error: "That search could not run. Check the date is in the future and the route exists." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Our flight provider is not responding right now. Please try again in a moment." },
      { status: 502 },
    );
  }
}
