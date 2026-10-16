import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xplorers Flights — search flights, book with confidence",
  description:
    "Student-built flight search and booking demo. Test mode for practice, live mode ready when keys are added.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="loader" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="44" height="44">
            <rect width="64" height="64" rx="14" fill="#1D4ED8" />
            <path d="M14 16 L50 48" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
            <path d="M50 16 L14 48" stroke="#9DBCFF" strokeWidth="5" strokeLinecap="round" />
            <circle cx="50" cy="16" r="4" fill="#fff" />
          </svg>
          <span>Xplorers Flights</span>
        </div>
        <div className="wrap">
          <header className="topbar">
            <Link className="brand" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Xplorers logo" width={32} height={32} />
              <b>Xplorers Flights</b>
            </Link>
            <nav className="nav">
              <Link href="/">Search</Link>
              <Link href="/copilot">Copilot</Link>
              <Link href="/tracker">Tracker</Link>
              <Link href="/passengers">Passengers</Link>
              <Link href="/bookings">Bookings</Link>
              <Link href="/login">Sign in</Link>
              <span className="pill">
                <span className="dot" />
                Sandbox
              </span>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <div>Team: The Xplorers — B.E. Computer Science, First Year.</div>
            <nav>
              <Link href="/">Search</Link>
              <Link href="/login">Sign in</Link>
              <a href="/api/status">System status</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
