"""
dependencies/auth.py
-----------------------------------------------------------------------
`get_current_user` is the one dependency every protected route uses. It
never trusts anything the extension claims about who it is - it verifies
the bearer token's signature/expiry and pulls the user id out of the
verified `sub` claim.
-----------------------------------------------------------------------
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import InvalidTokenError, decode_supabase_jwt
from app.db.database import get_db
from app.models.user import User
from app.services.auth_service import get_or_create_user


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header. Expected 'Bearer <token>'.",
        )
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_bearer_token(authorization)
    try:
        claims = decode_supabase_jwt(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired session: {exc}",
        ) from exc

    return get_or_create_user(db, claims)
