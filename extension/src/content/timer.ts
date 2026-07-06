/**
 * timer.ts
 * -----------------------------------------------------------------------
 * Renders the floating, draggable timer card injected into every LeetCode
 * problem page, and owns the start/stop/reset state machine described in
 * storage.ts. Pure DOM + CSS (no framework), styled with CSS variables so
 * it can match LeetCode's light/dark theme (styles.css does the theming;
 * this file just toggles a `data-theme` attribute).
 *
 * The adaptive-target math that used to live here (computeAdaptiveTargetSeconds,
 * reading GitHub-derived HistoryStats) is gone - the target now comes
 * straight from the backend's personalized-timer endpoint (see
 * content/api.ts + content/index.ts), which already knows the min/avg/max
 * and whether it's personal or a default estimate.
 * -----------------------------------------------------------------------
 */

import { computeElapsedMs, getTimerState, setTimerState } from "./storage";
import type { TimerState, TimerTarget } from "../shared/types";

const WIDGET_ID = "codepulse-widget";
const POSITION_STORAGE_KEY = "cp_widget_position";

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export class TimerWidget {
  private root: HTMLElement;
  private elapsedLabel!: HTMLElement;
  private targetLabel!: HTMLElement;
  private progressBar!: HTMLElement;
  private statusDot!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private expandBtn!: HTMLButtonElement;
  private dropdown!: HTMLElement;
  private dropdownMin!: HTMLElement;
  private dropdownAvg!: HTMLElement;
  private dropdownMax!: HTMLElement;
  private dropdownBasis!: HTMLElement;

  private target: TimerTarget | null = null;
  private tickHandle: number | null = null;
  private state: TimerState;
  private expanded = false;

  private onStartClick: () => void = () => {};
  private onStopClick: () => void = () => {};
  private onResetClick: () => void = () => {};

  constructor(_titleSlug: string, initialState: TimerState) {
    this.state = initialState;
    this.root = this.buildDom();
    document.body.appendChild(this.root);
    this.applyTheme();
    this.makeDraggable();
    this.restorePosition();
    this.render();
    this.manageTicking();
  }

  /** Sets the personalized (or default) target returned by the backend. */
  setTarget(target: TimerTarget) {
    this.target = target;
    this.targetLabel.textContent = formatMMSS(target.avg);
    this.dropdownMin.textContent = formatMMSS(target.min);
    this.dropdownAvg.textContent = formatMMSS(target.avg);
    this.dropdownMax.textContent = formatMMSS(target.max);
    this.dropdownBasis.textContent = target.basisLabel;
    this.render();
  }

  setHandlers(handlers: { onStart: () => void; onStop: () => void; onReset: () => void }) {
    this.onStartClick = handlers.onStart;
    this.onStopClick = handlers.onStop;
    this.onResetClick = handlers.onReset;
  }

  updateState(state: TimerState) {
    this.state = state;
    this.render();
    this.manageTicking();
  }

  destroy() {
    if (this.tickHandle !== null) window.clearInterval(this.tickHandle);
    this.root.remove();
  }

  /** Flashes green for Accepted, red for anything else - called once the judge verdict is known. */
  flashResult(status: string) {
    const accepted = status.toLowerCase() === "accepted";
    this.root.classList.add(accepted ? "cp-accepted-flash" : "cp-rejected-flash");
    this.statusDot.dataset.status = accepted ? "accepted" : "stopped";
    window.setTimeout(() => {
      this.root.classList.remove("cp-accepted-flash", "cp-rejected-flash");
    }, 1500);
  }

  // ---------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------

  private buildDom(): HTMLElement {
    const existing = document.getElementById(WIDGET_ID);
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = WIDGET_ID;
    root.innerHTML = `
      <div class="cp-header" data-cp-drag-handle>
        <span class="cp-dot" data-status="idle"></span>
        <span class="cp-time-row">
          <span class="cp-elapsed">00:00</span>
          <span class="cp-slash">/</span>
          <span class="cp-target">--:--</span>
        </span>
        <span class="cp-controls">
          <button type="button" class="cp-icon-btn cp-start" title="Start" aria-label="Start">▶</button>
          <button type="button" class="cp-icon-btn cp-stop" title="Stop" aria-label="Stop">⏸</button>
          <button type="button" class="cp-icon-btn cp-reset" title="Reset" aria-label="Reset">↺</button>
          <button type="button" class="cp-icon-btn cp-expand" title="Details" aria-label="Toggle details">⌄</button>
        </span>
      </div>
      <div class="cp-progress-track">
        <div class="cp-progress-fill"></div>
      </div>
      <div class="cp-dropdown">
        <div class="cp-dropdown-row">
          <span>Min</span><span class="cp-dropdown-min">--:--</span>
        </div>
        <div class="cp-dropdown-row">
          <span>Avg</span><span class="cp-dropdown-avg">--:--</span>
        </div>
        <div class="cp-dropdown-row">
          <span>Max</span><span class="cp-dropdown-max">--:--</span>
        </div>
        <div class="cp-dropdown-basis">--</div>
      </div>
    `;

    this.elapsedLabel = root.querySelector(".cp-elapsed")!;
    this.targetLabel = root.querySelector(".cp-target")!;
    this.progressBar = root.querySelector(".cp-progress-fill")!;
    this.statusDot = root.querySelector(".cp-dot")!;
    this.startBtn = root.querySelector(".cp-start")!;
    this.stopBtn = root.querySelector(".cp-stop")!;
    this.resetBtn = root.querySelector(".cp-reset")!;
    this.expandBtn = root.querySelector(".cp-expand")!;
    this.dropdown = root.querySelector(".cp-dropdown")!;
    this.dropdownMin = root.querySelector(".cp-dropdown-min")!;
    this.dropdownAvg = root.querySelector(".cp-dropdown-avg")!;
    this.dropdownMax = root.querySelector(".cp-dropdown-max")!;
    this.dropdownBasis = root.querySelector(".cp-dropdown-basis")!;

    this.startBtn.addEventListener("click", () => this.onStartClick());
    this.stopBtn.addEventListener("click", () => this.onStopClick());
    this.resetBtn.addEventListener("click", () => this.onResetClick());
    this.expandBtn.addEventListener("click", () => this.toggleExpanded());

    return root;
  }

  private toggleExpanded() {
    this.expanded = !this.expanded;
    this.dropdown.classList.toggle("cp-dropdown-open", this.expanded);
    this.expandBtn.classList.toggle("cp-expand-open", this.expanded);
  }

  private applyTheme() {
    // LeetCode toggles a `dark` class on <html> for its dark theme.
    const isDark =
      document.documentElement.classList.contains("dark") ||
      document.documentElement.getAttribute("data-mode") === "dark" ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.root.setAttribute("data-theme", isDark ? "dark" : "light");

    // Keep in sync if the user flips LeetCode's theme toggle later.
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      this.root.setAttribute("data-theme", dark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-mode"] });
  }

  private makeDraggable() {
    const handle = this.root.querySelector<HTMLElement>("[data-cp-drag-handle]")!;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = this.root.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      this.root.classList.add("cp-dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = Math.min(Math.max(0, e.clientX - offsetX), window.innerWidth - this.root.offsetWidth);
      const y = Math.min(Math.max(0, e.clientY - offsetY), window.innerHeight - this.root.offsetHeight);
      this.root.style.left = `${x}px`;
      this.root.style.top = `${y}px`;
      this.root.style.right = "auto";
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      this.root.classList.remove("cp-dragging");
      const { left, top } = this.root.style;
      chrome.storage.local.set({ [POSITION_STORAGE_KEY]: { left, top } });
    });
  }

  private async restorePosition() {
    const stored = await chrome.storage.local.get(POSITION_STORAGE_KEY);
    const pos = stored[POSITION_STORAGE_KEY] as { left?: string; top?: string } | undefined;
    if (pos?.left && pos?.top) {
      this.root.style.left = pos.left;
      this.root.style.top = pos.top;
      this.root.style.right = "auto";
    }
  }

  private manageTicking() {
    if (this.tickHandle !== null) {
      window.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    if (this.state.running) {
      this.tickHandle = window.setInterval(() => this.render(), 1000);
    }
  }

  private render() {
    const elapsedMs = computeElapsedMs(this.state);
    const elapsedSec = elapsedMs / 1000;
    this.elapsedLabel.textContent = formatMMSS(elapsedSec);

    const targetAvg = this.target?.avg ?? 0;
    const pct = targetAvg > 0 ? Math.min(100, (elapsedSec / targetAvg) * 100) : 0;
    this.progressBar.style.width = `${pct}%`;
    this.progressBar.classList.toggle("cp-overtime", elapsedSec > targetAvg && targetAvg > 0);

    this.statusDot.dataset.status = this.state.running ? "running" : "stopped";
    this.startBtn.disabled = this.state.running;
    this.stopBtn.disabled = !this.state.running;
  }
}

// ---------------------------------------------------------------------
// Timer state transitions (pure functions, easy to unit test)
// ---------------------------------------------------------------------

export function startTimer(state: TimerState): TimerState {
  if (state.running) return state;
  return { ...state, running: true, startedAt: Date.now() };
}

export function stopTimer(state: TimerState): TimerState {
  if (!state.running || state.startedAt === null) return { ...state, running: false };
  const accumulatedMs = state.accumulatedMs + (Date.now() - state.startedAt);
  return { ...state, running: false, startedAt: null, accumulatedMs };
}

export function resetTimer(titleSlug: string): TimerState {
  return { titleSlug, startedAt: null, accumulatedMs: 0, running: false };
}

export async function persist(state: TimerState): Promise<void> {
  await setTimerState(state);
}

export async function loadOrInit(titleSlug: string): Promise<TimerState> {
  return getTimerState(titleSlug);
}
