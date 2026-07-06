/**
 * auth/supabase.ts
 * -----------------------------------------------------------------------
 * Unlike the extension (which has to use chrome.identity.launchWebAuthFlow
 * because it isn't a normal web page), the dashboard IS a normal web page,
 * so it can use supabase-js's own signInWithOAuth with a real browser
 * redirect - no CORS issues, no manual token pasting.
 * -----------------------------------------------------------------------
 */

import { createClient } from "@supabase/supabase-js";

// Same Supabase project as the extension.
const SUPABASE_URL = "https://sgebiumeiuixmrxkurec.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnZWJpdW1laXVpeG1yeGt1cmVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMzA3OTcsImV4cCI6MjA5ODcwNjc5N30.MVtHgWpMHRSY3EC8Y5yLTUsGflJOCyDp_mng2wxH7iI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
