import { describe, expect, it } from "vitest";
import { canTransition, evaluateRisk, sign, verifySignature } from "../src";

describe("risk", () => {
  it("approves a normal payment", () => {
    expect(evaluateRisk({ amountCents: 2500, billingCountry: "US", ipCountry: "US" }, { recentSameCardCount: 0 }).decision).toBe("approve");
  });
  it("reviews a large payment from a mismatched country", () => {
    expect(evaluateRisk({ amountCents: 89900, billingCountry: "US", ipCountry: "NG" }, { recentSameCardCount: 0 }).decision).toBe("review");
  });
  it("declines when several rules fire", () => {
    const r = evaluateRisk({ amountCents: 120000, billingCountry: "US", ipCountry: "NG" }, { recentSameCardCount: 2 });
    expect(r.decision).toBe("decline");
    expect(r.flags).toHaveLength(3);
  });
});

describe("payment state machine", () => {
  it("allows the happy path and blocks shortcuts", () => {
    expect(canTransition("pending", "captured")).toBe(true);
    expect(canTransition("captured", "refunded")).toBe(true);
    expect(canTransition("pending", "refunded")).toBe(false);
    expect(canTransition("refunded", "captured")).toBe(false);
  });
});

describe("webhook signatures", () => {
  it("accepts a valid signature and rejects tampering", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const sig = sign("secret", body);
    expect(verifySignature("secret", body, sig)).toBe(true);
    expect(verifySignature("secret", body + " ", sig)).toBe(false);
    expect(verifySignature("other", body, sig)).toBe(false);
    expect(verifySignature("secret", body, "short")).toBe(false);
  });
});
