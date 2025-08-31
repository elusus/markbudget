from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, constr


class BudgetCreate(BaseModel):
    name: constr(min_length=1, max_length=200)
    currency: constr(min_length=3, max_length=3) = "USD"
    start_month: date = Field(description="First day of the month")


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    currency: str
    start_month: date
    created_at: datetime

