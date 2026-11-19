import { NextFunction, Request, Response } from "express";
import { prisma } from "@tidepool/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      merchantId?: string;
      opsUserId?: string;
    }
  }
}

const bearer = (req: Request) => req.header("authorization")?.replace(/^Bearer\s+/i, "");

export async function requireMerchant(req: Request, res: Response, next: NextFunction) {
  const key = bearer(req);
  const merchant = key ? await prisma.merchant.findUnique({ where: { apiKey: key } }) : null;
  if (!merchant) return res.status(401).json({ error: "Invalid API key." });
  req.merchantId = merchant.id;
  next();
}

/** Ops keys live in their own table, so a merchant key can never pass this check. */
export async function requireOps(req: Request, res: Response, next: NextFunction) {
  const key = bearer(req);
  const ops = key ? await prisma.opsUser.findUnique({ where: { apiKey: key } }) : null;
  if (!ops) return res.status(403).json({ error: "Ops access required." });
  req.opsUserId = ops.id;
  next();
}
