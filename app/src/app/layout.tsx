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
        {/* Opening: a plane flies across and the site is revealed under
            it. Pure CSS, no JS, and it never blocks interaction. */}
        {/* A slow, soft light behind the page. Pure CSS, transform-only, so
            it costs no repaints and never blocks a click. */}
        <div className="aurora" aria-hidden="true">
          <span className="aurora-blob aurora-1" />
          <span className="aurora-blob aurora-2" />
          <span className="aurora-blob aurora-3" />
          <span className="aurora-grid" />
        </div>

        <div className="flyby" aria-hidden="true">
          <div className="flyby-veil" />
          <div className="flyby-plane">
            <span className="flyby-trail" />
            <svg viewBox="0 0 64 64" width="120" height="120" className="flyby-icon">
              <path
                d="M56 20 L38 34 L14 44 L20 32 L8 26 L20 24 L28 12 L32 24 L48 16 Z"
                fill="#1D4ED8"
              />
              <path
                d="M56 20 L38 34 L14 44 L20 32 L8 26 L20 24 L28 12 L32 24 L48 16 Z"
                fill="none"
                stroke="#93C5FD"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
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
              <Link href="/radar">Radar</Link>
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
