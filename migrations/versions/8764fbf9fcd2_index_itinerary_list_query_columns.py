"""index itinerary list query columns

Adds two single-column indexes on ``itinerary_records`` that back the Saved
list endpoint (``GET /api/v1/itineraries``), whose query is
``WHERE deleted_at IS NULL AND saved_at IS NOT NULL ORDER BY created_at DESC``
(see ``api/routes/itineraries.py`` ``list_itineraries``):

* ``ix_itinerary_records_saved_at`` — backs the ``saved_at IS NOT NULL`` filter
  so the (potentially many) unsaved drafts are skipped via the index.
* ``ix_itinerary_records_created_at`` — backs the ``ORDER BY created_at DESC``
  so the most-recent page is served from the index rather than a full sort.

Index creation is plain DDL (no SQLite copy-and-move needed), so this avoids
``batch_alter_table``. ``if_not_exists`` / ``if_exists`` make both directions
idempotent on SQLite and Postgres — safe to re-run against a DB that already
has (or lacks) the index. These index definitions are mirrored on the ORM model
(``index=True`` in ``api/db.py``) so ``create_all`` and autogenerate agree.

Revision ID: 8764fbf9fcd2
Revises: 18ffe838177d
Create Date: 2026-06-24 18:37:53.770555

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8764fbf9fcd2'
down_revision: Union[str, Sequence[str], None] = '18ffe838177d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        op.f('ix_itinerary_records_saved_at'),
        'itinerary_records',
        ['saved_at'],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        op.f('ix_itinerary_records_created_at'),
        'itinerary_records',
        ['created_at'],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_itinerary_records_created_at'),
        table_name='itinerary_records',
        if_exists=True,
    )
    op.drop_index(
        op.f('ix_itinerary_records_saved_at'),
        table_name='itinerary_records',
        if_exists=True,
    )
