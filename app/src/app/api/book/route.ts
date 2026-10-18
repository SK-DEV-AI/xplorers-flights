import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/flights";

const BookInput = z.object({
  offerId: z.string().min(1),
  passengers: z
    .array(
      z.object({
        givenName: z.string().min(1),
        familyName: z.string().min(1),
        bornOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        email: z.string().email(),
        phone: z.string().min(5),
      }),
    )
    .min(1),
});

/**
 * POST /api/book — guarded. Refuses unless live mode + live key +
 * BOOKING_ENABLED=true. Demo logins must never reach real booking.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = BookInput.parse(body);
    const result = await getProvider().createOrder(input.offerId, input.passengers);
    return NextResponse.json(result);
  } catch (err) {
    // The booking-disabled message is ours and is safe to show verbatim.
    // Everything else (Zod issues, Duffel payloads) must not reach the UI.
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Some passenger details are missing or invalid. Check name, date of birth, email and phone." },
        { status: 400 },
      );
    }
    const raw = err instanceof Error ? err.message : "";
    if (raw.startsWith("Booking is disabled")) {
      return NextResponse.json({ error: raw }, { status: 403 });
    }
    return NextResponse.json(
      { error: "We could not complete that booking. Nothing was charged — please try again." },
      { status: 502 },
    );
  }
}
