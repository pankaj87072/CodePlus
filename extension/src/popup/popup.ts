/**
 * popup.ts
 * -----------------------------------------------------------------------
 * Settings-only popup. Logged out: just a logo + "Continue with Google".
 * Logged in: profile, a Timer ON/OFF toggle (independent of auth - see
 * shouldRenderTimer() in content/index.ts), a small stats summary, and
 * logout. All GitHub connect/repo-picker UI has been removed.
 * -----------------------------------------------------------------------
 */

import type { DashboardSummary, RuntimeMessage, Session } from "../shared/types";

function send<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const loggedOutSection = $<HTMLElement>("section-logged-out");
const loggedInSection = $<HTMLElement>("section-logged-in");
const googleBtn = $<HTMLButtonElement>("btn-google");
const loginError = $<HTMLElement>("login-error");

const avatar = $<HTMLImageElement>("profile-avatar");
const profileName = $<HTMLElement>("profile-name");
const profileEmail = $<HTMLElement>("profile-email");
const timerToggle = $<HTMLInputElement>("timer-toggle");
const statSolved = $<HTMLElement>("stat-solved");
const statStreak = $<HTMLElement>("stat-streak");
const statAvg = $<HTMLElement>("stat-avg");
const logoutBtn = $<HTMLButtonElement>("btn-logout");

function formatAvgTime(seconds: number): string {
  if (!seconds) return "-";
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

async function init() {
  const session = await send<Session | null>({ type: "GET_SESSION" });
  if (session) {
    await showLoggedIn(session);
  } else {
    showLoggedOut();
  }
}

function showLoggedOut() {
  loggedOutSection.classList.remove("hidden");
  loggedInSection.classList.add("hidden");
}

async function showLoggedIn(session: Session) {
  loggedOutSection.classList.add("hidden");
  loggedInSection.classList.remove("hidden");

  profileName.textContent = session.user.name ?? session.user.email;
  profileEmail.textContent = session.user.email;
  avatar.src = session.user.avatar ?? "";

  const timerEnabled = await send<boolean>({ type: "GET_TIMER_ENABLED" });
  timerToggle.checked = timerEnabled;

  const summary = await send<DashboardSummary | null>({ type: "GET_DASHBOARD_SUMMARY" });
  if (summary) {
    statSolved.textContent = String(summary.totalSolved);
    statStreak.textContent = `${summary.currentStreak}d`;
    statAvg.textContent = formatAvgTime(summary.averageSolveSeconds);
  }
}

googleBtn.addEventListener("click", async () => {
  googleBtn.disabled = true;
  loginError.classList.add("hidden");
  try {
    const result = await send<{ ok: boolean; session?: Session; error?: string }>({ type: "SIGN_IN_GOOGLE" });
    if (result.ok && result.session) {
      await showLoggedIn(result.session);
    } else {
      loginError.textContent = result.error ?? "Sign-in failed. Please try again.";
      loginError.classList.remove("hidden");
    }
  } finally {
    googleBtn.disabled = false;
  }
});

timerToggle.addEventListener("change", async () => {
  await send({ type: "SET_TIMER_ENABLED", enabled: timerToggle.checked });
});

logoutBtn.addEventListener("click", async () => {
  await send({ type: "SIGN_OUT" });
  showLoggedOut();
});

init();
