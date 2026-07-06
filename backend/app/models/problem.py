"""
models/problem.py
-----------------------------------------------------------------------
One row per LeetCode problem. Bulk-populated from the uploaded metadata
JSON via scripts/seed_problems.py. Problems the extension asks about that
aren't in the table yet get fetched live from LeetCode and inserted here
on demand (see services/problem_service.py) - so this table grows to
cover new LeetCode problems automatically over time.
-----------------------------------------------------------------------
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    frontend_question_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    difficulty: Mapped[str] = mapped_column(String, index=True)
    topic_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    acceptance_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    estimated_time_min: Mapped[int] = mapped_column(Integer)
    estimated_time_avg: Mapped[int] = mapped_column(Integer)
    estimated_time_max: Mapped[int] = mapped_column(Integer)

    # Not present in the current metadata JSON, but the schema leaves room
    # for LeetCode fields that may show up later without a migration.
    likes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Catch-all for anything else worth keeping (hasSolution, hasVideoSolution,
    # and whatever else shows up in future metadata dumps) without needing a
    # migration every time the source JSON gains a field.
    problem_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)

    # True for problems we had to fetch + estimate dynamically rather than
    # get from the bulk-imported JSON - useful for auditing the estimator.
    is_dynamically_estimated: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    submissions: Mapped[list["Submission"]] = relationship(back_populates="problem")
