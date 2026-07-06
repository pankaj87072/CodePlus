"""
services/problem_service.py
-----------------------------------------------------------------------
Looks problems up by slug. If a problem isn't in the table yet (i.e. it's
newer than the seeded metadata JSON), fetches its basic info straight
from LeetCode's public GraphQL endpoint, runs it through the dynamic
estimation algorithm, inserts it, and returns it - so every future
request for that slug is a plain DB read.
-----------------------------------------------------------------------
"""

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.services.estimation_service import compute_default_estimated_time

LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql"

_QUESTION_QUERY = """
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    difficulty
    stats
    topicTags { name }
  }
}
"""


def get_problem_by_slug(db: Session, slug: str) -> Problem | None:
    return db.scalar(select(Problem).where(Problem.slug == slug))


async def _fetch_from_leetcode(slug: str) -> dict | None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            LEETCODE_GRAPHQL_URL,
            json={"query": _QUESTION_QUERY, "variables": {"titleSlug": slug}},
            headers={"Content-Type": "application/json"},
        )
    if response.status_code != 200:
        return None
    data = response.json().get("data", {}).get("question")
    return data


def _parse_ac_rate(stats_json: str | None) -> float:
    import json

    if not stats_json:
        return 50.0
    try:
        stats = json.loads(stats_json)
        return float(stats.get("acRate", "50%").rstrip("%"))
    except (ValueError, TypeError):
        return 50.0


async def get_or_fetch_problem(db: Session, slug: str) -> Problem | None:
    """Returns the Problem for `slug`, fetching + estimating + persisting it if it's new to us."""
    existing = get_problem_by_slug(db, slug)
    if existing is not None:
        return existing

    remote = await _fetch_from_leetcode(slug)
    if remote is None:
        return None

    topic_tags = [t["name"] for t in remote.get("topicTags", [])]
    ac_rate = _parse_ac_rate(remote.get("stats"))
    difficulty = remote.get("difficulty", "Medium")
    estimate = compute_default_estimated_time(difficulty, ac_rate, topic_tags)

    problem = Problem(
        frontend_question_id=str(remote.get("questionFrontendId", "")),
        title=remote.get("title", slug),
        slug=slug,
        difficulty=difficulty,
        topic_tags=topic_tags,
        acceptance_rate=ac_rate,
        estimated_time_min=estimate["min"],
        estimated_time_avg=estimate["avg"],
        estimated_time_max=estimate["max"],
        problem_metadata={},
        is_dynamically_estimated=True,
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem
