/**
 * lib/backendClient.ts
 * -----------------------------------------------------------------------
 * Replaces the old lib/githubClient.ts. Same shape of responsibility
 * (fetch the data the dashboard needs to render) but the source of truth
 * is now the FastAPI backend + Postgres instead of walking a GitHub repo
 * tree.
 * -----------------------------------------------------------------------
 */

const BACKEND_BASE_URL = import.meta.env.VITE_API_URL;

async function backendGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BACKEND_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Backend request failed (${res.status}): ${path}`);
  return res.json();
}

export interface BackendStatistics {
  total_solved: number;
  total_submissions: number;
  acceptance_rate: number;
  average_solve_seconds: number;
  current_streak: number;
  longest_streak: number;
  by_topic: { topic: string; count: number; avg_seconds: number }[];
  by_difficulty: { difficulty: string; count: number; avg_seconds: number }[];
}

export interface BackendSubmission {
  id: number;
  problem_id: number;
  problem_title: string;
  problem_slug: string;
  problem_difficulty: string;
  status: string;
  solve_time_seconds: number;
  language: string;
  runtime: string | null;
  memory: string | null;
  attempt_number: number;
  submitted_at: string;
}

export async function fetchStatistics(token: string): Promise<BackendStatistics> {
  return backendGet<BackendStatistics>(token, "/statistics");
}

export async function fetchHistory(token: string, limit = 100): Promise<BackendSubmission[]> {
  return backendGet<BackendSubmission[]>(token, `/history?limit=${limit}`);
}
