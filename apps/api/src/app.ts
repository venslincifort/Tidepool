import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import paymentRoutes, { balanceRouter } from "./routes/payments";
import webhookRoutes from "./routes/webhooks";
import ledgerRoutes from "./routes/ledger";
import opsRoutes from "./routes/ops";

export function createApp() {
  const app = express();
  app.use(cors());

  // The webhook route needs the raw body to verify the signature, so it comes before express.json().
  app.use("/webhooks", express.raw({ type: "*/*", limit: "1mb" }), webhookRoutes);

  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/v1/payments", paymentRoutes);
  app.use("/v1/balance", balanceRouter);
  app.use("/v1/ledger", ledgerRoutes);
  app.use("/v1/ops", opsRoutes);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side." });
  });
  return app;
}
