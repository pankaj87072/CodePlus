# """
# core/security.py
# -----------------------------------------------------------------------
# Verifies the Supabase-issued JWT that the extension attaches to every
# request. Supabase (GoTrue) signs access tokens with the project's JWT
# secret using HS256 - we can verify that signature locally, with zero
# extra network calls per request, instead of hitting Supabase's /auth/v1/user
# endpoint on every API call.

# If your Supabase project has been switched to asymmetric (RS256/JWKS)
# signing, swap `decode_supabase_jwt` to fetch and cache the JWKS from
# `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` instead - the rest of the
# backend (dependencies/auth.py) doesn't need to change.
# -----------------------------------------------------------------------
# """

# import jwt

# from app.core.config import settings


# class InvalidTokenError(Exception):
#     pass


# def decode_supabase_jwt(token: str) -> dict:
#     """Verifies signature + expiry and returns the decoded claims.

#     Raises InvalidTokenError on any failure (expired, malformed, bad
#     signature) - callers turn this into an HTTP 401.
#     """
#     try:
#         payload = jwt.decode(
#             token,
#             settings.SUPABASE_JWT_SECRET,
#             algorithms=["HS256"],
#             audience="authenticated",
#         )
#     except jwt.PyJWTError as exc:
#         raise InvalidTokenError(str(exc)) from exc

#     if not payload.get("sub"):
#         raise InvalidTokenError("Token is missing a subject (user id) claim.")

#     return payload

import time
import requests
import jwt

from app.core.config import settings


class InvalidTokenError(Exception):
    pass


JWKS_URL = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

_jwks_client = jwt.PyJWKClient(JWKS_URL)


def decode_supabase_jwt(token: str) -> dict:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )

    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    if "sub" not in payload:
        raise InvalidTokenError("Missing subject claim.")

    return payload

