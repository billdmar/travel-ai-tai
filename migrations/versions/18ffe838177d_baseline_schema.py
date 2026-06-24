"""baseline schema

Captures the schema previously created ad-hoc by ``Base.metadata.create_all``:
``itinerary_records`` (with the explicit-save ``saved_at`` and soft-delete
``deleted_at`` columns) and ``share_tokens`` (opaque public-link tokens with an
``ondelete=CASCADE`` FK to the itinerary and an index on ``itinerary_id``).

Revision ID: 18ffe838177d
Revises:
Create Date: 2026-06-24 16:09:38.834099

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '18ffe838177d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('itinerary_records',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('preferences_json', sa.Text(), nullable=False),
    sa.Column('itinerary_json', sa.Text(), nullable=False),
    sa.Column('provider', sa.String(length=32), nullable=False),
    sa.Column('tokens_used', sa.Integer(), nullable=True),
    sa.Column('saved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('share_tokens',
    sa.Column('token', sa.String(length=64), nullable=False),
    sa.Column('itinerary_id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['itinerary_id'], ['itinerary_records.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('token')
    )
    with op.batch_alter_table('share_tokens', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_share_tokens_itinerary_id'),
            ['itinerary_id'],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('share_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_share_tokens_itinerary_id'))

    op.drop_table('share_tokens')
    op.drop_table('itinerary_records')
