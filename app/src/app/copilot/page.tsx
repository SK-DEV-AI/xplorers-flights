"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

/**
 * Agent transcript: the same tools the home chat uses, shown as an explicit
 * step-by-step audit trail. Its job is reviewability, not a second search UI —
 * so results are summarised, never duplicated as a competing offer list
 * (audit S1).
 */

interface Run {
  role: "user" | "tool" | "agent";
  text: string;
}

const EXAMPLES = ["SFO to Tokyo for 2 adults", "Weather in Tokyo", "Status of BA117", "1 USD to INR", "Local time in London"];

export default function CopilotPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<Run[]>([
    { role: "agent", text: "Run a request and every tool call will be listed here, in order." },
  ]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [runs, busy]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setRuns((prev) => [...prev, { role: "user", text: q }]);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed.");
      const steps: Run[] = (json.steps ?? []).map((s: string) => ({ role: "tool" as const, text: s }));
      const meta = `${json.intent} · ${json.via === "proxy" ? "parsed by the model" : "parsed locally"}`;
      setRuns((prev) => [
        ...prev,
        ...steps,
        { role: "tool", text: `— result (${meta}) —` },
        { role: "agent", text: json.reply ?? "I didn't catch that. Try naming two airports or a flight number." },
      ]);
    } catch (err) {
      setRuns((prev) => [...prev, { role: "agent", text: err instanceof Error ? err.message : "Request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero fade-up">
        <p className="muted mono">AUDIT TRAIL</p>
        <h1>Agent transcript</h1>
        <p>
          Every request the agent handles, with each tool call in order.{" "}
          <Link className="syn-link" href="/">Search with results on the home page →</Link>
        </p>
      </section>

      <section className="card fade-up">
        <div className="chat-log transcript-log">
          {runs.map((r, i) => (
            <div key={i} className={`bubble-row ${r.role === "tool" ? "tool" : r.role}`}>
              <div className={`bubble ${r.role === "tool" ? "tool" : r.role} bubble-in`}>
                {r.role === "tool" ? <span className="mono tool-tag">{r.text}</span> : <p>{r.text}</p>}
              </div>
            </div>
          ))}
          {busy && (
            <div className="bubble-row agent">
              <div className="bubble agent">
                <div className="typing" aria-label="Agent working"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form className="chat-input" onSubmit={send}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="SFO to Tokyo for 2 adults" aria-label="Request" />
          <button className="primary" type="submit" disabled={busy}>{busy ? "…" : "Run"}</button>
        </form>

        <div className="chip-row chat-chips">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="chip" onClick={() => setInput(x)}>{x}</button>
          ))}
        </div>
      </section>
    </>
  );
}
