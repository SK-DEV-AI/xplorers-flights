import { z } from "zod";

/** Provider-agnostic flight shapes. Every provider maps to these. */

export const SearchInput = z.object({
  origin: z.string().length(3).transform((s) => s.toUpperCase()),
  destination: z.string().length(3).transform((s) => s.toUpperCase()),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.number().int().min(1).max(9).default(1),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
});
export type SearchInput = z.infer<typeof SearchInput>;

export interface FlightOffer {
  id: string;
  airline: string;
  flightNo: string;
  origin: string;
  destination: string;
  departAt: string;
  arriveAt: string;
  duration: string;
  stops: number;
  price: string;
  currency: string;
  cabinClass: string;
}

export interface Passenger {
  givenName: string;
  familyName: string;
  bornOn: string; // YYYY-MM-DD
  email: string;
  phone: string;
}

export interface BookingResult {
  orderId: string;
  reference: string; // PNR / record locator
  status: string;
}

/** Any flight backend (Duffel today, others later) implements this. */
export interface FlightProvider {
  readonly name: string;
  readonly mode: "test" | "live";
  searchOffers(input: SearchInput): Promise<FlightOffer[]>;
  /** Must refuse unless the provider is live AND booking is enabled. */
  createOrder(offerId: string, passengers: Passenger[]): Promise<BookingResult>;
  cancelOrder(orderId: string): Promise<{ status: string }>;
}
