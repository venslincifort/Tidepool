import { Router } from "express";
import { prisma } from "@tidepool/db";
import { config } from "../config";
import { requireOps } from "../auth";

const router = Router();
router.use(requireOps);

/** Payments the risk rules held for a human, oldest first, across all merchants. */
router.get("/review", async (_req, res) => {
  res.json(await prisma.payment.findMany({ where: { status: "review" }, orderBy: { createdAt: "asc" }, take: 100 }));
});

router.get("/audit", async (_req, res) => {
  res.json(
    await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { opsUser: { select: { name: true } } },
    }),
  );
});

/**
 * Moves a payment out of "review" and records who did it, in one database transaction.
 * The WHERE status = 'review' check makes it safe if two reviewers click at once:
 * only one update matches, the other gets a 409.
 */
async function decide(paymentId: string, opsUserId: string, action: "approve" | "decline") {
  const toStatus = action === "approve" ? "pending" : "declined";
  return prisma.$transaction(async (tx) => {
    const result = await tx.payment.updateMany({ where: { id: paymentId, status: "review" }, data: { status: toStatus } });
    if (result.count === 0) return false;
    await tx.auditLog.create({ data: { opsUserId, action, paymentId, fromStatus: "review", toStatus } });
    return true;
  });
}

router.post("/payments/:id/decline", async (req, res) => {
  const moved = await decide(req.params.id, req.opsUserId!, "decline");
  if (!moved) return res.status(409).json({ error: "This payment is not waiting for review." });
  res.json(await prisma.payment.findUniqueOrThrow({ where: { id: req.params.id } }));
});

router.post("/payments/:id/approve", async (req, res) => {
  const moved = await decide(req.params.id, req.opsUserId!, "approve");
  if (!moved) return res.status(409).json({ error: "This payment is not waiting for review." });

  // Approved payments now take the normal path: processor charge, webhook, worker posts the ledger.
  let payment = await prisma.payment.findUniqueOrThrow({ where: { id: req.params.id } });
  try {
    const response = await fetch(`${config.processorUrl}/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: payment.id, amountCents: payment.amountCents, webhookUrl: config.webhookUrl, scenario: "success" }),
    });
    if (!response.ok) throw new Error(`Processor responded ${response.status}`);
    const { id } = (await response.json()) as { id: string };
    payment = await prisma.payment.update({ where: { id: payment.id }, data: { processorRef: id } });
  } catch (err) {
    console.error("processor call failed after approval", err);
    payment = await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  }
  res.json(payment);
});

export default router;
