import { z } from "zod";

export const QUEUES = { webhooks: "webhooks", reconcile: "reconcile" } as const;
export const SIGNATURE_HEADER = "x-tidepool-signature";

export const webhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["charge.succeeded", "charge.failed", "charge.refunded"]),
  data: z.object({
    chargeId: z.string(),
    paymentId: z.string(),
    amountCents: z.number().int().optional(),
  }),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
