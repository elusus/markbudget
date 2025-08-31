from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.budget import Budget
from app.models.payee import Payee


router = APIRouter(prefix="/api/v1/budgets/{budget_id}/payees", tags=["payees"])


@router.get("/", response_model=list[dict])
def list_payees(budget_id: UUID, q: str | None = None, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    query = db.query(Payee).filter_by(budget_id=budget_id)
    if q:
        query = query.filter(Payee.name.ilike(f"%{q}%"))
    rows = query.order_by(Payee.name).limit(100).all()
    return [{"id": r.id, "name": r.name} for r in rows]

