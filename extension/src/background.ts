/**
 * background.ts
 * -----------------------------------------------------------------------
 * MV3 service worker. This is the ONLY place that talks to Supabase and
 * to our own backend directly - content scripts route through here (see
 * content/api.ts) because they run under the host page's CSP.
 *
 * GitHub Device Flow, repo listing, and commit logic have all been
 * removed as part of the backend migration. Auth is now Supabase Google
 * sign-in via chrome.identity.launchWebAuthFlow, and all persisted data
 * (submissions, statistics, personalized timer) lives in our own
 * PostgreSQL database behind the FastAPI backend, not in a GitHub repo.
 * -----------------------------------------------------------------------
 */

import {
  BACKEND_BASE_URL,
  SESSION_REFRESH_SKEW_SECONDS,
  STORAGE_KEYS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./shared/constants";
import type { AuthUser, DashboardSummary, RuntimeMessage, Session, SubmissionRecord, TimerTarget } from "./shared/types";

// ---------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------

async function getSession(): Promise<Session | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
  return stored[STORAGE_KEYS.SESSION] ?? null;
}

async function setSession(session: Session | null): Promise<void> {
  if (session === null) {
    await chrome.storage.local.remove(STORAGE_KEYS.SESSION);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: session });
  }
}

// ---------------------------------------------------------------------
// Supabase Google sign-in (chrome.identity, no backend involved in auth
// itself - Supabase issues the JWT, our backend only ever verifies it)
// ---------------------------------------------------------------------

function parseFragment(url: string): Record<string, string> {
  const hash = url.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);
  const result: Record<string, string> = {};
  params.forEach((value, key) => (result[key] = value));
  return result;
}

async function fetchSupabaseUser(accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error("Could not load the signed-in user's profile from Supabase.");
  const data = await res.json();
  const metadata = data.user_metadata ?? {};
  return {
    id: data.id,
    email: data.email,
    name: metadata.full_name ?? metadata.name ?? null,
    avatar: metadata.avatar_url ?? metadata.picture ?? null,
  };
}

async function signInWithGoogle(): Promise<Session> {
  const redirectUrl = chrome.identity.getRedirectURL();
  console.log('redirecturl'),redirectUrl
  const authUrl =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectUrl)}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!responseUrl) throw new Error("Google sign-in was cancelled.");

  const fragment = parseFragment(responseUrl);
  if (fragment.error) throw new Error(fragment.error_description ?? fragment.error);
  if (!fragment.access_token || !fragment.refresh_token) {
    throw new Error("Supabase did not return a session. Check your OAuth redirect URL configuration.");
  }
  console.log('fragments',fragment)

  const expiresAt = Date.now() + Number(fragment.expires_in ?? "3600") * 1000;
  const user = await fetchSupabaseUser(fragment.access_token);
  const session: Session = {
    accessToken: fragment.access_token,
    refreshToken: fragment.refresh_token,
    expiresAt,
    user,
  };
  console.log('seassion',session)

  await setSession(session);
  // Confirm the session with our own backend right away - this both
  // verifies the token server-side and upserts the user row.
  await backendFetch("/auth/session", { method: "POST" });
  return session;
}

async function refreshSession(session: Session): Promise<Session | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!res.ok) {
    await setSession(null); // refresh failed - the user has to sign in again
    return null;
  }
  const data = await res.json();
  const refreshed: Session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in ?? "3600") * 1000,
    user: session.user,
  };
  await setSession(refreshed);
  return refreshed;
}

/** Returns a valid (non-expired) access token, refreshing first if it's about to expire. Null if signed out. */
async function getValidAccessToken(): Promise<string | null> {
  let session = await getSession();
  if (!session) return null;

  const aboutToExpire = Date.now() > session.expiresAt - SESSION_REFRESH_SKEW_SECONDS * 1000;
  if (aboutToExpire) {
    session = await refreshSession(session);
    if (!session) return null;
  }
  return session.accessToken;
}

// ---------------------------------------------------------------------
// Backend client
// ---------------------------------------------------------------------

async function backendFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not signed in.");
  console.log('backen url',BACKEND_BASE_URL)
  const res = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  console.log('res',res)

  // One retry after a forced refresh, in case the token expired right at
  // the edge of our skew window.
  if (res.status === 401 && !isRetry) {
    const session = await getSession();
    if (session) {
      const refreshed = await refreshSession(session);
      if (refreshed) return backendFetch(path, init, true);
    }
  }

  return res;
}

// ---------------------------------------------------------------------
// Timer enabled/disabled flag (independent of auth state, per spec)
// ---------------------------------------------------------------------

async function getTimerEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TIMER_ENABLED);
  // Default to true so the timer shows immediately the first time someone signs in.
  return stored[STORAGE_KEYS.TIMER_ENABLED] ?? true;
}

async function setTimerEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.TIMER_ENABLED]: enabled });
}

// ---------------------------------------------------------------------
// Backend-backed features: personalized timer, submission recording,
// dashboard summary
// ---------------------------------------------------------------------

async function getTimerTarget(slug: string): Promise<TimerTarget | null> {
  try {
    const res = await backendFetch(`/problems/${encodeURIComponent(slug)}/timer`);
    console.log('get time',res)
    if (!res.ok) return null;
    const data = await res.json();
    return { min: data.min, avg: data.avg, max: data.max, source: data.source, basisLabel: data.basis_label };
  } catch {
    return null;
  }
}

async function recordSubmission(record: SubmissionRecord): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await backendFetch("/history", {
      method: "POST",
      body: JSON.stringify({
        problem_slug: record.problemSlug,
        status: record.status,
        solve_time_seconds: record.timeTaken,
        language: record.language,
        source_code: record.code,
        runtime: record.runtime ?? null,
        memory: record.memory ?? null,
        estimated_time_used: record.estimatedTimeUsed ?? null,
        submitted_at: record.submittedAt,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Backend rejected the submission (${res.status}): ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getDashboardSummary(): Promise<DashboardSummary | null> {
  try {
    const res = await backendFetch("/statistics/dashboard");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      totalSolved: data.total_solved,
      currentStreak: data.current_streak,
      averageSolveSeconds: data.average_solve_seconds,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "GET_SESSION":
        sendResponse(await getSession());
        break;
      case "SIGN_IN_GOOGLE":
        try {
          sendResponse({ ok: true, session: await signInWithGoogle() });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        break;
      case "SIGN_OUT":
        await setSession(null);
        sendResponse({ ok: true });
        break;
      case "GET_TIMER_ENABLED":
        sendResponse(await getTimerEnabled());
        break;
      case "SET_TIMER_ENABLED":
        await setTimerEnabled(message.enabled);
        sendResponse({ ok: true });
        break;
      case "GET_TIMER_TARGET":
        sendResponse(await getTimerTarget(message.slug));
        break;
      case "RECORD_SUBMISSION":
        sendResponse(await recordSubmission(message.payload));
        break;
      case "GET_DASHBOARD_SUMMARY":
        sendResponse(await getDashboardSummary());
        break;
      default:
        sendResponse(null);
    }
  })();
  return true; // keep the message channel open for the async response
});
