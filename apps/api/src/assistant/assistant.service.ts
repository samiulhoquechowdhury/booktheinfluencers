import { Inject, Injectable, Logger } from "@nestjs/common";
import { OFF_TOPIC_REPLY, type AssistantChatInput, type AssistantReply, type AssistantSettings, type AssistantSettingsInput, type AssistantStatus, DEFAULT_ASSISTANT_MODEL } from "@repo/schemas";
import { toIstDateKey } from "@repo/utils";
import type { AuthUser } from "../auth/guard";
import { DomainError } from "../common/errors";
import { iso } from "../common/validate";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { decrypt, encrypt } from "../talent/document-vault";
import { DECLINE_TOOL, REPLY_TOOL, runTool, systemPrompt, toolDefinitions, type ToolResult } from "./assistant.tools";
import { GrokError, messageText, respond, toolCalls, type GrokFailure, type GrokInput } from "./grok";

const IV = 12;
const TAG = 16;
const AAD = "assistant-grok-key";
const MAX_ROUNDS = 5;
const REPLY_MAX = 1200;

/** Every message spends money on the saved key, and the chat is open to anyone. */
const PER_VISITOR = { limit: 20, windowMs: 10 * 60_000 };
const SITE_WIDE = { limit: 600, windowMs: 60 * 60_000 };

const BUSY = () => new DomainError("ASSISTANT_BUSY", "You're sending messages quickly. Please wait a few minutes and try again.", 429);
const UNAVAILABLE = () => new DomainError("ASSISTANT_UNAVAILABLE", "The assistant can't answer right now. Please try again, or browse talent directly.", 503);

const WHY: Record<GrokFailure, string> = {
  key: "Grok rejected this API key. Check it and try again.",
  credit: "This key can't be used yet. Check that your xAI team has credits.",
  model: "Grok doesn't recognise that model. Check the name.",
  busy: "Grok is limiting requests on this key. Try again in a minute.",
  down: "Couldn't reach Grok. Check the connection and try again.",
};

const settingsKey = () => Buffer.from(env.SETTINGS_KEY, "base64");

function sealKey(key: string): Uint8Array<ArrayBuffer> {
  const { iv, tag, body } = encrypt(settingsKey(), Buffer.from(key), AAD);
  return new Uint8Array(Buffer.concat([iv, tag, body]));
}

function openKey(sealed: Uint8Array) {
  const blob = Buffer.from(sealed);
  return decrypt(settingsKey(), blob.subarray(0, IV), blob.subarray(IV, IV + TAG), blob.subarray(IV + TAG), AAD).toString();
}

/** The model is told not to send links, and a link in a chat bubble would look like ours. */
const cleanReply = (text: string) =>
  text
    .replace(/(https?:\/\/|www\.)\S+/gi, "")
    .trim()
    .slice(0, REPLY_MAX);

@Injectable()
export class AssistantService {
  private readonly logger = new Logger("Assistant");
  private readonly visitors = new Map<string, { count: number; resetAt: number }>();
  private siteWide = { count: 0, resetAt: 0 };

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private config() {
    return this.prisma.db.assistantConfig.findUnique({ where: { id: "grok" } });
  }

  async status(): Promise<AssistantStatus> {
    return { available: Boolean((await this.config())?.enabled) };
  }

  async settings(): Promise<AssistantSettings> {
    const row = await this.config();
    return {
      configured: Boolean(row),
      enabled: row?.enabled ?? false,
      keyHint: row?.keyHint ?? null,
      model: row?.model ?? DEFAULT_ASSISTANT_MODEL,
      updatedAt: iso(row?.updatedAt),
      updatedByName: row?.updatedByName ?? null,
    };
  }

  private async ping(key: string, model: string) {
    try {
      await respond(key, { model, input: [{ role: "user", content: "Reply with OK." }] });
    } catch (error) {
      if (error instanceof GrokError) throw new DomainError("GROK_REFUSED", WHY[error.reason], 422);
      throw error;
    }
  }

  private savedKey(row: { sealedKey: Uint8Array }) {
    try {
      return openKey(row.sealedKey);
    } catch {
      throw new DomainError("KEY_UNREADABLE", "The saved key can't be read, so please enter it again.", 422);
    }
  }

  private async audit(user: AuthUser, action: string, summary: string) {
    const actor = await this.prisma.db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const actorName = actor?.name ?? "Unknown";
    await this.prisma.db.auditLog.create({ data: { actorId: user.id, actorName, action, entity: "AssistantConfig", entityId: "grok", summary } });
    return actorName;
  }

