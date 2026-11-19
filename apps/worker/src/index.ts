import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@tidepool/db";
import { QUEUES } from "@tidepool/core";
import { handleWebhook } from "./handleWebhook";
import { reconcile } from "./reconcile";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const processorUrl = process.env.PROCESSOR_URL ?? "http://localhost:4100";

const webhooks = new Worker(QUEUES.webhooks, (job) => handleWebhook(job.data.eventId), { connection, concurrency: 5 });

webhooks.on("completed", (job) => console.log(JSON.stringify({ job: "webhook", id: job.id, result: "ok" })));
webhooks.on("failed", async (job, err) => {
  console.error(JSON.stringify({ job: "webhook", id: job?.id, attempt: job?.attemptsMade, error: err.message }));
  // After the final attempt, record the error so it shows up for a human (dead-letter behavior).
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await prisma.webhookEvent.update({ where: { id: job.data.eventId }, data: { error: err.message } }).catch(() => undefined);
  }
});

const reconcileQueue = new Queue(QUEUES.reconcile, { connection });
await reconcileQueue.add("nightly", {}, { repeat: { pattern: "0 2 * * *" }, removeOnComplete: 10 });
new Worker(QUEUES.reconcile, () => reconcile(processorUrl), { connection });

console.log("Worker running");
