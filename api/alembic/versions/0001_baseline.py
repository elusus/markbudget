"""baseline schema

Revision ID: 0001_baseline
Revises: 
Create Date: 2025-08-31 00:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

# revision identifiers, used by Alembic.
revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # baseline only (no-op). See 0002_core_schema for tables.
    pass

def downgrade() -> None:
    pass
