"""
main.py
-----------------------------------------------------------------------
FastAPI application entry point. Wires together all routers and CORS.

Table creation uses Base.metadata.create_all() for MVP simplicity. For
anything beyond local development, swap this for Alembic migrations -
create_all() can't handle schema changes to existing tables.
-----------------------------------------------------------------------
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, history, problems, statistics, users
from app.core.config import settings
from app.db.database import Base, engine

# Import models so SQLAlchemy's metadata knows about every table before create_all() runs.
import app.models  # noqa: F401

app = FastAPI(title="CodePulse API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(problems.router)
app.include_router(history.router)
app.include_router(statistics.router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
