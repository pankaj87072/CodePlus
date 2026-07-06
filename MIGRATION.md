# CodePulse: GitHub → Backend Migration

This document is the full account of the migration from the GitHub-based
v1 architecture to the FastAPI + Supabase + Postgres v2 architecture.

---

## 1. Modified files (extension)

| File | What changed |
|---|---|
| `extension/manifest.json` | Removed `api.github.com`/`github.com` host permissions. Added `http://localhost:8000/*`, `https://*.supabase.co/*`, and the `identity` permission (needed for Google sign-in). Bumped version to 2.0.0 and updated description. |
| `extension/src/shared/types.ts` | Removed `GitHubRepo`, `DeviceFlowStartResult`, `HistoryStats`, and the old GitHub-shaped `CodePulseSettings`. Added `Session`, `AuthUser`, `TimerTarget`, `DashboardSummary`. `SubmissionRecord.status` is now `string` (any judge verdict), not just `"Accepted"`. |
| `extension/src/shared/constants.ts` | Removed all GitHub OAuth/API constants. Added `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKEND_BASE_URL`, and new storage keys (`SESSION`, `TIMER_ENABLED`, `TIMER_TARGET_CACHE_PREFIX`). |
| `extension/src/background.ts` | **Fully rewritten.** GitHub Device Flow, repo listing, and commit logic are gone. Now: Supabase Google sign-in via `chrome.identity.launchWebAuthFlow`, session refresh, and a `backendFetch()` helper that every backend-touching message handler goes through. |
| `extension/src/content/index.ts` | Rewired to gate rendering on login + `timerEnabled` (see §5), fetch the target from the backend instead of computing it from GitHub history, and record **every** submission status instead of only Accepted. Reconciles your "stop on submit" fix with auto-resume on non-Accepted verdicts (see §5). |
| `extension/src/content/timer.ts` | Removed the GitHub-era `computeAdaptiveTargetSeconds`/`AdaptiveTargetInputs`. Added `setTarget(target: TimerTarget)`, an expandable dropdown (Min/Avg/Max + "Based on your history" vs "Default estimate"), and `flashResult(status)` (green for Accepted, red otherwise) replacing `markAccepted()`. Kept the drag/position logic, the compact chip layout, and the tick-loop bugfix from last round untouched.
| `extension/src/content/storage.ts` | Removed `getSettings`/`setSettings` (GitHub token/repo config). Added `getSession()` and `getTimerEnabled()` (both read-only from the content script's side - background owns writes). Timer-state functions unchanged. |
| `extension/content/styles.css` | Added dropdown panel styles and a red "rejected" flash animation alongside the existing green "accepted" one. |
| `extension/src/popup/popup.html` / `.css` / `.ts` | **Fully rewritten.** Logged-out: logo + "Continue with Google" only. Logged-in: avatar/name/email, a Timer ON/OFF switch, a 3-stat summary (solved/streak/avg time), Logout. |

## 2. Newly created files

**Backend (all new - the repo only had an empty scaffold before):**
```
backend/requirements.txt
backend/.env.example
backend/app/core/config.py
backend/app/core/security.py
backend/app/db/database.py
backend/app/dependencies/auth.py
backend/app/models/user.py
backend/app/models/problem.py
backend/app/models/submission.py
backend/app/schemas/user.py
backend/app/schemas/problem.py
backend/app/schemas/submission.py
backend/app/schemas/timer.py
backend/app/schemas/statistics.py
backend/app/services/auth_service.py
backend/app/services/estimation_service.py
backend/app/services/problem_service.py
backend/app/services/history_service.py
backend/app/services/statistics_service.py
backend/app/services/timer_service.py
backend/app/api/auth.py
backend/app/api/users.py
backend/app/api/problems.py
backend/app/api/history.py
backend/app/api/statistics.py
backend/app/main.py
backend/scripts/seed_problems.py
backend/data/leetcode_with_time_final.json   (copy of your uploaded file)
```

**Extension:**
```
extension/src/content/api.ts   (replaces the deleted content/github.ts)
```

**Dashboard:**
```
dashboard/src/auth/supabase.ts   (replaces the deleted auth/github.ts)
dashboard/src/lib/backendClient.ts   (replaces the deleted lib/githubClient.ts)
```

**Deleted:** `extension/src/content/github.ts`, `dashboard/src/auth/github.ts`,
`dashboard/src/lib/githubClient.ts`, the old empty `backend/app/auth/`
directory, and the old empty `backend/app/config.py` / `backend/app/dependencies.py`
files (superseded by `core/config.py` and `dependencies/auth.py`).

The dashboard's data-fetching logic in `App.tsx` and its three chart/table
components (`TopicMastery.tsx`, `WeakTopics.tsx`, `RecentSubmissions.tsx`)
were adapted to consume the backend's already-aggregated response shapes
instead of walking a GitHub repo tree - I judged this in-scope since the
dashboard was 100% GitHub-based and the goal was a complete migration off
GitHub, not just inside the extension. `StatCard.tsx` and `lib/stats.ts`
(trimmed to just `formatDuration`) needed no logic changes.

---

## 3. Authentication flow

**Why not GitHub-style OAuth for Google:** same reasoning as before - the
extension has no backend co-located with it that could exchange an
authorization code for a token without exposing a secret. Supabase Auth
handles this cleanly:

1. Popup: user clicks **Continue with Google**.
2. `background.ts` computes `chrome.identity.getRedirectURL()` (a
   `https://<extension-id>.chromiumapp.org/` URL Chrome owns) and opens
   `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=...`
   via `chrome.identity.launchWebAuthFlow`.
3. Google → Supabase → redirected back to that chromiumapp.org URL with
   `#access_token=...&refresh_token=...&expires_in=...` in the fragment.
   `launchWebAuthFlow` hands the whole URL back to `background.ts`.
4. `background.ts` parses the fragment, calls Supabase's `/auth/v1/user`
   to get the profile (name/email/avatar), and stores
   `{ accessToken, refreshToken, expiresAt, user }` in
   `chrome.storage.local` under `cp_session`.
5. It immediately calls our own backend's `POST /auth/session` with that
   access token - this is what actually creates/updates the `users` row
   and confirms the token is valid server-side.
6. Every later backend call goes through `backendFetch()`, which checks
   `expiresAt` (with a 60s safety skew), transparently calls Supabase's
   `/auth/v1/token?grant_type=refresh_token` if needed, and retries once
   on a `401` in case the token expired right at the edge of that window.
7. If refresh ever fails (refresh token revoked/expired), the session is
   cleared and the popup falls back to the logged-out view - "never ask
   the user to log in again unless refresh fails" is satisfied by this
   being the *only* path that clears the session.

**Why the backend never trusts a client-supplied user id:** `get_current_user`
(`backend/app/dependencies/auth.py`) takes the `Authorization: Bearer`
header, verifies the JWT's signature and expiry locally against
`SUPABASE_JWT_SECRET` (`core/security.py`), and only ever reads the user
id from the verified `sub` claim. Nothing in any request body is trusted
as an identity.

---

## 4. Backend architecture

```
backend/app/
  core/       config.py (env settings), security.py (JWT verification)
  db/         database.py (SQLAlchemy engine/session)
  dependencies/  auth.py (get_current_user - the one dependency every
                 protected route uses)
  models/     user.py, problem.py, submission.py (SQLAlchemy ORM)
  schemas/    matching Pydantic request/response models
  services/   the actual business logic - each API file is a thin layer
              on top of these:
                auth_service.py        upserts a User from JWT claims
                problem_service.py     lookup + live-fetch-and-estimate
                                       for problems not yet in the DB
                history_service.py     records submissions, computes
                                       attempt_number
                statistics_service.py  all aggregate stats, on the fly
                timer_service.py       the personalized-timer algorithm
                estimation_service.py  the dynamic default-estimate math
  api/        auth.py, users.py, problems.py, history.py, statistics.py
  main.py     FastAPI app, CORS, router registration, table creation
```

Every route follows the same shape: `Depends(get_db)` for a session,
`Depends(get_current_user)` where auth is required, then a one-line call
into the matching service. Table creation uses
`Base.metadata.create_all()` at startup for MVP simplicity - swap this
for Alembic migrations before this needs to evolve its schema in
production.

**This was tested end-to-end just now against a real local Postgres 16
instance** (not just type-checked or read through): started the actual
FastAPI server, seeded 300 real rows from your JSON, minted a JWT signed
with a matching test secret, and hit every endpoint with `curl`:
- `POST /auth/session` correctly upserted a user from the token claims.
- `GET /problems/two-sum` returned the exact seeded values (6/16/26).
- Personalized timer walked through all three personal tiers correctly
  as history was added (see §6's worked example, with hand-checked math).
- `POST /history` recorded both an Accepted and a Wrong Answer submission;
  `GET /statistics` then showed `total_solved: 7`, `total_submissions: 8`,
  `acceptance_rate: 87.5` - all arithmetically correct.
- A request with no `Authorization` header correctly got `401`.
- A request for a problem outside the 300 seeded rows correctly attempted
  the live LeetCode fetch path and returned `404` when it couldn't reach
  `leetcode.com` (this sandbox's outbound network is allow-listed to a
  fixed set of domains that doesn't include LeetCode - a real deployment
  has no such restriction). The estimator itself was separately verified
  against your JSON's real stored values in §6b.

---

## 5. Timer flow

**Visibility (independent of auth, per spec):**
`content/index.ts`'s `shouldRenderTimer()` checks, in order: is there a
session? (no → never render) → is `cp_timer_enabled` true? (no → don't
render, but the timer state machine keeps running so nothing is lost).
A `chrome.storage.onChanged` listener re-evaluates this live, so toggling
"Hide Timer" in the popup removes the widget without reloading the
LeetCode tab.

**Reconciling your submit-time fix with "record every submission":**
Your edit stops the timer the instant the user hits Submit (banking a
clean "time to submit" reading rather than including judge run time) -
I kept that, it's a real improvement. But taken alone with "every
submission is recorded," a Wrong Answer would leave the clock frozen
until the user remembered to hit Start again, silently under-counting
time on their next attempt. I resolved this by keeping your stop-on-submit
behavior, and auto-resuming the clock right after a non-Accepted verdict
(recording that submission first) so multiple attempts on the same
problem keep accumulating into one continuous "solve time" - only
Accepted stops it for good. If you intended something different here
(e.g. genuinely pausing until the user manually resumes), that's a
one-line change in `onVerdict()`'s `else` branch.

**Solve flow end to end:**
1. Problem page opens → `mountForProblem()` → timer resets and
   auto-starts (if visible) → `GET /problems/{slug}/timer` fills in the
   target.
2. `inject.ts` (MAIN world) intercepts the submit `fetch()` call, capturing
   the exact code + language, and separately intercepts the judge's
   `check/` polling response for the final verdict + runtime/memory.
3. On the submit capture: timer stops, state persisted.
4. On the verdict: `POST /history` records it (any status) with the
   banked elapsed time, language, code, runtime, memory, and the target
   avg that was on screen at the time (`estimated_time_used`, kept for
   future ML). Accepted → flash green, keep stopped, refresh the target
   (this solve now counts toward future personalization). Anything else
   → flash red, resume the clock.

---

## 6. Personalized timer algorithm

`backend/app/services/timer_service.py`, exactly as specified:

1. **Exact problem** - if the user has any Accepted submissions for this
   slug, return `min`/`avg`/`max` computed straight from those solve
   times. Source: `personal_problem`.
2. **Same topic(s)** - Accepted submissions across any problem sharing at
   least one topic tag (Postgres `ARRAY.overlap()`, i.e. `&&`), but only
   trusted once there are `>= MIN_SOLVED_FOR_TOPIC_AVERAGE` (default 3,
   configurable via env) qualifying solves. Source: `personal_topic`.
3. **Same difficulty** - same idea, gated by
   `MIN_SOLVED_FOR_DIFFICULTY_AVERAGE`. Source: `personal_difficulty`.
4. **Default** - the problem's own `estimated_time_min/avg/max` (from the
   seeded JSON, or dynamically computed - see §6b). Source: `default`.

Each tier returns `basis_label: "Based on your history"` except the
default tier, which returns `"Default estimate"` - the extension's
dropdown displays this directly.

**Verified with real numbers, just now:** recorded an Accepted solve for
`two-sum` at 500s → its timer immediately returned
`{min:500, avg:500, max:500, source:"personal_problem"}`. Then recorded
3 more Accepted solves on other Array/Easy problems (300s, 400s, 200s)
and asked for the timer on a 4th, never-solved Array/Easy problem
(`search-insert-position`) → got back
`{min:200, avg:350, max:500, source:"personal_topic"}` - 350 being the
exact average of 500/300/400/200. Then recorded 3 more Accepted solves
on Easy problems with *no* shared topic tags (Math, Linked List,
Dynamic Programming) and asked for the timer on `sqrtx` (Math + Binary
Search, topic count only 1 - below the topic threshold) → got back
`{min:100, avg:271, max:500, source:"personal_difficulty"}`, matching
the hand-computed average of all 7 Easy solves (1900/7 = 271.43 → 271).

### 6b. Dynamic default-estimate algorithm (new problems)

`estimation_service.py` implements the `DIFFICULTY_BASE` /
`TOPIC_WEIGHTS` / acceptance-multiplier / top-3-topics-weighted formula
exactly as specified, used only when `problem_service.get_or_fetch_problem()`
can't find a slug in the DB - it fetches title/difficulty/acceptance
rate/topics from LeetCode's public GraphQL endpoint, runs this formula,
inserts the result (`is_dynamically_estimated=True`), and returns it; all
later requests for that slug are a plain DB read.

**Verified against your own JSON**: feeding "Two Sum"'s real
difficulty/acceptance/topics through this formula reproduces its stored
estimate exactly (6/16/26), and same for "N-Queens" (28/55/82) - strong
evidence this is the same formula that generated your dataset.

---

## 7. Database schema

```
users
  id (uuid, PK)            = Supabase auth user id, never generated locally
  email, name, avatar
  created_at, updated_at

problems
  id (serial, PK)
  frontend_question_id, title, slug (unique), difficulty
  topic_tags (text[])       -- Postgres array, not JSON, so it supports
                                the && overlap operator used by the
                                personalized-timer topic tier
  acceptance_rate
  estimated_time_min/avg/max
  likes, frequency          -- nullable, not in current JSON but reserved
  problem_metadata (jsonb)  -- hasSolution/hasVideoSolution/etc, catch-all
  is_dynamically_estimated  -- true for problems fetched+estimated live
  created_at, updated_at

submissions
  id (serial, PK)
  user_id (FK -> users), problem_id (FK -> problems)
  status, solve_time_seconds, language, source_code
  runtime, memory                -- nullable
  attempt_number                 -- computed at insert time
  estimated_time_used            -- target shown at submit time, for future ML
  submitted_at, created_at
```

**Deliberate design choice - no separate `user_statistics` table.**
Everything the spec calls "User Statistics" (averages, streaks,
acceptance rate, per-topic/difficulty breakdowns) is computed on the fly
in `statistics_service.py` via SQL aggregation over `submissions` +
`problems`, rather than kept in a table that would need to be kept in
sync on every insert. For the data volumes here this is fast (indexed on
`user_id`) and it can never drift from the source of truth. If this ever
needs to scale further, these exact queries are what a materialized view
would wrap - nothing about the API shape would need to change.

---

## 8. Every API

| Method & Path | Auth | Purpose |
|---|---|---|
| `POST /auth/session` | required | Verifies the bearer token, upserts the `users` row, returns it. Called right after Google sign-in. |
| `GET /users/me` | required | Current user's profile. |
| `GET /problems/{slug}` | none | Problem metadata - DB lookup, or live LeetCode fetch + dynamic estimate + insert if new. |
| `GET /problems/{slug}/timer` | required | Personalized (or default) target time for this user + problem - the fallback chain in §6. |
| `POST /history` | required | Records one submission of any status. Looks the problem up (fetching it if new) and computes `attempt_number`. |
| `GET /history?limit=&offset=` | required | Paginated submission history, joined with problem title/slug/difficulty. |
| `GET /statistics` | required | Full breakdown: totals, acceptance rate, streaks, per-topic, per-difficulty. |
| `GET /statistics/dashboard` | required | Cheap subset (solved count, streak, avg time) for the popup. |
| `GET /health` | none | Liveness check. |

---

## 9. Required environment variables

**Backend (`backend/.env`):**
| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (URI format) |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_JWT_SECRET` | Supabase → Project Settings → API → JWT Secret |
| `CORS_ORIGINS` | comma-separated; must include your unpacked extension's `chrome-extension://<id>` origin and the dashboard's dev origin |
| `MIN_SOLVED_FOR_TOPIC_AVERAGE`, `MIN_SOLVED_FOR_DIFFICULTY_AVERAGE` | optional, default 3 |

**Extension (`extension/src/shared/constants.ts`):**
`SUPABASE_URL` (already filled in from your prior `.env`), `SUPABASE_ANON_KEY`
(placeholder - fill in from Supabase → API → anon public key), `BACKEND_BASE_URL`.

**Dashboard (`dashboard/src/auth/supabase.ts`):**
Same `SUPABASE_ANON_KEY` placeholder to fill in.

⚠️ Your uploaded `backend/.env` contained a live-looking Supabase
`service_role`/secret key. I kept it in place (it's your file, and it's
server-side only) but you should treat any secret that's passed through
a chat upload as potentially exposed and rotate it in the Supabase
dashboard.

---

## 10. Running everything locally

**Supabase:** create a project at supabase.com (or use your existing
one). Enable the Google provider under Authentication → Providers, and
add your Google OAuth client id/secret there. Under Authentication → URL
Configuration, add `https://<your-extension-id>.chromiumapp.org/` as a
redirect URL (you'll know the extension id after loading it unpacked
once) and `http://localhost:5173` for the dashboard.

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then fill in the values from §9
python -m scripts.seed_problems
uvicorn app.main:app --reload --port 8000
```

**Extension:**
```bash
cd extension
npm install
npm run build
```
Load unpacked in `chrome://extensions`. Copy the extension id it's
assigned, add its `chromiumapp.org` redirect URL to Supabase (above), and
fill in `SUPABASE_ANON_KEY` in `src/shared/constants.ts`, then
`npm run build` again.

**Dashboard:**
```bash
cd dashboard
npm install
npm run dev
```
Open `http://localhost:5173`, sign in with the same Google account.

This was validated with a real local Postgres 16 instance end-to-end
(seeding, auth, problem lookup, submission recording, all three
personalized-timer tiers, statistics) - see §4 and §6 for what was
actually exercised, not just written.
