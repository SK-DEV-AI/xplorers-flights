import { NextResponse } from "next/server";
import { askModel, composeAnswer } from "@/lib/copilot/agent";
import { runTool, describeToolResult } from "@/lib/copilot/tools";

/**
 * POST /api/agent { message } — the conversational agent.
 *
 * The model gets the full tool list and decides what to do, exactly like a
 * normal harness. It can:
 *   - call one tool, and we run it server-side with our keys, then feed the
 *     result back so the model writes the final answer, or
 *   - just answer in plain language (for "what can you do?", "hi", a
 *     question about flying, or a clarification).
 *
 * The model NEVER holds a key and never calls an API itself.
 */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string; history?: Array<{ role: string; text: string }> };
    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ reply: "Tell me where you'd like to fly, or ask me anything about a flight.", ok: true });
    }

    const decision = await askModel([{ role: "user", content: message }]);

    // No tool call: the model answered conversationally. That is a valid,
    // useful answer — not an error.
    if (!decision.toolCall) {
      const text = decision.text?.trim();
      return NextResponse.json({
        reply:
          text ||
          "I'm here — ask me to find a flight, check a flight's status, or answer a travel question.",
        ok: true,
        steps: [],
        intent: "chat",
      });
    }

    const { name, args } = decision.toolCall;
    const steps = [`Calling ${name}…`];
    const result = await runTool(name, args);
    if (!result.ok) {
      return NextResponse.json({
        reply: result.message,
        ok: true,
        steps,
        intent: name,
      });
    }
    steps.push(result.summary);
    const reply = await composeAnswer(message, name, result.data, describeToolResult(name, result.data));
    return NextResponse.json({
      reply,
      ok: true,
      steps,
      intent: name,
      data: result.data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        reply:
          err instanceof Error
            ? `Something went wrong on my side (${err.message}). Try rephrasing, or ask me something else.`
            : "Something went wrong on my side. Try again in a moment.",
        ok: false,
        steps: [],
        intent: "error",
      },
      { status: 200 },
    );
  }
}
