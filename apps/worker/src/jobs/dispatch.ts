import type { PrismaClient } from "@repo/db";
import type { Channel } from "../channels";

export const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;

/** 1, 2, 4, 8 … minutes between retries. */
export const backoffMs = (attempt: number) => 60_000 * 2 ** Math.max(0, attempt - 1);

/**
 * Sends due notifications. Each one is claimed by pushing its sendAfter out (a lease), so two
 * workers running at once never send the same message; a crash mid-send simply retries later.
 */
export async function dispatchNotifications(db: PrismaClient, channel: Channel, now = new Date(), batch = 50) {
  const due = await db.notification.findMany({
    where: { status: "PENDING", sendAfter: { lte: now } },
    orderBy: { sendAfter: "asc" },
    take: batch,
  });
  let sent = 0;
  let failed = 0;

  for (const n of due) {
    const claimed = await db.notification.updateMany({
      where: { id: n.id, status: "PENDING", sendAfter: n.sendAfter },
      data: { sendAfter: new Date(now.getTime() + LEASE_MS) },
    });
    if (claimed.count === 0) continue; // another worker has it

    try {
      await channel.send(n);
      await db.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      sent++;
    } catch (error) {
      const attempts = n.attempts + 1;
      await db.notification.update({
        where: { id: n.id },
        data: {
          attempts,
          lastError: error instanceof Error ? error.message.slice(0, 500) : String(error),
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          sendAfter: new Date(now.getTime() + backoffMs(attempts)),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}
