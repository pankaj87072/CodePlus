import { useMemo, useState } from "react";
import type { BackendSubmission } from "../types";
import { formatDuration } from "../lib/stats";

interface Props {
  submissions: BackendSubmission[];
}

export default function RecentSubmissions({ submissions }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");
  const [languageFilter, setLanguageFilter] = useState<string>("All");

  const statuses = useMemo(() => Array.from(new Set(submissions.map((s) => s.status))).sort(), [submissions]);
  const languages = useMemo(() => Array.from(new Set(submissions.map((s) => s.language))).sort(), [submissions]);

  const filtered = submissions.filter((s) => {
    if (statusFilter !== "All" && s.status !== statusFilter) return false;
    if (difficultyFilter !== "All" && s.problem_difficulty !== difficultyFilter) return false;
    if (languageFilter !== "All" && s.language !== languageFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="filters-row">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
          <option>All</option>
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
        <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
          <option>All</option>
          {languages.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>

      <table className="submissions-table">
        <thead>
          <tr>
            <th>Problem</th>
            <th>Status</th>
            <th>Difficulty</th>
            <th>Language</th>
            <th>Time</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id}>
              <td>{s.problem_title}</td>
              <td>
                <span className={`status-pill ${s.status === "Accepted" ? "status-accepted" : "status-other"}`}>
                  {s.status}
                </span>
              </td>
              <td>
                <span className={`difficulty-pill difficulty-${s.problem_difficulty.toLowerCase()}`}>
                  {s.problem_difficulty}
                </span>
              </td>
              <td>{s.language}</td>
              <td>{formatDuration(s.solve_time_seconds)}</td>
              <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-state">
                No submissions match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
