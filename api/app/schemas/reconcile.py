from datetime import date
from uuid import UUID
from pydantic import BaseModel, Field


class ReconcileRequest(BaseModel):
    statement_date: date
    statement_balance_cents: int
    notes: str | None = None


class ReconcileResponse(BaseModel):
    account_id: UUID
    statement_date: date
    statement_balance_cents: int
    current_balance_cents: int
    diff_cents: int
    adjustment_tx_id: UUID | None = None

