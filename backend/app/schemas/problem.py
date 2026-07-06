from pydantic import BaseModel, ConfigDict, computed_field


class EstimatedTime(BaseModel):
    min: int
    avg: int
    max: int


class ProblemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    frontend_question_id: str
    title: str
    slug: str
    difficulty: str
    topic_tags: list[str]
    acceptance_rate: float | None

    estimated_time_min: int
    estimated_time_avg: int
    estimated_time_max: int

    is_dynamically_estimated: bool

    @computed_field
    @property
    def estimated_time(self) -> EstimatedTime:
        return EstimatedTime(min=self.estimated_time_min, avg=self.estimated_time_avg, max=self.estimated_time_max)
