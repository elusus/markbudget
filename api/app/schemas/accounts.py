from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, constr


class AccountCreate(BaseModel):
    name: constr(min_length=1, max_length=200)
    type: constr(min_length=2, max_length=32) = "checking"
    on_budget: bool = True


class AccountPatch(BaseModel):
    name: constr(min_length=1, max_length=200) | None = None
    on_budget: bool | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    type: str
    on_budget: bool

