import { PrismaClient, Prisma } from "@prisma/client";
import { assertBalanced, EntryInput, merchantBalanceId, PLATFORM } from "@tidepool/core";

export const prisma = new PrismaClient();
export { Prisma };
export type Tx = Prisma.TransactionClient;

/** Creates the platform accounts and the merchant's balance account if they do not exist yet. */
export async function ensureAccounts(tx: Tx, merchantId: string) {
  const accounts = [
    { id: PLATFORM.receivable, kind: "receivable", merchantId: null },
    { id: PLATFORM.fees, kind: "fees", merchantId: null },
    { id: PLATFORM.payouts, kind: "payouts", merchantId: null },
    { id: merchantBalanceId(merchantId), kind: "merchant_balance", merchantId },
  ];
  for (const a of accounts) await tx.account.upsert({ where: { id: a.id }, create: a, update: {} });
}

/**
 * Posts a balanced transaction exactly once. Call it inside prisma.$transaction so all
 * entries land together or not at all. Posting the same idempotency key again is a no-op.
 */
export async function postTransaction(
  tx: Tx,
  input: { type: string; idempotencyKey: string; paymentId?: string; entries: EntryInput[] },
): Promise<{ posted: boolean; id: string }> {
  assertBalanced(input.entries);
  const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { posted: false, id: existing.id };

  const created = await tx.ledgerTransaction.create({
    data: {
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      paymentId: input.paymentId,
      entries: { create: input.entries.map((e) => ({ accountId: e.accountId, amountCents: e.amountCents })) },
    },
  });
  return { posted: true, id: created.id };
}

/** Balance is always derived from entries, never stored. */
export async function accountSum(client: Tx | PrismaClient, accountId: string): Promise<number> {
  const result = await client.ledgerEntry.aggregate({ where: { accountId }, _sum: { amountCents: true } });
  return result._sum.amountCents ?? 0;
}
