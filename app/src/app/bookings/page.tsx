"use client";

import { useEffect, useState } from "react";
import { listBookings, type BookingRow } from "@/lib/supabase/bookings";
import { supabaseConfigured } from "@/lib/env";

/**
 * Bookings page. Ports the Stitch "My Bookings & Boarding Pass" screen.
 * Live history from Supabase when the bookings table exists; otherwise
 * shows the sample layout with an honest setup hint. Demo login continues
 * to work locally until Supabase Auth is wired.
 */
export default function BookingsPage() {
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!supabaseConfigured()) {
        setHint("Supabase is not configured yet — showing the sample layout.");
        setLoading(false);
        return;
      }
      const res = await listBookings();
      if (res.rows) setRows(res.rows);
      if (res.error) setHint(res.error);
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <section className="hero fade-up">
        <p className="muted mono">STEP 4 OF 4 · TICKET</p>
        <h1>My bookings</h1>
        <p>Confirmed tickets appear here with their reference, seats, and baggage.</p>
      </section>
      <section className="card fade-up">
        <h2>{rows && rows.length > 0 ? `Booking history (${rows.length})` : "Booking confirmed — sample layout"}</h2>
        <p className="desc">
          {rows && rows.length > 0 ? "Live history from Supabase." : "Shape of a real ticket. Live data arrives with the database layer."}
        </p>
        {loading && <div className="shimmer" style={{ height: 60, borderRadius: 8 }} />}
        {!loading && rows && rows.length > 0
          ? rows.map((r) => (
              <div key={r.id} className="offer stagger">
                <div className="route">{r.origin ?? "—"} → {r.destination ?? "—"}</div>
                <div className="meta">{r.status ?? "confirmed"}</div>
                <div className="mono">Reference: {r.reference ?? r.order_id ?? r.id.slice(0, 8)}</div>
              </div>
            ))
          : !loading && (
              <div className="offer stagger">
                <div className="route">SFO → HND</div>
                <div className="meta">Xplorers Airways · XP 819 · Economy · Non-stop</div>
                <div className="mono">Reference: XP-74291-SBX</div>
                <div className="meta">Seats 14A · 14B · 2 × 23kg included</div>
              </div>
            )}
        {(hint !== "" || true) && (
          <div className="notice">{hint || "Test data only — not valid for travel."}</div>
        )}
      </section>
    </>
  );
}
