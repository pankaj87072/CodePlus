"""
api/auth.py
-----------------------------------------------------------------------
Deliberately thin: `get_current_user` already does the token verification
+ upsert. This router just exposes that as a callable endpoint so the
extension can confirm "yes, my Supabase session is valid" right after
Google sign-in and get back a User row.
-----------------------------------------------------------------------
"""

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/session", response_model=UserOut)
def verify_session(current_user: User = Depends(get_current_user)) -> User:
    """Call this immediately after Supabase sign-in to verify the token and upsert the user row."""
    return current_user
