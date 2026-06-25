"""Share-token helpers: mint and look up opaque public share links.

A share token is an opaque, URL-safe string that maps to exactly one
itinerary. Tokens are persisted in the ``share_tokens`` table so a generated
link keeps working across a process restart (same DB), and the public lookup
returns a read-only :class:`ItineraryResponse`.

Minting is idempotent per itinerary: asking to share an itinerary that already
has a token returns the existing token rather than minting a duplicate.
"""

from __future__ import annotations

import asyncio
import secrets
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import ItineraryRecord, ShareTokenRecord
from api.models import ItineraryResponse
from api.recommend import record_to_response

#: Bytes of entropy for a token; 32 → 43-char URL-safe string (well within the
#: 64-char column). Opaque and unguessable.
_TOKEN_BYTES = 32

#: Per-itinerary in-process locks serializing concurrent mints within a single
#: worker. The DB row lock (``with_for_update``) handles cross-process / cross-
#: worker races on Postgres, but it is a no-op on SQLite; this lock closes the
#: check-then-act window for two requests sharing one event loop regardless of
#: backend. Keyed by itinerary id, created on first use. ``defaultdict`` keeps
#: this allocation-free and lock-free at the call site (dict access is atomic
#: under the GIL / single-threaded event loop).
_mint_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def generate_share_token() -> str:
    """Return a fresh opaque, URL-safe share token."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


async def mint_share_token(session: AsyncSession, itinerary_id: str) -> str | None:
    """Mint (or reuse) a share token for a live itinerary.

    Returns the token string, or ``None`` if the itinerary does not exist or is
    soft-deleted. Idempotent: a second call for the same itinerary returns the
    token minted on the first call.

    Concurrency: minting is a check-then-act (look for an existing token, else
    insert), so two simultaneous share clicks could both pass the check and both
    insert — and because ``share_tokens.itinerary_id`` carries only a *non*-unique
    index, the duplicate is silently accepted by the DB rather than rejected,
    breaking the documented per-itinerary idempotency. Three layers guard it:

    1. A per-itinerary :class:`asyncio.Lock` serializes mints sharing one event
       loop / worker so the second caller observes the first's committed token.
    2. ``with_for_update=True`` takes a ``SELECT ... FOR UPDATE`` row lock on the
       parent itinerary, serializing concurrent mints *across* workers/processes
       on Postgres (prod). It is a no-op on SQLite (the test backend), which is
       why layer 1 carries the in-process case the tests exercise.
    3. A belt-and-suspenders ``IntegrityError`` fallback: if a constraint ever
       does reject the insert (e.g. the token primary key, or a unique index a
       future migration adds on ``itinerary_id``), roll back and return the token
       the winning request already committed instead of surfacing a 500.
    """
    async with _mint_locks[itinerary_id]:
        # Row-lock the parent before the existence check so a concurrent mint on
        # another connection blocks here (Postgres) until we commit or roll back.
        record = await session.get(
            ItineraryRecord, itinerary_id, with_for_update=True
        )
        if record is None or record.deleted_at is not None:
            return None

        existing = await session.scalar(
            select(ShareTokenRecord).where(
                ShareTokenRecord.itinerary_id == itinerary_id
            )
        )
        if existing is not None:
            return existing.token

        token = generate_share_token()
        session.add(
            ShareTokenRecord(
                token=token,
                itinerary_id=itinerary_id,
                created_at=datetime.now(timezone.utc),
            )
        )
        try:
            await session.commit()
        except IntegrityError:
            # A racing request beat us to the insert and a constraint rejected
            # ours. Roll back and return the token that already won.
            await session.rollback()
            winner = await session.scalar(
                select(ShareTokenRecord).where(
                    ShareTokenRecord.itinerary_id == itinerary_id
                )
            )
            return winner.token if winner is not None else None
        return token


async def delete_tokens_for_itinerary(
    session: AsyncSession, itinerary_id: str
) -> None:
    """Delete every share token pointing at ``itinerary_id``.

    Called when an itinerary is (soft-)deleted so its public share links stop
    resolving. The caller owns the surrounding transaction; this issues the
    DELETE but does not commit.
    """
    await session.execute(
        delete(ShareTokenRecord).where(
            ShareTokenRecord.itinerary_id == itinerary_id
        )
    )


async def lookup_share_token(
    session: AsyncSession, token: str
) -> ItineraryResponse | None:
    """Resolve a share token to its read-only itinerary response.

    Returns ``None`` if the token is unknown or its itinerary has since been
    soft-deleted. The ``deleted_at IS NULL`` filter is applied in the query so a
    soft-deleted parent never resolves, independent of the delete-time token
    cleanup — defense in depth.
    """
    record = await session.scalar(
        select(ItineraryRecord)
        .join(ShareTokenRecord, ShareTokenRecord.itinerary_id == ItineraryRecord.id)
        .where(
            ShareTokenRecord.token == token,
            ItineraryRecord.deleted_at.is_(None),
        )
    )
    if record is None:
        return None
    return record_to_response(record)
