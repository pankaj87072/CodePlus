# CodePulse

A LeetCode solve-timer Chrome extension (Manifest V3, plain HTML/CSS/TypeScript)
with Google sign-in, a personalized target time based on your own solve
history, and a FastAPI + Supabase Postgres backend as the single source of
truth for that history.

```
codepulse/
  extension/     Manifest V3 extension - vanilla TS/HTML/CSS, no framework
  backend/       FastAPI + SQLAlchemy + Supabase Auth verification
  dashboard/     React app - reads stats/history from the backend
  MIGRATION.md   Full account of the GitHub -> backend migration
```

**This project used to sync to a GitHub repo instead of a backend.** That
architecture has been fully removed - see `MIGRATION.md` for the complete
list of what changed, why, and how every piece was verified (including a
real end-to-end test run against a local Postgres instance).

## Quick start

**1. Supabase** - create a project, enable Google as an Auth provider, and
grab the Project URL / anon key / JWT secret / Postgres connection string
from Project Settings.

**2. Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL, SUPABASE_URL, SUPABASE_JWT_SECRET
python -m scripts.seed_problems
uvicorn app.main:app --reload --port 8000
```

**3. Extension**
```bash
cd extension
# fill in SUPABASE_ANON_KEY in src/shared/constants.ts
npm install && npm run build
```
Load unpacked at `chrome://extensions`.

**4. Dashboard**
```bash
cd dashboard
npm install && npm run dev
```

Full details, the personalized-timer algorithm, database schema, every API
endpoint, and required environment variables are all in `MIGRATION.md`.
