from typing import Literal

from pydantic import BaseModel

TimerSource = Literal["personal_problem", "personal_topic", "personal_difficulty", "default"]


class TimerTargetOut(BaseModel):
    min: int
    avg: int
    max: int
    source: TimerSource
    basis_label: str  # "Based on your history" or "Default estimate"
