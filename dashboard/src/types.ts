/**
 * Re-exports of the backend response shapes the dashboard renders.
 * (The old GitHub-era SubmissionMetadata/SubmissionEntry shapes are gone -
 * the backend now returns already-aggregated statistics directly.)
 */
export type { BackendStatistics, BackendSubmission } from "./lib/backendClient";
