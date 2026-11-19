export interface RiskInput {
  amountCents: number;
  billingCountry: string;
  ipCountry: string;
}
export interface RiskContext {
  recentSameCardCount: number; // payments on this card in the last 10 minutes
}
export interface RiskFlag {
  rule: string;
  points: number;
  reason: string;
}
export interface RiskResult {
  score: number;
  flags: RiskFlag[];
  decision: "approve" | "review" | "decline";
}

export const REVIEW_THRESHOLD = 30;
export const DECLINE_THRESHOLD = 70;
export const LARGE_AMOUNT_CENTS = 50_000;

export function evaluateRisk(input: RiskInput, ctx: RiskContext): RiskResult {
  const flags: RiskFlag[] = [];
  if (ctx.recentSameCardCount >= 2) {
    flags.push({ rule: "velocity", points: 40, reason: "Third payment on this card within 10 minutes" });
  }
  if (input.amountCents > LARGE_AMOUNT_CENTS) {
    flags.push({ rule: "large_amount", points: 35, reason: "Amount is above the review threshold" });
  }
  if (input.billingCountry !== input.ipCountry) {
    flags.push({ rule: "country_mismatch", points: 30, reason: `Billing ${input.billingCountry} but IP ${input.ipCountry}` });
  }
  const score = flags.reduce((total, f) => total + f.points, 0);
  const decision = score >= DECLINE_THRESHOLD ? "decline" : score >= REVIEW_THRESHOLD ? "review" : "approve";
  return { score, flags, decision };
}
