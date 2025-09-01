"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Group = { id: string; name: string; sort: number };
type Category = { id: string; group_id: string; name: string; sort: number; hidden: boolean; is_credit_payment: boolean };
type MonthRow = { category_id: string; month: string; assigned_cents: number; activity_cents: number; available_cents: number };
type MonthResp = { month: string; groups: Group[]; categories: Category[]; months: MonthRow[]; available_to_budget_cents?: number };
type AccountWithBalance = { id: string; name: string; type: string; on_budget: boolean; current_balance_cents: number };

function fmtMoney(cents: number | undefined | null) {
  const v = ((cents || 0) as number) / 100;
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

function ymToLabel(ym: string) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const y = ym.slice(0,4);
  const m = parseInt(ym.slice(5,7), 10) - 1;
  return `${months[m]} ${y}`;
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
  const nextMonth = nextYm(ym, +1);
  const nextMonthIso = `${nextMonth}-01`;
  const prevMonth = nextYm(ym, -1);
  const prevMonthIso = `${prevMonth}-01`;

  const [respA, setRespA] = useState<MonthResp | null>(null); // current month
  const [respB, setRespB] = useState<MonthResp | null>(null); // next month
  const [respPrev, setRespPrev] = useState<MonthResp | null>(null); // previous month of current
  const [accts, setAccts] = useState<AccountWithBalance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const year = parseInt(ym.slice(0,4), 10);
  const monthIndex = parseInt(ym.slice(5,7), 10) - 1;

  // Editing state for budgeted cells: key `${ym}|${category_id}` -> string value
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catsPrev, catsA, catsB, acctRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories?month=${prevMonthIso}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories?month=${monthIso}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories?month=${nextMonthIso}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/with-balances`, { cache: "no-store" }),
      ]);
      if (!catsPrev.ok) throw new Error(`Categories prev failed (${catsPrev.status})`);
      if (!catsA.ok) throw new Error(`Categories A failed (${catsA.status})`);
      if (!catsB.ok) throw new Error(`Categories B failed (${catsB.status})`);
      if (!acctRes.ok) throw new Error(`Accounts failed (${acctRes.status})`);
      const [p, a, b] = await Promise.all([catsPrev.json(), catsA.json(), catsB.json()]);
      setRespPrev(p);
      setRespA(a);
      setRespB(b);
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

  const monthsByCatA = useMemo(() => {
    const map = new Map<string, MonthRow>();
    respA?.months.forEach((m) => map.set(m.category_id, m));
    return map;
  }, [respA]);
  const monthsByCatB = useMemo(() => {
    const map = new Map<string, MonthRow>();
    respB?.months.forEach((m) => map.set(m.category_id, m));
    return map;
  }, [respB]);

  const totalsA = useMemo(() => {
    const assigned = respA?.months.reduce((s, r) => s + (r.assigned_cents || 0), 0) || 0;
    const activity = respA?.months.reduce((s, r) => s + (r.activity_cents || 0), 0) || 0;
    const available_to_budget = (respA as any)?.available_to_budget_cents ?? (assigned - activity);
    const balance = (respA?.months.reduce((s, r) => s + (typeof r.available_cents === 'number' ? r.available_cents : ((r.assigned_cents||0) - (r.activity_cents||0))), 0)) || (assigned - activity);
    return { assigned, activity, balance, available_to_budget };
  }, [respA]);
  const totalsB = useMemo(() => {
    const assigned = respB?.months.reduce((s, r) => s + (r.assigned_cents || 0), 0) || 0;
    const activity = respB?.months.reduce((s, r) => s + (r.activity_cents || 0), 0) || 0;
    const available_to_budget = (respB as any)?.available_to_budget_cents ?? (assigned - activity);
    const balance = (respB?.months.reduce((s, r) => s + (typeof r.available_cents === 'number' ? r.available_cents : ((r.assigned_cents||0) - (r.activity_cents||0))), 0)) || (assigned - activity);
    return { assigned, activity, balance, available_to_budget };
  }, [respB]);

  const creditAccounts = accts.filter((a) => a.type === "credit");

  const setMonth = (newYm: string) => {
    setYm(newYm);
    router.push(`/b/${budgetId}?m=${newYm}`);
  };

  async function createGroup() {
    const name = prompt("Master Category name");
    if (!name) return;
    const sort = (respA?.groups?.length || 0) + 1;
    const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/category-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sort }),
    });
    if (!res.ok) {
      alert(`Failed to create group (${res.status})`);
      return;
    }
    await load();
  }

  async function createCategory(groupId: string) {
    const name = prompt("New sub-category name");
    if (!name) return;
    const sort = (respA?.categories?.filter(c=>c.group_id===groupId).length || 0) + 1;
    const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, name, sort, hidden: false, is_credit_payment: false }),
    });
    if (!res.ok) {
      alert(`Failed to create category (${res.status})`);
      return;
    }
    await load();
  }

  const onStartEdit = (key: string, currentCents: number) => {
    setEditingKey(key);
    setEditingVal(((currentCents || 0) / 100).toFixed(2));
  };

  const onCommitEdit = async (key: string, categoryId: string, monthIsoStr: string, beforeCents: number) => {
    if (editingKey !== key) return;
    const parsed = parseFloat(editingVal.replace(/[, ]/g, ""));
    const newCents = Math.round((isNaN(parsed) ? 0 : parsed) * 100);
    const delta = newCents - (beforeCents || 0);
    setEditingKey(null);
    if (delta === 0) return;
    const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories/${categoryId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: monthIsoStr, delta_cents: delta }),
    });
    if (!res.ok) {
      alert(`Update failed (${res.status})`);
      return;
    }
    const updated = await res.json();
    const m = monthIsoStr.slice(0, 7);
    if (m === ym) setRespA(updated);
    else if (m === nextMonth) setRespB(updated);
  };

  function monthShort(ymstr: string) {
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(ymstr.slice(5,7),10)-1];
  }

  function calcSummary(curr: MonthResp, prev: MonthResp | null) {
    const assigned = curr.months.reduce((s, r) => s + (r.assigned_cents || 0), 0);
    const activity = curr.months.reduce((s, r) => s + (r.activity_cents || 0), 0);
    const atb_api = (curr as any)?.available_to_budget_cents ?? (assigned - activity);
    const income = atb_api + assigned; // derive income from API atb + budgeted
    let prev_atb_api = 0;
    if (prev) {
      const prevAssigned = prev.months.reduce((s, r) => s + (r.assigned_cents || 0), 0);
      const prevActivity = prev.months.reduce((s, r) => s + (r.activity_cents || 0), 0);
      prev_atb_api = (prev as any)?.available_to_budget_cents ?? (prevAssigned - prevActivity);
    }
    const not_budgeted_prev = Math.max(prev_atb_api, 0);
    const overspent_prev = Math.min(prev_atb_api, 0);
    const atb_ynab = not_budgeted_prev + overspent_prev + income - assigned;
    return { assigned, activity, income, not_budgeted_prev, overspent_prev, atb_ynab };
  }

  const renderTableFor = (labelYm: string, resp: MonthResp | null, prevForLabel: MonthResp | null, monthsByCat: Map<string, MonthRow>) => {
    if (!resp) return null;
    const totals = (labelYm === ym) ? totalsA : totalsB;
    const summary = calcSummary(resp, prevForLabel);
    const monthIsoStr = `${labelYm}-01`;
    return (
      <div className="flex-1 min-w-[34rem]">
        <div className="mb-3 p-3 rounded border bg-gray-50 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-gray-500">{ymToLabel(labelYm)}</div>
            <div className={`text-2xl font-semibold ${(summary.atb_ynab || 0) < 0 ? "text-red-600" : "text-green-700"}`}>${fmtMoney(summary.atb_ynab)}</div>
            <div className="text-xs text-gray-500 mt-1">Available to Budget</div>
          </div>
          <div className="text-sm text-gray-600 leading-6">
            <div><span className="tabular-nums mr-2">{fmtMoney(summary.not_budgeted_prev)}</span> Not Budgeted in {monthShort(nextYm(labelYm, -1))}</div>
            <div><span className={`tabular-nums mr-2 ${summary.overspent_prev < 0 ? 'text-red-600' : ''}`}>{fmtMoney(summary.overspent_prev)}</span> Overspent in {monthShort(nextYm(labelYm, -1))}</div>
            <div><span className="tabular-nums mr-2">+{fmtMoney(summary.income)}</span> Income for {monthShort(labelYm)}</div>
            <div><span className="tabular-nums mr-2">-{fmtMoney(summary.assigned)}</span> Budgeted in {monthShort(labelYm)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-3 py-1">
                  <div className="flex items-center gap-2">
                    <span>Categories</span>
                    <button title="Add Master Category" className="ml-1 px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 border" onClick={createGroup}>+</button>
                  </div>
                </th>
                <th className="pr-3 py-1 text-right">Budgeted</th>
                <th className="pr-3 py-1 text-right">Outflows</th>
                <th className="pr-3 py-1 text-right">Balance</th>
              </tr>
              <tr className="text-gray-600">
                <th className="pr-3 py-1"></th>
                <th className="pr-3 py-1 text-right tabular-nums">${fmtMoney(totals.assigned)}</th>
                <th className="pr-3 py-1 text-right tabular-nums">-${fmtMoney(totals.activity)}</th>
                <th className={`pr-3 py-1 text-right tabular-nums ${ (totals.balance||0) < 0 ? 'text-red-600' : ''}`}>${fmtMoney(totals.balance)}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Pre-MarkBudget Debt */}
              <tr>
                <td colSpan={4} className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide px-2 py-1">Pre-MarkBudget Debt</td>
              </tr>
              {creditAccounts.length === 0 ? (
                <tr><td className="py-2 text-gray-400" colSpan={4}>No credit card accounts yet</td></tr>
              ) : (
                creditAccounts.map((a) => (
                  <tr key={a.id}>
                    <td className="pr-3 py-1">{a.name}</td>
                    <td className="pr-3 py-1 text-right">0.00</td>
                    <td className="pr-3 py-1 text-right">0.00</td>
                    <td className="pr-3 py-1 text-right">0.00</td>
                  </tr>
                ))
              )}

              {/* Category groups */}
              {resp.groups.map((g) => (
                <>
                  <tr key={g.id + "-hdr"}>
                    <td colSpan={4} className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide px-2 py-1">
                      <div className="flex items-center justify-between">
                        <span>{g.name}</span>
                        <button title="Add sub-category" className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 border" onClick={() => createCategory(g.id)}>+</button>
                      </div>
                    </td>
                  </tr>
                  {resp.categories
                    .filter((c) => c.group_id === g.id)
                    .map((c) => {
                      const m = monthsByCat.get(c.id);
                      const assigned = m?.assigned_cents || 0;
                      const activity = m?.activity_cents || 0;
                      const available = (m?.available_cents ?? (assigned - activity));
                      const key = `${labelYm}|${c.id}`;
                      const isEditing = editingKey === key;
                      return (
                        <tr key={c.id}>
                          <td className="pr-3 py-1">{c.name}</td>
                          <td className="pr-3 py-1 text-right">
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingVal}
                                onChange={(e) => setEditingVal(e.target.value)}
                                onBlur={() => onCommitEdit(key, c.id, monthIsoStr, assigned)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') onCommitEdit(key, c.id, monthIsoStr, assigned);
                                  if (e.key === 'Escape') setEditingKey(null);
                                }}
                                className="w-28 text-right border rounded px-2 py-0.5"
                              />
                            ) : (
                              <button className="w-28 text-right hover:underline" onClick={() => onStartEdit(key, assigned)}>
                                {fmtMoney(assigned)}
                              </button>
                            )}
                          </td>
                          <td className="pr-3 py-1 text-right">{fmtMoney(activity)}</td>
                          <td className={`pr-3 py-1 text-right ${available < 0 ? 'text-red-600' : ''}`}>{fmtMoney(available)}</td>
                        </tr>
                      );
                    })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Budget</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">Back to budgets</Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button className="px-2 py-1 bg-gray-100 rounded" onClick={() => setMonth(nextYm(ym, -1))}>Prev</button>
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
        <button className="px-2 py-1 bg-gray-100 rounded ml-auto" onClick={() => setMonth(nextYm(ym, +1))}>Next</button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : !respA ? null : (
        <div className="flex gap-6">
          {renderTableFor(ym, respA, respPrev, monthsByCatA)}
          {renderTableFor(nextMonth, respB, respA, monthsByCatB)}
        </div>
      )}
    </>
  );
}
