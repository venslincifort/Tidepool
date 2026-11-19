import { randomUUID } from "node:crypto";
import express from "express";
import { sign, SIGNATURE_HEADER } from "@tidepool/core";

/**
 * A stand-in for Stripe or another processor. It accepts charges and later sends signed
 * webhooks, and it can misbehave on purpose: fail, send duplicates, or deliver late.
 */
const secret = process.env.WEBHOOK_SECRET ?? "whsec_local_dev_secret";
const port = Number(process.env.PROCESSOR_PORT ?? 4100);

interface Charge {
  id: string;
  paymentId: string;
  amountCents: number;
  webhookUrl: string;
  status: "pending" | "succeeded" | "failed" | "refunded";
}
const charges = new Map<string, Charge>();

async function deliver(charge: Charge, type: string, delayMs: number, times = 1) {
  const event = { id: `evt_${randomUUID()}`, type, data: { chargeId: charge.id, paymentId: charge.paymentId, amountCents: charge.amountCents } };
  const body = JSON.stringify(event);
  setTimeout(async () => {
    for (let i = 0; i < times; i++) {
      try {
        await fetch(charge.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: sign(secret, body) }, body });
      } catch (err) {
        console.error("webhook delivery failed", err);
      }
    }
  }, delayMs);
}

const app = express();
app.use(express.json());

app.post("/charges", (req, res) => {
  const { paymentId, amountCents, webhookUrl, scenario = "success" } = req.body;
  const charge: Charge = { id: `ch_${randomUUID().slice(0, 8)}`, paymentId, amountCents, webhookUrl, status: "pending" };
  charges.set(charge.id, charge);

  if (scenario === "fail") {
    charge.status = "failed";
    deliver(charge, "charge.failed", 500);
  } else {
    charge.status = "succeeded";
    deliver(charge, "charge.succeeded", scenario === "delayed" ? 8000 : 500, scenario === "duplicate" ? 2 : 1);
  }
  res.status(201).json({ id: charge.id });
});

app.post("/refunds", (req, res) => {
  const charge = charges.get(req.body.chargeId);
  if (!charge || charge.status !== "succeeded") return res.status(404).json({ error: "No refundable charge." });
  charge.status = "refunded";
  deliver(charge, "charge.refunded", 500);
  res.status(202).json({ ok: true });
});

app.get("/settlements", (_req, res) => {
  res.json([...charges.values()].map(({ id, paymentId, amountCents, status }) => ({ id, paymentId, amountCents, status })));
});

app.listen(port, () => console.log(`Fake processor listening on :${port}`));
