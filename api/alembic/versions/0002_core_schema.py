"""core schema

Revision ID: 0002_core_schema
Revises: 0001_baseline
Create Date: 2025-08-31 17:30:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

# revision identifiers, used by Alembic.
revision = "0002_core_schema"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # budgets
    op.create_table(
        "budgets",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("start_month", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # category_groups
    op.create_table(
        "category_groups",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("budget_id", pg.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
    )

    # categories
    op.create_table(
        "categories",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("budget_id", pg.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", pg.UUID(as_uuid=True), sa.ForeignKey("category_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_credit_payment", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # monthly_category_budget
    op.create_table(
        "monthly_category_budget",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("category_id", pg.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("assigned_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("goal_type", sa.String(length=32), nullable=True),
        sa.Column("goal_target_cents", sa.Integer(), nullable=True),
        sa.Column("goal_target_month", sa.Date(), nullable=True),
        sa.Column("carryover_overspending", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_mcb_category_id", "monthly_category_budget", ["category_id"])
    op.create_index("ix_mcb_month", "monthly_category_budget", ["month"])

    # audit log
    op.create_table(
        "audit_log",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("budget_id", pg.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("diff_json", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_index("ix_mcb_month", table_name="monthly_category_budget")
    op.drop_index("ix_mcb_category_id", table_name="monthly_category_budget")
    op.drop_table("monthly_category_budget")
    op.drop_table("categories")
    op.drop_table("category_groups")
    op.drop_table("budgets")

