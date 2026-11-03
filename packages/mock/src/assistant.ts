import { ASKS_HOW, DEFAULT_ASSISTANT_MODEL, HOW_BOOKING_WORKS, OFF_TOPIC_REPLY, ON_TOPIC, WANTS_BOOKING, dateIn, eventTypeIn, type AssistantChatInput, type AssistantReply, type AssistantSettings, type AssistantSettingsInput, type AssistantStatus, type AssistantTalent, type TalentSummary } from "@repo/schemas";
import { formatINRCompact, toIstDateKey } from "@repo/utils";
import { CATEGORIES, CITIES, TALENTS } from "./catalogue/data";
import { searchTalents, toSummary } from "./catalogue/query";
import type { StaffUser } from "./internal";
import { ApiError, calendarFor, isBlocked, nowIso, readableDate } from "./server";
import { audit } from "./staff";
import type { MockDb } from "./types";

// The website assistant in demo mode. No Grok here: a browser must never hold the key, so only its last characters
// are kept, and simple matching stands in for the model. Mirrors apps/api/src/assistant/assistant.basic.ts.

export { dateIn };

const SHOWN = 4;

function requireAdmin(actor: StaffUser) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Your role can't do that");
}

export const assistantStatus = (db: MockDb): AssistantStatus => ({ ai: db.assistant?.enabled ?? false });

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
  const text = input.messages.at(-1)!.content.toLowerCase();
  const today = toIstDateKey(new Date());
  const date = dateIn(text, today);
  const everyone = TALENTS.map(toSummary);
  const named = everyone.find((t) => text.includes(t.stageName.toLowerCase()) || text.split(/\W+/).includes(t.stageName.toLowerCase().split(" ")[0]!));
  const category = CATEGORIES.find((c) => text.includes(c.name.toLowerCase()) || text.includes(c.slug.replace(/s$/, "")));
  const city = CITIES.find((c) => text.includes(c.name.toLowerCase()));
  const eventType = eventTypeIn(text);
  const wantsBooking = WANTS_BOOKING.test(text) && !ASKS_HOW.test(text);
  const reply = (words: string, talents: AssistantTalent[] = []): AssistantReply => {
    if (!wantsBooking) return { reply: words, talents, date, declined: false, booking: null };
    const picked = talents.filter((t) => t.slug === named?.slug && t.status !== "booked" && t.status !== "unavailable");
    const booking = { talentSlugs: picked.map((t) => t.slug), date, city: city?.name ?? null, eventType, budgetBand: null };
    return { reply: `${words} I've started a brief below: check it and send it to our team.`, talents, date, declined: false, booking };
  };

  if (!named && !category && !city && !date && !eventType && !ON_TOPIC.test(text)) return { reply: OFF_TOPIC_REPLY, talents: [], date: null, declined: true, booking: null };
  if (date && date < today) return { reply: "That date has passed. Which date is your event?", talents: [], date: null, declined: false, booking: null };
  if (ASKS_HOW.test(text) && !named) return reply(HOW_BOOKING_WORKS);

  if (named && date) {
    const status = statusOn(db, named.slug, date);
    if (status === "free") return reply(`Good news: ${named.stageName} is free on ${readableDate(date)}. Send a brief and our team will confirm it with them.`, [card(named, "free")]);
    const others = everyone.filter((t) => t.slug !== named.slug && t.categories.some((c) => named.categories.includes(c)) && !isBlocked(db, t.slug, date)).slice(0, SHOWN - 1);
    return reply(`${named.stageName} is ${status === "booked" ? "already booked" : "not available"} on ${readableDate(date)}.${others.length ? " These similar artists are free that day." : ""}`, [card(named, status), ...others.map((t) => card(t, "free"))]);
  }
  if (named) return reply(`Tell me your date and I'll check whether ${named.stageName} is free.`, [card(named)]);
  if (category || city || date || eventType) {
    const found = searchTalents({ category: category?.slug, city: city?.name }).data.filter((t) => !date || !isBlocked(db, t.slug, date)).slice(0, SHOWN);
    const which = [category?.name.toLowerCase() ?? "artists", city && `for events in ${city.name}`, date && `free on ${readableDate(date)}`].filter(Boolean).join(" ");
    return reply(found.length ? `Here are some ${which}. Tap Add to put them in your brief.` : `I couldn't find ${which}. Try another city or category.`, found.map((t) => card(t, date ? "free" : null)));
  }
  if (wantsBooking) return reply("Happy to help you book.");
  return reply("I can find artists for your event, check who's free on your date and start your booking. What are you planning?");
}
