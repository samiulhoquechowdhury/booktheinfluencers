import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createPrismaClient } from "@repo/db";
import { consoleChannel } from "./channels";
import { loadEnv } from "./env";
import { dispatchNotifications } from "./jobs/dispatch";
import { expireQuotes, markOverdueMilestones, pruneLoginEvents, sendEventReminders } from "./jobs/schedules";

// BullMQ job schedulers on Redis drive the jobs; each job is a plain function over the database.

const env = loadEnv();
const db = createPrismaClient(env.DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const channel = consoleChannel;

const QUEUE = "maintenance";
const JOBS = {
  "dispatch-notifications": { every: 15_000, run: () => dispatchNotifications(db, channel) },
  "expire-quotes": { every: 5 * 60_000, run: () => expireQuotes(db) },
  "overdue-milestones": { every: 60 * 60_000, run: () => markOverdueMilestones(db) },
  "event-reminders": { every: 60 * 60_000, run: () => sendEventReminders(db) },
  "prune-login-events": { every: 24 * 60 * 60_000, run: () => pruneLoginEvents(db) },
} as const;
type JobName = keyof typeof JOBS;

async function main() {
  const queue = new Queue(QUEUE, { connection });
  // Upserting keeps one schedule per job however many workers start.
  for (const [name, job] of Object.entries(JOBS)) {
    await queue.upsertJobScheduler(name, { every: job.every }, { name, opts: { removeOnComplete: 100, removeOnFail: 500 } });
  }

  const worker = new Worker(
    QUEUE,
    async (job) => {
      const result = await JOBS[job.name as JobName]?.run();
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
