"""add account.note column

Revision ID: 0005_add_account_note
Revises: 0004_add_income_month
Create Date: 2025-09-01 00:00:00

"""
from alembic import op
import sqlalchemy as sa

revision = "0005_add_account_note"
down_revision = "0004_add_income_month"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "note")

