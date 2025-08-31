# YNAB-style Budgeting App — Spec & Build Guide

> A clean-room, feature-parity clone **in spirit** (no copied assets or wording) optimized for vibe-coding: small steps, fast feedback, strong invariants.

---

## 0) What we’re building (MVP → v1)

**MVP**
- Multi-tenant users: email/password auth + optional TOTP 2FA.
- Budgets (1+ per user), month timeline (rolling).
- Accounts (checking, savings, cash, credit, asset/liability) with reconciliation.
- Transactions with splits, transfers, cleared/uncleared/reconciled.
- Categories & groups with monthly Assigned / Activity / Available.
- Goals: monthly target, target by date, target balance.
- Overspending rules (cash vs credit) + **credit card payment category** logic.
- Recurring (scheduled) transactions generator.
- CSV import/export.
- Reports: Spending, Income vs Expense, Net Worth.
- Admin console: users, budgets, audit log.

**Nice-to-have (v1)**
- PWA offline (recent months cached).
- Device sessions, email verification, magic link (optional).
- Webhooks; enhanced auto-categorization; Plaid/Finicity behind a feature flag.

---

## 1) Tech Stack (picked for velocity + reliability)

**Frontend**
- **Next.js 14 (React + TypeScript)**, App Router
- **Tailwind CSS**, Headless UI
- **TanStack Query** (server cache), **Zustand** (ephemeral UI state)
- **Zod** + **React Hook Form**
- **Recharts** for charts
- PWA service worker

**Backend**
- **FastAPI (Python 3.11+)** async + **Pydantic**
- **PostgreSQL 16** (store money as **integer cents**), **SQLAlchemy** + **Alembic**
- **Redis** for cache, rate limiting, and job queue (**RQ** or **Celery**)
- **JWT** (short-lived access + rotating refresh), TOTP 2FA, **Argon2id**
- **Sentry** + **OpenTelemetry** (observability)

**Ops**
- Docker Compose (dev) → GitHub Actions CI → Fly.io/Render/K8s (prod)
- Daily DB backups; feature flags via env/config

> **Why Postgres?** Ledger invariants and reporting are much simpler and safer. If you must use MongoDB later, see §10 for a mapping.

---

## 2) Monorepo layout

/app
/web # Next.js
/api # FastAPI
/infra # docker-compose, migrations, seed data, k6, etc.
/docs # this file + design notes


---

## 3) Quick Start (dev)

