/**
 * storage.ts
 * -----------------------------------------------------------------------
 * Thin wrapper around chrome.storage.local. All timer state lives here
 * (not just in memory) so that:
 *   - elapsed time survives the user switching tabs (per the spec:
 *     "continue running if user switches browser tabs")
 *   - elapsed time survives the service worker or content script being
 *     torn down and re-injected by Chrome
 *
 * Elapsed time is always computed as (now - startedAt) + accumulatedMs,
 * never by an interval "counting up in memory". That's what makes it
 * correct even if nothing was running to tick it while the tab was
 * backgrounded.
 *
 * GitHub-era getSettings/setSettings (repo/token config) have been
 * replaced with getSession/getTimerEnabled, matching the new auth model.
 * -----------------------------------------------------------------------
 */

import { STORAGE_KEYS } from "../shared/constants";
import type { Session, TimerState } from "../shared/types";

function timerKey(titleSlug: string): string {
  return `${STORAGE_KEYS.TIMER_PREFIX}${titleSlug}`;
}

/** Read-only from the content script's point of view - background.ts owns writes (sign-in/out/refresh). */
export async function getSession(): Promise<Session | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
  return stored[STORAGE_KEYS.SESSION] ?? null;
}

export async function isLoggedIn(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/** Read-only from the content script's point of view - background.ts owns writes via SET_TIMER_ENABLED. */
export async function getTimerEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TIMER_ENABLED);
  return stored[STORAGE_KEYS.TIMER_ENABLED] ?? true;
}

export async function getTimerState(titleSlug: string): Promise<TimerState> {
  const stored = await chrome.storage.local.get(timerKey(titleSlug));
  return (
    stored[timerKey(titleSlug)] ?? {
      titleSlug,
      startedAt: null,
      accumulatedMs: 0,
      running: false,
    }
  );
}

export async function setTimerState(state: TimerState): Promise<void> {
  await chrome.storage.local.set({ [timerKey(state.titleSlug)]: state });
}

export async function clearTimerState(titleSlug: string): Promise<void> {
  await chrome.storage.local.remove(timerKey(titleSlug));
}

/** Returns elapsed milliseconds for a timer state, accounting for a still-running interval. */
export function computeElapsedMs(state: TimerState): number {
  if (state.running && state.startedAt !== null) {
    return state.accumulatedMs + (Date.now() - state.startedAt);
  }
  return state.accumulatedMs;
}
