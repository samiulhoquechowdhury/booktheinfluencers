import { DEFAULT_ASSISTANT_MODEL, OFF_TOPIC_REPLY, type AssistantChatInput, type AssistantReply, type AssistantSettings, type AssistantSettingsInput, type AssistantStatus, type AssistantTalent, type TalentSummary } from "@repo/schemas";
import { formatINRCompact, toIstDateKey } from "@repo/utils";
import { CATEGORIES, CITIES, TALENTS } from "./catalogue/data";
import { searchTalents, toSummary } from "./catalogue/query";
import type { StaffUser } from "./internal";
import { ApiError, calendarFor, isBlocked, nowIso, readableDate } from "./server";
import { audit } from "./staff";
import type { MockDb } from "./types";

// The website assistant in demo mode. No Grok here: a browser must never hold the key, so only its last characters
// are kept, and simple matching stands in for the model. Mirrors the rules in apps/api/src/assistant.

const SHOWN = 4;
const ON_TOPIC = /\b(hi|hello|hey|namaste|book|booking|talent|artist|singer|band|dj|comedian|anchor|event|wedding|party|sangeet|corporate|free|available|availability|date|fee|price|cost|budget|quote|suggest|recommend|find|how)\b/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function requireAdmin(actor: StaffUser) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Your role can't do that");
}

export const assistantStatus = (db: MockDb): AssistantStatus => ({ available: db.assistant?.enabled ?? true });

export function assistantSettings(db: MockDb, actor: StaffUser): AssistantSettings {
  requireAdmin(actor);
  const saved = db.assistant;
  return { configured: Boolean(saved), enabled: saved?.enabled ?? false, keyHint: saved?.keyHint ?? null, model: saved?.model ?? DEFAULT_ASSISTANT_MODEL, updatedAt: saved?.updatedAt ?? null, updatedByName: saved?.updatedByName ?? null };
}

export function saveAssistantSettings(db: MockDb, actor: StaffUser, input: AssistantSettingsInput) {
  requireAdmin(actor);
  const key = input.apiKey || null;
  if (key && key.length < 20) throw new ApiError("KEY_INVALID", "That doesn't look like an API key.");
  if (!key && !db.assistant) throw new ApiError("KEY_REQUIRED", "Enter your Grok API key.");
  db.assistant = { keyHint: key ? key.slice(-4) : db.assistant!.keyHint, model: input.model, enabled: input.enabled, updatedAt: nowIso(), updatedByName: actor.name };
  audit(db, actor, "assistant.settings", "AssistantConfig", "grok", "Updated the Grok assistant");
  return assistantSettings(db, actor);
}

export function testAssistant(db: MockDb, actor: StaffUser) {
  requireAdmin(actor);
  if (!db.assistant) throw new ApiError("KEY_REQUIRED", "Save a Grok API key first.");
  return { ok: true };
}

export function removeAssistantKey(db: MockDb, actor: StaffUser) {
  requireAdmin(actor);
  if (db.assistant) audit(db, actor, "assistant.keyRemoved", "AssistantConfig", "grok", "Removed the Grok API key");
  db.assistant = null;
  return { ok: true };
}

/** "2026-11-03", "3 nov", "3rd november 2026" or "nov 3": the next time that date comes round. */
export function dateIn(text: string, today: string) {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (iso) return iso;
  const months = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
  const found = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${months}(?:\\s+(\\d{4}))?`).exec(text) ?? new RegExp(`\\b${months}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`).exec(text);
  if (!found) return null;
  const [day, month] = /\d/.test(found[1]!) ? [found[1]!, found[2]!] : [found[2]!, found[1]!];
  const build = (year: string | number) => `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (found[3]) return build(found[3]);
  const thisYear = Number(today.slice(0, 4));
  return build(thisYear) >= today ? build(thisYear) : build(thisYear + 1);
}

const fee = (t: TalentSummary) => {
  const [min, max] = [t.feeBandMinPaise, t.feeBandMaxPaise];
  return min && max ? `${formatINRCompact(BigInt(min))} – ${formatINRCompact(BigInt(max))}` : "Fee on request";
};

const card = (t: TalentSummary, status: AssistantTalent["status"] = null): AssistantTalent => ({ slug: t.slug, name: t.stageName, headline: t.headline, city: t.baseCity, photo: t.photo, fee: fee(t), status });

const statusOn = (db: MockDb, slug: string, date: string): NonNullable<AssistantTalent["status"]> => {
  if (!isBlocked(db, slug, date)) return "free";
  return calendarFor(db, slug).entries.find((e) => e.date === date)?.source === "booking" ? "booked" : "unavailable";
};

export function assistantChat(db: MockDb, input: AssistantChatInput): AssistantReply {
  if (!assistantStatus(db).available) throw new ApiError("ASSISTANT_UNAVAILABLE", "The assistant can't answer right now. Please try again, or browse talent directly.");
  const text = input.messages.at(-1)!.content.toLowerCase();
  const today = toIstDateKey(new Date());
  const date = dateIn(text, today);
  const everyone = TALENTS.map(toSummary);
  const named = everyone.find((t) => text.includes(t.stageName.toLowerCase()) || text.split(/\W+/).includes(t.stageName.toLowerCase().split(" ")[0]!));
  const category = CATEGORIES.find((c) => text.includes(c.name.toLowerCase()) || text.includes(c.slug.replace(/s$/, "")));
  const city = CITIES.find((c) => text.includes(c.name.toLowerCase()));
  const reply = (words: string, talents: AssistantTalent[] = []): AssistantReply => ({ reply: words, talents, date, declined: false });

  if (!named && !category && !city && !date && !ON_TOPIC.test(text)) return { reply: OFF_TOPIC_REPLY, talents: [], date: null, declined: true };
  if (date && date < today) return reply("That date has passed. Which date is your event?");

  if (named && date) {
    const status = statusOn(db, named.slug, date);
    if (status === "free") return reply(`Good news: ${named.stageName} is free on ${readableDate(date)}. Send a brief and our team will confirm it with them.`, [card(named, "free")]);
    const others = everyone.filter((t) => t.slug !== named.slug && t.categories.some((c) => named.categories.includes(c)) && !isBlocked(db, t.slug, date)).slice(0, SHOWN - 1);
    return reply(`${named.stageName} is ${status === "booked" ? "already booked" : "not available"} on ${readableDate(date)}.${others.length ? " These similar artists are free that day." : ""}`, [card(named, status), ...others.map((t) => card(t, "free"))]);
  }
  if (named) return reply(`Tell me your date and I'll check whether ${named.stageName} is free.`, [card(named)]);
  if (category || city || date) {
    const found = searchTalents({ category: category?.slug, city: city?.name }).data.filter((t) => !date || !isBlocked(db, t.slug, date)).slice(0, SHOWN);
    return reply(found.length ? `Here are some artists${date ? ` free on ${readableDate(date)}` : ""}.` : "Nobody matches that yet. Try another city or category.", found.map((t) => card(t, date ? "free" : null)));
  }
  return reply("I can find artists for your event and check who's free on your date. What are you planning?");
}
