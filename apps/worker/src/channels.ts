import type { Notification } from "@repo/db";

/** Adapter boundary (rules.md §3): SMS/WhatsApp/email vendors plug in here. */
export interface Channel {
  send(notification: Pick<Notification, "id" | "channel" | "to" | "subject" | "body">): Promise<void>;
}

/** Development stand-in: prints what would be sent. Refused in production (env.ts). */
export const consoleChannel: Channel = {
  async send(n) {
    // Mask most of the recipient so logs don't carry full phone numbers or emails (rules.md §3).
    const to = n.to.includes("@") ? n.to.replace(/^(.).*(@.*)$/, "$1***$2") : n.to.replace(/^(\d{2})\d+(\d{2})$/, "$1******$2");
    console.info(`[notify:${n.channel.toLowerCase()}] → ${to}${n.subject ? ` | ${n.subject}` : ""} | ${n.body}`);
  },
};
