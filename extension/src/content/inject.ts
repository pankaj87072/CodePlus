/**
 * inject.ts
 * -----------------------------------------------------------------------
 * Runs in the page's MAIN world (declared with "world": "MAIN" in the
 * manifest), so it shares window/fetch with LeetCode's own React app.
 * This is the only reliable way to capture the exact code + language the
 * user submitted, and the judge's final verdict, without fragile DOM
 * scraping of the Monaco editor.
 *
 * It never touches chrome.* APIs (not available in MAIN world) - it just
 * relays what it sees to the ISOLATED-world content script via
 * window.postMessage, which is safe because we tag + origin-check every
 * message.
 * -----------------------------------------------------------------------
 */

const CP_SOURCE = "codepulse-inject";

type OutgoingMessage =
  | { source: typeof CP_SOURCE; type: "SUBMIT_REQUEST"; lang: string; code: string; questionId: string }
  | { source: typeof CP_SOURCE; type: "SUBMIT_RESULT"; statusMsg: string; runtime?: string; memory?: string };

function post(msg: OutgoingMessage) {
  window.postMessage(msg, window.location.origin);
}

// Track submission ids we've already reported a final result for, so we
// don't double count while the frontend polls the check endpoint.
const reportedSubmissions = new Set<string>();

const originalFetch = window.fetch.bind(window);

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

  // 1) Capture the outgoing submission: POST /problems/<slug>/submit/
  if (init && init.method === "POST" && /\/problems\/[^/]+\/submit\/?$/.test(url) && init.body) {
    try {
      const bodyText = typeof init.body === "string" ? init.body : await new Response(init.body as BodyInit).text();
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed.typed_code === "string") {
        post({
          source: CP_SOURCE,
          type: "SUBMIT_REQUEST",
          lang: parsed.lang ?? "unknown",
          code: parsed.typed_code,
          questionId: String(parsed.question_id ?? ""),
        });
      }
    } catch {
      // Non-JSON or shape changed - silently ignore, we just lose this capture.
    }
  }

  const response = await originalFetch(input, init);

  // 2) Capture the judge's final verdict: GET /submissions/detail/<id>/check/
  const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/.*check\/?$/);
  if (checkMatch) {
    const submissionId = checkMatch[1];
    response
      .clone()
      .json()
      .then((data) => {
        if (data && data.state === "SUCCESS" && !reportedSubmissions.has(submissionId)) {
          reportedSubmissions.add(submissionId);
          post({
            source: CP_SOURCE,
            type: "SUBMIT_RESULT",
            statusMsg: data.status_msg ?? "Unknown",
            runtime: data.status_runtime,
            memory: data.status_memory,
          });
        }
      })
      .catch(() => {
        /* ignore parse errors on unrelated responses */
      });
  }

  return response;
};
