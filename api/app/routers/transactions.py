from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, aliased
from sqlalchemy import and_, or_

from app.db import get_db
from app.models.budget import Budget
from app.models.account import Account
from app.models.payee import Payee
from app.models.transaction import Transaction, SubTransaction
from app.schemas.transactions import TxIn, TxOut


router = APIRouter(prefix="/api/v1/budgets/{budget_id}/transactions", tags=["transactions"])


@router.get("/", response_model=list[TxOut])
def list_transactions(
    budget_id: UUID,
    db: Session = Depends(get_db),
    account_id: UUID | None = None,
    since: date | None = None,
):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    # Join payee for name and paired transfer to expose other account id
    other = aliased(Transaction)
    q = (
        db.query(
            Transaction,
            Payee.name.label("payee_name"),
            other.account_id.label("other_account_id"),
        )
        .outerjoin(Payee, Transaction.payee_id == Payee.id)
        .outerjoin(other, Transaction.transfer_tx_id == other.id)
        .filter(Transaction.budget_id == budget_id)
        .filter(Transaction.deleted_at.is_(None))
    )
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if since:
        q = q.filter(Transaction.date >= since)
    q = q.order_by(Transaction.date.desc(), Transaction.id.desc())
    items = q.limit(500).all()
    out: list[TxOut] = []
    for t, payee_name, other_account_id in items:
        out.append(
            TxOut(
                id=t.id,
                account_id=t.account_id,
                date=t.date,
                amount_cents=t.amount_cents,
                payee_id=t.payee_id,
                payee_name=payee_name,
                memo=t.memo,
                transfer_account_id=other_account_id,
                subtransactions=[
                    {
                        "category_id": st.category_id,
                        "amount_cents": st.amount_cents,
                        "memo": st.memo,
                    }
                    for st in t.subtransactions
                ],
                state=t.state,
            )
        )
    return out


def _get_or_create_payee(db: Session, budget_id: UUID, name: str | None, payee_id: UUID | None) -> UUID | None:
    if payee_id:
        p = db.get(Payee, payee_id)
        if not p or p.budget_id != budget_id:
            raise HTTPException(400, "Invalid payee_id")
        return p.id
    if not name:
        return None
    p = db.query(Payee).filter_by(budget_id=budget_id, name=name).one_or_none()
    if p:
        return p.id
    p = Payee(budget_id=budget_id, name=name)
    db.add(p)
    db.flush()
    return p.id


