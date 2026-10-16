import { NextResponse } from "next/server";

/** GET /api/currency?from=EUR&to=INR,USD — keyless ECB rates via Frankfurter. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = (searchParams.get("from") ?? "EUR").toUpperCase();
  const to = (searchParams.get("to") ?? "INR,USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(from)) return NextResponse.json({ error: "Pass from=EUR." }, { status: 400 });
  const res = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return NextResponse.json({ error: `Rates unavailable (${res.status}).` }, { status: 502 });
  const json = await res.json();
  return NextResponse.json({ base: json.base, date: json.date, rates: json.rates ?? {} });
}
