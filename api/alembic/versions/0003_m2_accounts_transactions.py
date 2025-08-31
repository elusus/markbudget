"""m2 accounts and transactions

Revision ID: 0003_m2_accounts_transactions
Revises: 0002_core_schema
Create Date: 2025-08-31 18:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

# revision identifiers, used by Alembic.
revision = "0003_m2_accounts_transactions"
down_revision = "0002_core_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # accounts
    op.create_table(
        "accounts",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("budget_id", pg.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False, server_default="checking"),
        sa.Column("on_budget", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # payees
    op.create_table(
        "payees",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("budget_id", pg.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("transfer_account_id", pg.UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
    )

    # transactions
    op.create_table(
        "transactions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("budget_id", pg.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", pg.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False, server_default="uncleared"),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("payee_id", pg.UUID(as_uuid=True), sa.ForeignKey("payees.id"), nullable=True),
        sa.Column("import_id", sa.String(length=255), nullable=True),
        sa.Column("transfer_tx_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_transactions_budget_date", "transactions", ["budget_id", "date"])
    op.create_index("ix_transactions_account_date", "transactions", ["account_id", "date"])

    # subtransactions
    op.create_table(
        "subtransactions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("transaction_id", pg.UUID(as_uuid=True), sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", pg.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
    )
    op.create_index("ix_subtransactions_tx", "subtransactions", ["transaction_id"])

    # reconciliations
    op.create_table(
        "reconciliations",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("account_id", pg.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("statement_balance_cents", sa.Integer(), nullable=False),
        sa.Column("diff_cents", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("reconciliations")
    op.drop_index("ix_subtransactions_tx", table_name="subtransactions")
    op.drop_table("subtransactions")
    op.drop_index("ix_transactions_account_date", table_name="transactions")
    op.drop_index("ix_transactions_budget_date", table_name="transactions")
    op.drop_table("transactions")
    op.drop_table("payees")
    op.drop_table("accounts")

