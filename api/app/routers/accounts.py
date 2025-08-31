from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.budget import Budget
from app.models.account import Account
from app.schemas.accounts import AccountCreate, AccountPatch, AccountOut
from app.models.transaction import Transaction
from app.models.reconciliation import Reconciliation
from app.schemas.reconcile import ReconcileRequest, ReconcileResponse


router = APIRouter(prefix="/api/v1/budgets/{budget_id}/accounts", tags=["accounts"])


@router.get("/", response_model=list[AccountOut])
def list_accounts(budget_id: UUID, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    return db.query(Account).filter_by(budget_id=budget_id).order_by(Account.name).all()


@router.post("/", response_model=AccountOut, status_code=201)
def create_account(budget_id: UUID, payload: AccountCreate, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    acc = Account(budget_id=budget_id, name=payload.name, type=payload.type, on_budget=payload.on_budget)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(budget_id: UUID, account_id: UUID, payload: AccountPatch, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc or acc.budget_id != budget_id:
        raise HTTPException(404, "Account not found")
    if payload.name is not None:
        acc.name = payload.name
    if payload.on_budget is not None:
        acc.on_budget = payload.on_budget
    db.commit()
    db.refresh(acc)
    return acc


@router.get("/{account_id}/balance", response_model=dict)
def get_account_balance(budget_id: UUID, account_id: UUID, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc or acc.budget_id != budget_id:
        raise HTTPException(404, "Account not found")
    total = (
        db.query(sa.func.coalesce(sa.func.sum(Transaction.amount_cents), 0))
        .filter(Transaction.account_id == account_id, Transaction.deleted_at.is_(None))
        .scalar()
    )
    return {"current_balance_cents": int(total)}


@router.get("/with-balances", response_model=list[dict])
def list_accounts_with_balances(budget_id: UUID, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    # Aggregate balances per account
    subq = (
        db.query(
            Transaction.account_id.label("account_id"),
            sa.func.coalesce(sa.func.sum(Transaction.amount_cents), 0).label("balance")
        )
        .filter(Transaction.deleted_at.is_(None))
        .group_by(Transaction.account_id)
        .subquery()
    )
    rows = (
        db.query(
            Account.id,
            Account.name,
            Account.type,
            Account.on_budget,
            sa.func.coalesce(subq.c.balance, 0).label("current_balance_cents"),
        )
        .outerjoin(subq, subq.c.account_id == Account.id)
        .filter(Account.budget_id == budget_id)
        .order_by(Account.name)
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "type": r.type,
            "on_budget": r.on_budget,
            "current_balance_cents": int(getattr(r, "current_balance_cents", 0) or 0),
        }
        for r in rows
    ]


@router.post("/{account_id}/reconcile", response_model=ReconcileResponse)
def reconcile_account(
    budget_id: UUID,
    account_id: UUID,
    payload: ReconcileRequest,
    db: Session = Depends(get_db),
):
    acc = db.get(Account, account_id)
    if not acc or acc.budget_id != budget_id:
        raise HTTPException(404, "Account not found")
    current = (
        db.query(sa.func.coalesce(sa.func.sum(Transaction.amount_cents), 0))
        .filter(Transaction.account_id == account_id, Transaction.deleted_at.is_(None))
        .scalar()
    )
    diff = int(payload.statement_balance_cents) - int(current)
    adj_id = None
    if diff != 0:
        # Create adjustment transaction
        t = Transaction(
            budget_id=budget_id,
            account_id=account_id,
            date=payload.statement_date,
            amount_cents=diff,
            memo=(payload.notes or "Reconciliation Adjustment"),
            state="reconciled",
        )
        db.add(t)
        db.flush()
        adj_id = t.id

    # Record reconciliation
    rec = Reconciliation(
        account_id=account_id,
        statement_date=payload.statement_date,
        statement_balance_cents=payload.statement_balance_cents,
        diff_cents=diff,
        notes=payload.notes,
    )
    db.add(rec)
    db.commit()
    return ReconcileResponse(
        account_id=account_id,
        statement_date=payload.statement_date,
        statement_balance_cents=payload.statement_balance_cents,
        current_balance_cents=int(current),
        diff_cents=diff,
        adjustment_tx_id=adj_id,
    )