  /** A key is only saved once Grok has accepted it, and it applies from the next message. */
  async save(user: AuthUser, input: AssistantSettingsInput): Promise<AssistantSettings> {
    const row = await this.config();
    const entered = input.apiKey || null;
    if (entered && entered.length < 20) throw new DomainError("KEY_INVALID", "That doesn't look like an API key.", 422);
    if (!entered && !row) throw new DomainError("KEY_REQUIRED", "Enter your Grok API key.", 422);
    const key = entered ?? this.savedKey(row!);
    if (entered || input.model !== row?.model) await this.ping(key, input.model);

    const changes = [entered && "a new key", input.model !== row?.model && `model ${input.model}`, input.enabled !== row?.enabled && (input.enabled ? "turned on" : "turned off")].filter(Boolean).join(", ");
    const updatedByName = await this.audit(user, "assistant.settings", `Updated the Grok assistant: ${changes || "no changes"}`);
    const data = { sealedKey: sealKey(key), keyHint: entered ? key.slice(-4) : row!.keyHint, model: input.model, enabled: input.enabled, updatedByName };
    await this.prisma.db.assistantConfig.upsert({ where: { id: "grok" }, create: data, update: data });
    return this.settings();
  }

  async test() {
    const row = await this.config();
    if (!row) throw new DomainError("KEY_REQUIRED", "Save a Grok API key first.", 422);
    await this.ping(this.savedKey(row), row.model);
    return { ok: true };
  }

  async remove(user: AuthUser) {
    if (!(await this.config())) return { ok: true };
    await this.audit(user, "assistant.keyRemoved", "Removed the Grok API key");
    await this.prisma.db.assistantConfig.delete({ where: { id: "grok" } });
    return { ok: true };
  }

  private admit(visitor: string) {
    const now = Date.now();
    if (now >= this.siteWide.resetAt) this.siteWide = { count: 0, resetAt: now + SITE_WIDE.windowMs };
    if (this.visitors.size > 20_000) this.visitors.clear();
    const mine = this.visitors.get(visitor);
    const entry = mine && now < mine.resetAt ? mine : { count: 0, resetAt: now + PER_VISITOR.windowMs };
    if (entry.count >= PER_VISITOR.limit || this.siteWide.count >= SITE_WIDE.limit) throw BUSY();
    entry.count += 1;
    this.siteWide.count += 1;
    this.visitors.set(visitor, entry);
  }

  /**
   * Grok has to call a tool every turn, and a turn only ends with reply_to_customer or decline_off_topic. So a question
   * that isn't about booking gets our fixed words, not whatever the model might write. Cards come from tool results.
   */
  async chat(input: AssistantChatInput, visitor: string): Promise<AssistantReply> {
    const row = await this.config();
    if (!row?.enabled) throw UNAVAILABLE();
    this.admit(visitor);
    let key: string;
    try {
      key = openKey(row.sealedKey);
    } catch {
      this.logger.error("The saved Grok key can't be decrypted");
      throw UNAVAILABLE();
    }

    const categories = await this.prisma.db.category.findMany({ select: { slug: true } });
    const tools = toolDefinitions(categories.map((c) => c.slug));
    let request: GrokInput[] = [{ role: "system", content: systemPrompt(toIstDateKey(new Date())) }, ...input.messages];
    let previous: string | undefined;
    let found: ToolResult | null = null;
    const finish = (reply: string, declined = false): AssistantReply => ({ reply, talents: declined ? [] : (found?.talents ?? []), date: declined ? null : (found?.date ?? null), declined });

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const response = await respond(key, { model: row.model, input: request, tools, tool_choice: "required", previous_response_id: previous });
        const calls = toolCalls(response);
        if (calls.some((c) => c.name === DECLINE_TOOL)) return finish(OFF_TOPIC_REPLY, true);
        const answer = calls.find((c) => c.name === REPLY_TOOL);
        if (answer) {
          const { text } = JSON.parse(answer.arguments) as { text?: unknown };
          const reply = typeof text === "string" ? cleanReply(text) : "";
          if (reply) return finish(reply);
        }
        // A model that ignores tool_choice can't be trusted to have stayed on topic.
        if (calls.length === 0) return finish(found ? cleanReply(messageText(response)) || "Here's what I found." : OFF_TOPIC_REPLY, !found);

        const results = await Promise.all(calls.map((c) => runTool(this.prisma, c.name, c.arguments).then((result) => ({ call: c, result }))));
        for (const { result } of results) if (result.talents) found = result;
        request = results.map(({ call, result }) => ({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result.forModel) }));
        previous = response.id;
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.warn(error instanceof GrokError ? `Grok failed: ${error.reason}` : `Assistant failed: ${String(error)}`);
      throw UNAVAILABLE();
    }
    if (found) return finish("Here's what I found.");
    throw UNAVAILABLE();
  }
}
