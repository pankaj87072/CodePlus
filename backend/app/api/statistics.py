from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.statistics import DashboardSummaryOut, StatisticsOut
from app.services.statistics_service import compute_dashboard_summary, compute_statistics

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("", response_model=StatisticsOut)
def get_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StatisticsOut:
    return compute_statistics(db, current_user.id)


@router.get("/dashboard", response_model=DashboardSummaryOut)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryOut:
    return compute_dashboard_summary(db, current_user.id)
