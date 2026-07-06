/**
 * scraper.ts
 * -----------------------------------------------------------------------
 * Two jobs:
 *   1. Fetch reliable problem metadata (title, difficulty, topics, numeric
 *      id) from LeetCode's own GraphQL endpoint. This runs same-origin
 *      inside the content script so no CORS/host-permission issues.
 *   2. Listen for the postMessage events emitted by inject.ts (running in
 *      the MAIN world) that carry the submitted code/language and the
 *      final judge verdict.
 * -----------------------------------------------------------------------
 */

import type { Difficulty, ProblemInfo } from "../shared/types";

const CP_SOURCE = "codepulse-inject";

export interface CapturedSubmission {
  lang: string;
  code: string;
  questionId: string;
}

export interface CapturedVerdict {
  statusMsg: string;
  runtime?: string;
  memory?: string;
}

/** Extracts the problem's URL slug, e.g. "two-sum" from /problems/two-sum/. */
export function getTitleSlugFromUrl(url: string = window.location.href): string | null {
  const match = url.match(/\/problems\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

const QUESTION_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionFrontendId
      title
      difficulty
      topicTags { name }
    }
  }
`;

/** Fetches title/difficulty/topics/id for the given problem slug. */
export async function fetchProblemInfo(titleSlug: string): Promise<ProblemInfo | null> {
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ query: QUESTION_QUERY, variables: { titleSlug } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const q = json?.data?.question;
    if (!q) return null;
    return {
      problemId: Number(q.questionFrontendId),
      titleSlug,
      title: q.title,
      difficulty: q.difficulty as Difficulty,
      topics: (q.topicTags ?? []).map((t: { name: string }) => t.name),
    };
  } catch {
    return null;
  }
}

/**
 * Subscribes to messages relayed by inject.ts. Returns an unsubscribe fn.
 * onSubmitRequest fires the instant the user hits "Submit" (captures code).
 * onVerdict fires once the judge finishes (captures Accepted / Wrong Answer / etc).
 */
export function listenForSubmissions(
  onSubmitRequest: (data: CapturedSubmission) => void,
  onVerdict: (data: CapturedVerdict) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== CP_SOURCE) return;
    console.log('datat',data)

    if (data.type === "SUBMIT_REQUEST") {
      onSubmitRequest({ lang: data.lang, code: data.code, questionId: data.questionId });
    } else if (data.type === "SUBMIT_RESULT") {
      onVerdict({ statusMsg: data.statusMsg, runtime: data.runtime, memory: data.memory });
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
