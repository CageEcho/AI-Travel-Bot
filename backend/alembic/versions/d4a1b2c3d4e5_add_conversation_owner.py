"""add conversation owner for row-level access control

Revision ID: d4a1b2c3d4e5
Revises: af351a7a956b
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = "d4a1b2c3d4e5"
down_revision = "af351a7a956b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 历史 M0 数据没有用户归属：统一归给本地演示身份，避免开启鉴权后意外暴露给首个登录用户。
    op.add_column("conversation", sa.Column("owner_id", sa.Text(), nullable=True))
    op.execute("UPDATE conversation SET owner_id = 'local-advisor' WHERE owner_id IS NULL")
    op.alter_column("conversation", "owner_id", nullable=False, server_default="local-advisor")
    op.create_index("ix_conversation_owner_id", "conversation", ["owner_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_conversation_owner_id", table_name="conversation")
    op.drop_column("conversation", "owner_id")
