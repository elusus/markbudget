"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Account = { id: string; name: string; type: string; on_budget: boolean };

export default function AccountsPage({ params }: { params: { budgetId: string } }) {
  const { budgetId } = params;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [onBudget, setOnBudget] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      setAccounts(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, on_budget: onBudget }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message || "Create failed");
    }
  };

  return (
    <main>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Accounts</h1>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : (
        <>
          <section style={{ marginTop: 12, marginBottom: 24 }}>
            <form onSubmit={create} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label>
                <div>Name</div>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label>
                <div>Type</div>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="cash">Cash</option>
                  <option value="credit">Credit</option>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                </select>
              </label>
              <label>
                <div>On Budget</div>
                <input type="checkbox" checked={onBudget} onChange={(e) => setOnBudget(e.target.checked)} />
              </label>
              <button type="submit">Add Account</button>
            </form>
          </section>
          <ul>
            {accounts.map((a) => (
              <li key={a.id}>
                {a.name} ({a.type}) {a.on_budget ? "• on budget" : ""} — <Link href={`/b/${budgetId}/accounts/${a.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

