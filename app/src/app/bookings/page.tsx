"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listBookings, type BookingRow } from "@/lib/supabase/bookings";
import { supabaseConfigured } from "@/lib/env";

/**
 * Bookings: real history from Supabase, or an honest empty state.
 * The sample ticket is only ever shown when explicitly asked for, so nobody
 * mistakes placeholder data for a real booking (audit S10).
 */
export default function BookingsPage() {
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSample, setShowSample] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabaseConfigured()) {
        setHint("Connect Supabase to see real bookings.");
        setLoading(false);
        return;
      }
      const res = await listBookings();
      if (res.rows) setRows(res.rows);
      if (res.error) setHint(res.error);
      setLoading(false);
    })();
  }, []);

  const hasBookings = Boolean(rows && rows.length > 0);

  return (
    <>
      <section className="hero fade-up">
        <p className="muted mono">YOUR TICKETS</p>
        <h1>My bookings</h1>
        <p>Confirmed tickets appear here with their reference and route.</p>
      </section>

      <section className="card fade-up">
        {loading ? (
          <div className="shimmer" style={{ height: 72, borderRadius: 8 }} aria-label="Loading bookings" />
        ) : hasBookings ? (
          <>
            <h2>Booking history ({rows?.length ?? 0})</h2>
            <p className="desc">Live from Supabase.</p>
            {rows!.map((r) => (
              <article key={r.id} className="offer">
                <div className="route">{r.origin ?? "—"} → {r.destination ?? "—"}</div>
                <div className="meta">{r.status ?? "confirmed"}</div>
                <div className="mono">Reference: {r.reference ?? r.order_id ?? r.id.slice(0, 8)}</div>
              </article>
            ))}
          </>
        ) : (
          <>
            <h2>No bookings yet</h2>
            <p className="desc">
              Nothing has been booked on this account. Search for a flight and complete the passenger
              details to create one.
            </p>
            <Link className="primary syn-cta" href="/">Find a flight</Link>
          </>
        )}

        {!hasBookings && !loading && (
          <details className="sample-details">
            <summary>Show what a confirmed ticket looks like</summary>
            <div className="offer">
              <div className="route">SFO → HND</div>
              <div className="meta">Xplorers Airways · XP 819 · Economy · Non-stop</div>
              <div className="mono">Reference: XP-74291-SBX</div>
              <div className="meta">Seats 14A · 14B · 2 × 23kg included</div>
            </div>
            <div className="notice">Sample only — not valid for travel.</div>
          </details>
        )}

        {hint !== "" && <div className="notice">{hint}</div>}
      </section>
    </>
  );
}
