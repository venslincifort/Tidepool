import { createHmac, timingSafeEqual } from "node:crypto";

export const sign = (secret: string, body: string | Buffer) =>
  createHmac("sha256", secret).update(body).digest("hex");

export function verifySignature(secret: string, body: string | Buffer, signature: string): boolean {
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
