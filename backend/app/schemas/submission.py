from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SubmissionIn(BaseModel):
    """What the extension sends after every judge result (any status, not just Accepted)."""

    problem_slug: str
    status: str
    solve_time_seconds: int
    language: str
    # source_code: str
    runtime: str | None = None
    memory: str | None = None
    estimated_time_used: int | None = None
    submitted_at: datetime


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    problem_id: int
    status: str
    solve_time_seconds: int
    language: str
    runtime: str | None
    memory: str | None
    attempt_number: int
    estimated_time_used: int | None
    submitted_at: datetime


class SubmissionHistoryItem(SubmissionOut):
    """Same as SubmissionOut but with the problem's title/slug/difficulty joined in, for history/dashboard views."""

    problem_title: str
    problem_slug: str
    problem_difficulty: str
