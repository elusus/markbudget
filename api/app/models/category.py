import uuid
from datetime import date, datetime
from sqlalchemy import String, Integer, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base


class CategoryGroup(Base):
    __tablename__ = "category_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    budget_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    categories: Mapped[list["Category"]] = relationship(back_populates="group", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    budget_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False)
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("category_groups.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_credit_payment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    group: Mapped[CategoryGroup] = relationship(back_populates="categories")


class MonthlyCategoryBudget(Base):
    __tablename__ = "monthly_category_budget"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True)
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    assigned_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    goal_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    goal_target_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    goal_target_month: Mapped[date | None] = mapped_column(Date, nullable=True)
    carryover_overspending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

