"""add income_month to transactions

Revision ID: 0004_add_income_month
Revises: 0003_m2_accounts_transactions
Create Date: 2025-08-31 20:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0004_add_income_month"
down_revision = "0003_m2_accounts_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("income_month", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "income_month")

