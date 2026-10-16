/**
 * Bookings page. Ports the Stitch "My Bookings & Boarding Pass" screen.
 * Server-rendered placeholder: real history arrives with the database
 * layer (Supabase) after exams. Copy matches the Stitch ticket layout.
 */
export default function BookingsPage() {
  return (
    <>
      <section className="hero">
        <p className="muted mono">STEP 4 OF 4 · TICKET</p>
        <h1>My bookings</h1>
        <p>Confirmed tickets appear here with their reference, seats, and baggage.</p>
      </section>
      <section className="card">
        <h2>Booking confirmed — sample layout</h2>
        <p className="desc">Shape of a real ticket. Live data arrives with the database layer.</p>
        <div className="offer">
          <div className="route">SFO → HND</div>
          <div className="meta">Xplorers Airways · XP 819 · Economy · Non-stop</div>
          <div className="mono">Reference: XP-74291-SBX</div>
          <div className="meta">Seats 14A · 14B · 2 × 23kg included</div>
        </div>
        <div className="notice">Test data only — not valid for travel.</div>
      </section>
    </>
  );
}
