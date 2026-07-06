"""
services/history_service.py
-----------------------------------------------------------------------
Every submission gets a row here, regardless of status - Accepted, Wrong
Answer, TLE, Runtime Error, all of it. Nothing is ever overwritten, which
is both the audit trail and the future ML training set.
-----------------------------------------------------------------------
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.models.submission import Submission
from app.schemas.submission import SubmissionIn


def create_submission(db: Session, user_id: uuid.UUID, problem: Problem, payload: SubmissionIn) -> Submission:
    prior_attempts = db.scalar(
        select(func.count())
        .select_from(Submission)
        .where(Submission.user_id == user_id, Submission.problem_id == problem.id)
    )

    submission = Submission(
        user_id=user_id,
        problem_id=problem.id,
        status=payload.status,
        solve_time_seconds=payload.solve_time_seconds,
        language=payload.language,
        # source_code=payload.source_code,
        runtime=payload.runtime,
        memory=payload.memory,
        attempt_number=(prior_attempts or 0) + 1,
        estimated_time_used=payload.estimated_time_used,
        submitted_at=payload.submitted_at,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def get_history(db: Session, user_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[tuple[Submission, Problem]]:
    rows = db.execute(
        select(Submission, Problem)
        .join(Problem, Problem.id == Submission.problem_id)
        .where(Submission.user_id == user_id)
        .order_by(Submission.submitted_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows.all())
