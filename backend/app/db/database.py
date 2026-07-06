"""
db/database.py
-----------------------------------------------------------------------
SQLAlchemy engine + session factory, pointed at the Supabase Postgres
instance via DATABASE_URL. `get_db` is the FastAPI dependency every
route/service uses to get a request-scoped session.
-----------------------------------------------------------------------
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
