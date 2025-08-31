"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Account = { id: string; name: string; type: string; on_budget: boolean; current_balance_cents?: number };

const TYPE_OPTIONS = [
  "Checking",
  "Savings",
  "Credit Card",
  "Cash",
  "Line of Credit or Other Credit",
  "Paypal",
  "Merchant Account",
  "Investment Account",
  "Mortgage",
  "Other Asset (House, Car, etc)",
  "Other Loan or Liability",
];

function mapType(label: string): string {
  switch (label) {
    case "Checking":
      return "checking";
    case "Savings":
      return "savings";
    case "Credit Card":
      return "credit";
    case "Cash":
      return "cash";
    case "Line of Credit or Other Credit":
      return "credit";
    case "Paypal":
      return "cash";
    case "Merchant Account":
      return "asset";
    case "Investment Account":
      return "asset";
    case "Mortgage":
      return "liability";
    case "Other Asset (House, Car, etc)":
      return "asset";
    case "Other Loan or Liability":
      return "liability";
    default:
      return "checking";
  }
}

export default function Sidebar({ budgetId }: { budgetId: string }) {
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("0.00");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [typeLabel, setTypeLabel] = useState("");
  const [onBudget, setOnBudget] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/with-balances`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Accounts load failed (${res.status})`);
      setAccounts(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load accounts");
    }
  };

  useEffect(() => {
    load();
    const onRefresh = () => load();
    const onFocus = () => load();
    if (typeof window !== 'undefined') {
      window.addEventListener('accounts:refresh', onRefresh as any);
      window.addEventListener('focus', onFocus as any);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('accounts:refresh', onRefresh as any);
        window.removeEventListener('focus', onFocus as any);
      }
    };
  }, [budgetId]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const apiType = mapType(typeLabel || "Checking");
      const res = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/accounts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: apiType, on_budget: onBudget }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const acc: Account = await res.json();

      // Starting balance transaction if non-zero
      const cents = Math.round((parseFloat(balance) || 0) * 100);
      if (cents !== 0) {
        const txRes = await fetch(`${API_URL}/api/v1/budgets/${budgetId}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: acc.id,
            date: dateStr,
            amount_cents: cents,
            payee_name: "Starting Balance",
            memo: "Starting balance",
            subtransactions: [],
          }),
        });
        if (!txRes.ok) throw new Error(`Starting balance failed (${txRes.status})`);
      }

      setShowModal(false);
      setName("");
      setBalance("0.00");
      setTypeLabel("");
      setOnBudget(true);
      await load();
    } catch (e: any) {
      setSubmitError(e.message || "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  const fmtMoney = (cents?: number) => {
    const v = ((cents ?? 0) / 100) || 0;
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Determine active account from pathname
  const activeAccountId = useMemo(() => {
    const parts = (pathname || "").split("/");
    const idx = parts.indexOf("accounts");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return null;
  }, [pathname]);

  return (
    <aside className="h-screen sticky top-0 w-72 bg-sidebar shadow-xl text-white flex flex-col">
      <div className="px-4 py-4 text-lg font-semibold">MarkBudget</div>

      <nav className="px-2 space-y-1">
        <Link href={`/b/${budgetId}`} className={`sidebar-link ${pathname?.endsWith(`/b/${budgetId}`) ? 'bg-sidebarLight' : ''}`}>🏠 Budget</Link>
        <Link href={`/b/${budgetId}/reports`} className={`sidebar-link ${pathname?.includes(`/b/${budgetId}/reports`) ? 'bg-sidebarLight' : ''}`}>📊 Reports</Link>
        <Link href={`/b/${budgetId}/accounts`} className={`sidebar-link ${pathname?.includes(`/b/${budgetId}/accounts`) && !activeAccountId ? 'bg-sidebarLight' : ''}`}>💳 All Accounts</Link>
      </nav>

      <div className="sidebar-section-title">Budget Accounts</div>
      <div className="px-2 pb-4 overflow-y-auto">
        {error ? (
          <div className="px-3 text-sm text-red-200">{error}</div>
        ) : accounts.length === 0 ? (
          <div className="px-3 text-sm text-white/70">No accounts yet</div>
        ) : (
          <ul className="space-y-1">
            {accounts.filter(a => a.on_budget).map((a) => (
              <li key={a.id}>
                <Link href={`/b/${budgetId}/accounts/${a.id}`} className={`account-item ${activeAccountId === a.id ? 'bg-sidebarLight' : ''}`}>
                  <span className="truncate">{a.name}</span>
                  <span className={`${(a.current_balance_cents ?? 0) < 0 ? 'text-red-200' : 'text-white/80'} tabular-nums`}>{fmtMoney(a.current_balance_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          <button className="w-full bg-sidebarDark hover:bg-sidebarLight text-white rounded py-2" onClick={() => setShowModal(true)}>
            + Add Account
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="bg-white text-gray-900 rounded-md shadow-2xl w-full max-w-lg">
            <div className="px-4 py-3 bg-gray-100 border-b text-lg font-semibold">Create a New Account</div>
            <form onSubmit={onCreate} className="p-4">
              <div className="space-y-1">
                <label className="block text-sm text-gray-600">Name:</label>
                <input className="mt-1 w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="my-3 border-t" />
              <div className="grid grid-cols-2 gap-4 items-start">
                <div>
                  <label className="block text-sm text-gray-600">Current Balance:</label>
                  <input className="mt-1 w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
                  <div className="text-xs text-gray-500 mt-1">You can always change this later</div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Date of Current Balance:</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="date" className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
                    <span className="text-gray-400">📅</span>
                  </div>
                </div>
              </div>
              <div className="my-3 border-t" />
              <div>
                <label className="block text-sm text-gray-600">Type:</label>
                <select className="mt-1 w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} required>
                  <option value="" disabled>Select an Account Type...</option>
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="my-3 border-t" />
              <div className="space-y-2">
                <label className="flex items-start gap-2">
                  <input type="radio" name="onBudget" checked={onBudget} onChange={() => setOnBudget(true)} />
                  <span>
                    <span className="font-medium">Budget Account</span> — This account should affect my budget
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="onBudget" checked={!onBudget} onChange={() => setOnBudget(false)} />
                  <span>
                    <span className="font-medium">Off‑Budget</span> — This account should not affect my budget
                  </span>
                </label>
              </div>
              {submitError ? <div className="text-sm text-red-600 mt-2">{submitError}</div> : null}
              <div className="flex justify-end gap-2 pt-3 mt-4 border-t">
                <button type="button" className="px-3 py-2 rounded border bg-gray-100 hover:bg-gray-200 text-gray-800" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50" disabled={submitting}>Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
