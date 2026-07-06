"""
services/estimation_service.py
-----------------------------------------------------------------------
Only used for problems that AREN'T in the seeded metadata JSON (i.e. new
LeetCode problems published after the JSON was generated). Problems that
exist in the JSON always use the JSON's own `estimatedTime` values as the
baseline default - this algorithm never overrides those.
-----------------------------------------------------------------------
"""

DIFFICULTY_BASE: dict[str, tuple[int, int, int]] = {
    "Easy": (5, 15, 25),
    "Medium": (15, 35, 60),
    "Hard": (30, 60, 90),
}

TOPIC_WEIGHTS: dict[str, int] = {
    "Array": 0,
    "String": 0,
    "Simulation": 0,
    "Math": 2,
    "Hash Table": 2,
    "Two Pointers": 3,
    "Sliding Window": 3,
    "Binary Search": 4,
    "Stack": 3,
    "Queue": 3,
    "Linked List": 3,
    "Tree": 6,
    "Binary Tree": 6,
    "Binary Search Tree": 6,
    "Heap (Priority Queue)": 6,
    "Greedy": 5,
    "Backtracking": 7,
    "Graph": 9,
    "Graph Theory": 9,
    "Depth-First Search": 7,
    "Breadth-First Search": 7,
    "Topological Sort": 8,
    "Shortest Path": 0,  # already covered by Graph
    "Union Find": 8,
    "Dynamic Programming": 10,
    "Memoization": 8,
    "Trie": 10,
    "Segment Tree": 12,
    "Binary Indexed Tree": 10,
    "Bit Manipulation": 5,
    "Bitmask": 8,
    "Geometry": 10,
}

MAX_TIME = 120


def acceptance_multiplier(ac_rate: float) -> float:
    if ac_rate >= 70:
        return 0.80
    if ac_rate >= 55:
        return 0.90
    if ac_rate >= 40:
        return 1.00
    if ac_rate >= 30:
        return 1.10
    if ac_rate >= 20:
        return 1.20
    return 1.35


def topic_bonus(topic_tags: list[str]) -> float:
    """Highest-weighted topic counts 100%, second 50%, third 25%; the rest are ignored."""
    weights = sorted((TOPIC_WEIGHTS.get(tag, 0) for tag in topic_tags), reverse=True)
    bonus = 0.0
    if len(weights) > 0:
        bonus += weights[0] * 1.0
    if len(weights) > 1:
        bonus += weights[1] * 0.5
    if len(weights) > 2:
        bonus += weights[2] * 0.25
    return bonus


def compute_default_estimated_time(difficulty: str, ac_rate: float, topic_tags: list[str]) -> dict[str, int]:
    """
    min  = base_min * multiplier + bonus * 0.5
    avg  = base_avg * multiplier + bonus
    max  = base_max * multiplier + bonus * 1.5, clamped to MAX_TIME

    Falls back to Medium's base times if an unrecognized difficulty ever
    shows up so this never throws.
    """
    base_min, base_avg, base_max = DIFFICULTY_BASE.get(difficulty, DIFFICULTY_BASE["Medium"])
    multiplier = acceptance_multiplier(ac_rate)
    bonus = topic_bonus(topic_tags)

    est_min = round(base_min * multiplier + bonus * 0.5)
    est_avg = round(base_avg * multiplier + bonus)
    est_max = round(min(base_max * multiplier + bonus * 1.5, MAX_TIME))

    # Guarantee strict ordering even in edge cases (huge bonus on an Easy
    # problem, tiny MAX_TIME clamp, etc).
    if est_avg <= est_min:
        est_avg = est_min + 1
    if est_max <= est_avg:
        est_max = min(est_avg + 1, MAX_TIME)
        if est_max <= est_avg:  # already at the ceiling - nudge avg/min down instead
            est_avg = est_max - 1
            est_min = min(est_min, est_avg - 1)

    return {"min": est_min, "avg": est_avg, "max": est_max}
