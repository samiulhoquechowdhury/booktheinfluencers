import { env } from "../config/env";

// xAI's Responses API (docs.x.ai). A tool call comes back as an output item; its result goes back in the next
// request, linked by previous_response_id.

export type GrokTool = { type: "function"; name: string; description: string; parameters: Record<string, unknown> };
export type GrokInput =
  | { role: "system" | "user" | "assistant"; content: string }
  | { type: "function_call_output"; call_id: string; output: string };
type GrokOutput =
  | { type: "function_call"; name: string; arguments: string; call_id: string }
  | { type: "message"; content?: { type: string; text?: string }[] }
  | { type: string };
export type GrokResponse = { id: string; output: GrokOutput[] };

export type GrokFailure = "key" | "credit" | "model" | "busy" | "down";

export class GrokError extends Error {
  constructor(readonly reason: GrokFailure) {
    super(`Grok request failed: ${reason}`);
  }
}

const TIMEOUT_MS = 30_000;

function failureOf(status: number, detail: string): GrokFailure {
  if (status === 429) return "busy";
  if (status === 401 || /api[ -]?key/i.test(detail)) return "key";
  if (status === 404 || /model/i.test(detail)) return "model";
  if (status === 402 || status === 403) return "credit";
  return "down";
}

export async function respond(key: string, body: { model: string; input: GrokInput[]; tools?: GrokTool[]; tool_choice?: "required"; previous_response_id?: string }) {
  let res: Response;
  try {
    res = await fetch(`${env.XAI_BASE_URL}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GrokError("down");
  }
  if (!res.ok) throw new GrokError(failureOf(res.status, await res.text().catch(() => "")));
  return (await res.json()) as GrokResponse;
}

export const toolCalls = (response: GrokResponse) =>
  response.output.filter((item): item is Extract<GrokOutput, { type: "function_call" }> => item.type === "function_call");

export const messageText = (response: GrokResponse) =>
  response.output
    .flatMap((item) => ("content" in item ? (item.content ?? []) : []))
    .map((part) => part.text ?? "")
    .join("")
    .trim();
