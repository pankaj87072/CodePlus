import type { BackendStatistics } from "../types";
import { formatDuration } from "../lib/stats";

interface Props {
  topics: BackendStatistics["by_topic"];
}

/** Horizontal bar chart of solve count per topic, hand-rolled in SVG - no charting library needed for this. */
export default function TopicMastery({ topics }: Props) {
  const top = [...topics].sort((a, b) => b.count - a.count).slice(0, 8);
  const max = Math.max(1, ...top.map((t) => t.count));
  const rowHeight = 28;
  const width = 480;
  const labelWidth = 140;
  const chartWidth = width - labelWidth - 50;
  const height = top.length * rowHeight + 10;

  if (top.length === 0) {
    return <div className="empty-state">No topic data yet - solve a few problems to see this fill in.</div>;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Solve count by topic">
      {top.map((t, i) => {
        const barWidth = (t.count / max) * chartWidth;
        const y = i * rowHeight;
        return (
          <g key={t.topic} transform={`translate(0, ${y})`}>
            <text x={labelWidth - 8} y={rowHeight / 2 + 4} textAnchor="end" className="chart-label">
              {t.topic}
            </text>
            <rect x={labelWidth} y={4} width={Math.max(2, barWidth)} height={rowHeight - 10} rx={4} className="chart-bar" />
            <text x={labelWidth + barWidth + 8} y={rowHeight / 2 + 4} className="chart-value">
              {t.count} · avg {formatDuration(t.avg_seconds)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
