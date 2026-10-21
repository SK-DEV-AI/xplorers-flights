import { NextResponse } from "next/server";
import { askModel, composeAnswer, type ChatMessage } from "@/lib/copilot/agent";
import { runTool, describeToolResult } from "@/lib/copilot/tools";

/**
 * POST /api/agent { message } — the conversational agent.
 *
 * A real harness loop, not a parser:
 *
 *   1. The model reads the message WITH the full tool list and decides:
 *      call a tool, or just talk.
 *   2. If it calls a tool, WE run it server-side with our secret key and
 *      feed the facts back into the conversation.
 *   3. The model then decides again — it can chain another tool, or answer
 *      the user in its own words.
 *   4. After MAX_ROUNDS we write the final answer from what we gathered.
 *
 * The model NEVER holds a key and never calls an API itself. It only ever
 * chooses which tool to run and with what arguments.
 */

const MAX_ROUNDS = 4;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ reply: "Tell me where you'd like to fly, or ask me anything about a flight.", ok: true });
    }

    const history: ChatMessage[] = [{ role: "user", content: message }];
    const steps: string[] = [];
    const facts: string[] = [];
    const data: Record<string, unknown> = {};
    let intent = "chat";
    let lastSummary = "";

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const decision = await askModel(history);

      // No tool call: the model answered in plain language. That IS the answer.
      if (!decision.toolCall) {
        const text = decision.text?.trim();
        if (text) {
          return NextResponse.json({ reply: text, ok: true, steps, intent, data });
        }
        break;
      }

      const { name, args } = decision.toolCall;
      intent = name;
      steps.push(`Calling ${name}…`);

      const result = await runTool(name, args);
      lastSummary = result.summary;
      steps.push(result.summary);

      if (!result.ok) {
        return NextResponse.json({ reply: result.message, ok: true, steps, intent, data });
      }

      // Keep every payload so the UI can render cards from every tool used.
      Object.assign(data, result.data);

      const toolFacts = describeToolResult(name, result.data);
      facts.push(toolFacts);

      // Hand the facts back to the model and let it decide what happens next.
      history.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: `call_${round}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
      });
      history.push({ role: "tool", tool_call_id: `call_${round}`, name, content: toolFacts });
    }

    // The model kept reaching for tools (or ran out of rounds). Write the
    // answer ourselves from everything we gathered.
    const narration = await composeAnswer(message, facts.join("\n\n"));
    const reply = narration || lastSummary || "I looked that up but could not turn it into a clean answer. Try asking a bit differently.";

    return NextResponse.json({ reply, ok: true, steps, intent, data });
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
