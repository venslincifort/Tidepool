import { Router } from "express";
import { prisma } from "@tidepool/db";
import { SIGNATURE_HEADER, verifySignature, webhookEventSchema } from "@tidepool/core";
import { config } from "../config";
import { webhookQueue } from "../queue";

const router = Router();

/**
 * Receives processor webhooks. This handler does as little as possible:
 * verify the signature, store the raw event, enqueue it, return 200.
 * All real work happens in the worker.
 */
router.post("/processor", async (req, res) => {
  const raw = req.body as Buffer;
  const signature = req.header(SIGNATURE_HEADER) ?? "";
  if (!Buffer.isBuffer(raw) || !verifySignature(config.webhookSecret, raw, signature)) {
    return res.status(400).json({ error: "Invalid signature." });
  }

  const event = webhookEventSchema.parse(JSON.parse(raw.toString("utf8")));

  // Duplicates are normal: the same event id is stored and queued once.
  await prisma.webhookEvent.upsert({
    where: { id: event.id },
    create: { id: event.id, type: event.type, payload: event },
    update: {},
  });
  await webhookQueue.add(
    "process",
    { eventId: event.id },
    { jobId: event.id, attempts: 8, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000 },
  );
  res.sendStatus(200);
});

export default router;
