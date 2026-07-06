"""
services/statistics_service.py
-----------------------------------------------------------------------
All statistics are computed on the fly from `submissions` + `problems`
via SQL aggregation, rather than kept in a separately-maintained
"user_statistics" table. For an MVP this is the right tradeoff: it can
never drift out of sync with the underlying history, at the cost of a
few extra aggregate queries per request (cheap - indexed on user_id).
If this ever needs to scale further, these queries are exactly what a
materialized view would wrap.
-----------------------------------------------------------------------
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.models.submission import Submission
from app.schemas.statistics import DashboardSummaryOut, DifficultyStatOut, StatisticsOut, TopicStatOut


def _accepted_dates(db: Session, user_id: uuid.UUID) -> list[date]:
    rows = db.scalars(
        select(func.date(Submission.submitted_at))
        .where(Submission.user_id == user_id, Submission.status == "Accepted")
        .distinct()
        .order_by(func.date(Submission.submitted_at))
    ).all()
    return list(rows)


def _compute_streaks(days: list[date]) -> tuple[int, int]:
    if not days:
        return 0, 0

    longest = 1
    run = 1
    for i in range(1, len(days)):
        if (days[i] - days[i - 1]) == timedelta(days=1):
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    current = 0
    cursor = date.today()
    day_set = set(days)
    while cursor in day_set:
        current += 1
        cursor -= timedelta(days=1)

    return current, longest


def compute_statistics(db: Session, user_id: uuid.UUID) -> StatisticsOut:
    total_submissions = db.scalar(
        select(func.count()).select_from(Submission).where(Submission.user_id == user_id)
    ) or 0

    total_solved = db.scalar(
        select(func.count(func.distinct(Submission.problem_id))).where(
            Submission.user_id == user_id, Submission.status == "Accepted"
        )
    ) or 0

    accepted_count = db.scalar(
        select(func.count()).where(Submission.user_id == user_id, Submission.status == "Accepted")
    ) or 0
    acceptance_rate = (accepted_count / total_submissions * 100) if total_submissions else 0.0

    average_solve_seconds = db.scalar(
        select(func.avg(Submission.solve_time_seconds)).where(
            Submission.user_id == user_id, Submission.status == "Accepted"
        )
    ) or 0.0

    days = _accepted_dates(db, user_id)
    current_streak, longest_streak = _compute_streaks(days)

    topic_rows = db.execute(
        select(
            func.unnest(Problem.topic_tags).label("topic"),
            Submission.solve_time_seconds,
        )
        .join(Problem, Problem.id == Submission.problem_id)
        .where(Submission.user_id == user_id, Submission.status == "Accepted")
    ).all()
    topic_agg: dict[str, list[int]] = {}
    for topic, seconds in topic_rows:
        topic_agg.setdefault(topic, []).append(seconds)
    by_topic = [
        TopicStatOut(topic=topic, count=len(secs), avg_seconds=sum(secs) / len(secs))
        for topic, secs in sorted(topic_agg.items(), key=lambda kv: len(kv[1]), reverse=True)
    ]

    difficulty_rows = db.execute(
        select(Problem.difficulty, func.count(), func.avg(Submission.solve_time_seconds))
        .join(Problem, Problem.id == Submission.problem_id)
        .where(Submission.user_id == user_id, Submission.status == "Accepted")
        .group_by(Problem.difficulty)
    ).all()
    by_difficulty = [
        DifficultyStatOut(difficulty=diff, count=count, avg_seconds=float(avg or 0))
        for diff, count, avg in difficulty_rows
    ]

    return StatisticsOut(
        total_solved=total_solved,
        total_submissions=total_submissions,
        acceptance_rate=round(acceptance_rate, 1),
        average_solve_seconds=round(float(average_solve_seconds), 1),
        current_streak=current_streak,
        longest_streak=longest_streak,
        by_topic=by_topic,
        by_difficulty=by_difficulty,
    )


def compute_dashboard_summary(db: Session, user_id: uuid.UUID) -> DashboardSummaryOut:
    """Cheaper subset of compute_statistics for the popup, which just needs headline numbers."""
    total_solved = db.scalar(
        select(func.count(func.distinct(Submission.problem_id))).where(
            Submission.user_id == user_id, Submission.status == "Accepted"
        )
    ) or 0

    average_solve_seconds = db.scalar(
        select(func.avg(Submission.solve_time_seconds)).where(
            Submission.user_id == user_id, Submission.status == "Accepted"
        )
    ) or 0.0

    days = _accepted_dates(db, user_id)
    current_streak, _ = _compute_streaks(days)

    return DashboardSummaryOut(
        total_solved=total_solved,
        current_streak=current_streak,
        average_solve_seconds=round(float(average_solve_seconds), 1),
    )
