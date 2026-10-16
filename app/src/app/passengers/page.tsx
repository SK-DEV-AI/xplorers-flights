"use client";

import { useState } from "react";

/**
 * Passenger page. Ports the Stitch "Passenger Details & Confirmation"
 * screen: 4-step progress (Select, Passenger info, Confirm, Ticket) and a
 * per-passenger form. Submit calls the guarded /api/book route, which
 * refuses while booking is disabled — the form proves readiness.
 */

const STEPS = ["Select flight", "Passenger info", "Confirm", "Ticket"];

interface Form {
  givenName: string;
  familyName: string;
  bornOn: string;
  email: string;
  phone: string;
}

const EMPTY: Form = { givenName: "", familyName: "", bornOn: "", email: "", phone: "" };

export default function PassengerPage() {
  const [offerId, setOfferId] = useState("");
  const [forms, setForms] = useState<Form[]>([{ ...EMPTY }]);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function setField(i: number, k: keyof Form, v: string) {
    setForms((prev) => prev.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, passengers: forms }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Booking failed.");
      setResult(`Confirmed — order ${json.orderId}, reference ${json.reference}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="muted mono">STEP 2 OF 4 · PASSENGER INFO</p>
        <h1>Who is travelling?</h1>
        <p>Details are checked before anything is booked. Booking stays off until a live key and approval exist.</p>
      </section>
      <section className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STEPS.map((s, i) => (
            <span key={s} className="pill" style={i === 1 ? { borderColor: "var(--accent)", fontWeight: 700 } : undefined}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Passenger details</h2>
        <form onSubmit={onSubmit}>
          <label htmlFor="offer">Offer ID (from Search results)</label>
          <input id="offer" className="mono" value={offerId} onChange={(e) => setOfferId(e.target.value)} placeholder="off_0000…" required />
          {forms.map((f, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
              <h2 style={{ fontSize: 18 }}>Passenger {i + 1}</h2>
              <div className="row">
                <div>
                  <label htmlFor={`gn-${i}`}>Given name</label>
                  <input id={`gn-${i}`} value={f.givenName} onChange={(e) => setField(i, "givenName", e.target.value)} required />
                </div>
                <div>
                  <label htmlFor={`fn-${i}`}>Family name</label>
                  <input id={`fn-${i}`} value={f.familyName} onChange={(e) => setField(i, "familyName", e.target.value)} required />
                </div>
              </div>
              <div className="row">
                <div>
                  <label htmlFor={`dob-${i}`}>Date of birth</label>
                  <input id={`dob-${i}`} type="date" value={f.bornOn} onChange={(e) => setField(i, "bornOn", e.target.value)} required />
                </div>
                <div>
                  <label htmlFor={`phone-${i}`}>Phone</label>
                  <input id={`phone-${i}`} value={f.phone} onChange={(e) => setField(i, "phone", e.target.value)} placeholder="+91…" required />
                </div>
              </div>
              <label htmlFor={`email-${i}`}>Email</label>
              <input id={`email-${i}`} type="email" value={f.email} onChange={(e) => setField(i, "email", e.target.value)} required />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost" style={{ marginTop: 16 }} onClick={() => setForms((p) => (p.length < 9 ? [...p, { ...EMPTY }] : p))}>
              Add passenger
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Confirm details"}
            </button>
          </div>
        </form>
        {error !== "" && <div className="error">{error}</div>}
        {result !== "" && <div className="notice" style={{ borderStyle: "solid" }}>{result}</div>}
      </section>
    </>
  );
}
