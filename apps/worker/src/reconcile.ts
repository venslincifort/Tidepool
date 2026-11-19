import { prisma } from "@tidepool/db";

interface Settlement {
  id: string;
  paymentId: string;
  amountCents: number;
  status: "succeeded" | "failed" | "refunded";
}

/** Compares the processor's records with our payments and reports any mismatch. */
export async function reconcile(processorUrl: string) {
  const response = await fetch(`${processorUrl}/settlements`);
  const settlements = (await response.json()) as Settlement[];
  const mismatches: string[] = [];

  for (const s of settlements) {
    const payment = await prisma.payment.findUnique({ where: { id: s.paymentId } });
    if (!payment) {
      mismatches.push(`${s.id}: processor has a charge we have no payment for`);
      continue;
    }
    if (payment.amountCents !== s.amountCents) mismatches.push(`${payment.id}: amount differs (ours ${payment.amountCents}, theirs ${s.amountCents})`);
    const expected = s.status === "succeeded" ? "captured" : s.status;
    if (payment.status !== expected && !(s.status === "succeeded" && payment.status === "refunded")) {
      mismatches.push(`${payment.id}: status differs (ours ${payment.status}, processor ${s.status})`);
    }
  }
  console.log(JSON.stringify({ job: "reconcile", checked: settlements.length, mismatches }));
  return mismatches;
}
