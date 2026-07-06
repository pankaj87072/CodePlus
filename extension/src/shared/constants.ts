/**
 * Central place for constants so nothing is hard-coded in multiple files.
 *
 * GitHub-era constants (OAuth client id, api.github.com URLs, ROOT_FOLDER)
 * have been removed - the extension no longer talks to GitHub at all.
 */

// Supabase project URL, e.g. https://xxxx.supabase.co (Project Settings -> API).
// Used to build the Google OAuth redirect and to call Supabase's own
// /auth/v1/token endpoint directly for session refresh.
export const SUPABASE_URL = "https://sgebiumeiuixmrxkurec.supabase.co";

// Supabase's public "anon" key (Project Settings -> API -> anon public).
// This is safe to ship in a client - it identifies the project, not a user,
// and every actual authorization check happens against the signed-in
// user's own JWT. Never put the service_role secret key here.
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnZWJpdW1laXVpeG1yeGt1cmVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMzA3OTcsImV4cCI6MjA5ODcwNjc5N30.MVtHgWpMHRSY3EC8Y5yLTUsGflJOCyDp_mng2wxH7iI";

// Your FastAPI backend. Point this at your deployed backend in production.
export const BACKEND_BASE_URL = "http://localhost:8000";

export const STORAGE_KEYS = {
  SESSION: "cp_session", // Session (access/refresh token + user)
  TIMER_ENABLED: "cp_timer_enabled", // boolean, independent of auth state
  TIMER_PREFIX: "cp_timer_", // + titleSlug -> per-problem TimerState
  TIMER_TARGET_CACHE_PREFIX: "cp_target_", // + titleSlug -> cached TimerTarget
} as const;

// How long a cached personalized-timer response is trusted before we ask
// the backend again (it only changes when a new Accepted solve lands).
export const TIMER_TARGET_CACHE_TTL_MS = 5 * 60 * 1000;

// Refresh the Supabase session this many seconds before it actually expires,
// so a backend call never gets caught mid-refresh.
export const SESSION_REFRESH_SKEW_SECONDS = 60;
