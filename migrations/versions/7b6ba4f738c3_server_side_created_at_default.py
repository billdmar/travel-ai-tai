"""server-side created_at default

Make the database authoritative for ``itinerary_records.created_at`` by adding
a ``server_default`` of ``now()``. Previously the application stamped the
timestamp in Python at insert time (api/recommend.py); moving it to the DB makes
the value consistent across app instances and immune to client clock skew. The
column stays ``DateTime(timezone=True)`` and ``NOT NULL`` — existing rows keep
their stamped timestamps untouched; only the *default* for future inserts that
omit the column changes.

Autogenerate does not emit this (server-default comparison is off, and SQLite
cannot ALTER a default in place), so it is hand-written. ``batch_alter_table``
makes the change round-trip on SQLite (it recreates the table with the new
default) while issuing a plain ``ALTER COLUMN ... SET DEFAULT`` on Postgres. The
ORM model mirrors this with ``server_default=func.now()`` (api/db.py).

Revision ID: 7b6ba4f738c3
Revises: 8764fbf9fcd2
Create Date: 2026-06-24 18:41:12.773137

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7b6ba4f738c3'
down_revision: Union[str, Sequence[str], None] = '8764fbf9fcd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: stamp created_at from the DB clock by default."""
    with op.batch_alter_table('itinerary_records', schema=None) as batch_op:
        batch_op.alter_column(
            'created_at',
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=sa.func.now(),
        )


def downgrade() -> None:
    """Downgrade schema: drop the server-side default."""
    with op.batch_alter_table('itinerary_records', schema=None) as batch_op:
        batch_op.alter_column(
            'created_at',
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=None,
        )
