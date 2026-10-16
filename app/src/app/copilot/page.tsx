"use client";

import { useState } from "react";

/**
 * Copilot page. Ports the Stitch "Interactive AI Copilot" screen: a chat
 * thread that narrates each step (slot check, tool call, results) so a
 * reviewer can see what the agent would do. Calls the real /api/search
 * underneath — no mock results.
 */

interface Msg {
  role: "user" | "agent" | "tool";
  text: string;
}

const CHECKS = [
  { label: "Origin / destination", detail: "SFO → HND" },
  { label: "Depart window", detail: "2026-11-14" },
  { label: "Passengers", detail: "2 adults" },
  { label: "Cabin", detail: "Economy" },
];

export default function CopilotPage() {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<Msg[]>([
    { role: "agent", text: "Tell me the trip in plain words — for example: non-stop SFO to Tokyo for 2 adults." },
  ]);
  const [busy, setBusy] = useState(false);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const next: Msg[] = [...log, { role: "user" as const, text: q }];
    next.push({ role: "tool", text: "Asking big-pickle proxy to parse slots…" });
    setLog(next);
    try {
      // AI bar backend: big-pickle extracts slots, OUR code runs the tools.
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      const trail: Msg[] = [...next];
      for (const s of json.steps ?? []) trail.push({ role: "tool" as const, text: s });
      const n = (json.offers ?? []).length + (json.flights ?? []).length;
      const extra =
        json.intent === "status" && (json.flights ?? []).length > 0
          ? ` ${json.flights[0].flightNo}: ${json.flights[0].status}, ${json.flights[0].departure} → ${json.flights[0].arrival}.`
          : json.intent === "search" && (json.offers ?? []).length > 0
            ? ` Top pick ${json.offers[0].airline} ${json.offers[0].flightNo} at ${json.offers[0].price} ${json.offers[0].currency}.`
            : "";
      trail.push({ role: "agent" as const, text: `${json.reply ?? `Done (${n} result${n === 1 ? "" : "s"}).`}${extra}` });
      setLog(trail);
    } catch (err) {
      setLog([...next, { role: "agent", text: err instanceof Error ? err.message : "Search failed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="muted mono">AGENT TRANSCRIPT · EVERY STEP SHOWN</p>
        <h1>Flight copilot</h1>
        <p>Each step is narrated: checks, the search call, and the result. Nothing happens silently.</p>
      </section>
      <div className="grid">
        <section className="card">
          <h2>Checks before searching</h2>
          <p className="desc">The agent validates these slots before calling search.</p>
          {CHECKS.map((c) => (
            <div key={c.label} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div className="route" style={{ fontSize: 15 }}>{c.label}</div>
              <div className="meta">{c.detail} · valid</div>
            </div>
          ))}
          <div className="notice">Test mode — fares and availability are simulated practice data.</div>
        </section>
        <section className="card">
          <h2>Conversation</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {log.map((m, i) => (
              <div
                key={i}
                className={m.role === "tool" ? "mono" : undefined}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "var(--ink)" : "var(--card)",
                  color: m.role === "user" ? "#fff" : "var(--ink)",
                  border: m.role === "user" ? 0 : "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  maxWidth: "90%",
                  fontSize: 14,
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
          <form onSubmit={onSend} style={{ display: "flex", gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe the trip…" aria-label="Trip description" />
            <button className="primary" style={{ width: "auto", marginTop: 0 }} type="submit" disabled={busy}>
              {busy ? "…" : "Send"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
