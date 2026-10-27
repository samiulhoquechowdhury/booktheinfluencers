import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createPrismaClient, reconcilePayments } from "@repo/db";
import { consoleChannel } from "./channels";
import { loadEnv } from "./env";
import { dispatchNotifications } from "./jobs/dispatch";
import { expireQuotes, markOverdueMilestones, pruneLoginEvents, sendEventReminders, sendFollowUpReminders } from "./jobs/schedules";

// BullMQ job schedulers on Redis drive the jobs; each job is a plain function over the database.

const env = loadEnv();
const db = createPrismaClient(env.DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const channel = consoleChannel;

const QUEUE = "maintenance";
type Schedule = { every: number } | { pattern: string; tz: string };
const JOBS: Record<string, { schedule: Schedule; run: () => Promise<unknown> }> = {
  "dispatch-notifications": { schedule: { every: 15_000 }, run: () => dispatchNotifications(db, channel) },
  "expire-quotes": { schedule: { every: 5 * 60_000 }, run: () => expireQuotes(db) },
  "overdue-milestones": { schedule: { every: 60 * 60_000 }, run: () => markOverdueMilestones(db) },
  "event-reminders": { schedule: { every: 60 * 60_000 }, run: () => sendEventReminders(db) },
  "prune-login-events": { schedule: { every: 24 * 60 * 60_000 }, run: () => pruneLoginEvents(db) },
  "follow-up-reminders": { schedule: { every: 5 * 60_000 }, run: () => sendFollowUpReminders(db) },
  // Nightly, when payments are quiet: 2:30 am India time.
  "reconcile-payments": { schedule: { pattern: "30 2 * * *", tz: "Asia/Kolkata" }, run: () => summary(reconcilePayments(db, { trigger: "schedule" })) },
};

/** The run's findings are saved in the database; the log only needs the counts. */
const summary = async (run: ReturnType<typeof reconcilePayments>) => {
  const { errorCount, warnCount } = await run;
  return { errorCount, warnCount };
};

async function main() {
  const queue = new Queue(QUEUE, { connection });
  // Upserting keeps one schedule per job however many workers start.
  for (const [name, job] of Object.entries(JOBS)) {
    await queue.upsertJobScheduler(name, job.schedule, { name, opts: { removeOnComplete: 100, removeOnFail: 500 } });
  }

  const worker = new Worker(
    QUEUE,
    async (job) => {
      const result = await JOBS[job.name]?.run();
      return result ?? null;
    },
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) => {
    if (result && Object.values(result).some((v) => typeof v === "number" && v > 0)) console.info(`[worker] ${job.name}`, result);
  });
  worker.on("failed", (job, error) => console.error(`[worker] ${job?.name} failed: ${error.message}`));
  console.info(`[worker] running ${Object.keys(JOBS).join(", ")}`);

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
