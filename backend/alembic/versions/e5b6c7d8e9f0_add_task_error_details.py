"""add structured generation recovery details

Revision ID: e5b6c7d8e9f0
Revises: d4a1b2c3d4e5
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5b6c7d8e9f0"
down_revision = "d4a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generation_task", sa.Column("error_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("generation_task", "error_details")
