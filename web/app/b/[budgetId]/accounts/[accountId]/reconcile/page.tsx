"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ReconcilePage({ params }: { params: { budgetId: string; accountId: string } }) {
  const { budgetId, accountId } = params;
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [current, setCurrent] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/${accountId}/balance`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Balance failed (${res.status})`);
      const data = await res.json();
      setCurrent(data.current_balance_cents);
    } catch (e: any) {
      setError(e.message || "Failed to load balance");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId, accountId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const cents = Math.round(parseFloat(statementBalance) * 100);
      if (!Number.isFinite(cents)) throw new Error("Enter a valid statement balance");
      const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/${accountId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement_date: dateStr, statement_balance_cents: cents, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error(`Reconcile failed (${res.status})`);
      setResult(await res.json());
      await load();
    } catch (e: any) {
      setError(e.message || "Reconcile failed");
    }
  };

  return (
    <main>
      <p>
        <Link href={`/b/${budgetId}/accounts/${accountId}`}>← Register</Link>
      </p>
      <h1>Reconcile</h1>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <p>Current balance: {current === null ? "…" : (current / 100).toFixed(2)}</p>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
        <label>
          <div>Statement date</div>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
        </label>
        <label>
          <div>Statement balance</div>
          <input value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} placeholder="1234.56" required />
        </label>
        <label>
          <div>Notes</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </label>
        <button type="submit">Reconcile</button>
      </form>
      {result ? (
        <div style={{ marginTop: 12 }}>
          <p>Diff: {(result.diff_cents / 100).toFixed(2)}</p>
          <p>Adjustment tx id: {result.adjustment_tx_id || "none"}</p>
        </div>
      ) : null}
    </main>
  );
}

