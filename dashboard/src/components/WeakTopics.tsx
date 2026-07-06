import type { BackendStatistics } from "../types";
import { formatDuration } from "../lib/stats";

interface Props {
  topics: BackendStatistics["by_topic"];
}

/** Topics you solve slowest on average - a decent proxy for "needs practice". */
export default function WeakTopics({ topics }: Props) {
  const ranked = [...topics].sort((a, b) => b.avg_seconds - a.avg_seconds).slice(0, 5);

  if (ranked.length === 0) {
    return <div className="empty-state">Not enough data yet.</div>;
  }

  return (
    <ul className="weak-topics-list">
      {ranked.map((t) => (
        <li key={t.topic}>
          <span className="weak-topic-name">{t.topic}</span>
          <span className="weak-topic-meta">
            avg {formatDuration(t.avg_seconds)} · {t.count} solved
          </span>
        </li>
      ))}
    </ul>
  );
}