```bash
# 1) clone + env
cp infra/.env.example infra/.env

# 2) start services
docker compose up -d

# 3) migrate DB
docker compose exec api alembic upgrade head

# 4) seed (dev budget, sample data)
docker compose exec api python -m app.seeds.dev_seed

# 5) web + api locally
# api: http://localhost:8000/docs  web: http://localhost:3000

Env (infra/.env.example)

POSTGRES_URL=postgresql+psycopg://budget:budget@db:5432/budget
JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
SENTRY_DSN=
REDIS_URL=redis://redis:6379/0
APP_URL=http://localhost:3000
API_URL=http://localhost:8000

4) Architecture Sketch

[ React/Next.js ]  ──HTTP──>  [ FastAPI ]
      │                       │
      │  TanStack Query       ├── SQLAlchemy → [ Postgres ]
      │                       └── RQ/Celery →  [ Workers ] → Redis
      │
   Service Worker (PWA cache)

5) Data Model (relational, minimal fields shown)

    users: id, email*, password_hash, twofa_secret?, created_at, last_login

    budgets: id, owner_user_id→users, name, currency, start_month, archived_at?

    user_budget_roles: (user_id, budget_id, role[owner|editor|viewer])

    accounts: id, budget_id→budgets, name, type, on_budget, last_reconciled_at

    payees: id, budget_id→budgets, name, transfer_account_id?

    category_groups: id, budget_id→budgets, name, sort

    categories: id, budget_id, group_id→category_groups, name, sort, hidden, is_credit_payment

    monthly_category_budget: id, category_id→categories, month, assigned_cents, goal_type, goal_target_cents, goal_target_month, carryover_overspending

    transactions: id, budget_id, account_id→accounts, date, amount_cents (±), state[uncleared|cleared|reconciled], memo, payee_id?, import_id?, transfer_tx_id?, deleted_at?

    subtransactions: id, transaction_id→transactions, category_id→categories, amount_cents, memo?

    scheduled_transactions: id, budget_id, account_id, rrule, template_json, next_occurrence_date

    reconciliations: id, account_id, statement_date, statement_balance_cents, diff_cents, notes?

    rules: id, budget_id, type, action, config_json

    audit_log: id, user_id, budget_id, action, entity_type, entity_id, at, diff_json

Invariants

    Sum(subtransactions.amount_cents) == transactions.amount_cents (for split tx).

    Transfers are paired transactions; deleting one flags the pair.

    Money is integer cents only. No floats. Ever.

6) Budget Math (YNAB-style rules)

Per category × month:

available = carry_in + assigned - activity + adjustments

    Cash overspend → negative available carries into next month (red carry).

    Credit overspend → increases card debt; does not auto-increase CC payment category.

    Credit card payment category:

        Purchases on credit reduce purchase categories.

        Payments reduce card balance and consume from credit-payment category.

    Moves between categories/months are zero-sum adjustments with audit entries.

    Goals

        Monthly: assigned = target suggestion each month.

        By Date: remaining amount / remaining months (ceil).

        Target Balance: top up until available reaches target.

7) API Surface (v1)

Base: /api/v1

Auth

    POST /auth/register

    POST /auth/login → access/refresh JWT

    POST /auth/refresh

    POST /auth/totp/enable|verify

    POST /auth/logout

Budgets

    GET /budgets / POST /budgets

    GET /budgets/{id} / PATCH /budgets/{id} / DELETE

Categories

    GET /budgets/{id}/categories?month=YYYY-MM (groups, categories, assigned/activity/available)

    POST /budgets/{id}/categories/{catId}/assign { month, delta_cents }

    POST /budgets/{id}/categories/{catId}/move { from_month, to_month, amount_cents }

Accounts

    CRUD /budgets/{id}/accounts

Transactions

    GET /budgets/{id}/transactions?since=iso&accountId=...

    POST /budgets/{id}/transactions (single or batch; supports splits)

    PATCH /budgets/{id}/transactions/{txId}

    DELETE /budgets/{id}/transactions/{txId}

    POST /budgets/{id}/transactions/import (CSV) → job id; GET /jobs/{id}

Scheduled

    CRUD /budgets/{id}/scheduled (RRULE); worker materializes due items daily

Reports

    /reports/spending?from=YYYY-MM&to=YYYY-MM

    /reports/net-worth?from=YYYY-MM&to=YYYY-MM

    /metrics/age-of-money?windowDays=90

Headers

    Use ETags on month/category endpoints; clients send If-None-Match.

    Idempotency-Key for batch create/import.

8) Frontend UX (keyboard-first)

    Onboarding: create budget → currency → initial accounts → starter categories → assign dollars.

    Budget view: table (Assigned / Activity / Available), goal pills, “Move Money” dialog, undo/redo.

    Accounts: register with filters, split editor, bulk clear, reconcile wizard.

    Transactions: quick add (Payee autocomplete → last used category), transfers.

    Reports: cards + drill-down tables; CSV export.

    Settings: categories, currency/locale, backup/export, close accounts.

9) Algorithms

Auto-categorization (MVP)

    Deterministic rules (payee match / contains text / amount range)

    Last-used category per payee

    Fallback: “Uncategorized”

Age of Money (FIFO heuristic)

    Track inflow “buckets” (date, amount) when money enters on-budget accounts.

    When spending, consume oldest buckets first.

    AOM = avg age (days) of dollars spent in rolling window (e.g., 90 days).

Scheduled expansion

    Nightly job: find due RRULEs, create real tx atomically, advance next_occurrence_date.

10) If you must use MongoDB later

    Collections: users, budgets, accounts, payees, transactions, category_groups, categories, monthly_category_budget, scheduled, audit_log.

    Embed subtransactions in transactions, and monthly_category_budget inside categories (indexed by month).

    Enforce invariants in service layer. Precompute report docs to avoid heavy $group.

11) Security & Compliance

    Argon2id password hashing; rotate JWTs; revoke on pw change.

    Strict per-budget scoping on every query; never trust client budget_id.

    CSRF protection (if cookie auth), CORS allowlist, tight Content-Security-Policy.

    Audit log for all money-affecting mutations.

    PII minimization, GDPR export/delete.

    Rate limiting (IP + user); WAF/CDN recommended.

12) Testing Strategy

    Unit: budget math, credit flows, transfers, goals, AOM.

    Property-based (Hypothesis): ledger invariants.

    API contract: Schemathesis vs OpenAPI.

    E2E: Playwright (add account → import CSV → assign → pay CC).

    Load: k6 on reports and imports.

13) Milestones (checklists for vibe-coding)
M0 — Scaffolding

Docker Compose (web, api, db, redis)

FastAPI skeleton + health check

Next.js skeleton + auth pages

Alembic migrations baseline

    CI lint/test on PR

M1 — Budgets & Categories

CRUD budgets; roles

Category groups & categories

Month math (Assigned/Activity/Available) + ETag caching

Move Money dialog + audit entries

    Goals (monthly/by-date/target balance)

M2 — Accounts & Transactions

Accounts CRUD + reconcile wizard

Transactions with splits, transfers, flags

Bulk clear/unclear; soft delete

CSV import (dedupe by import_id) + job queue

    Auto-categorization rules (MVP)

M3 — Reports & Metrics

Spending by category (range)

Income vs Expense

Net Worth

    Age of Money (90-day window)

M4 — Scheduled & Workers

RRULE parser + validator

Nightly materialization job

    In-app due warnings

M5 — Polish & Security

TOTP 2FA

Device sessions

Playwright E2E critical paths

    Sentry + tracing + perf pass

14) Developer Prompts (for vibe-coding)

    “Implement POST /budgets/{id}/categories/{catId}/assign so it writes an audit entry and returns the new month rollup with an ETag.”

    “Create SQLAlchemy models for transactions/subtransactions with a check that sum(subs) == parent amount.”

    “Add keyboard shortcuts on the budget table: A assign, M move, G set goal.”

    “Build reconciliation: user inputs statement balance → create delta adjustment transaction if needed.”

    “Write a pure function for credit card payment category availability given a month’s ledger.”

15) Sample Schemas (Pydantic)

# app/schemas/transactions.py
from pydantic import BaseModel, Field
from datetime import date
from typing import List, Optional
class SubTxIn(BaseModel):
    category_id: str
    amount_cents: int
    memo: Optional[str] = None

class TxIn(BaseModel):
    account_id: str
    date: date
    amount_cents: int  # ±
    payee_id: Optional[str] = None
    memo: Optional[str] = None
    transfer_account_id: Optional[str] = None
    subtransactions: List[SubTxIn] = Field(default_factory=list)

class TxOut(TxIn):
    id: str
    state: str  # 'uncleared'|'cleared'|'reconciled'

16) CSV Import Columns (MVP)

date, payee, memo, amount, category, account
# amount: negative = outflow, positive = inflow (we convert to signed cents)

Deduplication key: import_id = f"{account_id}:{date}:{amount_cents}:{payee}:{memo}"
17) License & Branding

    Use your own names, icons, copy. Do not reuse YNAB branding or proprietary assets.

    This is a functional clone — not a visual or trademark clone.