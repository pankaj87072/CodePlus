from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.problem import ProblemOut
from app.schemas.timer import TimerTargetOut
from app.services.problem_service import get_or_fetch_problem
from app.services.timer_service import get_personalized_timer

router = APIRouter(prefix="/problems", tags=["problems"])


@router.get("/{slug}", response_model=ProblemOut)
async def get_problem(slug: str, db: Session = Depends(get_db)) -> ProblemOut:
    problem = await get_or_fetch_problem(db, slug)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Problem '{slug}' not found on LeetCode.")
    return ProblemOut.model_validate(problem)


@router.get("/{slug}/timer", response_model=TimerTargetOut)
async def get_problem_timer(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TimerTargetOut:
    problem = await get_or_fetch_problem(db, slug)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Problem '{slug}' not found on LeetCode.")
    return get_personalized_timer(db, current_user.id, problem)
