"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Tx = {
  id: string;
  account_id: string;
  date: string;
  amount_cents: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
  state: string;
  subtransactions: { category_id?: string | null; amount_cents: number; memo?: string | null }[];
};

type Category = { id: string; group_id: string; name: string };
type Group = { id: string; name: string };
type MonthResp = { month: string; groups: Group[]; categories: Category[]; months: any[] };
type Account = { id: string; name: string };

function fmtMoney(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RegisterPage({ params }: { params: { budgetId: string; accountId: string } }) {
  const { budgetId, accountId } = params;
  const [txs, setTxs] = useState<Tx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters/controls
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Add form state (bottom bar)
  const [showAdd, setShowAdd] = useState(false);
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [payeeName, setPayeeName] = useState("");
  const [outflow, setOutflow] = useState<string>("");
  const [inflow, setInflow] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [transferAccount, setTransferAccount] = useState<string>("");
  const [transferMode, setTransferMode] = useState<boolean>(false);
  const inflowRef = useRef<HTMLInputElement>(null);

  const [catsResp, setCatsResp] = useState<MonthResp | null>(null);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<{id: string; name: string}[]>([]);
  const [payeeOpen, setPayeeOpen] = useState(false);
  const payeeInputRef = useRef<HTMLInputElement>(null);

  const sinceParam = useMemo(() => {
    const d = new Date();
    if (dateFilter === "30") {
      d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    }
    if (dateFilter === "month") {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }
    if (dateFilter === "lastmonth") {
      const m = d.getMonth();
      const y = d.getFullYear();
      const month = m === 0 ? 12 : m;
      const year = m === 0 ? y - 1 : y;
      return `${year}-${String(month).padStart(2, "0")}-01`;
    }
    return null;
  }, [dateFilter]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = sinceParam ? `?account_id=${accountId}&since=${sinceParam}` : `?account_id=${accountId}`;
      const [txRes, catsRes, acctRes, payeeRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions${qs}`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/categories?month=${new Date().toISOString().slice(0, 7)}-01`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/`, { cache: "no-store" }),
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/payees/`, { cache: "no-store" }),
      ]);
      if (!txRes.ok) throw new Error(`Load tx failed (${txRes.status})`);
      if (!catsRes.ok) throw new Error(`Load cats failed (${catsRes.status})`);
      if (!acctRes.ok) throw new Error(`Load accounts failed (${acctRes.status})`);
      setTxs(await txRes.json());
      setCatsResp(await catsRes.json());
      setAllAccounts(await acctRes.json());
      setPayees(await payeeRes.json());
      setSelected({});
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId, accountId, sinceParam]);

  const cats = catsResp?.categories || [];
  const groups = catsResp?.groups || [];
  const catName = (id?: string | null) => cats.find((c) => c.id === id)?.name || (id ? "(unknown)" : "");
  const acctName = (id?: string | null) => allAccounts.find((a) => a.id === id)?.name || "";
  const payeeNames = Array.from(new Set(txs.map(t => t.payee_name).filter(Boolean))) as string[];

  const filtered = txs.filter((t) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (t.payee_name || "").toLowerCase().includes(s) ||
      (t.memo || "").toLowerCase().includes(s)
    );
  });

  const toggleSelect = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const allSelected = filtered.length > 0 && filtered.every((t) => selected[t.id]);
  const toggleSelectAll = () => {
    const next: Record<string, boolean> = {};
    if (!allSelected) filtered.forEach((t) => (next[t.id] = true));
    setSelected(next);
  };

  const toggleCleared = async (t: Tx) => {
    const nextState = t.state === "cleared" ? "uncleared" : "cleared";
    await fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: nextState }),
    });
    await load();
  };

  const bulkSetCleared = async (cleared: boolean) => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    await Promise.all(
      ids.map((id) =>
        fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: cleared ? "cleared" : "uncleared" }),
        })
      )
    );
    await load();
  };

  const bulkDelete = async () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    await Promise.all(
      ids.map((id) => fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions/${id}`, { method: "DELETE" }))
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounts:refresh', { detail: { budgetId } }));
    }
    await load();
  };

  const createTx = async () => {
    const out = parseFloat(outflow || "0");
    const infl = parseFloat(inflow || "0");
    let amount_cents = Math.round(infl * 100) - Math.round(out * 100);
    if (!Number.isFinite(amount_cents)) throw new Error("Enter valid amounts");
    const body: any = {
      account_id: accountId,
      date: dateStr,
      amount_cents,
      payee_name: payeeName || undefined,
      memo: memo || undefined,
      subtransactions: categoryId && !categoryId.startsWith('income:') ? [{ category_id: categoryId, amount_cents, memo: undefined }] : [],
    };
    if (transferAccount) {
      body.transfer_account_id = transferAccount;
      body.subtransactions = [];
    }
    // Income targeting
    if (categoryId && categoryId.startsWith('income:')) {
      const d = new Date(dateStr);
      if (categoryId.endsWith('next')) d.setMonth(d.getMonth()+1);
      body.income_for_month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    }
    const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Create failed (${res.status})`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounts:refresh', { detail: { budgetId } }));
    }
    // reset state
    const keepOpen = createTx.keepOpenFlag === true;
    setShowAdd(keepOpen);
    setPayeeName("");
    setOutflow("");
    setInflow("");
    setMemo("");
    setCategoryId("");
    setTransferAccount("");
    setTransferMode(false);
    await load();
  };
  // little trick to pass flag without changing signature type
  (createTx as any).keepOpenFlag = false;

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<any>({});
  const startEdit = (t: Tx) => {
    if (t.transfer_account_id || t.subtransactions.length > 1) return; // keep simple for now
    setEditingId(t.id);
    const out = t.amount_cents < 0 ? (Math.abs(t.amount_cents)/100).toFixed(2) : "";
    const infl = t.amount_cents > 0 ? (t.amount_cents/100).toFixed(2) : "";
    setEditFields({
      date: t.date,
      payee_name: t.payee_name || "",
      category_id: t.subtransactions[0]?.category_id || "",
      memo: t.memo || "",
      outflow: out,
      inflow: infl,
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditFields({}); };
  const saveEdit = async (t: Tx) => {
    const body: any = { memo: editFields.memo, date: editFields.date, payee_name: editFields.payee_name };
    const out = parseFloat(editFields.outflow || "0");
    const infl = parseFloat(editFields.inflow || "0");
    const amount_cents = Math.round(infl * 100) - Math.round(out * 100);
    if (amount_cents !== t.amount_cents) body.amount_cents = amount_cents;
    if (editFields.category_id !== undefined) body.category_id = editFields.category_id || null;
    await fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditingId(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accounts:refresh', { detail: { budgetId } }));
    }
    await load();
  };

  // (removed running balance map)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button className="px-3 py-1.5 rounded border bg-gray-100">Edit Transactions ▾</button>
            <div className="absolute z-10 mt-1 bg-white border rounded shadow hidden group-focus:block"></div>
          </div>
          <button className="px-3 py-1.5 rounded border bg-gray-100" title="Import (coming soon)">Import</button>
          <Link href={`/b/${budgetId}/accounts/${accountId}/reconcile`} className="px-3 py-1.5 rounded border bg-gray-100" title="Reconcile">🔒 Reconcile</Link>
          <select className="ml-2 px-2 py-1 rounded border bg-white" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All Dates</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="lastmonth">Last month</option>
          </select>
        </div>
        <input className="px-3 py-1.5 rounded border bg-white" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error ? (
        <p className="text-red-600">{error}</p>
      ) : loading ? (
        <p>Loading…</p>
      ) : (
        <div className="overflow-x-auto border rounded max-h-[60vh]">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="w-8 text-center"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className="w-8"></th>
                <th className="px-2 py-1 text-left">Date</th>
                <th className="px-2 py-1 text-left">Payee</th>
                <th className="px-2 py-1 text-left">Category</th>
                <th className="px-2 py-1 text-left">Memo</th>
                <th className="px-2 py-1 text-right">Outflow</th>
                <th className="px-2 py-1 text-right">Inflow</th>
                <th className="w-8 text-center">C</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isSel = !!selected[t.id];
                const isCleared = t.state === "cleared" || t.state === "reconciled";
                const isTransfer = !!t.transfer_account_id;
                const catLabel = t.subtransactions.length > 1 ? "Split" : (t.subtransactions[0]?.category_id ? catName(t.subtransactions[0]?.category_id as string) : isTransfer ? `Transfer: ${acctName(t.transfer_account_id as string)}` : "");
                const out = t.amount_cents < 0 ? fmtMoney(Math.abs(t.amount_cents)) : "";
                const infl = t.amount_cents > 0 ? fmtMoney(t.amount_cents) : "";
                const isEditing = editingId === t.id;
                if (isEditing) {
                  return (
                    <tr key={t.id} className="bg-yellow-50">
                      <td className="text-center"><input type="checkbox" checked={isSel} onChange={() => toggleSelect(t.id)} /></td>
                      <td className="text-center"><button className={`w-4 h-4 rounded-full ${isCleared ? 'bg-green-500' : 'bg-gray-300'}`} onClick={() => toggleCleared(t)} title={isCleared ? 'Cleared' : 'Uncleared'} /></td>
                      <td className="px-2 py-1"><input type="date" className="border rounded px-1" value={editFields.date} onChange={(e)=>setEditFields({...editFields, date:e.target.value})} /></td>
                      <td className="px-2 py-1">
                        <input list="payees" className="border rounded px-1" value={editFields.payee_name} onChange={(e)=>setEditFields({...editFields, payee_name:e.target.value})} />
                        <datalist id="payees">
                          {Array.from(new Set([...(payeeNames||[]), ...payees.map(p=>p.name)])).map((n)=> (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                      </td>
                      <td className="px-2 py-1">
                        <select className="border rounded px-1" value={editFields.category_id} onChange={(e)=>setEditFields({...editFields, category_id:e.target.value})}>
                          <option value="">(none)</option>
                          {groups.map((g) => (
                            <optgroup key={g.id} label={g.name}>
                              {cats.filter(c=>c.group_id===g.id).map(c=> (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1"><input className="border rounded px-1 w-full" value={editFields.memo} onChange={(e)=>setEditFields({...editFields, memo:e.target.value})} /></td>
                      <td className="px-2 py-1 text-right"><input className="border rounded px-1 text-right w-24" value={editFields.outflow} onChange={(e)=>setEditFields({...editFields, outflow:e.target.value})} /></td>
                      <td className="px-2 py-1 text-right"><input className="border rounded px-1 text-right w-24" value={editFields.inflow} onChange={(e)=>setEditFields({...editFields, inflow:e.target.value})} /></td>
                      <td className="text-center whitespace-nowrap">
                        <button className="px-2 py-0.5 rounded border mr-1" onClick={()=>cancelEdit()}>Cancel</button>
                        <button className="px-2 py-0.5 rounded bg-blue-600 text-white" onClick={()=>saveEdit(t)}>Save</button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={t.id} className={`${isSel ? 'bg-blue-50' : ''} hover:bg-gray-50`} onDoubleClick={()=>startEdit(t)}>
                    <td className="text-center"><input type="checkbox" checked={isSel} onChange={() => toggleSelect(t.id)} /></td>
                    <td className="text-center">
                      <button className={`w-4 h-4 rounded-full ${isCleared ? 'bg-green-500' : 'bg-gray-300'}`} onClick={() => toggleCleared(t)} title={isCleared ? 'Cleared' : 'Uncleared'} />
                    </td>
                    <td className="px-2 py-1">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="px-2 py-1">{isTransfer ? `Transfer: ${acctName(t.transfer_account_id as string)}` : (t.payee_name || '')}</td>
                    <td className="px-2 py-1">{catLabel}</td>
                    <td className="px-2 py-1">{t.memo || ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{out}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{infl}</td>
                    <td className="text-center">{isCleared ? <span className="inline-block px-1 rounded bg-green-100 text-green-700 text-xs">C</span> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom bar for adding transactions */}
      <div className="mt-3 flex items-center gap-2">
        <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={() => { setShowAdd(v => !v); setTransferMode(false); setTransferAccount(""); }}>+ Add a new transaction</button>
        <button className="px-3 py-2 bg-emerald-700 text-white rounded" onClick={() => { setShowAdd(true); setTransferMode(true); setTransferAccount(""); setPayeeName("Transfer: "); setTimeout(()=>payeeInputRef.current?.focus(), 0); setPayeeOpen(true); }}>↔ Make a transfer</button>
        {Object.values(selected).some(Boolean) && (
          <div className="ml-auto flex items-center gap-2">
            <button className="px-2 py-1 rounded border" onClick={() => bulkSetCleared(true)}>Clear</button>
            <button className="px-2 py-1 rounded border" onClick={() => bulkSetCleared(false)}>Unclear</button>
            <button className="px-2 py-1 rounded border" onClick={bulkDelete}>Delete</button>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="mt-3 border rounded p-3 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
            <div>
              <div className="text-xs text-gray-600">Date</div>
              <input type="date" className="w-full border rounded px-2 py-1" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            <div className="md:col-span-2 relative">
              <div className="text-xs text-gray-600">Payee</div>
              <input
                ref={payeeInputRef}
                className="w-full border rounded px-2 py-1"
                value={payeeName}
                onChange={(e) => {
                  const v = e.target.value;
                  setPayeeName(v);
                  setPayeeOpen(true);
                  if (!v.toLowerCase().startsWith('transfer')) {
                    setTransferAccount("");
                  }
                }}
                onFocus={() => setPayeeOpen(true)}
                onBlur={() => setTimeout(()=>setPayeeOpen(false), 100)}
                placeholder="Payee or 'Transfer: Account'"
              />
              {payeeOpen && (
                <div className="absolute z-20 bg-white border rounded shadow w-full max-h-60 overflow-auto mt-1">
                  <div className="px-2 py-1 text-xs text-gray-500">Memorized Payees</div>
                  {payees
                    .filter(p => !payeeName || p.name.toLowerCase().includes(payeeName.toLowerCase()))
                    .slice(0, 8)
                    .map(p => (
                      <div
                        key={p.id}
                        className="px-3 py-1 hover:bg-gray-100 cursor-pointer"
                        onMouseDown={(e)=>e.preventDefault()}
                        onClick={() => { setPayeeName(p.name); setTransferAccount(""); setPayeeOpen(false); }}
                      >
                        {p.name}
                      </div>
                    ))}
                  {(transferMode || payeeName.toLowerCase().startsWith('transfer')) && (
                    <>
                      <div className="px-2 py-1 text-xs text-gray-500 border-t">Transfer to/from account:</div>
                      {allAccounts
                        .filter(a => a.id !== accountId)
                        .filter(a => {
                          const label = `Transfer: ${a.name}`.toLowerCase();
                          const q = payeeName.toLowerCase();
                          return q.startsWith('transfer') ? (label.includes(q.replace(/\s+/g,' '))) || q === 'transfer' || q === 'transfer:' || q === 'transfer : ' : true;
                        })
                        .map(a => (
                          <div
                            key={a.id}
                            className="px-3 py-1 hover:bg-gray-100 cursor-pointer"
                            onMouseDown={(e)=>e.preventDefault()}
                            onClick={() => { setPayeeName(`Transfer: ${a.name}`); setTransferAccount(a.id); setCategoryId(""); setPayeeOpen(false); }}
                          >
                            {`Transfer: ${a.name}`}
                          </div>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-600">Category</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={categoryId}
                onChange={(e) => {
                  const v = e.target.value;
                  setCategoryId(v);
                  if (v.startsWith('income:')) {
                    setTransferAccount("");
                    setTransferMode(false);
                    setTimeout(()=>inflowRef.current?.focus(), 0);
                  }
                }}
                disabled={!!transferAccount}
              >
                <option value="">(none)</option>
                {/* Income shortcuts */}
                <optgroup label="Income">
                  <option value={`income:current`}>{`Income for ${new Date(dateStr).toLocaleString(undefined,{month:'long'})}`}</option>
                  <option value={`income:next`}>{`Income for ${(() => { const d=new Date(dateStr); d.setMonth(d.getMonth()+1); return d.toLocaleString(undefined,{month:'long'}); })()}`}</option>
                </optgroup>
                {groups.map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {cats.filter((c) => c.group_id === g.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-600">Outflow</div>
              <input className="w-full border rounded px-2 py-1" value={outflow} onChange={(e) => setOutflow(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <div className="text-xs text-gray-600">Inflow</div>
              <input ref={inflowRef} className="w-full border rounded px-2 py-1" value={inflow} onChange={(e) => setInflow(e.target.value)} placeholder="0.00" />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-gray-600">Memo</div>
              <input className="w-full border rounded px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button className="px-3 py-2 rounded border" onClick={() => { setShowAdd(false); setTransferMode(false); }}>Cancel</button>
              <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => { (createTx as any).keepOpenFlag = false; createTx(); }}>Save</button>
              <button className="px-3 py-2 rounded bg-blue-600/80 text-white" onClick={() => { (createTx as any).keepOpenFlag = true; createTx(); }}>Save and add another</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
