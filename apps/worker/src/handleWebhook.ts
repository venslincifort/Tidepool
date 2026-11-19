import { ensureAccounts, postTransaction, prisma } from "@tidepool/db";
import { buildCaptureEntries, buildReversal, canTransition, computeFee, PaymentStatus, webhookEventSchema } from "@tidepool/core";

/**
 * Applies one webhook event. Safe to run more than once for the same event:
 * the ledger post is idempotent and the status checks skip work already done.
 * Throwing makes BullMQ retry with backoff, which handles out-of-order delivery.
 */
export async function handleWebhook(eventId: string) {
  const stored = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (stored.processedAt) return;
  const event = webhookEventSchema.parse(stored.payload);

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: event.data.paymentId } });
    if (!payment) throw new Error(`Payment ${event.data.paymentId} not found yet`);
    const status = payment.status as PaymentStatus;

    if (event.type === "charge.succeeded") {
      if (status !== "captured") {
        if (!canTransition(status, "captured")) throw new Error(`Cannot capture a ${status} payment`);
        const feeCents = computeFee(payment.amountCents);
        await ensureAccounts(tx, payment.merchantId);
        await postTransaction(tx, {
          type: "capture",
          idempotencyKey: `capture:${payment.id}`,
          paymentId: payment.id,
          entries: buildCaptureEntries(payment.merchantId, payment.amountCents, feeCents),
        });
        await tx.payment.update({ where: { id: payment.id }, data: { status: "captured", feeCents } });
      }
    } else if (event.type === "charge.failed") {
      if (status === "pending") await tx.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    } else if (event.type === "charge.refunded") {
      if (status !== "refunded") {
        // A refund that arrives before its capture is retried until the capture lands.
        if (!canTransition(status, "refunded")) throw new Error(`Refund arrived while payment is ${status}; will retry`);
        const capture = await tx.ledgerTransaction.findUniqueOrThrow({
          where: { idempotencyKey: `capture:${payment.id}` },
          include: { entries: true },
        });
        await postTransaction(tx, {
          type: "refund",
          idempotencyKey: `refund:${payment.id}`,
          paymentId: payment.id,
          entries: buildReversal(capture.entries),
        });
        await tx.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
      }
    }

    await tx.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), error: null } });
  });
}
