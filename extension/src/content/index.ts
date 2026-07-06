/**
 * content/index.ts
 * -----------------------------------------------------------------------
 * Entry point bundled to dist/content.js and injected (ISOLATED world) on
 * every https://leetcode.com/problems/* page. Wires together:
 *   observer   -> detects problem navigation (SPA) + DOM accepted banner
 *   scraper    -> problem metadata (GraphQL) + submit/verdict capture
 *   timer      -> floating widget UI + start/stop/reset state machine
 *   storage    -> persistence for timer state + session/timerEnabled reads
 *   api        -> personalized timer target + submission recording, via
 *                 the background worker (backend-driven, no GitHub)
 *
 * Timer Rendering Rules (per spec):
 *   - Not logged in            -> never render the widget.
 *   - Logged in, timer hidden  -> don't render, but keep timer state ready.
 *   - Logged in, timer shown   -> render immediately.
 * These are re-evaluated live via chrome.storage.onChanged, so toggling
 * "Hide Timer" in the popup removes the widget without a page reload.
 * -----------------------------------------------------------------------
 */

import { getTitleSlugFromUrl, fetchProblemInfo, listenForSubmissions, type CapturedSubmission } from "./scraper";
import { watchProblemNavigation, watchAcceptedBanner } from "./observer";
import { TimerWidget, startTimer, stopTimer, resetTimer, persist } from "./timer";
import { getSession, getTimerEnabled } from "./storage";
import { getTimerTarget, recordSubmission } from "./api";
import { STORAGE_KEYS } from "../shared/constants";
import type { ProblemInfo, SubmissionRecord, TimerState, TimerTarget } from "../shared/types";

class CodePulseController {
  private widget: TimerWidget | null = null;
  private problemInfo: ProblemInfo | null = null;
  private timerState: TimerState | null = null;
  private pendingSubmission: CapturedSubmission | null = null;
  private currentTarget: TimerTarget | null = null;
  private currentSlug: string | null = null;

  async init() {
    const slug = getTitleSlugFromUrl();
    if (!slug) return;
    await this.mountForProblem(slug);

    watchProblemNavigation((newSlug) => {
      // Requirement: opening another problem resets the timer.
      this.mountForProblem(newSlug);
    });

    listenForSubmissions(
      (submission) => this.onSubmitRequest(submission),
      (verdict) => this.onVerdict(verdict.statusMsg, verdict.runtime, verdict.memory)
    );

    // DOM fallback: confirms the UI shows "accepted" even if, for some
    // reason, the fetch-interception signal in inject.ts didn't fire.
    watchAcceptedBanner(() => this.widget?.flashResult("Accepted"));

    // Live-react to the popup toggling "Hide Timer" / signing in or out,
    // without requiring the LeetCode tab to be reloaded.
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (STORAGE_KEYS.TIMER_ENABLED in changes || STORAGE_KEYS.SESSION in changes) {
        if (this.currentSlug) this.mountForProblem(this.currentSlug);
      }
    });
  }

  private async shouldRenderTimer(): Promise<boolean> {
    const [session, timerEnabled] = await Promise.all([getSession(), getTimerEnabled()]);
    if (!session) return false; // not logged in
    return timerEnabled;
  }

  private async mountForProblem(slug: string) {
    this.currentSlug = slug;
    this.widget?.destroy();
    this.widget = null;
    this.pendingSubmission = null;

    if (!(await this.shouldRenderTimer())) return;

    this.problemInfo = await fetchProblemInfo(slug);

    // Requirement: automatically start when a problem page opens / a new
    // problem is opened resets the timer.
    this.timerState = resetTimer(slug);
    this.timerState = startTimer(this.timerState);
    await persist(this.timerState);

    this.widget = new TimerWidget(slug, this.timerState);
    this.widget.setHandlers({
      onStart: () => this.handleStart(),
      onStop: () => this.handleStop(),
      onReset: () => this.handleReset(),
    });

    await this.refreshTarget(slug);
  }

  private async refreshTarget(slug: string) {
    if (!this.widget) return;
    const target = await getTimerTarget(slug);
    if (!target) return;
    this.currentTarget = target;
    this.widget.setTarget(target);
  }

  private async handleStart() {
    if (!this.timerState) return;
    this.timerState = startTimer(this.timerState);
    await persist(this.timerState);
    this.widget?.updateState(this.timerState);
  }

  private async handleStop() {
    if (!this.timerState) return;
    this.timerState = stopTimer(this.timerState);
    await persist(this.timerState);
    this.widget?.updateState(this.timerState);
  }

  private async handleReset() {
    const slug = this.problemInfo?.titleSlug ?? getTitleSlugFromUrl();
    if (!slug) return;
    this.timerState = startTimer(resetTimer(slug));
    await persist(this.timerState);
    this.widget?.updateState(this.timerState);
  }

  private async onSubmitRequest(submission: CapturedSubmission) {
    if (!this.timerState) return;
    this.pendingSubmission = submission;

    // Stop the instant the user hits Submit, so "solve time" is a clean
    // reading rather than including however long the judge takes to run.
    this.timerState = stopTimer(this.timerState);
    await persist(this.timerState);
    this.widget?.updateState(this.timerState);
  }

  private async onVerdict(statusMsg: string, runtime?: string, memory?: string) {
    if (!this.problemInfo || !this.timerState || !this.pendingSubmission) return;

    const accepted = statusMsg.toLowerCase() === "accepted";
    this.widget?.flashResult(statusMsg);

    const elapsedSeconds = Math.round(this.timerState.accumulatedMs / 1000);
    const record: SubmissionRecord = {
      problemSlug: this.problemInfo.titleSlug,
      language: this.pendingSubmission.lang,
      code: this.pendingSubmission.code,
      timeTaken: elapsedSeconds,
      submittedAt: new Date().toISOString(),
      status: statusMsg,
      runtime,
      memory,
      estimatedTimeUsed: this.currentTarget?.avg,
    };

    // Requirement: record EVERY submission, not just Accepted.
    const result = await recordSubmission(record);
    if (!result?.ok) {
      console.warn("[CodePulse] Failed to record submission:", result?.error);
    }

    this.pendingSubmission = null;

    if (accepted) {
      // Solved - the clock stays stopped, and future opens of this exact
      // problem (or its topics/difficulty) will factor this solve in.
      await this.refreshTarget(this.problemInfo.titleSlug);
    } else {
      // Not accepted - resume the clock so additional attempts keep
      // counting toward the same solve-time reading instead of forcing
      // the user to remember to hit Start again.
      this.timerState = startTimer(this.timerState);
      await persist(this.timerState);
      this.widget?.updateState(this.timerState);
    }
  }
}

new CodePulseController().init();
