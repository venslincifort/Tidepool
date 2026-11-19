import { describe, expect, it } from "vitest";
import { assertBalanced, buildCaptureEntries, buildReversal, computeFee } from "../src";

describe("ledger", () => {
  it("computes a 2.9% + 30c fee", () => {
    expect(computeFee(10000)).toBe(320);
  });

  it("builds balanced capture entries", () => {
    const entries = buildCaptureEntries("m1", 10000, computeFee(10000));
    expect(() => assertBalanced(entries)).not.toThrow();
    expect(entries.reduce((s, e) => s + e.amountCents, 0)).toBe(0);
  });

  it("rejects unbalanced entries", () => {
    expect(() => assertBalanced([{ accountId: "a", amountCents: 100 }, { accountId: "b", amountCents: -90 }])).toThrow();
  });

  it("rejects floats and zero entries", () => {
    expect(() => assertBalanced([{ accountId: "a", amountCents: 10.5 }, { accountId: "b", amountCents: -10.5 }])).toThrow();
    expect(() => assertBalanced([{ accountId: "a", amountCents: 0 }, { accountId: "b", amountCents: 0 }])).toThrow();
  });

  it("reversal cancels the original exactly", () => {
    const original = buildCaptureEntries("m1", 5000, computeFee(5000));
    const net = new Map<string, number>();
    for (const e of [...original, ...buildReversal(original)]) net.set(e.accountId, (net.get(e.accountId) ?? 0) + e.amountCents);
    expect([...net.values()].every((v) => v === 0)).toBe(true);
  });

  it("refuses a fee larger than the payment", () => {
    expect(() => buildCaptureEntries("m1", 20, 30)).toThrow();
  });
});
