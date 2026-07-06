/**
 * lib/stats.ts
 * -----------------------------------------------------------------------
 * Aggregation (averages, streaks, topic/difficulty breakdowns) now happens
 * server-side in the backend's statistics_service.py - the dashboard just
 * formats what it's given. Kept as its own module since formatDuration is
 * shared across several components.
 * -----------------------------------------------------------------------
 */

export function formatDuration(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
