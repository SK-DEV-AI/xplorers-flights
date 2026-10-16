import { NextResponse } from "next/server";
import { env, isLive } from "@/lib/env";

/** GET /api/status — what the site is running on (no secrets). */
export async function GET() {
  return NextResponse.json({
    provider: env.provider,
    mode: env.mode,
    live: isLive(),
    bookingEnabled: env.bookingEnabled,
    hasKey: (isLive() ? env.liveKey : env.testKey).length > 0,
  });
}
