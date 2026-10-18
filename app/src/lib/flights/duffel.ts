import { activeKey, bookingAllowed, env } from "@/lib/env";
import type {
  BookingResult,
  FlightOffer,
  FlightProvider,
  Passenger,
  SearchInput,
} from "./types";

/**
 * Duffel implementation of FlightProvider (raw REST, no SDK lock-in).
 * Test mode and live mode share this code path — only the key changes.
 * Docs: https://duffel.com/docs/api/overview/test-mode/duffel-airways
 */

const BASE = "https://api.duffel.com/air";

function headers(key: string) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Duffel-Version": "v2",
    Authorization: `Bearer ${key}`,
  };
}

interface DuffelOffer {
  id: string;
  owner?: { name?: string };
  slices?: Array<{
    segments?: Array<{
      operating_carrier?: { name?: string; iata_code?: string };
      operating_carrier_flight_number?: string;
      origin?: { iata_code?: string };
      destination?: { iata_code?: string };
      departing_at?: string;
      arriving_at?: string;
      duration?: string;
    }>;
    duration?: string;
  }>;
  total_amount?: string;
  total_currency?: string;
  cabin_class?: string;
}

function toOffer(o: DuffelOffer): FlightOffer {
  const seg = o.slices?.[0]?.segments?.[0];
  return {
    id: o.id,
    airline: seg?.operating_carrier?.name ?? o.owner?.name ?? "Duffel Airways",
    airlineIata: seg?.operating_carrier?.iata_code ?? "",
    flightNo: seg?.operating_carrier_flight_number ?? "—",
    origin: seg?.origin?.iata_code ?? "",
    destination: seg?.destination?.iata_code ?? "",
    departAt: seg?.departing_at ?? "",
    arriveAt: seg?.arriving_at ?? "",
    duration: o.slices?.[0]?.duration ?? seg?.duration ?? "",
    stops: Math.max(0, (o.slices?.[0]?.segments?.length ?? 1) - 1),
    price: o.total_amount ?? "",
    currency: o.total_currency ?? "",
    cabinClass: o.cabin_class ?? "",
  };
}

export class DuffelProvider implements FlightProvider {
  readonly name = "duffel";
  readonly mode = env.mode;

  async searchOffers(input: SearchInput): Promise<FlightOffer[]> {
    const key = activeKey();
    if (!key) {
      throw new Error(
        env.mode === "live"
          ? "DUFFEL_LIVE_KEY is not set. Add it to .env.local to search live inventory."
          : "DUFFEL_TEST_KEY is not set. Get a free key at duffel.com → Test Mode, then add it to .env.local.",
      );
    }
    const res = await fetch(`${BASE}/offer_requests`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        data: {
          cabin_class: input.cabinClass,
          slices: [
            {
              origin: input.origin,
              destination: input.destination,
              departure_date: input.departureDate,
            },
          ],
          passengers: Array.from({ length: input.passengers }, () => ({ type: "adult" })),
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Duffel search failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data?: { offers?: DuffelOffer[] } };
    return (json.data?.offers ?? []).map(toOffer);
  }

  async createOrder(offerId: string, passengers: Passenger[]): Promise<BookingResult> {
    if (!bookingAllowed()) {
      throw new Error(
        "Booking is disabled. It requires DUFFEL_MODE=live, a DUFFEL_LIVE_KEY, and BOOKING_ENABLED=true. " +
          "Test mode never issues real tickets.",
      );
    }
    const res = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: headers(env.liveKey),
      body: JSON.stringify({
        data: {
          type: "instant",
          offers: [offerId],
          passengers: passengers.map((p) => ({
            given_name: p.givenName,
            family_name: p.familyName,
            born_on: p.bornOn,
            email: p.email,
            phone_number: p.phone,
          })),
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Duffel booking failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      data?: { id?: string; booking_reference?: string };
    };
    return {
      orderId: json.data?.id ?? "",
      reference: json.data?.booking_reference ?? "",
      status: "confirmed",
    };
  }

  async cancelOrder(orderId: string): Promise<{ status: string }> {
    if (!bookingAllowed()) {
      throw new Error("Cancellation is disabled while booking is disabled.");
    }
    const res = await fetch(`${BASE}/orders/${orderId}/actions/cancel`, {
      method: "POST",
      headers: headers(env.liveKey),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Duffel cancel failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return { status: "cancelled" };
  }
}
