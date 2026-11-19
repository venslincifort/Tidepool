# Tidepool

A small Merchant-of-Record-style payments platform: a double-entry ledger, a payments API with
idempotency, signed webhooks processed by a queue worker, and a merchant dashboard.
Everything runs in test mode against a fake processor.


## How a payment flows
1. `POST /v1/payments` (Idempotency-Key required) runs the risk rules, stores a `pending` payment, and calls the processor.
2. The processor later sends a signed webhook to `POST /webhooks/processor`.
3. The API verifies the signature, stores the raw event, enqueues it, and returns 200 immediately.
4. The worker applies the event in one DB transaction: updates the payment and posts balanced ledger entries.
5. Duplicates and out-of-order events are safe: ledger posts are keyed, and early refunds retry with backoff.

## Run it
```bash
cp .env.example .env
docker compose up -d db redis
npm install
npm run db:generate && npm run db:push && npm run db:seed
npm run dev          # api :4000, processor :4100, worker, web :5173
npm test             # core unit tests
```
Or run the backend in Docker: `docker compose up --build`, then `npm run dev -w @tidepool/web`.

## Try it
```bash
curl -s localhost:4000/v1/payments \
  -H "Authorization: Bearer tp_test_demo_key" \
  -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d '{"amountCents":2500,"cardFingerprint":"4242","billingCountry":"US","ipCountry":"US"}'
```
In the dashboard, pick **duplicate webhook** and confirm the balance only changes once. Pick **delayed**
and watch the payment move from pending to captured. A $899 payment with billing US and IP NG lands in `review`.

## Built so far vs next
- Ledger, payments API, idempotency, signed webhooks, queue worker, reconciliation job, dashboard
-  Auth for dashboard users, ops role, and a review queue that approves or declines held payments
-  Disputes with evidence upload


## Known simplifications
- Packages run from TypeScript source with `tsx`; add a build step before production.
- Merchant auth is a single seeded API key. Replace with hashed keys and real user login.
- Two concurrent workers posting the same ledger key can collide on the unique index; the job then fails and retries, which resolves it.
- Webhook signatures have no timestamp, so replay protection relies on event-id dedupe.

- Btw this isn't the final version
