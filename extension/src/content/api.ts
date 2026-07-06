/**
 * content/api.ts
 * -----------------------------------------------------------------------
 * Replaces the old content/github.ts. Same pattern as before: this file
 * is a thin typed messaging client to background.ts, which is the only
 * place that actually calls our backend (content scripts run under
 * leetcode.com's CSP, background does not).
 * -----------------------------------------------------------------------
 */

import type { DashboardSummary, RuntimeMessage, SubmissionRecord, TimerTarget } from "../shared/types";

function send<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

/** Personalized (or default) target time for a problem, computed by the backend. */
export async function getTimerTarget(slug: string): Promise<TimerTarget | null> {
  return send({ type: "GET_TIMER_TARGET", slug });
}

/** Records one submission of any status (Accepted, Wrong Answer, TLE, ...). */
export async function recordSubmission(record: SubmissionRecord): Promise<{ ok: boolean; error?: string }> {
  return send({ type: "RECORD_SUBMISSION", payload: record });
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  return send({ type: "GET_DASHBOARD_SUMMARY" });
}
