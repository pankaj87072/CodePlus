"""
models/submission.py
-----------------------------------------------------------------------
Solve history. Every submission is stored - Accepted, Wrong Answer, TLE,
Runtime Error, everything - so nothing here ever gets overwritten. This
is deliberate: it's both the audit trail for "did I solve this before"
and the training data for future ML features.
-----------------------------------------------------------------------
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    problem_id: Mapped[int] = mapped_column(Integer, ForeignKey("problems.id"), index=True)

    status: Mapped[str] = mapped_column(String, index=True)  # "Accepted", "Wrong Answer", "TLE", ...
    solve_time_seconds: Mapped[int] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String)
    # source_code: Mapped[str] = mapped_column(Text, nullable=True)

    runtime: Mapped[str | None] = mapped_column(String, nullable=True)
    memory: Mapped[str | None] = mapped_column(String, nullable=True)

    # Which attempt number this was for this user+problem (1 = first ever
    # try). Computed at insert time in history_service.py.
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)

    # The target time the widget was showing when this was submitted -
    # useful later for judging how good the estimator/personalization is.
    estimated_time_used: Mapped[int | None] = mapped_column(Integer, nullable=True)

    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="submissions")
    problem: Mapped["Problem"] = relationship(back_populates="submissions")
