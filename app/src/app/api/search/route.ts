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
    const message = err instanceof Error ? err.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
