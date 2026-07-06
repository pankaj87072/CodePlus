/**
 * observer.ts
 * -----------------------------------------------------------------------
 * LeetCode is a client-side-routed SPA, so navigating from one problem to
 * another does NOT trigger a full page load (our content script keeps
 * running). We detect that with light polling of the URL slug rather than
 * patching history.pushState, because content scripts run in an ISOLATED
 * JS world and can't intercept calls made from the page's own realm.
 *
 * We also keep a DOM-based MutationObserver watching for the "Accepted"
 * result banner as a safety net alongside the fetch-interception signal
 * from inject.ts, in case LeetCode ever changes its internal API shape.
 * -----------------------------------------------------------------------
 */

import { getTitleSlugFromUrl } from "./scraper";

const POLL_INTERVAL_MS = 400;

/** Fires `onChange(newSlug)` whenever the /problems/<slug>/ portion of the URL changes. */
export function watchProblemNavigation(onChange: (slug: string) => void): () => void {
  let lastSlug = getTitleSlugFromUrl();

  const check = () => {
    const currentSlug = getTitleSlugFromUrl();
    if (currentSlug && currentSlug !== lastSlug) {
      lastSlug = currentSlug;
      onChange(currentSlug);
    }
  };

  const intervalId = window.setInterval(check, POLL_INTERVAL_MS);
  window.addEventListener("popstate", check);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("popstate", check);
  };
}

const ACCEPTED_TEXT_PATTERN = /^accepted$/i;

/**
 * Fallback watcher: scans newly added elements for a standalone "Accepted"
 * label, which LeetCode renders prominently (green) after a successful
 * submission. Only used as a secondary confirmation signal.
 */
export function watchAcceptedBanner(onAccepted: () => void): () => void {
  let firedForThisResult = false;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (firedForThisResult) return;
        if (!(node instanceof HTMLElement)) return;
        const text = node.textContent?.trim() ?? "";
        if (ACCEPTED_TEXT_PATTERN.test(text)) {
          firedForThisResult = true;
          onAccepted();
        }
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Reset the "already fired" guard whenever the user submits again.
  const resetGuard = () => {
    firedForThisResult = false;
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") resetGuard();
  });

  return () => observer.disconnect();
}
