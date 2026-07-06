/**
 * Shared type definitions used by background, content scripts, and popup.
 * Keeping these in one place avoids drift between the pieces that talk
 * to each other over chrome.runtime messaging.
 *
 * NOTE: GitHub-era types (GitHubRepo, DeviceFlowStartResult, HistoryStats,
 * the old CodePulseSettings with repo/token fields) have been removed as
 * part of the backend migration - see README "Migration notes".
 */

export type Difficulty = "Easy" | "Medium" | "Hard";

/** Metadata scraped for the problem currently open in the tab. */
export interface ProblemInfo {
  problemId: number;
  titleSlug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
}

/** One submission of any status - Accepted, Wrong Answer, TLE, Runtime Error, etc. */
export interface SubmissionRecord {
  problemSlug: string;
  language: string;
  code: string;
  timeTaken: number; // seconds, banked at the moment the user hit Submit
  submittedAt: string; // ISO date
  status: string;
  runtime?: string;
  memory?: string;
  estimatedTimeUsed?: number; // the target (avg, seconds) the widget was showing at submit time
}

/** Persisted timer state for one tab/problem. Source of truth for elapsed time. */
export interface TimerState {
  titleSlug: string;
  startedAt: number | null; // epoch ms, null when stopped
  accumulatedMs: number; // time banked from previous start/stop cycles
  running: boolean;
}

/** The signed-in user, as returned by Supabase / our backend. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

/** Supabase session, persisted in chrome.storage.local and refreshed as needed. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  user: AuthUser;
}

/** Personalized (or default) target time for the problem currently open. */
export interface TimerTarget {
  min: number; // seconds
  avg: number; // seconds
  max: number; // seconds
  source: "personal_problem" | "personal_topic" | "personal_difficulty" | "default";
  basisLabel: string; // "Based on your history" or "Default estimate"
}

export interface DashboardSummary {
  totalSolved: number;
  currentStreak: number;
  averageSolveSeconds: number;
}

/** Messages exchanged between content scripts, popup, and the background worker. */
export type RuntimeMessage =
  | { type: "GET_SESSION" }
  | { type: "SIGN_IN_GOOGLE" }
  | { type: "SIGN_OUT" }
  | { type: "GET_TIMER_ENABLED" }
  | { type: "SET_TIMER_ENABLED"; enabled: boolean }
  | { type: "GET_TIMER_TARGET"; slug: string }
  | { type: "RECORD_SUBMISSION"; payload: SubmissionRecord }
  | { type: "GET_DASHBOARD_SUMMARY" };
