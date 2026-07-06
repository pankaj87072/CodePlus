"""
services/auth_service.py
-----------------------------------------------------------------------
Turns verified JWT claims into a User row. Called on every authenticated
request via dependencies/auth.py - cheap upsert, no extra network calls.
-----------------------------------------------------------------------
"""

import uuid

from sqlalchemy.orm import Session

from app.models.user import User


def get_or_create_user(db: Session, claims: dict) -> User:
    user_id = uuid.UUID(claims["sub"])
    email = claims.get("email", "")
    user_metadata = claims.get("user_metadata", {}) or {}
    name = user_metadata.get("full_name") or user_metadata.get("name")
    avatar = user_metadata.get("avatar_url") or user_metadata.get("picture")

    user = db.get(User, user_id)
    if user is None:
        user = User(id=user_id, email=email, name=name, avatar=avatar)
        db.add(user)
    else:
        # Keep profile fields fresh in case the user changed their Google
        # avatar/name since we last saw them.
        user.email = email or user.email
        user.name = name or user.name
        user.avatar = avatar or user.avatar

    db.commit()
    db.refresh(user)
    return user
