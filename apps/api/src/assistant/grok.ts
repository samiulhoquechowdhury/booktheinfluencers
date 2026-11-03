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

export type GrokFailure = "key" | "credit" | "model" | "tools" | "busy" | "down";

export class GrokError extends Error {
  constructor(readonly reason: GrokFailure) {
    super(`Grok request failed: ${reason}`);
  }
}

const TIMEOUT_MS = 30_000;

/** xAI's messages differ by status, so the words matter more than the code: "no credits" can come back as a 403 that also mentions the key. */
function failureOf(status: number, detail: string): GrokFailure {
  if (status === 429 && !/credit|spending|limit reached/i.test(detail)) return "busy";
  if (/credit|billing|spending|payment|licen[cs]e/i.test(detail) || status === 402) return "credit";
  if (status === 401 || /api[ -]?key/i.test(detail)) return "key";
  if (status === 404 || /model/i.test(detail)) return "model";
  if (status === 403) return "credit";
  return "down";
}

/** `deadline` (a Date.now() time) caps the whole answer, so a slow model can't outlast the website's request. */
export async function respond(key: string, body: { model: string; input: GrokInput[]; tools?: GrokTool[]; tool_choice?: "required"; previous_response_id?: string }, deadline = Date.now() + TIMEOUT_MS) {
  const left = Math.min(TIMEOUT_MS, deadline - Date.now());
  if (left < 1000) throw new GrokError("down");
  let res: Response;
  try {
    res = await fetch(`${env.XAI_BASE_URL}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(left),
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
