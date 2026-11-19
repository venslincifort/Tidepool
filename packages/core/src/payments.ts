export type PaymentStatus = "pending" | "review" | "declined" | "captured" | "refunded" | "failed";

const ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
  review: ["pending", "declined"],
  pending: ["captured", "failed"],
  captured: ["refunded"],
  declined: [],
  refunded: [],
  failed: [],
};

export const canTransition = (from: PaymentStatus, to: PaymentStatus) => ALLOWED[from].includes(to);
