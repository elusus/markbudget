from datetime import date
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel, Field


class SubTxIn(BaseModel):
    category_id: Optional[UUID] = None
    amount_cents: int
    memo: Optional[str] = None


class TxIn(BaseModel):
    account_id: UUID
    date: date
    amount_cents: int  # negative = outflow, positive = inflow
    payee_name: Optional[str] = None
    payee_id: Optional[UUID] = None
    memo: Optional[str] = None
    transfer_account_id: Optional[UUID] = None
    subtransactions: List[SubTxIn] = Field(default_factory=list)
    income_for_month: Optional[date] = None


class TxOut(TxIn):
    id: UUID
    state: str  # 'uncleared'|'cleared'|'reconciled'
