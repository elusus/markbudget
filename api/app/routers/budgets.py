from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.budget import Budget
from app.schemas.budgets import BudgetCreate, BudgetOut


router = APIRouter(prefix="/api/v1/budgets", tags=["budgets"])


@router.get("/", response_model=list[BudgetOut])
def list_budgets(db: Session = Depends(get_db)):
    return db.query(Budget).order_by(Budget.created_at.desc()).all()


@router.post("/", response_model=BudgetOut, status_code=201)
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db)):
    # Ensure start_month is normalized to first day of month
    sm = payload.start_month.replace(day=1)
    b = Budget(name=payload.name, currency=payload.currency.upper(), start_month=sm)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b

