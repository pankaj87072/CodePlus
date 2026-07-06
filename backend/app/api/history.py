from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.submission import SubmissionHistoryItem, SubmissionIn, SubmissionOut
from app.services.history_service import create_submission, get_history
from app.services.problem_service import get_or_fetch_problem

router = APIRouter(prefix="/history", tags=["history"])


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def record_submission(
    payload: SubmissionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Records every submission (any status) - called once per judge result, not just Accepted."""
    problem = await get_or_fetch_problem(db, payload.problem_slug)
    if problem is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Problem '{payload.problem_slug}' not found on LeetCode.",
        )
    print('payload',payload)
    submission = create_submission(db, current_user.id, problem, payload)
    return SubmissionOut.model_validate(submission)


@router.get("", response_model=list[SubmissionHistoryItem])
def list_history(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SubmissionHistoryItem]:
    rows = get_history(db, current_user.id, limit=limit, offset=offset)
    return [
        SubmissionHistoryItem(
            **SubmissionOut.model_validate(submission).model_dump(),
            problem_title=problem.title,
            problem_slug=problem.slug,
            problem_difficulty=problem.difficulty,
        )
        for submission, problem in rows
    ]
