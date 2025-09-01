from datetime import date
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, constr


class CategoryGroupCreate(BaseModel):
    name: constr(min_length=1, max_length=200)
    sort: int = 0


class CategoryCreate(BaseModel):
    group_id: UUID
    name: constr(min_length=1, max_length=200)
    sort: int = 0
    hidden: bool = False
    is_credit_payment: bool = False


class CategoryGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    sort: int


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    group_id: UUID
    name: str
    sort: int
    hidden: bool
    is_credit_payment: bool


class CategoryMonthOut(BaseModel):
    category_id: UUID
    month: date
    assigned_cents: int
    activity_cents: int
    available_cents: int


class CategoriesMonthResponse(BaseModel):
    month: date
    groups: list[CategoryGroupOut]
    categories: list[CategoryOut]
    months: list[CategoryMonthOut]
    available_to_budget_cents: int


class AssignRequest(BaseModel):
    month: date = Field(description="Month (first day)")
    delta_cents: int


class MoveMonthRequest(BaseModel):
    from_month: date
    to_month: date
    amount_cents: int


class MoveBetweenCategoriesRequest(BaseModel):
    month: date
    from_category_id: UUID
    to_category_id: UUID
    amount_cents: int


class CategoryPatch(BaseModel):
    name: constr(min_length=1, max_length=200) | None = None
    hidden: bool | None = None


class CategoryGroupPatch(BaseModel):
    name: constr(min_length=1, max_length=200) | None = None
