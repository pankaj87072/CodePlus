"""
services/timer_service.py
-----------------------------------------------------------------------
Answers "what should the target time be for this user and this problem?"

Fallback chain:
  1. This exact problem, if the user has an Accepted solve for it before
     -> personal min/avg/max from those solves.
  2. Same topics, if the user has enough Accepted solves across problems
     sharing at least one topic with this one (>= MIN_SOLVED_FOR_TOPIC_AVERAGE)
     -> topic-based personal min/avg/max.
  3. Same difficulty, same threshold idea
     -> difficulty-based personal min/avg/max.
  4. The problem's own default estimatedTime (from the seeded JSON or the
     dynamic estimator) - "Default estimate".
-----------------------------------------------------------------------
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.problem import Problem
from app.models.submission import Submission
from app.schemas.timer import TimerTargetOut


def _stats_from_seconds_query(db: Session, base_query) -> tuple[int, int, int, int] | None:
    row = db.execute(
        base_query.with_only_columns(
            func.count(Submission.id),
            func.min(Submission.solve_time_seconds),
            func.avg(Submission.solve_time_seconds),
            func.max(Submission.solve_time_seconds),
        )
    ).first()
    if row is None or row[0] == 0:
        return None
    count, min_s, avg_s, max_s = row
    return count, round(min_s), round(avg_s), round(max_s)


def get_personalized_timer(db: Session, user_id: uuid.UUID, problem: Problem) -> TimerTargetOut:
    accepted_base = select(Submission).where(Submission.user_id == user_id, Submission.status == "Accepted")

    # 1) Exact same problem.
    exact_query = accepted_base.where(Submission.problem_id == problem.id)
    exact_stats = _stats_from_seconds_query(db, exact_query)
    if exact_stats is not None:
        _, min_s, avg_s, max_s = exact_stats
        return TimerTargetOut(min=min_s, avg=avg_s, max=max_s, source="personal_problem", basis_label="Based on your history")

    # 2) Same topic(s) - only trust it once there's enough signal.
    if problem.topic_tags:
        topic_query = (
            accepted_base.join(Problem, Problem.id == Submission.problem_id)
            .where(Problem.topic_tags.overlap(problem.topic_tags))
        )
        topic_stats = _stats_from_seconds_query(db, topic_query)
        if topic_stats is not None and topic_stats[0] >= settings.MIN_SOLVED_FOR_TOPIC_AVERAGE:
            _, min_s, avg_s, max_s = topic_stats
            return TimerTargetOut(min=min_s, avg=avg_s, max=max_s, source="personal_topic", basis_label="Based on your history")

    # 3) Same difficulty.
    difficulty_query = (
        accepted_base.join(Problem, Problem.id == Submission.problem_id)
        .where(Problem.difficulty == problem.difficulty)
    )
    difficulty_stats = _stats_from_seconds_query(db, difficulty_query)
    if difficulty_stats is not None and difficulty_stats[0] >= settings.MIN_SOLVED_FOR_DIFFICULTY_AVERAGE:
        _, min_s, avg_s, max_s = difficulty_stats
        return TimerTargetOut(min=min_s, avg=avg_s, max=max_s, source="personal_difficulty", basis_label="Based on your history")

    # 4) Default estimate, in minutes in the source data -> convert to seconds.
    return TimerTargetOut(
        min=problem.estimated_time_min * 60,
        avg=problem.estimated_time_avg * 60,
        max=problem.estimated_time_max * 60,
        source="default",
        basis_label="Default estimate",
    )
