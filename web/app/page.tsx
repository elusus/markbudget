"use client";

import { useEffect, useState } from "react";

type Budget = {
  id: string;
  name: string;
  currency: string;
  start_month: string; // ISO date
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function HomePage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/v1/budgets/`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load budgets (${res.status})`);
      const data = await res.json();
      setBudgets(data);
    } catch (e: any) {
      setError(e.message || "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const start_month = `${month}-01`;
      const res = await fetch(`${API_URL}/api/v1/budgets/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, currency, start_month }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      setName("");
      setCurrency("USD");
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to create budget");
    }
  };

  return (
    <main>
      <h1>MarkBudget</h1>

      <section style={{ marginTop: 12, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Create a Budget</h2>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label>
            <div>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="My Budget" />
          </label>
          <label>
            <div>Currency</div>
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} required maxLength={3} size={4} />
          </label>
          <label>
            <div>Start Month</div>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
          </label>
          <button type="submit">Add Budget</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Your Budgets</h2>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: "crimson" }}>{error}</p>
        ) : budgets.length === 0 ? (
          <p>No budgets yet. Create one above.</p>
        ) : (
          <ul>
            {budgets.map((b) => (
              <li key={b.id}>
                {b.name} — {b.currency} — {new Date(b.start_month).toISOString().slice(0, 10)} — {" "}
                <a href={`/b/${b.id}`}>Manage</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
