"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Demo sign-in only. Stores a display name locally so pages can greet
 * the user. Real authentication (Supabase Auth) plugs in here later
 * without changing the rest of the site.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@") || password.length < 4) {
      setError("Enter a valid email and a password of at least 4 characters.");
      return;
    }
    try {
      localStorage.setItem("xplorers-user", JSON.stringify({ email }));
    } catch {
      /* private mode — continue without persistence */
    }
    router.push("/");
  }

  return (
    <>
      <section className="hero">
        <h1>Sign in to Xplorers Flights</h1>
        <p>Demo sign-in for the college review. No real account is created.</p>
      </section>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <section className="card">
          <h2>What this demo does</h2>
          <p className="desc">Search real-structured flight data, inspect offers, and see exactly where booking plugs in.</p>
          <ul className="muted" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Search works in test mode with a free key.</li>
            <li>Live mode needs a production key (KYC + card on file).</li>
            <li>Booking stays off until explicitly enabled.</li>
          </ul>
          <div className="notice">Test data only — nothing here issues a real ticket.</div>
        </section>
        <section className="card">
          <h2>Sign in</h2>
          <p className="desc">Any email works for the demo.</p>
          <form onSubmit={onSubmit}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" required />
            <label htmlFor="password">Password</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="ghost" style={{ width: "auto", marginTop: 0 }} onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button className="primary" type="submit">
              Sign in
            </button>
          </form>
          {error !== "" && <div className="error">{error}</div>}
        </section>
      </div>
    </>
  );
}
