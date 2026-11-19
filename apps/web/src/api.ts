export const API_KEY = "tp_test_demo_key"; // the seeded demo merchant
export const OPS_KEY = "tp_ops_demo_key"; // the seeded ops reviewer (demo only: real apps need a login)

export async function api<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string; key?: string } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.key ?? API_KEY}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export interface Payment {
  id: string;
  amountCents: number;
  status: "pending" | "review" | "declined" | "captured" | "refunded" | "failed";
  feeCents: number | null;
  cardFingerprint: string;
  billingCountry: string;
  ipCountry: string;
  riskScore: number;
  createdAt: string;
}

export interface LedgerTx {
  id: string;
  type: string;
  paymentId: string | null;
  createdAt: string;
  entries: { id: string; accountId: string; amountCents: number }[];
}
export interface LedgerResponse {
  transactions: LedgerTx[];
  balanced: boolean;
}

export function accountLabel(accountId: string) {
  if (accountId === "platform:receivable") return "Processor receivable";
  if (accountId === "platform:fees") return "Platform fees";
  if (accountId === "platform:payouts") return "Payouts in transit";
  if (accountId.endsWith(":balance")) return "Merchant balance";
  return accountId;
}

export interface ReviewPayment extends Payment {
  riskFlags: { rule: string; points: number; reason: string }[];
}
export interface AuditEntry {
  id: string;
  action: string;
  paymentId: string;
  fromStatus: string;
  toStatus: string;
  createdAt: string;
  opsUser: { name: string };
}
