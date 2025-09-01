"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Group = { id: string; name: string; sort: number };
type Category = { id: string; group_id: string; name: string; sort: number; hidden: boolean; is_credit_payment: boolean };
type MonthRow = { category_id: string; month: string; assigned_cents: number; activity_cents: number; available_cents: number };
type MonthResp = { month: string; groups: Group[]; categories: Category[]; months: MonthRow[] };
type AccountWithBalance = { id: string; name: string; type: string; on_budget: boolean; current_balance_cents: number };

function fmtMoney(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  let year = y;
  let month = m + delta;
  while (month < 1) { month += 12; year -= 1; }
  while (month > 12) { month -= 12; year += 1; }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default function BudgetPage({ params }: { params: { budgetId: string } }) {
  const { budgetId } = params;
  const search = useSearchParams();
  const router = useRouter();

  const initialYm = (() => {
    const q = search?.get("m");
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const [ym, setYm] = useState(initialYm);
  const monthIso = `${ym}-01`;
  const [resp, setResp] = useState<MonthResp | null>(null);
  const [accts, setAccts] = useState<AccountWithBalance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const year = parseInt(ym.slice(0,4), 10);
  const monthIndex = parseInt(ym.slice(5,7), 10) - 1;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catsRes, acctRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories?month=${monthIso}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/with-balances`, { cache: "no-store" }),
      ]);
      if (!catsRes.ok) throw new Error(`Categories failed (${catsRes.status})`);
      if (!acctRes.ok) throw new Error(`Accounts failed (${acctRes.status})`);
      setResp(await catsRes.json());
      setAccts(await acctRes.json());
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId, ym]);

  const monthsByCat = useMemo(() => {
    const map = new Map<string, MonthRow>();
    resp?.months.forEach((m) => map.set(m.category_id, m));
    return map;
  }, [resp]);

  const totals = useMemo(() => {
    const assigned = resp?.months.reduce((s, r) => s + (r.assigned_cents || 0), 0) || 0;
    const activity = resp?.months.reduce((s, r) => s + (r.activity_cents || 0), 0) || 0;
    const available_to_budget = (resp as any)?.available_to_budget_cents ?? (assigned - activity);
    return { assigned, activity, available_to_budget };
  }, [resp]);

  const creditAccounts = accts.filter((a) => a.type === "credit");

  const setMonth = (newYm: string) => {
    setYm(newYm);
    router.push(`/b/${budgetId}?m=${newYm}`);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Budget</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">Back to budgets</Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button className="px-2 py-1 bg-gray-100 rounded" onClick={() => setMonth(nextYm(ym, -1))}>‹</button>
        <div className="text-sm text-gray-600 mr-2">{year}</div>
        <div className="flex flex-wrap gap-1">
          {months.map((label, i) => {
            const my = `${year}-${String(i + 1).padStart(2, "0")}`;
            const active = i === monthIndex;
            return (
              <button key={label} onClick={() => setMonth(my)} className={`px-2 py-1 rounded ${active ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>{label}</button>
            );
          })}
        </div>
        <button className="px-2 py-1 bg-gray-100 rounded ml-auto" onClick={() => setMonth(nextYm(ym, +1))}>›</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : !resp ? null : (
        <>
          <div className="mb-4 p-3 rounded border bg-gray-50 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Available to Budget</div>
              <div className={`text-2xl font-semibold ${(totals.available_to_budget || 0) < 0 ? "text-red-600" : "text-green-700"}`}>${fmtMoney(totals.available_to_budget || 0)}</div>
            </div>
            <div className="text-sm text-gray-500">
              <span className="mr-4">Budgeted ${fmtMoney(totals.assigned)}</span>
              <span>Outflows -${fmtMoney(totals.activity)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pr-3 py-1">Categories</th>
                  <th className="pr-3 py-1 text-right">Budgeted</th>
                  <th className="pr-3 py-1 text-right">Outflows</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Pre-MarkBudget Debt group */}
                <tr>
                  <td colSpan={3} className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide px-2 py-1">Pre‑MarkBudget Debt</td>
                </tr>
                {creditAccounts.length === 0 ? (
                  <tr><td className="py-2 text-gray-400" colSpan={3}>No credit card accounts yet</td></tr>
                ) : (
                  creditAccounts.map((a) => (
                    <tr key={a.id}>
                      <td className="pr-3 py-1">{a.name}</td>
                      <td className="pr-3 py-1 text-right">0.00</td>
                      <td className="pr-3 py-1 text-right">0.00</td>
                      
                    </tr>
                  ))
                )}

                {/* Category groups */}
                {resp.groups.map((g) => (
                  <>
                    <tr key={g.id + "-hdr"}>
                      <td colSpan={3} className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide px-2 py-1">{g.name}</td>
                    </tr>
                    {resp.categories
                      .filter((c) => c.group_id === g.id)
                      .map((c) => {
                        const m = monthsByCat.get(c.id);
                        const assigned = m?.assigned_cents || 0;
                        const activity = m?.activity_cents || 0;
                        const available = assigned - activity;
                        return (
                          <tr key={c.id}>
                            <td className="pr-3 py-1">{c.name}</td>
                            <td className="pr-3 py-1 text-right">{fmtMoney(assigned)}</td>
                            <td className="pr-3 py-1 text-right">{fmtMoney(activity)}</td>
                            
                          </tr>
                        );
                      })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
