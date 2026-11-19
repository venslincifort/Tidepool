import { Router } from "express";
import { prisma } from "@tidepool/db";
import { requireMerchant } from "../auth";

const router = Router();
router.use(requireMerchant);

/** Recent ledger transactions for this merchant's payments, newest first. */
router.get("/", async (req, res) => {
  const payments = await prisma.payment.findMany({ where: { merchantId: req.merchantId! }, select: { id: true } });
  const transactions = await prisma.ledgerTransaction.findMany({
    where: { paymentId: { in: payments.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { entries: true },
  });
  const sum = transactions.flatMap((t) => t.entries).reduce((total, e) => total + e.amountCents, 0);
  res.json({ transactions, balanced: sum === 0 });
});

export default router;