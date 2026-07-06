"""
scripts/seed_problems.py
-----------------------------------------------------------------------
Bulk-imports backend/data/leetcode_with_time_final.json into the
`problems` table. Safe to re-run - upserts on `slug` so re-running after
the JSON is updated just refreshes existing rows instead of duplicating.

Usage (from backend/):
    python -m scripts.seed_problems
-----------------------------------------------------------------------
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.database import Base, SessionLocal, engine
from app.models.problem import Problem

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "leetcode_with_time_final.json"
BATCH_SIZE = 500


def load_rows() -> list[dict]:
    raw = json.loads(DATA_PATH.read_text())
    rows = []
    for entry in raw:
        estimated = entry.get("estimatedTime", {})
        rows.append(
            {
                "frontend_question_id": str(entry.get("frontendQuestionId", "")),
                "title": entry["title"],
                "slug": entry["titleSlug"],
                "difficulty": entry["difficulty"],
                "topic_tags": [t["name"] for t in entry.get("topicTags", [])],
                "acceptance_rate": entry.get("acRate"),
                "estimated_time_min": estimated.get("min", 15),
                "estimated_time_avg": estimated.get("avg", 30),
                "estimated_time_max": estimated.get("max", 45),
                "likes": entry.get("likes"),
                "frequency": entry.get("frequency"),
                "problem_metadata": {
                    "hasSolution": entry.get("hasSolution"),
                    "hasVideoSolution": entry.get("hasVideoSolution"),
                },
                "is_dynamically_estimated": False,
            }
        )
    return rows


def upsert_batch(session, batch: list[dict]) -> None:
    stmt = pg_insert(Problem).values(batch)
    update_cols = {
        col: stmt.excluded[col]
        for col in (
            "frontend_question_id",
            "title",
            "difficulty",
            "topic_tags",
            "acceptance_rate",
            "estimated_time_min",
            "estimated_time_avg",
            "estimated_time_max",
            "likes",
            "frequency",
            "problem_metadata",
        )
    }
    stmt = stmt.on_conflict_do_update(index_elements=["slug"], set_=update_cols)
    session.execute(stmt)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    rows = load_rows()
    print(f"Loaded {len(rows)} problems from {DATA_PATH.name}")

    with SessionLocal() as session:
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            upsert_batch(session, batch)
            session.commit()
            print(f"  upserted {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")

    print("Done.")


if __name__ == "__main__":
    main()
