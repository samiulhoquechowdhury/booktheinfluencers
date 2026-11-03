import { ASKS_HOW, HOW_BOOKING_WORKS, OFF_TOPIC_REPLY, ON_TOPIC, WANTS_BOOKING, dateIn, eventTypeIn, type AssistantChatInput, type AssistantReply, type AssistantTalent } from "@repo/schemas";
import { formatDate, toIstDateKey } from "@repo/utils";
import { LISTED } from "../catalogue/listed";
import type { PrismaService } from "../prisma/prisma.service";
import { runTool } from "./assistant.tools";

// The assistant without Grok: no key saved, Grok switched off or failing, or over our spending limits. Simple matching
// picks the artist, date, city and category out of the message, and Grok's own lookups answer it.

const readable = (date: string) => formatDate(`${date}T12:00:00+05:30`);
const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? ""));

type Facts = { problem?: string; status?: AssistantTalent["status"]; nextFreeDates?: string[] };

export async function basicChat(prisma: PrismaService, input: AssistantChatInput): Promise<AssistantReply> {
  const text = input.messages.at(-1)!.content.toLowerCase();
  const today = toIstDateKey(new Date());
  const date = dateIn(text, today);
  const [artists, categories, cities] = await Promise.all([
    prisma.db.talent.findMany({ where: LISTED, select: { stageName: true } }),
    prisma.db.category.findMany({ select: { slug: true, name: true } }),
    prisma.db.talent.findMany({ where: LISTED, select: { baseCity: true }, distinct: ["baseCity"] }),
  ]);
  const words = text.split(/\W+/);
  const named = artists.find((t) => text.includes(t.stageName.toLowerCase())) ?? artists.find((t) => words.includes(t.stageName.toLowerCase().split(" ")[0]!));
  const category = categories.find((c) => text.includes(c.name.toLowerCase()) || words.includes(c.slug.replace(/s$/, "")));
  const city = cities.find((c) => text.includes(c.baseCity.toLowerCase()))?.baseCity ?? null;
  const eventType = eventTypeIn(text);
  const wantsBooking = WANTS_BOOKING.test(text) && !ASKS_HOW.test(text);

  if (!named && !category && !city && !date && !eventType && !ON_TOPIC.test(text)) return { reply: OFF_TOPIC_REPLY, talents: [], date: null, declined: true, booking: null };

  /** A customer who asked to book also gets a brief to finish, with the artist in it if they're free. */
  const answer = (reply: string, talents: AssistantTalent[] = [], on: string | null = date): AssistantReply => {
    if (!wantsBooking) return { reply, talents, date: on, declined: false, booking: null };
    const picked = talents.filter((t) => t.name === named?.stageName && t.status !== "booked" && t.status !== "unavailable");
    const booking = { talentSlugs: picked.map((t) => t.slug), date: on, city, eventType, budgetBand: null };
    return { reply: `${reply} I've started a brief below: check it and send it to our team.`, talents, date: on, declined: false, booking };
  };
  const lookup = async (name: string, args: Record<string, unknown>) => {
    const result = await runTool(prisma, name, JSON.stringify(args));
    return { talents: result.talents ?? [], facts: result.forModel as Facts };
  };

  if (date && date < today) return answer("That date has passed. Which date is your event?", [], null);
  if (ASKS_HOW.test(text) && !named) return answer(HOW_BOOKING_WORKS);

  if (named && date) {
    const { talents, facts } = await lookup("check_availability", { artist: named.stageName, date });
    if (facts.problem) return answer("I can only check dates up to three years ahead. Which date is your event?", [], null);
    if (facts.status === "free") return answer(`Good news: ${named.stageName} is free on ${readable(date)}. Send a brief and our team will confirm it with them.`, talents);
    const next = (facts.nextFreeDates ?? []).slice(0, 3).map(readable);
    const others = talents.length > 1 ? " These similar artists are free that day." : "";
    return answer(`${named.stageName} is ${facts.status === "booked" ? "already booked" : "not available"} on ${readable(date)}.${next.length ? ` They're free on ${list(next)}.` : ""}${others}`, talents);
  }
  if (named) {
    const { talents, facts } = await lookup("list_free_dates", { artist: named.stageName });
    const next = (facts.nextFreeDates ?? []).slice(0, 4).map(readable);
    return answer(next.length ? `${named.stageName} is free on ${list(next)}. Tell me your date and I'll check it.` : `Tell me your date and I'll check whether ${named.stageName} is free.`, talents);
  }
  if (category || city || date || eventType) {
    const { talents } = await lookup("search_talents", { category: category?.slug, city: city ?? undefined, date: date ?? undefined });
    const which = [category?.name.toLowerCase() ?? "artists", city && `for events in ${city}`, date && `free on ${readable(date)}`].filter(Boolean).join(" ");
    if (!talents.length) return answer(`I couldn't find ${which}. Try another city or category.`);
    return answer(`Here are some ${which}. Tap Add to put them in your brief.`, talents);
  }
  if (wantsBooking) return answer("Happy to help you book.");
  return answer("I can find artists for your event, check who's free on your date and start your booking. What are you planning?");
}
