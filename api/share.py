"""Share-token helpers: mint and look up opaque public share links.

A share token is an opaque, URL-safe string that maps to exactly one
itinerary. Tokens are persisted in the ``share_tokens`` table so a generated
link keeps working across a process restart (same DB), and the public lookup
returns a read-only :class:`ItineraryResponse`.

Minting is idempotent per itinerary: asking to share an itinerary that already
has a token returns the existing token rather than minting a duplicate.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import ItineraryRecord, ShareTokenRecord
from api.models import ItineraryResponse
from api.recommend import record_to_response

#: Bytes of entropy for a token; 32 → 43-char URL-safe string (well within the
#: 64-char column). Opaque and unguessable.
_TOKEN_BYTES = 32


def generate_share_token() -> str:
    """Return a fresh opaque, URL-safe share token."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


async def mint_share_token(session: AsyncSession, itinerary_id: str) -> str | None:
    """Mint (or reuse) a share token for a live itinerary.

    Returns the token string, or ``None`` if the itinerary does not exist or is
    soft-deleted. Idempotent: a second call for the same itinerary returns the
    token minted on the first call.
    """
    record = await session.get(ItineraryRecord, itinerary_id)
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
    await session.commit()
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
    soft-deleted.
    """
    share = await session.get(ShareTokenRecord, token)
    if share is None:
        return None
    record = await session.get(ItineraryRecord, share.itinerary_id)
    if record is None or record.deleted_at is not None:
        return None
    return record_to_response(record)
