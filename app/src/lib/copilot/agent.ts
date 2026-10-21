import { env } from "@/lib/env";

/**
 * The agent layer.
 *
 * big-pickle is a capable model — we were treating it like a regex. This
 * gives it the same freedom a normal harness gives a model:
 *
 *   1. We describe the tools in plain language (OpenAI-style function schema).
 *   2. The model replies with EITHER a tool call OR a natural-language answer.
 *   3. We run the tool it picked, server-side, with our secret keys.
 *   4. We feed the result back and the model writes the final reply.
 *
 * The model still never holds a key. It only chooses which tool to call.
 */

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentResult {
  reply: string;
  steps: string[];
  intent: string;
  slots: Record<string, unknown>;
  toolData?: Record<string, unknown>;
}

/** The tools the agent may call, described the way an OpenAI-style API does. */
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "search_flights",
    description: "Search real flight offers with prices. Use when the user wants to find or book a flight.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "3-letter IATA airport code, e.g. SFO" },
        destination: { type: "string", description: "3-letter IATA airport code, e.g. HND" },
        departure_date: { type: "string", description: "Date as YYYY-MM-DD" },
        passengers: { type: "integer", description: "How many adults" },
        cabin_class: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
      },
      required: ["origin", "destination", "departure_date", "passengers"],
    },
  },
  {
    name: "flight_status",
    description: "Live status of ONE flight: is it on time, delayed, gate and terminal. Use when a flight number is given.",
    parameters: {
      type: "object",
      properties: {
        flight_number: { type: "string", description: "Flight number with airline code, e.g. BA117" },
      },
      required: ["flight_number"],
    },
  },
  {
    name: "flight_schedule",
    description: "The schedule of one flight: departure and arrival times, distance, terminal.",
    parameters: {
      type: "object",
      properties: {
        flight_number: { type: "string", description: "3-letter IATA airline code + digits, e.g. BA117" },
        date: { type: "string", description: "Date as YYYY-MM-DD" },
      },
      required: ["flight_number"],
    },
  },
  {
    name: "drive_time_to_airport",
    description: "How long the drive to an airport takes, and the time to leave by. Use when someone is running late.",
    parameters: {
      type: "object",
      properties: {
        airport: { type: "string", description: "Airport code or name, e.g. DEL or Chennai airport" },
      },
      required: ["airport"],
    },
  },
  {
    name: "public_transit_to_airport",
    description: "Bus, metro or train route from a city to an airport, leg by leg with times.",
    parameters: {
      type: "object",
      properties: {
        airport: { type: "string", description: "Airport code or name, e.g. BLR or Heathrow" },
      },
      required: ["airport"],
    },
  },
  {
    name: "security_wait_time",
    description: "How long the security queue is at an airport. Covers 440 US airports.",
    parameters: {
      type: "object",
        properties: {
          airport: { type: "string", description: "Airport code, e.g. JFK" },
        },
      required: ["airport"],
    },
  },
  {
    name: "nearby_parking_and_transit",
    description: "Parking lots, bus/metro stops and taxi ranks near an airport or place.",
    parameters: {
      type: "object",
      properties: {
        airport: { type: "string", description: "Airport code or name" },
      },
      required: ["airport"],
    },
  },
  {
    name: "weather_at",
    description: "Current weather, wind and the day's high and low at a place or airport.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "City name or airport code, e.g. Tokyo or HND" },
      },
      required: ["place"],
    },
  },
    {
    name: "air_quality_at",
    description: "Air quality index and PM2.5 at a place or airport.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "City name or airport code" },
      },
      required: ["place"],
    },
  },
  {
    name: "sun_times_at",
    description: "Sunrise, sunset and daylight length at a place.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "City name or airport code" },
      },
      required: ["place"],
    },
  },
  {
    name: "recent_earthquakes",
    description: "Any earthquakes above magnitude 4.5 in the last day, anywhere in the world.",
    parameters: {
      type: "object",
      properties: {
        minimum_magnitude: { type: "string", description: "e.g. 4.5" },
      },
    },
  },
  {
    name: "exchange_rate",
    description: "The exchange rate between two currencies.",
    parameters: {
      type: "object",
      properties: {
        from_currency: { type: "string", description: "3-letter ISO code, e.g. USD" },
        to_currency: { type: " " + "string", description: "3-letter ISO code, e.g. INR" },
      },
      required: ["from_currency", "to_currency"],
    },
  },
  {
    name: "local_time_at",
    description: "The local time in a city or country.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "City, country or IANA timezone, e.g. London or Asia/Kolkata" },
      },
      required: ["place"],
    },
  },
  {
    name: "nearby_places",
    description: "Parking, transit stops and amenities near an airport or city.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "command" + "string", description: "City name or airport code" },
      },
      required: ["place"],
    },
  },
];

const SYSTEM = `You are the flight agent for Xplorers Flights, a site where people book flights.

You run tools. You do not have API keys, so you never call an API yourself — you choose a tool, and the site runs it for you.

How to work:
1. Read the user's message. If it needs live data, call ONE tool with the right arguments.
2. If the user is just chatting, asking what you can do, or asking a question you can answer from what you already know, reply in plain language. Do not call a tool for that.
3. If a message is too vague to act on, ask one short clarifying question in a friendly, conversational tone.
4. If a call is a bad fit, say so warmly and suggest what you can do instead.

Tone: warm, confident, brief. Like a knowledgeable travel assistant, not a form. Never robotic, never scold the user, never repeat the same sentence twice. Use the user's own words. If you are unsure, say "let me check" and call a tool.

Never invent flight numbers, prices, times or airport codes. If you need a fact you do not have, call a tool.`;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

function toolSchema() {
  return AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Call the model once, with tools, and see what it wants to do. */
export async function askModel(messages: ChatMessage[]): Promise<{
  toolCall?: { name: string; args: Record<string, unknown> };
  text?: string;
}> {
  const base = env.copilotBaseUrl;
  const model = env.copilotModel;
  const key = env.copilotApiKey;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      tools: toolSchema(),
      tool_choice: "auto",
      max_tokens: 600,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`model ${res.status}`);
  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const message = json.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (call) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }
    return { toolCall: { name: call.function.name, args } };
  }
  return { text: message?.content?.trim() || "" };
}

/** Ask the model to write the final answer from a tool result. */
export async function composeAnswer(
  userMessage: string,
  toolName: string,
  toolResult: unknown,
  toolSummary: string,
): Promise<string> {
  const base = env.copilotBaseUrl;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.copilotApiKey}` },
    body: JSON.stringify({
      model: env.copilotModel,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMessage },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_1", type: "function", function: { name: toolName, arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "call_1", name: toolName, content: toolSummary },
      ],
      max_tokens: 500,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return toolSummary;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  return json.choices?.[0]?.message?.content?.trim() || toolSummary;
}
