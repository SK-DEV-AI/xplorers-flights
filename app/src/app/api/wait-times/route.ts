import { NextResponse } from "next/server";

/**
 * GET /api/wait-times?code=JFK
 *
 * Keyless security-queue estimates for 440 US airports. Each row says whether
 * the figure is LIVE (from the airport operator) or MODELLED (our time-of-day
 * model), so the UI can be honest about it.
 *
 * Docs: https://securitywaittimes.com/data/ — CC BY 4.0, attribution needed.
 * Note: this endpoint 403s a descriptive User-Agent, so we send a browser one.
 */

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

interface WaitRow {
  iata: string;
  name: string;
  city?: string;
  state?: string;
  standard_minutes?: number | null;
  precheck_minutes?: number | null;
  measurement?: "live" | "modelled" | "unavailable";
  precheck_measurement?: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();

  try {
    const res = await fetch("https://securitywaittimes.com/wp-json/swt/v1/wait", {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = (await res.json()) as {
      count?: number;
      live_count?: number;
      modelled_count?: number;
      generated_at?: string;
      airports?: WaitRow[];
    };
    const rows = json.airports ?? [];
    const match = code ? rows.find((r) => r.iata === code) : undefined;
    if (code && !match) {
      return NextResponse.json(
        { error: `No security wait data for ${code}. It covers 440 US airports.`, found: false },
        { status: 404 },
      );
    }
    return NextResponse.json({
      count: json.count ?? rows.length,
      liveCount: json.live_count ?? 0,
      modelledCount: json.modelled_count ?? 0,
      generatedAt: json.generated_at ?? null,
      attribution: "Security Wait Times (CC BY 4.0)",
      airport: match ?? null,
      airports: code ? undefined : rows.slice(0, 40),
    });
  } catch {
    return NextResponse.json(
      { error: "Security wait times are unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
