import { NextResponse } from "next/server";
import { fetchMetars, fetchTafs, isReportKind } from "@/lib/metar";

/** GET /api/metar?code=KJFK[&type=taf] — keyless real aviation weather. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();
  // Default to METAR when ?type is absent; only metar and taf are accepted.
  const typeParam = searchParams.get("type") ?? "metar";

  if (!/^[A-Z0-9]{3,4}$/.test(code)) {
    return NextResponse.json(
      { error: "Pass an airport code like KJFK." },
      { status: 400 },
    );
  }

  if (!isReportKind(typeParam)) {
    return NextResponse.json(
      { error: 'Pass type=metar or type=taf.' },
      { status: 400 },
    );
  }

  try {
    // An empty upstream array is a legitimate "no report right now", not an error.
    const result = typeParam === "taf" ? await fetchTafs(code) : await fetchMetars(code);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aviation weather lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}