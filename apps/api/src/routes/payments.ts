import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { accountSum, Prisma, prisma } from "@tidepool/db";
import { evaluateRisk, merchantBalanceId } from "@tidepool/core";
import { config } from "../config";
import { requireMerchant } from "../auth";

const router = Router();
router.use(requireMerchant);

const createSchema = z.object({
  amountCents: z.number().int().min(50).max(100_000_000),
  cardFingerprint: z.string().min(4).max(64),
  billingCountry: z.string().length(2),
  ipCountry: z.string().length(2),
  /** Tells the fake processor how to behave, so you can test failure modes. */
  scenario: z.enum(["success", "fail", "duplicate", "delayed"]).default("success"),
});

router.post("/", async (req, res) => {
  const merchantId = req.merchantId!;
  const key = req.header("idempotency-key");
  if (!key) return res.status(400).json({ error: "Idempotency-Key header is required." });

  const body = createSchema.parse(req.body);
  const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");

  const previous = await prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId, key } } });
  if (previous) {
    if (previous.requestHash !== requestHash) {
      return res.status(422).json({ error: "This Idempotency-Key was already used with a different request." });
    }
    return res.status(previous.status).json(previous.response);
  }

  const recentSameCardCount = await prisma.payment.count({
    where: { merchantId, cardFingerprint: body.cardFingerprint, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  const risk = evaluateRisk(body, { recentSameCardCount });
  const status = risk.decision === "decline" ? "declined" : risk.decision === "review" ? "review" : "pending";

  let payment = await prisma.payment.create({
    data: {
      merchantId,
      amountCents: body.amountCents,
      cardFingerprint: body.cardFingerprint,
      billingCountry: body.billingCountry,
      ipCountry: body.ipCountry,
      status,
      riskScore: risk.score,
      riskFlags: risk.flags as unknown as Prisma.InputJsonValue,
    },
  });

  if (status === "pending") {
    try {
      const response = await fetch(`${config.processorUrl}/charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id,
          amountCents: payment.amountCents,
          webhookUrl: config.webhookUrl,
          scenario: body.scenario,
        }),
      });
      if (!response.ok) throw new Error(`Processor responded ${response.status}`);
      const { id } = (await response.json()) as { id: string };
      payment = await prisma.payment.update({ where: { id: payment.id }, data: { processorRef: id } });
    } catch (err) {
      console.error("processor call failed", err);
      payment = await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    }
  }

  const output = JSON.parse(JSON.stringify(payment));
  await prisma.idempotencyKey.create({ data: { merchantId, key, requestHash, status: 201, response: output } });
  res.status(201).json(output);
});

router.get("/", async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { merchantId: req.merchantId! },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(payments);
});

router.get("/:id", async (req, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, merchantId: req.merchantId! } });
  if (!payment) return res.status(404).json({ error: "Payment not found." });
  const ledger = await prisma.ledgerTransaction.findMany({
    where: { paymentId: payment.id },
    include: { entries: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ ...payment, ledger });
});

router.post("/:id/refund", async (req, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, merchantId: req.merchantId! } });
  if (!payment) return res.status(404).json({ error: "Payment not found." });
  if (payment.status !== "captured" || !payment.processorRef) {
    return res.status(409).json({ error: "Only captured payments can be refunded." });
  }
  // The ledger changes when the processor confirms via webhook, not here.
  const response = await fetch(`${config.processorUrl}/refunds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chargeId: payment.processorRef }),
  });
  if (!response.ok) return res.status(502).json({ error: "The processor could not start the refund." });
  res.status(202).json({ status: "refund_requested" });
});

export const balanceRouter = Router();
balanceRouter.use(requireMerchant);
balanceRouter.get("/", async (req, res) => {
  const sum = await accountSum(prisma, merchantBalanceId(req.merchantId!));
  res.json({ availableCents: -sum, currency: "USD" });
});

export default router;
