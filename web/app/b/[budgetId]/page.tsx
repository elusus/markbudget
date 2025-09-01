"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [paymentsA, setPaymentsA] = useState<Map<string, number>>(new Map());
  const [paymentsB, setPaymentsB] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const year = parseInt(ym.slice(0,4), 10);
  const monthIndex = parseInt(ym.slice(5,7), 10) - 1;

  // Editing state for budgeted cells: key `${ym}|${category_id}` -> string value
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState<string>("");

  // Edit modals for groups/categories
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [hiddenOpen, setHiddenOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = window.localStorage.getItem(`mb:hiddenCats:${budgetId}`);
      if (v === '0' || v === 'false') return false;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`mb:hiddenCats:${budgetId}`, hiddenOpen ? '1' : '0');
    }
  }, [hiddenOpen, budgetId]);

  const groupsById = useMemo(() => {
    const map = new Map<string, Group>();
    respA?.groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [respA]);

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

  // Load payment activity per credit card for current (A) and next (B) months
  useEffect(() => {
    const run = async () => {
      const cards = accts.filter((a) => a.type === "credit");
      if (cards.length === 0) {
        setPaymentsA(new Map());
        setPaymentsB(new Map());
        return;
      }
      const startA = `${ym}-01`;
      const endA = `${nextYm(ym, +1)}-01`;
      const ymB = nextYm(ym, +1);
      const startB = `${ymB}-01`;
      const endB = `${nextYm(ymB, +1)}-01`;

      const fetchSum = async (accountId: string, start: string, end: string) => {
        try {
          const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions?account_id=${accountId}&since=${start}`, { cache: "no-store" });
          if (!res.ok) return 0;
          const items = await res.json();
          // Payments onto the credit card show as positive amounts on the credit account
          let sum = 0;
          for (const t of items) {
            const d = t.date as string;
            if (d >= start && d < end && (t.amount_cents || 0) > 0) sum += t.amount_cents;
          }
          return sum;
        } catch (_) {
          return 0;
        }
      };

      const mapA = new Map<string, number>();
      const mapB = new Map<string, number>();
      await Promise.all(cards.map(async (c) => {
        const [sa, sb] = await Promise.all([
          fetchSum(c.id, startA, endA),
          fetchSum(c.id, startB, endB),
        ]);
        mapA.set(c.id, sa || 0);
        mapB.set(c.id, sb || 0);
      }));
      setPaymentsA(mapA);
      setPaymentsB(mapB);
    };
    run();
  }, [accts, ym, budgetId]);

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

  // Ensure a single synthetic "Pre-MarkBudget Debt" section with per-card payment categories exists
  useEffect(() => {
    const ensure = async () => {
      if (!respA || accts.length === 0) return;
      const cards = creditAccounts;
      if (cards.length === 0) return;

      // Find or create group
      let debtGroup = respA.groups.find((g) => g.name === "Pre-MarkBudget Debt");
      if (!debtGroup) {
        const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/category-groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pre-MarkBudget Debt", sort: 0 }),
        });
        if (res.ok) {
          debtGroup = await res.json();
        } else {
          return;
        }
      }

      // Ensure a credit-payment category (by name) exists for each card
      let createdAny = false;
      for (const card of cards) {
        const existing = respA.categories.find(
          (c) => c.group_id === (debtGroup as any).id && c.is_credit_payment && c.name === card.name
        );
        if (!existing) {
          const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              group_id: (debtGroup as any).id,
              name: card.name,
              sort: 0,
              hidden: false,
              is_credit_payment: true,
            }),
          });
          if (res.ok) createdAny = true;
        }
      }
      if (createdAny) await load();
    };
    ensure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respA, accts.length]);

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
                creditAccounts.map((a) => {
                  // Find the payment category by name (temporary mapping)
                  const payCat = resp.categories.find((c) => c.is_credit_payment && c.name === a.name);
                  // If the payment category is hidden, do not render here (it will appear under Hidden Categories)
                  if (payCat && payCat.hidden) return null;
                  const catId = payCat?.id;
                  const m = catId ? monthsByCat.get(catId) : undefined;
                  const assigned = m?.assigned_cents || 0;
                  const payments = (labelYm === ym ? paymentsA : paymentsB).get(a.id) || 0;
                  // Treat budgeted + actual payments as progress against debt
                  const debtBalance = (a.current_balance_cents || 0) + assigned - payments;
                  const key = `${labelYm}|ccpay|${catId || a.id}`;
                  const isEditing = editingKey === key;
                  const monthIsoStr = `${labelYm}-01`;
                  return (
                    <tr key={`cc-${a.id}`}>
                      <td className="pr-3 py-1 pl-6">
                        <button className="hover:underline" onClick={() => { if (catId) { setEditCat({ ...(payCat as any) }); setEditCatName(payCat!.name); } }} title="Edit payment category">
                          {a.name}
                        </button>
                      </td>
                      <td className="pr-3 py-1 text-right">
                        {catId ? (
                          isEditing ? (
                            <input
                              autoFocus
                              value={editingVal}
                              onChange={(e) => setEditingVal(e.target.value)}
                              onBlur={() => onCommitEdit(key, catId!, monthIsoStr, assigned)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") onCommitEdit(key, catId!, monthIsoStr, assigned);
                                if (e.key === "Escape") setEditingKey(null);
                              }}
                              className="w-28 text-right border rounded px-2 py-0.5"
                            />
                          ) : (
                            <button className="w-28 text-right hover:underline" onClick={() => onStartEdit(key, assigned)}>
                              {fmtMoney(assigned)}
                            </button>
                          )
                        ) : (
                          <span className="text-gray-400">(creating…)</span>
                        )}
                      </td>
                      <td className="pr-3 py-1 text-right">{fmtMoney(payments)}</td>
                      <td className={`pr-3 py-1 text-right ${debtBalance < 0 ? "text-red-600" : ""}`}>{fmtMoney(debtBalance)}</td>
                    </tr>
                  );
                })
              )}

              {/* Category groups (exclude synthetic Pre-MarkBudget Debt shown above) */}
              {resp.groups.filter(g => g.name !== 'Pre-MarkBudget Debt').map((g) => (
                <>
                  <tr key={g.id + "-hdr"}>
                    <td colSpan={4} className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide px-2 py-1">
                      <div className="flex items-center justify-between">
                        <button className="hover:underline" title="Edit master category" onClick={() => { setEditGroup(g); setEditGroupName(g.name); }}>
                          {g.name}
                        </button>
                        <button title="Add sub-category" className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 border" onClick={() => createCategory(g.id)}>+</button>
                      </div>
                    </td>
                  </tr>
                  {resp.categories
                    .filter((c) => c.group_id === g.id && !c.hidden)
                    .map((c) => {
                      const m = monthsByCat.get(c.id);
                      const assigned = m?.assigned_cents || 0;
                      const activity = m?.activity_cents || 0;
                      const available = (m?.available_cents ?? (assigned - activity));
                      const key = `${labelYm}|${c.id}`;
                      const isEditing = editingKey === key;
                      return (
                        <tr key={c.id}>
                          <td className="pr-3 py-1 pl-6">
                            <button className="hover:underline" title="Edit category" onClick={() => { setEditCat(c); setEditCatName(c.name); }}>
                              {c.name}
                            </button>
                          </td>
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

              {/* Hidden Categories management */}
              {(() => {
                const hiddenCats = resp.categories.filter((c) => c.hidden);
                if (hiddenCats.length === 0) return null;
                // Group hidden by original group name
                const byGroup = new Map<string, Category[]>();
                hiddenCats.forEach((c) => {
                  const g = groupsById.get(c.group_id) || { id: c.group_id, name: "(Ungrouped)", sort: 0 } as Group;
                  const key = g.name;
                  const arr = byGroup.get(key) || [];
                  arr.push(c);
                  byGroup.set(key, arr);
                });
                return (
                  <>
                    <tr>
                      <td colSpan={4} className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide px-2 py-1">
                        <div className="flex items-center justify-between">
                          <span>Hidden Categories ({hiddenCats.length})</span>
                          <button className="text-xs underline" onClick={() => setHiddenOpen((v) => !v)}>{hiddenOpen ? 'Collapse' : 'Expand'}</button>
                        </div>
                      </td>
                    </tr>
                    {hiddenOpen && (
                      <>
                        {[...byGroup.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([gname, cats]) => (
                          <>
                            <tr key={`hidden-${gname}`}>
                              <td colSpan={4} className="text-xs text-gray-500 px-2 pt-2">{gname}</td>
                            </tr>
                            {cats.sort((a,b)=>a.name.localeCompare(b.name)).map((c) => (
                              <tr key={`hidden-cat-${c.id}`} className="text-gray-500">
                                <td className="pr-3 py-1 pl-6">
                                  <span className="mr-3">{c.name}</span>
                                  <button className="text-blue-700 underline" onClick={async ()=>{
                                    await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories/${c.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ hidden: false }) });
                                    await load();
                                  }}>Unhide</button>
                                </td>
                                <td className="pr-3 py-1 text-right">-</td>
                                <td className="pr-3 py-1 text-right">-</td>
                                <td className="pr-3 py-1 text-right">-</td>
                              </tr>
                            ))}
                          </>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
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

      {/* Edit Group Modal */}
      {editGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>{ if(e.target===e.currentTarget) setEditGroup(null); }}>
          <div className="bg-white rounded-md shadow-2xl w-full max-w-md">
            <div className="px-4 py-3 bg-gray-100 border-b text-lg font-semibold">Edit master category</div>
            <div className="p-4 space-y-3">
              <input className="w-full border rounded px-3 py-2" value={editGroupName} onChange={(e)=>setEditGroupName(e.target.value)} />
              <div className="flex justify-between items-center pt-3 border-t">
                <button className="text-red-600" onClick={async ()=>{
                  if(!confirm('Delete this master category? All sub-categories will also be deleted.')) return;
                  await fetch(`${API_URL}/api/v1/budgets/${budgetId}/category-groups/${editGroup.id}`, { method: 'DELETE' });
                  setEditGroup(null);
                  await load();
                }}>Delete this group</button>
                <div className="ml-auto flex gap-2">
                  <button className="px-3 py-2 rounded border" onClick={()=>setEditGroup(null)}>Cancel</button>
                  <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={async ()=>{
                    await fetch(`${API_URL}/api/v1/budgets/${budgetId}/category-groups/${editGroup.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: editGroupName }) });
                    setEditGroup(null);
                    await load();
                  }}>Done</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editCat && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e)=>{ if(e.target===e.currentTarget) setEditCat(null); }}>
          <div className="bg-white rounded-md shadow-2xl w-full max-w-md">
            <div className="px-4 py-3 bg-gray-100 border-b text-lg font-semibold">Edit category</div>
            <div className="p-4 space-y-3">
              {editCat.is_credit_payment ? (
                <>
                  <input className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-500" value={editCatName} disabled />
                  <div className="text-sm text-gray-600">Payment categories under Pre‑MarkBudget Debt cannot be renamed.</div>
                </>
              ) : (
                <input className="w-full border rounded px-3 py-2" value={editCatName} onChange={(e)=>setEditCatName(e.target.value)} />
              )}
              <div>
                <button className="text-blue-700 underline" onClick={async ()=>{
                  await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories/${editCat.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ hidden: true }) });
                  setEditCat(null);
                  await load();
                }}>Hide this category</button>
              </div>
              <div>
                <button className="text-red-600" onClick={async ()=>{
                  if(!confirm('Delete this category?')) return;
                  await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories/${editCat.id}`, { method:'DELETE' });
                  setEditCat(null);
                  await load();
                }}>Delete this category</button>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button className="px-3 py-2 rounded border" onClick={()=>setEditCat(null)}>Cancel</button>
                <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={async ()=>{
                  if (!editCat.is_credit_payment) {
                    await fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories/${editCat.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: editCatName }) });
                  }
                  setEditCat(null);
                  await load();
                }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
