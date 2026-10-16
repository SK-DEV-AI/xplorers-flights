import { NextResponse } from "next/server";
import { parseWithProxy } from "@/lib/copilot/proxy";
import { getProvider } from "@/lib/flights";
import { flightStatus } from "@/lib/status/aviationstack";

/**
 * POST /api/copilot { message } — the AI bar backend.
 * 1) big-pickle proxy extracts slots (local fallback on failure).
 * 2) OUR code calls the right tool: Duffel search or Aviationstack status.
 * 3) Returns a narrated transcript the UI renders step by step.
 * The model never holds API keys — keys stay in server routes.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    const message = (body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Say where you want to fly." }, { status: 400 });
    const { slots, flightNo, via } = await parseWithProxy(message);
    const steps: string[] = [`Understood via ${via === "proxy" ? "AI parse" : "local parse"}.`];

    if (slots.intent === "status" && flightNo) {
      steps.push(`Calling flight-status(${flightNo})…`);
      try {
        const rows = await flightStatus(flightNo, 3);
        return NextResponse.json({
          via,
          intent: "status",
          steps,
          flights: rows,
          reply:
            rows.length === 0
              ? `No live status for ${flightNo} right now.`
              : `${flightNo}: ${rows[0].status}, ${rows[0].departure} → ${rows[0].arrival}${rows[0].delayMin != null ? `, delay ${rows[0].delayMin} min` : ""}.`,
        });
      } catch (err) {
        return NextResponse.json({ via, intent: "status", steps, reply: err instanceof Error ? err.message : "Status failed." });
      }
    }

    if (!slots.origin || !slots.destination) {
      return NextResponse.json({
        via,
        intent: "search",
        steps,
        reply: "Which airports? Give me origin and destination, e.g. SFO to Tokyo for 2 adults.",
        slots,
      });
    }
    const date = slots.departureDate ?? "2026-11-14";
    steps.push(`Calling search(${slots.origin}, ${slots.destination}, ${date}, ${slots.passengers} pax, ${slots.cabinClass})…`);
    try {
      const offers = await getProvider().searchOffers({
        origin: slots.origin,
        destination: slots.destination,
        departureDate: date,
        passengers: slots.passengers,
        cabinClass: slots.cabinClass as "economy" | "premium_economy" | "business" | "first",
      });
      steps.push(`Search returned ${offers.length} offer${offers.length === 1 ? "" : "s"}.`);
      return NextResponse.json({
        via,
        intent: "search",
        steps,
        slots: { ...slots, departureDate: date },
        offers: offers.slice(0, 5),
        reply:
          offers.length === 0
            ? "No options on that route and date. Try different dates or nearby airports."
            : `Found ${offers.length} option${offers.length === 1 ? "" : "s"} — top pick ${offers[0].airline} ${offers[0].flightNo} at ${offers[0].price} ${offers[0].currency}. Scroll to results to filter and review.`,
      });
    } catch (err) {
      return NextResponse.json({ via, intent: "search", steps, reply: err instanceof Error ? err.message : "Search failed." });
    }
  } catch {
    return NextResponse.json({ error: "Copilot failed." }, { status: 500 });
  }
}
