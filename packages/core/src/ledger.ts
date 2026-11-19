/**
 * Double-entry rules. Debits are positive, credits are negative, and every
 * transaction's entries must sum to exactly zero. Money is integer cents.
 */
export interface EntryInput {
  accountId: string;
  amountCents: number;
}

export const PLATFORM = {
  receivable: "platform:receivable",
  fees: "platform:fees",
  payouts: "platform:payouts",
} as const;

export const merchantBalanceId = (merchantId: string) => `merchant:${merchantId}:balance`;

export function assertBalanced(entries: EntryInput[]): void {
  if (entries.length < 2) throw new Error("A transaction needs at least two entries");
  if (entries.some((e) => !Number.isInteger(e.amountCents) || e.amountCents === 0)) {
    throw new Error("Entries must be non-zero integer cents");
  }
  const sum = entries.reduce((total, e) => total + e.amountCents, 0);
  if (sum !== 0) throw new Error(`Unbalanced transaction: entries sum to ${sum}`);
}

/** 2.9% + 30 cents, rounded to the nearest cent. */
export const computeFee = (amountCents: number) => Math.round(amountCents * 0.029) + 30;

export function buildCaptureEntries(merchantId: string, amountCents: number, feeCents: number): EntryInput[] {
  if (feeCents >= amountCents) throw new Error("Fee must be smaller than the payment amount");
  return [
    { accountId: PLATFORM.receivable, amountCents },
    { accountId: merchantBalanceId(merchantId), amountCents: -(amountCents - feeCents) },
    { accountId: PLATFORM.fees, amountCents: -feeCents },
  ];
}

/** A refund or correction never edits history. It posts the exact opposite entries. */
export const buildReversal = (entries: EntryInput[]): EntryInput[] =>
  entries.map((e) => ({ accountId: e.accountId, amountCents: -e.amountCents }));
