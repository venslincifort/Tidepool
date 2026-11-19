import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountLabel, api, AuditEntry, LedgerResponse, money, OPS_KEY, Payment, ReviewPayment } from "./api";

export default function App() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["balance"] });
    qc.invalidateQueries({ queryKey: ["ledger"] });
  };

  // Polling keeps the table current while webhooks arrive in the background.
  const payments = useQuery({ queryKey: ["payments"], queryFn: () => api<Payment[]>("/v1/payments"), refetchInterval: 2000 });
  const balance = useQuery({ queryKey: ["balance"], queryFn: () => api<{ availableCents: number }>("/v1/balance"), refetchInterval: 2000 });

  const ledger = useQuery({ queryKey: ["ledger"], queryFn: () => api<LedgerResponse>("/v1/ledger"), refetchInterval: 2000 });

  const [opsView, setOpsView] = useState(false);
  const review = useQuery({ queryKey: ["review"], queryFn: () => api<ReviewPayment[]>("/v1/ops/review", { key: OPS_KEY }), enabled: opsView, refetchInterval: 2000 });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api<AuditEntry[]>("/v1/ops/audit", { key: OPS_KEY }), enabled: opsView, refetchInterval: 2000 });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "decline" }) =>
      api(`/v1/ops/payments/${id}/${action}`, { method: "POST", key: OPS_KEY }),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ["review"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const [form, setForm] = useState({ amount: "25.00", card: "4242", billing: "US", ip: "US", scenario: "success" });
  const create = useMutation({
    mutationFn: () =>
      api("/v1/payments", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: {
          amountCents: Math.round(parseFloat(form.amount) * 100),
          cardFingerprint: form.card,
          billingCountry: form.billing,
          ipCountry: form.ip,
          scenario: form.scenario,
        },
      }),
    onSuccess: refresh,
  });
  const refund = useMutation({
    mutationFn: (id: string) => api(`/v1/payments/${id}/refund`, { method: "POST" }),
    onSuccess: refresh,
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Tidepool</h1>
          <label className="toggle"><input type="checkbox" checked={opsView} onChange={(e) => setOpsView(e.target.checked)} /> Ops view</label>
        </div>
        <div className="balance">
          <small>Available balance</small>
          <strong>{money(balance.data?.availableCents ?? 0)}</strong>
        </div>
      </header>

      <form onSubmit={submit} className="panel">
        <h2>New test payment</h2>
        <div className="row">
          <label>Amount<input value={form.amount} onChange={set("amount")} inputMode="decimal" /></label>
          <label>Card<input value={form.card} onChange={set("card")} /></label>
          <label>Billing<input value={form.billing} onChange={set("billing")} maxLength={2} /></label>
          <label>IP country<input value={form.ip} onChange={set("ip")} maxLength={2} /></label>
          <label>
            Processor behavior
            <select value={form.scenario} onChange={set("scenario")}>
              <option value="success">success</option>
              <option value="fail">fail</option>
              <option value="duplicate">duplicate webhook</option>
              <option value="delayed">delayed webhook</option>
            </select>
          </label>
          <button disabled={create.isPending}>Create payment</button>
        </div>
        {create.error && <p className="error">{create.error.message}</p>}
      </form>

      {opsView && (
        <>
          <h2>Review queue</h2>
          {review.data?.length === 0 && <p className="note">Nothing waiting for review. Create an $899 payment with billing US and IP NG to fill the queue.</p>}
          {review.data?.map((p) => (
            <div className="panel review" key={p.id}>
              <div className="row spread">
                <b>{p.id.slice(-8)} · {money(p.amountCents)} · risk {p.riskScore}</b>
                <span className="row">
                  <button disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, action: "approve" })}>Approve</button>
                  <button className="quiet" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, action: "decline" })}>Decline</button>
                </span>
              </div>
              {p.riskFlags.map((f) => (
                <div className="flag" key={f.rule}><b>{f.rule}</b> (+{f.points}) · {f.reason}</div>
              ))}
            </div>
          ))}
          {decide.error && <p className="error">{decide.error.message}</p>}

          <h2>Audit log</h2>
          <div className="panel">
            {audit.data?.length === 0 && <span className="note">No decisions yet. Every approval and decline is recorded here.</span>}
            {audit.data?.map((a) => (
              <div className="note" key={a.id}>
                {new Date(a.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {a.opsUser.name} {a.action}d {a.paymentId.slice(-8)} ({a.fromStatus} → {a.toStatus})
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Payments</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>ID</th><th>Card</th><th>Countries</th><th>Risk</th><th className="r">Amount</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {payments.data?.map((p) => (
              <tr key={p.id}>
                <td>{p.id.slice(-8)}</td>
                <td>…{p.cardFingerprint.slice(-4)}</td>
                <td>{p.billingCountry} / {p.ipCountry}</td>
                <td>{p.riskScore}</td>
                <td className="r">{money(p.amountCents)}</td>
                <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                <td>{p.status === "captured" && <button className="quiet" onClick={() => refund.mutate(p.id)}>Refund</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Ledger</h2>
      <p className="note">
        <b className={ledger.data?.balanced === false ? "credit" : "debit"}>
          {ledger.data?.balanced === false ? "Out of balance" : "Balanced"}
        </b>{" "}
        · every transaction's debits and credits sum to $0.00. Entries are never edited; refunds add reversing entries.
      </p>
      {ledger.data?.transactions.length === 0 && <p className="note">No ledger entries yet. They appear when a payment is captured.</p>}
      {ledger.data?.transactions.map((t) => (
        <div className="tx" key={t.id}>
          <div className="tx-head">
            <span>{t.type} · {t.paymentId?.slice(-8)}</span>
            <span className="note">{new Date(t.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </div>
          {t.entries.map((e) => (
            <div className="tx-line" key={e.id}>
              <span>{accountLabel(e.accountId)}</span>
              <span className={e.amountCents > 0 ? "debit" : "credit"}>
                {e.amountCents > 0 ? "debit" : "credit"} {money(Math.abs(e.amountCents))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
