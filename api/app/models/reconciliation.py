import uuid
from datetime import date
from sqlalchemy import Integer, Date, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from .base import Base


class Reconciliation(Base):
    __tablename__ = "reconciliations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    statement_balance_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    diff_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