@router.post("/", response_model=TxOut, status_code=201)
def create_transaction(budget_id: UUID, payload: TxIn, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    acc = db.get(Account, payload.account_id)
    if not acc or acc.budget_id != budget_id:
        raise HTTPException(400, "Invalid account")

    # Transfers: create pair and link
    if payload.transfer_account_id:
        other = db.get(Account, payload.transfer_account_id)
        if not other or other.budget_id != budget_id:
            raise HTTPException(400, "Invalid transfer account")
        if payload.subtransactions:
            raise HTTPException(400, "Transfer cannot have subtransactions")
        t1 = Transaction(
            budget_id=budget_id,
            account_id=payload.account_id,
            date=payload.date,
            amount_cents=payload.amount_cents,
            memo=payload.memo,
            state="uncleared",
        )
        t2 = Transaction(
            budget_id=budget_id,
            account_id=payload.transfer_account_id,
            date=payload.date,
            amount_cents=-payload.amount_cents,
            memo=payload.memo,
            state="uncleared",
        )
        db.add_all([t1, t2])
        db.flush()
        t1.transfer_tx_id = t2.id
        t2.transfer_tx_id = t1.id
        db.commit()
        db.refresh(t1)
        return TxOut(
            id=t1.id,
            account_id=t1.account_id,
            date=t1.date,
            amount_cents=t1.amount_cents,
            payee_id=None,
            payee_name=None,
            memo=t1.memo,
            transfer_account_id=other.id,
            subtransactions=[],
            state=t1.state,
        )

    # Normal transaction (optionally split or income)
    payee_id = _get_or_create_payee(db, budget_id, payload.payee_name, payload.payee_id)
    t = Transaction(
        budget_id=budget_id,
        account_id=payload.account_id,
        date=payload.date,
        amount_cents=payload.amount_cents,
        memo=payload.memo,
        payee_id=payee_id,
        state="uncleared",
    )
    if payload.income_for_month is not None:
        t.income_month = payload.income_for_month.replace(day=1)
    db.add(t)
    db.flush()

    if payload.subtransactions and payload.income_for_month is None:
        total = sum(st.amount_cents for st in payload.subtransactions)
        if total != payload.amount_cents:
            raise HTTPException(400, "Split amounts must sum to transaction amount")
        for st in payload.subtransactions:
            db.add(
                SubTransaction(
                    transaction_id=t.id,
                    category_id=st.category_id,
                    amount_cents=st.amount_cents,
                    memo=st.memo,
                )
            )

    db.commit()
    db.refresh(t)

    return TxOut(
        id=t.id,
        account_id=t.account_id,
        date=t.date,
        amount_cents=t.amount_cents,
        payee_id=t.payee_id,
        payee_name=payload.payee_name,
        memo=t.memo,
        transfer_account_id=None,
        subtransactions=[
            {
                "category_id": st.category_id,
                "amount_cents": st.amount_cents,
                "memo": st.memo,
            }
            for st in t.subtransactions
        ],
        state=t.state,
    )


@router.patch("/{tx_id}", response_model=TxOut)
def patch_transaction(budget_id: UUID, tx_id: UUID, payload: dict, db: Session = Depends(get_db)):
    t = db.get(Transaction, tx_id)
    if not t or t.budget_id != budget_id:
        raise HTTPException(404, "Transaction not found")
    # If it's a transfer, only allow memo/state edits for now
    is_transfer = bool(t.transfer_tx_id)

    # Update state
    state = payload.get("state")
    if state is not None:
        if state not in {"uncleared", "cleared", "reconciled"}:
            raise HTTPException(400, "Invalid state")
        t.state = state
    # Update memo
    if "memo" in payload:
        t.memo = payload["memo"]

    # Payee changes
    if not is_transfer:
        if "payee_id" in payload or "payee_name" in payload:
            payee_id = payload.get("payee_id")
            payee_name = payload.get("payee_name")
            if payee_id is not None:
                p = db.get(Payee, payee_id)
                if not p or p.budget_id != budget_id:
                    raise HTTPException(400, "Invalid payee_id")
                t.payee_id = p.id
            elif payee_name is not None:
                pid = _get_or_create_payee(db, budget_id, payee_name, None)
                t.payee_id = pid

    # Date
    if "date" in payload and not is_transfer:
        t.date = payload["date"]

    # Amount
    if "amount_cents" in payload and not is_transfer:
        try:
            t.amount_cents = int(payload["amount_cents"])
        except Exception:
            raise HTTPException(400, "amount_cents must be int")

    # Category (only for non-split, non-transfer): we ensure a single subtransaction mirrors the amount
    if "category_id" in payload and not is_transfer:
        cat_id = payload["category_id"]
        # Allow None to clear category
        subs = list(t.subtransactions)
        if len(subs) > 1:
            raise HTTPException(400, "Cannot set category on split transaction")
        if len(subs) == 0:
            if cat_id is not None:
                db.add(SubTransaction(transaction_id=t.id, category_id=cat_id, amount_cents=t.amount_cents))
        else:
            subs[0].category_id = cat_id
            subs[0].amount_cents = t.amount_cents

    # Income month (set/clear). If set, remove any categorization subs
    if "income_for_month" in payload and not is_transfer:
        d = payload["income_for_month"]
        if d is None:
            t.income_month = None
        else:
            t.income_month = d.replace(day=1)
        if t.income_month is not None:
            for st in list(t.subtransactions):
                db.delete(st)

    db.commit()
    db.refresh(t)
    payee_name = db.query(Payee.name).filter(Payee.id == t.payee_id).scalar()
    return TxOut(
        id=t.id,
        account_id=t.account_id,
        date=t.date,
        amount_cents=t.amount_cents,
        payee_id=t.payee_id,
        payee_name=payee_name,
        memo=t.memo,
        transfer_account_id=t.transfer_tx_id,
        subtransactions=[
            {
                "category_id": st.category_id,
                "amount_cents": st.amount_cents,
                "memo": st.memo,
            }
            for st in t.subtransactions
        ],
        state=t.state,
    )


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(budget_id: UUID, tx_id: UUID, db: Session = Depends(get_db)):
    t = db.get(Transaction, tx_id)
    if not t or t.budget_id != budget_id:
        raise HTTPException(404, "Transaction not found")
    # Soft delete
    from datetime import datetime as _dt

    t.deleted_at = _dt.utcnow()
    # If transfer, also delete counterpart
    if t.transfer_tx_id:
        other = db.get(Transaction, t.transfer_tx_id)
        if other:
            other.deleted_at = _dt.utcnow()
    db.commit()
    return
