"""curated destinations table and seed

Creates the ``destinations`` table backing ``GET /api/v1/destinations/curated``
and seeds it with the curated Explore atlas (previously a hardcoded frontend
array, see web/src/components/explore/destinations.ts). The table mirrors the
ORM model in ``api/db.py`` (slug PK, name/country/query/tagline/best_season
text, ``vibes``/``story`` JSON arrays, and an indexed ``sort_order`` capturing
the gallery's editorial ordering) so ``create_all`` (dev/test) and autogenerate
agree — the ``test_no_model_drift_after_upgrade`` smoke test enforces that.

Seed rows are sourced from the single canonical list in
``api/seed_destinations.py`` (shared with the SQLite/dev startup seed) so the
data never diverges between the migration and the app. The JSON column type
serializes the ``vibes``/``story`` lists for both SQLite (TEXT) and Postgres.
``ix_destinations_sort_order`` backs the endpoint's ``ORDER BY sort_order``.

Revision ID: e3ab67743567
Revises: 7b6ba4f738c3
Create Date: 2026-06-24 19:40:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from api.seed_destinations import seed_rows

# revision identifiers, used by Alembic.
revision: str = 'e3ab67743567'
down_revision: Union[str, Sequence[str], None] = '7b6ba4f738c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: create + seed the curated ``destinations`` table."""
    destinations = op.create_table(
        'destinations',
        sa.Column('slug', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('country', sa.String(length=128), nullable=False),
        sa.Column('query', sa.String(length=128), nullable=False),
        sa.Column('tagline', sa.Text(), nullable=False),
        sa.Column('best_season', sa.Text(), nullable=False),
        sa.Column('vibes', sa.JSON(), nullable=False),
        sa.Column('story', sa.JSON(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('slug'),
    )
    op.create_index(
        op.f('ix_destinations_sort_order'),
        'destinations',
        ['sort_order'],
        unique=False,
        if_not_exists=True,
    )
    # Reuse the canonical seed list so migration and app never diverge. The JSON
    # column type serializes the vibes/story lists on insert.
    op.bulk_insert(destinations, seed_rows())


def downgrade() -> None:
    """Downgrade schema: drop the index and the table."""
    op.drop_index(
        op.f('ix_destinations_sort_order'),
        table_name='destinations',
        if_exists=True,
    )
    op.drop_table('destinations')
