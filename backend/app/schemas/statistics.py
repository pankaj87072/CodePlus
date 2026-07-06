from pydantic import BaseModel


class TopicStatOut(BaseModel):
    topic: str
    count: int
    avg_seconds: float


class DifficultyStatOut(BaseModel):
    difficulty: str
    count: int
    avg_seconds: float


class StatisticsOut(BaseModel):
    total_solved: int
    total_submissions: int
    acceptance_rate: float
    average_solve_seconds: float
    current_streak: int
    longest_streak: int
    by_topic: list[TopicStatOut]
    by_difficulty: list[DifficultyStatOut]


class DashboardSummaryOut(BaseModel):
    """Small, cheap payload for the popup - avoid shipping the full breakdown there."""

    total_solved: int
    current_streak: int
    average_solve_seconds: float
